import Foundation

public struct RepositoryStatus: Identifiable, Sendable, Equatable {
    public var id: String { path }
    public var path: String
    public var name: String { URL(fileURLWithPath: path).lastPathComponent }
    public var branch = ""
    public var upstream = ""
    public var ahead = 0
    public var behind = 0
    public var changed = 0
    public var untracked = 0
    public var conflicts = 0
    public var error: String?
    public var checkedAt = Date()
    public var dirty: Bool { changed + untracked + conflicts > 0 }
    public init(path: String) { self.path = path }

    public static func parse(_ output: String, path: String) -> Self {
        var result = Self(path: path)
        let records = output.split(separator: "\0", omittingEmptySubsequences: true)
        var skipRenamePath = false
        for record in records {
            if skipRenamePath {
                skipRenamePath = false
                continue
            }
            let line = String(record)
            if line.hasPrefix("# branch.head ") {
                result.branch = String(line.dropFirst(14))
            } else if line.hasPrefix("# branch.upstream ") {
                result.upstream = String(line.dropFirst(18))
            } else if line.hasPrefix("# branch.ab ") {
                let values = line.dropFirst(12).split(separator: " ")
                if values.count == 2 {
                    result.ahead = Int(values[0].dropFirst()) ?? 0
                    result.behind = Int(values[1].dropFirst()) ?? 0
                }
            } else if line.hasPrefix("1 ") || line.hasPrefix("2 ") {
                result.changed += 1
                skipRenamePath = line.hasPrefix("2 ")
            } else if line.hasPrefix("? ") {
                result.untracked += 1
            } else if line.hasPrefix("u ") {
                result.conflicts += 1
            }
        }
        return result
    }
}

public actor RepositoryService {
    private static let git = "/usr/bin/git"
    private static let excluded: Set<String> = [
        "node_modules", ".build", ".cache", ".venv", "venv", "target", "Pods", "vendor",
        "dist", "build", ".git", ".Trash",
    ]
    private var running = Set<String>()
    public init() {}

    public func discover(_ root: RepositoryRoot) throws -> [String] {
        guard root.path.hasPrefix("/"), (1...8).contains(root.maxDepth) else {
            throw ORIError.invalid("Selecciona la carpeta local de este espacio en macOS.")
        }
        let base = URL(fileURLWithPath: root.path).standardizedFileURL
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: base.path, isDirectory: &isDirectory),
            isDirectory.boolValue
        else { throw ORIError.unavailable("La carpeta del espacio no está disponible.") }
        var pending = [(base, 0)]
        var repositories: [String] = []
        var visited = 0
        while let (directory, depth) = pending.popLast() {
            try Task.checkCancellation()
            visited += 1
            guard visited <= 20_000, repositories.count < 1_000 else {
                throw ORIError.invalid(
                    "Hay demasiadas carpetas. Selecciona un espacio más concreto.")
            }
            if FileManager.default.fileExists(atPath: directory.appendingPathComponent(".git").path)
            {
                repositories.append(directory.resolvingSymlinksInPath().path)
                continue
            }
            guard depth < root.maxDepth else { continue }
            let children = try FileManager.default.contentsOfDirectory(
                at: directory, includingPropertiesForKeys: [.isDirectoryKey, .isSymbolicLinkKey],
                options: [.skipsHiddenFiles])
            for child in children where !Self.excluded.contains(child.lastPathComponent) {
                let values = try child.resourceValues(forKeys: [
                    .isDirectoryKey, .isSymbolicLinkKey,
                ])
                if values.isDirectory == true && values.isSymbolicLink != true {
                    pending.append((child, depth + 1))
                }
            }
        }
        return Array(Set(repositories)).sorted {
            $0.localizedStandardCompare($1) == .orderedAscending
        }
    }

    public func status(_ path: String) async -> RepositoryStatus {
        do {
            let result = try await git(
                path, ["status", "--porcelain=v2", "--branch", "-z"], timeout: .seconds(15))
            guard result.status == 0 else {
                throw ORIError.process("No se pudo consultar este repositorio Git.")
            }
            return RepositoryStatus.parse(result.output, path: path)
        } catch {
            var result = RepositoryStatus(path: path)
            result.error = error.localizedDescription
            return result
        }
    }

    public func remoteURL(_ path: String) async throws -> String {
        let result = try await git(path, ["remote", "get-url", "origin"], timeout: .seconds(10))
        guard result.status == 0 else {
            throw ORIError.unavailable("Este repositorio no tiene remoto origin.")
        }
        return Self.shareableURL(result.output.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    // Quita usuario y token de las URLs http(s) para poder mandarlas a otra persona
    public static func shareableURL(_ url: String) -> String {
        guard var components = URLComponents(string: url),
            ["http", "https"].contains(components.scheme?.lowercased() ?? "")
        else { return url }
        components.user = nil
        components.password = nil
        return components.string ?? url
    }

    public enum Action: Sendable { case fetch, pull }
    public func perform(_ action: Action, path: String) async throws -> RepositoryStatus {
        guard running.insert(path).inserted else {
            throw ORIError.invalid("Ya hay una operación Git en este repositorio.")
        }
        defer { running.remove(path) }
        if action == .pull {
            let current = await status(path)
            guard current.error == nil, !current.dirty, !current.upstream.isEmpty,
                current.branch != "(detached)"
            else {
                throw ORIError.invalid(
                    "Pull requiere una rama con upstream y sin cambios locales ni conflictos.")
            }
        }
        let arguments =
            action == .fetch
            ? ["fetch", "--all", "--prune"]
            : [
                "-c", "pull.autostash=false", "-c", "rebase.autoStash=false", "pull", "--ff-only",
                "--no-rebase",
            ]
        let result = try await git(path, arguments, timeout: .seconds(90))
        guard result.status == 0 else {
            throw ORIError.process(
                action == .fetch
                    ? "Fetch falló. Revisa el remoto, la red y la autenticación en VS Code."
                    : "Pull falló. Revisa autenticación o divergencias en VS Code; se exige avance rápido."
            )
        }
        return await status(path)
    }

    private func git(_ path: String, _ arguments: [String], timeout: Duration) async throws
        -> CommandResult
    {
        guard path.hasPrefix("/"), !path.contains("\0") else {
            throw ORIError.invalid("Ruta Git no válida.")
        }
        return try await SystemCommandRunner().run(
            Self.git,
            ["--no-optional-locks", "-C", path, "-c", "core.fsmonitor=false"] + arguments,
            timeout: timeout,
            environment: [
                "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never",
                "GIT_SSH_COMMAND": "/usr/bin/ssh -oBatchMode=yes -oConnectTimeout=10",
            ])
    }
}
