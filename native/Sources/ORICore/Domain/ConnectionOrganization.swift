import Foundation

public struct DiagramPosition: Codable, Sendable, Equatable {
    public var x: Double
    public var y: Double
    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct ConnectionOrganization: Codable, Sendable, Equatable {
    public var hostOrder: [String] = []
    public var positions: [String: DiagramPosition] = [:]
    public init() {}
}

public struct RepositoryRoot: Codable, Identifiable, Sendable, Equatable {
    public var id = UUID().uuidString
    public var name: String
    public var path: String
    public var maxDepth = 3
    public init(name: String, path: String) {
        self.name = name
        self.path = path
    }
}

public enum ConnectionOrganizer {
    public enum FolderPlacement: Sendable {
        case root, child, sibling, parent
    }

    public static func descendantGroupIDs(
        of groupID: String, in configuration: Configuration
    ) -> Set<String> {
        var result: Set<String> = [groupID]
        var pending = [groupID]
        while let parent = pending.popLast() {
            for group in configuration.groups where group.parentID == parent {
                if result.insert(group.id).inserted { pending.append(group.id) }
            }
        }
        return result
    }

    public static func createGroup(
        _ group: HostGroup, relativeTo referenceID: String? = nil,
        placement: FolderPlacement = .root, in configuration: inout Configuration
    ) throws {
        guard !configuration.groups.contains(where: { $0.id == group.id }) else {
            throw ORIError.invalid("Ya existe una carpeta con ese identificador.")
        }
        var candidate = configuration
        var value = group
        let reference = candidate.groups.first { $0.id == referenceID }
        if placement != .root && reference == nil {
            throw ORIError.invalid("La carpeta seleccionada ya no existe.")
        }
        switch placement {
        case .root: value.parentID = nil
        case .child: value.parentID = referenceID
        case .sibling, .parent: value.parentID = reference?.parentID
        }
        var peers = candidate.groups.filter { $0.parentID == value.parentID }.sorted {
            ($0.order, $0.name) < ($1.order, $1.name)
        }.map(\.id)
        if placement == .parent, let referenceID {
            guard let index = candidate.groups.firstIndex(where: { $0.id == referenceID }),
                let position = peers.firstIndex(of: referenceID)
            else { throw ORIError.invalid("La carpeta seleccionada ya no existe.") }
            peers[position] = value.id
            candidate.groups[index].parentID = value.id
            candidate.groups[index].order = 0
            value.expanded = true
        } else if placement == .sibling, let referenceID,
            let position = peers.firstIndex(of: referenceID)
        {
            peers.insert(value.id, at: position + 1)
        } else {
            peers.append(value.id)
        }
        candidate.groups.append(value)
        for (order, id) in peers.enumerated() {
            if let index = candidate.groups.firstIndex(where: { $0.id == id }) {
                candidate.groups[index].order = order
            }
        }
        if let parent = value.parentID,
            let index = candidate.groups.firstIndex(where: { $0.id == parent })
        {
            candidate.groups[index].expanded = true
        }
        try Validation.configuration(candidate)
        configuration = candidate
    }

    public static func updateGroup(_ group: HostGroup, in configuration: inout Configuration) throws
    {
        guard let index = configuration.groups.firstIndex(where: { $0.id == group.id }) else {
            throw ORIError.invalid("La carpeta ya no existe.")
        }
        var candidate = configuration
        candidate.groups[index] = group
        try Validation.configuration(candidate)
        configuration = candidate
    }

    // Coloca la carpeta justo delante de otra, en el mismo nivel que ella
    public static func moveGroup(
        _ id: String, before targetID: String, in configuration: inout Configuration
    ) throws {
        guard id != targetID else { return }
        guard let index = configuration.groups.firstIndex(where: { $0.id == id }),
            let target = configuration.groups.first(where: { $0.id == targetID })
        else { throw ORIError.invalid("La carpeta ya no existe.") }
        var candidate = configuration
        candidate.groups[index].parentID = target.parentID
        var peers = candidate.groups.filter { $0.parentID == target.parentID && $0.id != id }
            .sorted { ($0.order, $0.name) < ($1.order, $1.name) }.map(\.id)
        peers.insert(id, at: peers.firstIndex(of: targetID) ?? peers.endIndex)
        for (order, peer) in peers.enumerated() {
            if let i = candidate.groups.firstIndex(where: { $0.id == peer }) {
                candidate.groups[i].order = order
            }
        }
        // Valida también que no se meta dentro de sí misma
        try Validation.configuration(candidate)
        configuration = candidate
    }

    public static func moveHost(
        _ id: String, to groupID: String?, before targetID: String? = nil,
        in configuration: inout Configuration
    ) throws {
        guard let index = configuration.hosts.firstIndex(where: { $0.id == id }),
            groupID == nil || configuration.groups.contains(where: { $0.id == groupID })
        else { throw ORIError.invalid("La conexión o la carpeta ya no existe.") }
        guard targetID != id else { return }
        if let targetID {
            guard
                configuration.hosts.contains(where: { $0.id == targetID && $0.groupID == groupID })
            else { throw ORIError.invalid("El destino de ordenación ya no existe.") }
        }
        configuration.hosts[index].groupID = groupID
        var organization = configuration.organization ?? .init()
        let valid = Set(configuration.hosts.map(\.id))
        var order = organization.hostOrder.filter { valid.contains($0) && $0 != id }
        for host in configuration.hosts where host.id != id && !order.contains(host.id) {
            order.append(host.id)
        }
        let insertion = targetID.flatMap { order.firstIndex(of: $0) } ?? order.endIndex
        order.insert(id, at: insertion)
        organization.hostOrder = order
        configuration.organization = organization
    }

    public static func insertJump(
        _ hostID: String, before hopID: String? = nil, in connection: inout ConnectionProfile,
        configuration: Configuration
    ) throws {
        guard let host = configuration.host(hostID), host.usableAsJump else {
            throw ORIError.invalid("Marca esta conexión como bastión antes de usarla como salto.")
        }
        var hops = connection.route.hops
        let existing = hops.first { $0.hostID == hostID }
        if let existing, existing.id == hopID { return }
        hops.removeAll { $0.hostID == hostID }
        var hop = existing ?? JumpHop()
        hop.hostID = hostID
        let index = hopID.flatMap { id in hops.firstIndex { $0.id == id } } ?? hops.endIndex
        hops.insert(hop, at: index)
        var candidate = connection
        candidate.route.hops = hops
        _ = try Validation.resolvedHops(candidate, configuration: configuration)
        connection = candidate
    }
}
