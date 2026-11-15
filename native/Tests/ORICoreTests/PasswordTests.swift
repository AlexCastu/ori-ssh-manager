import Foundation
import ORICore
import Testing

struct PasswordTests {
    private func host() -> HostProfile {
        var host = HostProfile()
        host.name = "Fixture"
        host.address = "127.0.0.1"
        host.username = "fixture"
        host.authentication = .interactive
        return host
    }

    @Test func portableArchiveRecoversConfigurationAndPasswordsWithoutLocalKey() throws {
        let host = host()
        var configuration = Configuration()
        configuration.hosts = [host]
        configuration.connections = [ConnectionProfile(hostID: host.id)]
        let entry = StoredSSHPassword(host: host, password: "SYNTHETIC_ñ_'_PASSWORD")
        let payload = PortablePayload(configuration: configuration, passwords: [entry])
        let password = "Synthetic archive password ñ"
        let data = try PortableArchive.encode(payload, password: password)
        if let directory = ProcessInfo.processInfo.environment["ORI_PASSWORD_FIXTURES"] {
            try data.write(
                to: URL(fileURLWithPath: directory).appendingPathComponent("portable-fixture.json"))
        }
        #expect(PortableArchive.recognizes(data))
        let text = String(decoding: data, as: UTF8.self)
        #expect(!text.contains(entry.password))
        #expect(!text.contains(host.address))
        #expect(!text.contains(password))
        let restored = try PortableArchive.decode(data, password: password)
        #expect(restored.configuration == configuration)
        #expect(restored.passwords == [entry])
        #expect(throws: (any Error).self) {
            try PortableArchive.decode(data, password: "incorrect-password")
        }
        var object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
        var ciphertext = try #require(Data(base64Encoded: object["ciphertext"] as? String ?? ""))
        ciphertext[ciphertext.count / 2] ^= 1
        object["ciphertext"] = ciphertext.base64EncodedString()
        let altered = try JSONSerialization.data(withJSONObject: object)
        #expect(throws: (any Error).self) {
            try PortableArchive.decode(altered, password: password)
        }
        let second = try PortableArchive.encode(payload, password: password)
        #expect(second != data)
    }

    @Test func localStoreIsEncryptedAndScopedToProfileEndpoint() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SSHPasswordStore(dataDirectory: root)
        let host = host()
        let entry = StoredSSHPassword(host: host, password: "FAKE_PASSWORD_ONLY")
        try store.save([entry])
        #expect(try store.password(for: entry.reference) == entry.password)
        let vault = try Data(contentsOf: store.directory.appendingPathComponent("passwords.json"))
        #expect(!String(decoding: vault, as: UTF8.self).contains(entry.password))
        var changed = host
        changed.address = "another.test"
        #expect(try store.password(for: SSHPasswordReference(host: changed)) == nil)
        changed = host
        changed.username = "another"
        #expect(try store.password(for: SSHPasswordReference(host: changed)) == nil)
        for name in ["local.key", "passwords.json"] {
            let attrs = try FileManager.default.attributesOfItem(
                atPath: store.directory.appendingPathComponent(name).path)
            #expect((attrs[.posixPermissions] as? NSNumber)?.intValue == 0o600)
        }
        try store.save([StoredSSHPassword(host: host, password: "replacement")])
        #expect(try store.all().count == 1)
        try store.save([StoredSSHPassword(host: host, password: "")])
        #expect(try store.all().isEmpty)
    }

    @Test func passwordPromptMustMatchExactEndpoint() {
        let reference = SSHPasswordReference(host: host())
        #expect(reference.matches(prompt: "fixture@127.0.0.1's password: "))
        #expect(!reference.matches(prompt: "banner fixture@127.0.0.1's password: "))
        #expect(!reference.matches(prompt: "other@127.0.0.1's password: "))
        #expect(!reference.matches(prompt: "Are you sure you want to continue connecting?"))
        #expect(!reference.matches(prompt: "Enter passphrase for key '/tmp/key': "))
    }
}
