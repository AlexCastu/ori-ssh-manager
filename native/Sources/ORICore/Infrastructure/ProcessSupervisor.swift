import Darwin
import Foundation

public enum ProcessEvent: Sendable {
    case output(Data)
    case exited(Int32)
}
public struct ManagedProcess: Sendable {
    public var id: UUID
    public var events: AsyncStream<ProcessEvent>
}

public actor ProcessSupervisor {
    private struct Entry {
        let process: Process
        let channel: DispatchIO
        let continuation: AsyncStream<ProcessEvent>.Continuation
        var status: Int32?
        var drained = false
    }
    private var entries: [UUID: Entry] = [:]
    public init() {}
    public func start(executable: String, arguments: [String], environment: [String: String]? = nil)
        throws -> ManagedProcess
    {
        guard FileManager.default.isExecutableFile(atPath: executable) else {
            throw ORIError.unavailable("No se encuentra \(executable).")
        }
        let id = UUID()
        let process = Process()
        let pipe = Pipe()
        let (stream, continuation) = AsyncStream<ProcessEvent>.makeStream()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.environment = environment
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = pipe
        process.standardError = pipe
        let fd = fcntl(pipe.fileHandleForReading.fileDescriptor, F_DUPFD_CLOEXEC, 3)
        guard fd >= 0 else { throw ORIError.process("No se pudo preparar la lectura del proceso.") }
        let queue = DispatchQueue(label: "ori.process.io.\(id)")
        let channel = DispatchIO(type: .stream, fileDescriptor: fd, queue: queue) { _ in
            Darwin.close(fd)
        }
        channel.setLimit(lowWater: 1)
        process.terminationHandler = { [weak self] process in
            Task { await self?.finished(id: id, status: process.terminationStatus) }
        }
        entries[id] = Entry(process: process, channel: channel, continuation: continuation)
        channel.read(offset: 0, length: Int.max, queue: queue) { [weak self] done, data, _ in
            if let data, !data.isEmpty { continuation.yield(.output(Data(data))) }
            if done { Task { await self?.drained(id) } }
        }
        do { try process.run() } catch {
            channel.close(flags: .stop)
            try? pipe.fileHandleForReading.close()
            try? pipe.fileHandleForWriting.close()
            entries.removeValue(forKey: id)
            continuation.finish()
            throw ORIError.process("No se pudo iniciar el proceso: \(error.localizedDescription)")
        }
        try? pipe.fileHandleForReading.close()
        try? pipe.fileHandleForWriting.close()
        return ManagedProcess(id: id, events: stream)
    }
    private func finished(id: UUID, status: Int32) {
        guard entries[id] != nil else { return }
        entries[id]?.status = status
        if entries[id]?.drained == true {
            finalize(id)
            return
        }
        // A ProxyCommand descendant may retain stderr. Never block an actor waiting for EOF.
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            await self?.finishDrain(id)
        }
    }
    private func finishDrain(_ id: UUID) { entries[id]?.channel.close(flags: .stop) }
    private func drained(_ id: UUID) {
        guard entries[id] != nil else { return }
        entries[id]?.drained = true
        if entries[id]?.status != nil { finalize(id) }
    }
    private func finalize(_ id: UUID) {
        guard let entry = entries.removeValue(forKey: id), let status = entry.status else { return }
        entry.channel.close()
        entry.continuation.yield(.exited(status))
        entry.continuation.finish()
    }
    public func stop(_ id: UUID) async {
        guard let entry = entries[id] else { return }
        if entry.process.isRunning { entry.process.terminate() }
        try? await Task.sleep(for: .milliseconds(700))
        // Process owns the child; isRunning is checked while the actor serializes lifecycle.
        if let entry = entries[id], entry.process.isRunning {
            kill(entry.process.processIdentifier, SIGKILL)
        }
        for _ in 0..<20 {
            if entries[id] == nil { return }
            try? await Task.sleep(for: .milliseconds(50))
        }
    }
    public func stopAll() async { for id in Array(entries.keys) { await stop(id) } }
    public var runningCount: Int { entries.count }
}

public struct CommandResult: Sendable {
    public var status: Int32
    public var output: String
}
public struct SystemCommandRunner: Sendable {
    private static let maximumOutputBytes = 1_048_576
    public init() {}
    public func run(
        _ executable: String, _ arguments: [String], timeout: Duration = .seconds(5),
        environment: [String: String] = [:]
    )
        async throws -> CommandResult
    {
        let supervisor = ProcessSupervisor()
        let process = try await supervisor.start(
            executable: executable, arguments: arguments,
            environment: ProcessInfo.processInfo.environment.merging(
                environment.merging(["LC_ALL": "C", "LANG": "C"]) { _, n in n }
            ) {
                _, n in n
            })
        return try await withTaskCancellationHandler {
            do {
                return try await withThrowingTaskGroup(of: CommandResult.self) { group in
                    group.addTask {
                        var bytes = Data()
                        var truncated = false
                        for await event in process.events {
                            switch event {
                            case .output(let data):
                                let remaining = Self.maximumOutputBytes - bytes.count
                                if data.count > remaining { truncated = true }
                                bytes.append(data.prefix(remaining))
                            case .exited(let status):
                                guard !truncated else {
                                    throw ORIError.process(
                                        "La salida del proceso supera el límite de 1 MB; no se interpreta un resultado incompleto."
                                    )
                                }
                                return CommandResult(
                                    status: status, output: String(decoding: bytes, as: UTF8.self))
                            }
                        }
                        throw ORIError.process("No se recibió el resultado del proceso.")
                    }
                    group.addTask {
                        try await Task.sleep(for: timeout)
                        throw ORIError.unavailable("Tiempo de espera agotado.")
                    }
                    defer { group.cancelAll() }
                    guard let result = try await group.next() else { throw CancellationError() }
                    return result
                }
            } catch {
                await supervisor.stop(process.id)
                throw error
            }
        } onCancel: {
            Task { await supervisor.stop(process.id) }
        }
    }
}

public struct SSHResolvedConfiguration: Sendable {
    public var hostname: String
    public var port: Int
    public var username: String
    public var proxyJump: String?
    public var proxyCommandPresent: Bool
}
public struct SSHConfigResolver: Sendable {
    public init() {}
    /// Only call for trusted, local configuration. `Match exec` may execute commands even with -G.
    public func resolve(plan: SSHLaunchPlan) async throws -> SSHResolvedConfiguration {
        var args = plan.arguments
        if let i = args.firstIndex(of: "-E"), i + 1 < args.count { args.removeSubrange(i...i + 1) }
        args.insert("-G", at: 0)
        let result = try await SystemCommandRunner().run(SSHArgumentBuilder.executable, args)
        guard result.status == 0 else {
            throw ORIError.invalid("OpenSSH no puede resolver la configuración local.")
        }
        var fields: [String: String] = [:]
        for line in result.output.split(separator: "\n") {
            let parts = line.split(separator: " ", maxSplits: 1)
            if parts.count == 2 { fields[String(parts[0])] = String(parts[1]) }
        }
        guard let host = fields["hostname"], let port = Int(fields["port"] ?? "22") else {
            throw ORIError.invalid("Configuración SSH incompleta.")
        }
        return .init(
            hostname: host, port: port, username: fields["user"] ?? "",
            proxyJump: fields["proxyjump"].flatMap { $0 == "none" ? nil : $0 },
            proxyCommandPresent: fields["proxycommand"].map { $0 != "none" } ?? false)
    }
}

public struct SSHRuntimeFiles: Sendable {
    public var directory: URL
    public var configuration: URL { directory.appendingPathComponent("ssh_config") }
    public var log: URL { directory.appendingPathComponent("ssh.log") }
    public init(root: URL, id: String = UUID().uuidString) throws {
        let requested = root.appendingPathComponent(id, isDirectory: true)
        // OpenSSH interpolates -F into its implicit ProxyJump shell command without quoting.
        // Keep only runtime files in a private, shell-safe path; persistent data stays in place.
        if Self.isProxyJumpSafe(requested.path) {
            directory = requested
        } else {
            let temporary = FileManager.default.temporaryDirectory
            let base =
                Self.isProxyJumpSafe(temporary.path)
                ? temporary : URL(fileURLWithPath: "/private/tmp", isDirectory: true)
            directory = base.appendingPathComponent(
                "ori-ssh-\(UUID().uuidString)", isDirectory: true)
        }
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
    }
    private static func isProxyJumpSafe(_ path: String) -> Bool {
        let allowed = CharacterSet(
            charactersIn: "/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-")
        return path.unicodeScalars.allSatisfy(allowed.contains)
    }
    public func write(_ plan: SSHLaunchPlan) throws {
        try Data(plan.managedConfiguration.utf8).write(to: configuration, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600], ofItemAtPath: configuration.path)
    }
    public func remove() { try? FileManager.default.removeItem(at: directory) }
}
