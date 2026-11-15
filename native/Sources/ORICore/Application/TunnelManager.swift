import Foundation

public struct TunnelInstance: Sendable, Identifiable, Equatable {
    public var id: String
    public var state: TunnelState = .stopped
    public var authenticated = false
    public var forwardingEstablished = false
    public var serviceReachable: Bool? = nil
    public var startedAt: Date? = nil
    public var lastError: ConnectionDiagnostic? = nil
    public var attempts = 0
    public var checkedAt: Date? = nil
    public init(id: String) { self.id = id }
}

public actor TunnelManager {
    private struct Run {
        var token = UUID()
        var processID: UUID?
        var files: SSHRuntimeFiles?
        var task: Task<Void, Never>?
        var parser = SSHLogParser()
        var instance: TunnelInstance
        var sawListener = false
        var sawReady = false
        var profile: TunnelProfile
        var configuration: Configuration
    }
    private let supervisor: ProcessSupervisor
    private let runtimeRoot: URL
    private var runs: [String: Run] = [:]
    private var observers: [UUID: AsyncStream<[TunnelInstance]>.Continuation] = [:]
    public init(supervisor: ProcessSupervisor, runtimeRoot: URL) {
        self.supervisor = supervisor
        self.runtimeRoot = runtimeRoot
    }
    public func updates() -> AsyncStream<[TunnelInstance]> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<[TunnelInstance]>.makeStream(
            bufferingPolicy: .bufferingNewest(1))
        observers[id] = continuation
        continuation.yield(snapshots)
        continuation.onTermination = { [weak self] _ in Task { await self?.removeObserver(id) } }
        return stream
    }
    private func removeObserver(_ id: UUID) { observers.removeValue(forKey: id) }
    public var snapshots: [TunnelInstance] { runs.values.map(\.instance).sorted { $0.id < $1.id } }
    private func publish() { for observer in observers.values { observer.yield(snapshots) } }
    public func start(_ profile: TunnelProfile, configuration: Configuration) async throws {
        if let existing = runs[profile.id],
            [.starting, .active, .reconnecting, .stopping].contains(existing.instance.state)
        {
            return
        }
        try Validation.tunnel(profile)
        guard
            let connection = configuration.connections.first(where: {
                $0.id == profile.connectionID
            })
        else {
            throw ORIError.invalid("No existe el perfil de conexión del túnel.")
        }
        _ = try Validation.resolvedHops(connection, configuration: configuration)
        let conflict = runs.values.contains { run in
            guard run.profile.id != profile.id,
                [.starting, .active, .reconnecting].contains(run.instance.state)
            else { return false }
            if profile.kind == .remote || run.profile.kind == .remote {
                return profile.kind == .remote && run.profile.kind == .remote
                    && profile.connectionID == run.profile.connectionID
                    && profile.listenPort == run.profile.listenPort
                    && profile.bindAddress == run.profile.bindAddress
            }
            return profile.listenPort == run.profile.listenPort
                && (profile.bindAddress == run.profile.bindAddress
                    || ["0.0.0.0", "::"].contains(profile.bindAddress)
                    || ["0.0.0.0", "::"].contains(run.profile.bindAddress))
        }
        guard !conflict else { throw ORIError.invalid("Otro túnel de ORI utiliza esta escucha.") }
        var instance = TunnelInstance(id: profile.id)
        instance.state = .starting
        let run = Run(instance: instance, profile: profile, configuration: configuration)
        runs[profile.id] = run
        publish()
        do { try await launch(profile.id, token: run.token) } catch {
            if runs[profile.id]?.token == run.token {
                runs[profile.id]?.instance.state = .failed
                runs[profile.id]?.instance.lastError = .init(
                    kind: .tunnel, message: error.localizedDescription)
                publish()
            }
            throw error
        }
    }
    private func launch(_ id: String, token: UUID) async throws {
        guard let run = runs[id], run.token == token else { return }
        let profile = run.profile
        guard
            let connection = run.configuration.connections.first(where: {
                $0.id == profile.connectionID
            })
        else { return }
        if profile.kind != .remote,
            try !PortConflictDetector.isAvailable(
                address: profile.bindAddress, port: profile.listenPort)
        {
            throw ORIError.unavailable("El puerto local solicitado ya está ocupado.")
        }
        let files = try SSHRuntimeFiles(root: runtimeRoot)
        let plan: SSHLaunchPlan
        do {
            plan = try SSHArgumentBuilder.build(
                connection: connection, configuration: run.configuration,
                configurationPath: files.configuration.path, tunnel: profile)
            try files.write(plan)
        } catch {
            files.remove()
            throw error
        }
        runs[id]?.files = files
        runs[id]?.parser = SSHLogParser()
        runs[id]?.sawListener = false
        runs[id]?.sawReady = false
        runs[id]?.instance.authenticated = false
        runs[id]?.instance.forwardingEstablished = false
        let process: ManagedProcess
        do {
            var environment = ProcessInfo.processInfo.environment
            environment["LC_ALL"] = "C"
            environment["LANG"] = "C"
            process = try await supervisor.start(
                executable: SSHArgumentBuilder.executable, arguments: plan.arguments,
                environment: environment)
        } catch {
            files.remove()
            throw error
        }
        guard runs[id]?.token == token else {
            await supervisor.stop(process.id)
            files.remove()
            return
        }
        runs[id]?.processID = process.id
        runs[id]?.task = Task { [weak self] in
            for await event in process.events {
                guard !Task.isCancelled else { break }
                await self?.consume(id, token: token, event: event)
            }
        }
    }
    private func consume(_ id: String, token: UUID, event: ProcessEvent) async {
        guard var run = runs[id], run.token == token else { return }
        switch event {
        case .output(let data):
            for progress in run.parser.ingest(String(decoding: data, as: UTF8.self)) {
                switch progress {
                case .authenticated: run.instance.authenticated = true
                case .transportReady: run.sawReady = true
                case .localForwardReady: if run.profile.kind != .remote { run.sawListener = true }
                case .remoteForwardReady: if run.profile.kind == .remote { run.sawListener = true }
                case .failure(let diagnostic): run.instance.lastError = diagnostic
                case .authenticating, .sessionReady: break
                }
            }
            if run.instance.authenticated && run.sawListener && run.sawReady
                && run.instance.lastError == nil
            {
                run.instance.state = .active
                run.instance.forwardingEstablished = true
                if run.instance.startedAt == nil { run.instance.startedAt = Date() }
            }
            runs[id] = run
            publish()
        case .exited(let status):
            run.processID = nil
            run.files?.remove()
            run.files = nil
            run.instance.authenticated = false
            run.instance.forwardingEstablished = false
            run.instance.serviceReachable = nil
            run.instance.startedAt = nil
            if run.instance.lastError == nil {
                run.instance.lastError = .init(
                    kind: status == 255 ? .disconnected : .ssh,
                    message: "El proceso SSH del túnel ha finalizado (\(status)).")
            }
            run.instance.state = .failed
            let next = run.instance.attempts + 1
            if run.instance.lastError?.retryable == true,
                let delay = run.profile.reconnect.delay(attempt: next)
            {
                run.instance.attempts = next
                run.instance.state = .reconnecting
                run.task = Task { [weak self] in
                    do {
                        try await Task.sleep(for: .seconds(delay))
                        try Task.checkCancellation()
                        try await self?.retry(id, token: token)
                    } catch is CancellationError {} catch {
                        await self?.retryFailed(id, token: token, error: error)
                    }
                }
            }
            runs[id] = run
            publish()
        }
    }
    private func retry(_ id: String, token: UUID) async throws {
        guard runs[id]?.token == token else { return }
        try Task.checkCancellation()
        runs[id]?.instance.lastError = nil
        try await launch(id, token: token)
    }
    private func retryFailed(_ id: String, token: UUID, error: any Error) {
        guard runs[id]?.token == token else { return }
        runs[id]?.instance.state = .failed
        runs[id]?.instance.lastError = .init(kind: .tunnel, message: error.localizedDescription)
        publish()
    }
    public func stop(_ id: String) async {
        guard let old = runs[id] else { return }
        let stoppedToken = UUID()
        runs[id]?.token = stoppedToken
        runs[id]?.task?.cancel()
        runs[id]?.instance.state = .stopping
        publish()
        if let processID = old.processID { await supervisor.stop(processID) }
        old.files?.remove()
        guard runs[id]?.token == stoppedToken else { return }
        runs[id]?.processID = nil
        runs[id]?.task = nil
        runs[id]?.files = nil
        runs[id]?.instance = TunnelInstance(id: id)
        publish()
    }
    public func stopAll() async { for id in Array(runs.keys) { await stop(id) } }
    public func checkService(_ id: String) async throws {
        guard let run = runs[id], let target = run.profile.healthTarget else {
            throw ORIError.invalid(
                "Configura un objetivo de salud explícito. Una escucha no confirma el servicio remoto."
            )
        }
        let token = run.token
        let reachable = try await TCPReachabilityProbe().check(target)
        guard runs[id]?.token == token else { return }
        runs[id]?.instance.serviceReachable = reachable
        runs[id]?.instance.checkedAt = Date()
        publish()
    }
}
