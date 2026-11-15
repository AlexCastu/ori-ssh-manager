import Foundation

public struct SSHLaunchPlan: Sendable, Equatable {
    public var arguments: [String]
    public var managedConfiguration: String
    public var firstHop: HostProfile
    public var configurationPath: String
}

public enum SSHArgumentBuilder {
    public static let executable = "/usr/bin/ssh"
    public static func build(
        connection: ConnectionProfile, configuration: Configuration,
        configurationPath: String, logPath: String? = nil,
        tunnel: TunnelProfile? = nil, home: String = NSHomeDirectory()
    ) throws -> SSHLaunchPlan {
        guard let host = configuration.host(connection.hostID) else {
            throw ORIError.invalid("No existe el servidor.")
        }
        try Validation.host(host)
        let hops = try Validation.resolvedHops(connection, configuration: configuration)
        if let tunnel { try Validation.tunnel(tunnel) }
        try Validation.identity(configurationPath)
        let unattended = tunnel != nil
        if let path = connection.knownHostsPath { try Validation.identity(path) }
        var overlay = "# ORI: configuración temporal sin secretos. No editar.\n"
        for hop in hops {
            overlay += "Host \(hop.address)\n"
            if !hop.username.isEmpty {
                overlay += "  User \(hop.username)\n"
            } else if !host.username.isEmpty {
                overlay += "  User \(host.username)\n"
            }
            if let port = hop.port { overlay += "  Port \(port)\n" }
            if !hop.identityPath.isEmpty {
                overlay += "  IdentityFile \(try quotedPath(hop.identityPath, home: home))\n"
            }
            overlay += "  ForwardAgent no\n  StrictHostKeyChecking \(unattended ? "yes" : "ask")\n"
            overlay += "  BatchMode \(unattended ? "yes" : "no")\n"
            if let path = connection.knownHostsPath {
                overlay += "  UserKnownHostsFile \(try quotedPath(path, home: home))\n"
            }
            overlay +=
                "  ControlMaster no\n  ControlPath none\n  ControlPersist no\n  ForkAfterAuthentication no\n"
            overlay +=
                "  ConnectTimeout \(connection.timeout)\n  ServerAliveInterval \(connection.keepalive)\n"
            if hop.authentication == .key { overlay += "  IdentitiesOnly yes\n" }
        }
        overlay += "Host *\n"
        if connection.useSSHConfig {
            overlay += "  Include \(try quotedPath(home + "/.ssh/config", home: home))\n"
            overlay += "Host *\n  Include /etc/ssh/ssh_config\n"
        }
        var args = [
            "-F", configurationPath, unattended ? "-v" : "-vv", "-o", "ForwardAgent=no",
            "-o", "StrictHostKeyChecking=\(unattended ? "yes" : "ask")",
            "-o", "ControlMaster=no", "-o", "ControlPath=none", "-o", "ControlPersist=no",
            "-o", "ForkAfterAuthentication=no", "-o", "PermitLocalCommand=no",
            "-o", "RemoteCommand=none", "-o", "ConnectTimeout=\(connection.timeout)",
            "-o", "ServerAliveInterval=\(connection.keepalive)",
            "-o", "ServerAliveCountMax=\(connection.keepaliveCount)",
        ]
        if let port = host.port { args += ["-p", String(port)] }
        if let path = connection.knownHostsPath {
            args += ["-o", "UserKnownHostsFile=\(try quotedPath(path, home: home))"]
        }
        if !host.username.isEmpty { args += ["-l", host.username] }
        if !host.identityPath.isEmpty { args += ["-i", expanded(host.identityPath, home: home)] }
        if host.authentication == .key { args += ["-o", "IdentitiesOnly=yes"] }
        if host.authentication == .agent || host.authentication == .key {
            args += ["-o", "PreferredAuthentications=publickey"]
        }
        if connection.legacyAlgorithms {
            args += [
                "-o", "KexAlgorithms=+diffie-hellman-group14-sha1",
                "-o", "HostKeyAlgorithms=+ssh-rsa", "-o", "PubkeyAcceptedAlgorithms=+ssh-rsa",
            ]
        }
        if !hops.isEmpty {
            args += [
                "-J",
                hops.map { hop in
                    let user = hop.username.isEmpty ? host.username : hop.username
                    let address = bracket(hop.address)
                    return (user.isEmpty ? "" : user + "@") + address
                        + (hop.port.map { ":\($0)" } ?? "")
                }.joined(separator: ","),
            ]
        }
        if let logPath { args += ["-E", logPath] }
        if let tunnel {
            args += ["-N", "-T", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes"]
            let listener = "\(bracket(tunnel.bindAddress)):\(tunnel.listenPort)"
            switch tunnel.kind {
            case .dynamic: args += ["-D", listener]
            case .local:
                args += [
                    "-L",
                    "\(listener):\(bracket(tunnel.destinationHost)):\(tunnel.destinationPort)",
                ]
            case .remote:
                args += [
                    "-R",
                    "\(listener):\(bracket(tunnel.destinationHost)):\(tunnel.destinationPort)",
                ]
            }
        } else {
            args += ["-tt", "-o", "BatchMode=no", "-o", "SessionType=default"]
        }
        args += ["--", host.address]
        return SSHLaunchPlan(
            arguments: args, managedConfiguration: overlay,
            firstHop: hops.first ?? host, configurationPath: configurationPath)
    }
    public static func bracket(_ host: String) -> String { host.contains(":") ? "[\(host)]" : host }
    private static func expanded(_ path: String, home: String) -> String {
        path.hasPrefix("~/") ? home + String(path.dropFirst()) : path
    }
    private static func quotedPath(_ path: String, home: String) throws -> String {
        try Validation.identity(path)
        return "\"\(expanded(path, home: home))\""
    }
}

public enum SSHProgress: Sendable, Equatable {
    case authenticating, authenticated, sessionReady, transportReady, localForwardReady,
        remoteForwardReady
    case failure(ConnectionDiagnostic)
}
public struct SSHLogParser: Sendable {
    private var pending = ""
    public init() {}
    public mutating func ingest(_ text: String) -> [SSHProgress] {
        pending += text
        // Swift treats CRLF as one Character; firstIndex(of: "\n") alone misses it.
        // Normalize after appending so a CR/LF split across reads is also handled.
        pending = pending.replacingOccurrences(of: "\r\n", with: "\n")
        var events: [SSHProgress] = []
        while let newline = pending.firstIndex(of: "\n") {
            let line = String(pending[..<newline])
            pending.removeSubrange(...newline)
            if line.contains("Authentications that can continue:")
                || line.contains("Authenticating to ")
            {
                events.append(.authenticating)
            }
            if line.hasPrefix("Authenticated to ") { events.append(.authenticated) }
            if line.contains("Entering interactive session.") { events.append(.transportReady) }
            if line.contains("shell request accepted on channel ") { events.append(.sessionReady) }
            if line.contains("Local forwarding listening on ") { events.append(.localForwardReady) }
            if line.contains("remote forward success for:") { events.append(.remoteForwardReady) }
            let lower = line.lowercased()
            if [
                "permission denied", "host key verification failed",
                "remote host identification has changed",
                "address already in use", "cannot listen", "forwarding failed", "resolve hostname",
                "connection refused", "connection reset", "timed out", "no route to host",
                "bad configuration option", "bad owner or permissions",
                "can't open user config file",
            ].contains(where: lower.contains)
                || (lower.contains("broken pipe") && !lower.hasPrefix("debug"))
            {
                events.append(.failure(.classify(line)))
            }
        }
        if pending.utf8.count > 32768 { pending = String(pending.suffix(4096)) }
        return events
    }
}

