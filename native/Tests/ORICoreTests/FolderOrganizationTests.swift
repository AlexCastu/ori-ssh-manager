import Foundation
import ORICore
import Testing

struct FolderOrganizationTests {
    private func folder(_ name: String) -> HostGroup {
        var group = HostGroup()
        group.name = name
        return group
    }

    @Test func insertingLevelsPreservesConnectionsAndFolderSelectionIncludesDescendants()
        async throws
    {
        var configuration = Configuration()
        let pre = folder("PRE")
        let pro = folder("PRO")
        let baf = folder("BAF")
        let nested = folder("Internodos")
        let proBAF = folder("BAF")
        try ConnectionOrganizer.createGroup(pre, in: &configuration)
        try ConnectionOrganizer.createGroup(pro, in: &configuration)
        try ConnectionOrganizer.createGroup(
            baf, relativeTo: pre.id, placement: .child, in: &configuration)
        try ConnectionOrganizer.createGroup(
            nested, relativeTo: baf.id, placement: .child, in: &configuration)
        try ConnectionOrganizer.createGroup(
            proBAF, relativeTo: pro.id, placement: .child, in: &configuration)
        for (index, group) in [baf, nested, proBAF].enumerated() {
            var host = HostProfile()
            host.name = "Servidor \(index)"
            host.address = "host\(index).test"
            host.groupID = group.id
            configuration.hosts.append(host)
            configuration.connections.append(ConnectionProfile(hostID: host.id))
        }
        let hosts = configuration.hosts
        let routes = configuration.connections
        let ids = ConnectionOrganizer.descendantGroupIDs(of: baf.id, in: configuration)
        #expect(ids == [baf.id, nested.id])
        #expect(configuration.hosts.filter { $0.groupID.map(ids.contains) ?? false }.count == 2)
        let parent = folder("Servicios")
        try ConnectionOrganizer.createGroup(
            parent, relativeTo: baf.id, placement: .parent, in: &configuration)
        #expect(configuration.groups.first { $0.id == parent.id }?.parentID == pre.id)
        #expect(configuration.groups.first { $0.id == baf.id }?.parentID == parent.id)
        let sibling = folder("BAM")
        try ConnectionOrganizer.createGroup(
            sibling, relativeTo: baf.id, placement: .sibling, in: &configuration)
        let peers = configuration.groups.filter { $0.parentID == parent.id }.sorted {
            $0.order < $1.order
        }
        #expect(peers.map(\.id) == [baf.id, sibling.id])
        let root = folder("Red")
        try ConnectionOrganizer.createGroup(
            root, relativeTo: pre.id, placement: .parent, in: &configuration)
        #expect(configuration.groups.first { $0.id == pre.id }?.parentID == root.id)
        #expect(configuration.hosts == hosts)
        #expect(configuration.connections == routes)
        let store = try ConfigurationStore(path: ":memory:")
        _ = try await store.replace(configuration)
        let loaded = try await store.load()
        #expect(loaded.groups == configuration.groups)
        #expect(loaded.connections == routes)
    }

    @Test func invalidFolderMovesAndMissingReferencesLeaveConfigurationIntact() throws {
        var configuration = Configuration()
        let parent = folder("PRE")
        let child = folder("BAF")
        try ConnectionOrganizer.createGroup(parent, in: &configuration)
        try ConnectionOrganizer.createGroup(
            child, relativeTo: parent.id, placement: .child, in: &configuration)
        let before = configuration
        var moving = parent
        moving.parentID = child.id
        #expect(throws: (any Error).self) {
            try ConnectionOrganizer.updateGroup(moving, in: &configuration)
        }
        #expect(configuration == before)
        #expect(throws: (any Error).self) {
            try ConnectionOrganizer.createGroup(
                folder("Nueva"), relativeTo: "missing", placement: .parent, in: &configuration)
        }
        #expect(configuration == before)
    }

    @Test func moverCarpetaDelanteDeOtraReordenaYNoPermiteCiclos() throws {
        var configuration = Configuration()
        let a = folder("A")
        let b = folder("B")
        let hija = folder("Hija")
        try ConnectionOrganizer.createGroup(a, in: &configuration)
        try ConnectionOrganizer.createGroup(b, in: &configuration)
        try ConnectionOrganizer.createGroup(
            hija, relativeTo: a.id, placement: .child, in: &configuration)
        // La hija sale de A y queda la primera de la raíz
        try ConnectionOrganizer.moveGroup(hija.id, before: a.id, in: &configuration)
        let raiz = configuration.groups.filter { $0.parentID == nil }.sorted { $0.order < $1.order }
        #expect(raiz.map(\.name) == ["Hija", "A", "B"])
        // A no puede ir delante de algo que está dentro de ella
        try ConnectionOrganizer.createGroup(
            folder("Nieta"), relativeTo: b.id, placement: .child, in: &configuration)
        let nieta = configuration.groups.first { $0.name == "Nieta" }!
        #expect(throws: (any Error).self) {
            try ConnectionOrganizer.moveGroup(b.id, before: nieta.id, in: &configuration)
        }
    }
}
