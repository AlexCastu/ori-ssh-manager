import AppKit
import Darwin
import Foundation
import ORICore

struct SSHAskpassManifest: Codable {
    var references: [SSHPasswordReference]

    func reference(for prompt: String) -> SSHPasswordReference? {
        let matches = references.filter { $0.matches(prompt: prompt) }
        return matches.count == 1 ? matches[0] : nil
    }
}

enum SSHAskpass {
    static func prepare(
        files: SSHRuntimeFiles, connection: ConnectionProfile, configuration: Configuration,
        store: SSHPasswordStore, executable: URL
    ) throws -> [String: String] {
        guard let host = configuration.host(connection.hostID) else { return [:] }
        let endpoints =
            try Validation.resolvedHops(connection, configuration: configuration) + [host]
        let references = endpoints.filter {
            $0.authentication == .interactive || $0.authentication == .configuration
        }.map(SSHPasswordReference.init)
        let saved = try store.all()
        guard references.contains(where: { ref in saved.contains { $0.reference == ref } }) else {
            return [:]
        }
        let manifest = files.directory.appendingPathComponent("askpass.json")
        let helper = files.directory.appendingPathComponent("askpass")
        try JSONEncoder().encode(SSHAskpassManifest(references: references)).write(
            to: manifest, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600], ofItemAtPath: manifest.path)
        func quote(_ text: String) -> String {
            "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'"
        }
        let source =
            "#!/bin/sh\nexec \(quote(executable.path)) --ssh-askpass "
            + "\(quote(manifest.path)) \(quote(store.directory.deletingLastPathComponent().path)) \"$@\"\n"
        try Data(source.utf8).write(to: helper, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: helper.path)
        return ["SSH_ASKPASS": helper.path, "SSH_ASKPASS_REQUIRE": "force"]
    }

    @MainActor static func run(arguments: [String]) -> Int32 {
        guard arguments.count == 5 else { return 1 }
        let manifestURL = URL(fileURLWithPath: arguments[2])
        let store = SSHPasswordStore(dataDirectory: URL(fileURLWithPath: arguments[3]))
        let prompt = arguments[4]
        guard let bytes = try? Data(contentsOf: manifestURL), bytes.count < 65_536,
            let manifest = try? JSONDecoder().decode(SSHAskpassManifest.self, from: bytes)
        else { return 1 }
        if let reference = manifest.reference(for: prompt),
            let password = try? store.password(for: reference)
        {
            // One automatic attempt per endpoint and session; stale passwords fall back to a dialog.
            let marker = manifestURL.deletingLastPathComponent().appendingPathComponent(
                "used-" + reference.account)
            let fd = open(marker.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
            if fd >= 0 {
                close(fd)
                return answer(password)
            }
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        app.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "OpenSSH · ORI"
        alert.informativeText = prompt
        let confirming =
            ProcessInfo.processInfo.environment["SSH_ASKPASS_PROMPT"] == "confirm"
            || prompt.contains("Are you sure you want to continue connecting")
        if confirming {
            alert.addButton(withTitle: "Sí, conectar")
            alert.addButton(withTitle: "Cancelar")
            return alert.runModal() == .alertFirstButtonReturn ? answer("yes") : 1
        }
        let input = NSSecureTextField(frame: NSRect(x: 0, y: 0, width: 360, height: 26))
        alert.accessoryView = input
        alert.addButton(withTitle: "Continuar")
        alert.addButton(withTitle: "Cancelar")
        alert.window.initialFirstResponder = input
        guard alert.runModal() == .alertFirstButtonReturn else { return 1 }
        return answer(input.stringValue)
    }

    private static func answer(_ value: String) -> Int32 {
        guard !value.contains("\n"), !value.contains("\r"), !value.contains("\0") else { return 1 }
        do {
            try FileHandle.standardOutput.write(contentsOf: Data((value + "\n").utf8))
            return 0
        } catch { return 1 }
    }
}
