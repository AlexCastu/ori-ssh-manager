import CommonCrypto
import CryptoKit
import Darwin
import Foundation

public struct SSHPasswordReference: Codable, Sendable, Equatable {
    public var hostID: String
    public var address: String
    public var username: String
    public var port: Int
    public init(host: HostProfile) {
        hostID = host.id
        address = host.address.lowercased()
        username = host.username
        port = host.port ?? 22
    }
    public var account: String {
        let bytes = try! JSONEncoder().encode([hostID, address, username, String(port)])
        return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
    public func matches(prompt: String) -> Bool {
        guard !username.isEmpty else { return false }
        return prompt == "\(username)@\(address)'s password: "
            || prompt == "\(username)@\(address)'s password:"
    }
}

public struct StoredSSHPassword: Codable, Sendable, Equatable {
    public var reference: SSHPasswordReference
    public var password: String
    public init(host: HostProfile, password: String) {
        reference = SSHPasswordReference(host: host)
        self.password = password
    }
}

public struct PortablePayload: Codable, Sendable {
    public var configuration: Configuration
    public var passwords: [StoredSSHPassword]
    public init(configuration: Configuration, passwords: [StoredSSHPassword]) {
        self.configuration = configuration
        self.passwords = passwords
    }
}

public enum PortableArchive {
    private struct Envelope: Codable {
        var format = "ori-encrypted"
        var version = 1
        var cipher = "AES-256-GCM"
        var kdf = "PBKDF2-HMAC-SHA256"
        var iterations = 600_000
        var salt: Data
        var ciphertext: Data
    }
    private static let context = Data("ORI portable archive v1".utf8)
    public static func recognizes(_ data: Data) -> Bool {
        (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["format"] as? String
            == "ori-encrypted"
    }
    public static func encode(_ payload: PortablePayload, password: String) throws -> Data {
        guard password.count >= 12 else {
            throw ORIError.invalid("Usa una contraseña de exportación de al menos 12 caracteres.")
        }
        let salt = randomBytes(count: 16)
        let key = try derive(password, salt: salt, iterations: 600_000)
        let box = try AES.GCM.seal(
            JSONEncoder().encode(payload), using: key, authenticating: context)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return try encoder.encode(Envelope(salt: salt, ciphertext: box.combined!))
    }
    public static func decode(_ data: Data, password: String) throws -> PortablePayload {
        guard data.count <= 64 * 1024 * 1024 else {
            throw ORIError.invalid("El archivo cifrado supera el límite permitido.")
        }
        let envelope: Envelope
        do { envelope = try JSONDecoder().decode(Envelope.self, from: data) } catch {
            throw ORIError.invalid("El archivo cifrado no tiene un formato válido.")
        }
        guard envelope.format == "ori-encrypted", envelope.version == 1,
            envelope.cipher == "AES-256-GCM", envelope.kdf == "PBKDF2-HMAC-SHA256",
            envelope.iterations == 600_000, envelope.salt.count == 16
        else { throw ORIError.invalid("Formato de cifrado no compatible.") }
        do {
            let key = try derive(password, salt: envelope.salt, iterations: envelope.iterations)
            let bytes = try AES.GCM.open(
                AES.GCM.SealedBox(combined: envelope.ciphertext), using: key,
                authenticating: context)
            let payload = try JSONDecoder().decode(PortablePayload.self, from: bytes)
            try Validation.configuration(payload.configuration)
            return payload
        } catch {
            throw ORIError.invalid("Contraseña incorrecta o archivo dañado.")
        }
    }
    private static func derive(_ password: String, salt: Data, iterations: Int) throws
        -> SymmetricKey
    {
        let input = Array(password.utf8)
        var output = [UInt8](repeating: 0, count: 32)
        let status = input.withUnsafeBytes { pass in
            salt.withUnsafeBytes { saltBytes in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2),
                    pass.baseAddress?.assumingMemoryBound(to: Int8.self),
                    input.count, saltBytes.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    salt.count, CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), UInt32(iterations),
                    &output, output.count)
            }
        }
        guard status == kCCSuccess else {
            throw ORIError.unavailable("No se pudo derivar la clave.")
        }
        return SymmetricKey(data: output)
    }
    static func randomBytes(count: Int) -> Data {
        var generator = SystemRandomNumberGenerator()
        return Data((0..<count).map { _ in UInt8.random(in: .min ... .max, using: &generator) })
    }
}

public struct SSHPasswordStore: Sendable {
    public let directory: URL
    public init(dataDirectory: URL) {
        directory = dataDirectory.appendingPathComponent("Credentials", isDirectory: true)
    }
    private var keyURL: URL { directory.appendingPathComponent("local.key") }
    private var vaultURL: URL { directory.appendingPathComponent("passwords.json") }
    private func key(create: Bool) throws -> SymmetricKey? {
        if !FileManager.default.fileExists(atPath: keyURL.path) {
            if FileManager.default.fileExists(atPath: vaultURL.path) {
                throw ORIError.invalid(
                    "Falta la clave del almacén local. Recupera una exportación cifrada.")
            }
            guard create else { return nil }
            try FileManager.default.createDirectory(
                at: directory, withIntermediateDirectories: true,
                attributes: [.posixPermissions: 0o700])
            let fd = open(keyURL.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
            if fd >= 0 {
                let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
                try handle.write(contentsOf: PortableArchive.randomBytes(count: 32))
                try handle.close()
            } else if errno != EEXIST {
                throw ORIError.unavailable("No se pudo crear la clave privada del almacén.")
            }
        }
        let bytes = try Data(contentsOf: keyURL)
        guard bytes.count == 32 else {
            throw ORIError.invalid("La clave del almacén local no es válida.")
        }
        return SymmetricKey(data: bytes)
    }
    public func all() throws -> [StoredSSHPassword] {
        guard let key = try key(create: false),
            FileManager.default.fileExists(atPath: vaultURL.path)
        else { return [] }
        do {
            let data = try Data(contentsOf: vaultURL)
            let envelope = try JSONDecoder().decode([String: Data].self, from: data)
            guard let bytes = envelope["ciphertext"] else { throw ORIError.invalid("") }
            let plain = try AES.GCM.open(AES.GCM.SealedBox(combined: bytes), using: key)
            return try JSONDecoder().decode([StoredSSHPassword].self, from: plain)
        } catch {
            throw ORIError.invalid("No se pudo descifrar el almacén local de contraseñas.")
        }
    }
    public func password(for reference: SSHPasswordReference) throws -> String? {
        try all().first { $0.reference == reference }?.password
    }
    public func save(_ values: [StoredSSHPassword]) throws {
        let key = try key(create: true)!
        let lockURL = directory.appendingPathComponent("vault.lock")
        let fd = open(lockURL.path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ORIError.unavailable("No se pudo abrir el almacén privado.") }
        defer {
            flock(fd, LOCK_UN)
            close(fd)
        }
        guard flock(fd, LOCK_EX) == 0 else {
            throw ORIError.unavailable("El almacén de contraseñas está ocupado.")
        }
        var entries = try all()
        for value in values {
            entries.removeAll { $0.reference == value.reference }
            if !value.password.isEmpty { entries.append(value) }
        }
        let box = try AES.GCM.seal(JSONEncoder().encode(entries), using: key)
        let bytes = try JSONEncoder().encode(["ciphertext": box.combined!])
        try bytes.write(to: vaultURL, options: [.atomic])
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600], ofItemAtPath: vaultURL.path)
    }
}
