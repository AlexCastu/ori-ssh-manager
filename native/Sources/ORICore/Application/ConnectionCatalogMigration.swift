import Foundation

public enum ConnectionCatalogMigration {
    public static func apply(to configuration: inout Configuration) {
        let original = configuration.groups
        func path(_ group: HostGroup) -> String {
            var parts = [group.name]
            var parent = group.parentID
            var visited = Set([group.id])
            while let id = parent, visited.insert(id).inserted,
                let value = original.first(where: { $0.id == id })
            {
                parts.insert(value.name, at: 0)
                parent = value.parentID
            }
            return parts.joined(separator: "/")
        }
        func ensure(_ names: [String]) -> String {
            var parent: String?
            for (index, name) in names.enumerated() {
                let stableID =
                    "ori-catalog-"
                    + names.prefix(index + 1).joined(separator: "-").lowercased()
                    .replacingOccurrences(of: " ", with: "-")
                if let existing = configuration.groups.first(where: {
                    $0.name.localizedCaseInsensitiveCompare(name) == .orderedSame
                        && $0.parentID == parent
                }) {
                    parent = existing.id
                    continue
                }
                if configuration.groups.contains(where: { $0.id == stableID }) {
                    parent = stableID
                    continue
                }
                var group = HostGroup()
                group.id = stableID
                group.name = name
                group.parentID = parent
                group.expanded = names.count == 1
                group.order = configuration.groups.count
                group.color = "green"
                configuration.groups.append(group)
                parent = group.id
            }
            return parent!
        }
        _ = ensure(["PRE"])
        _ = ensure(["PRO"])
        let model = ensure(["Maqueta"])
        for group in original where group.id.hasPrefix("accesos-") {
            let location = path(group)
            if location == "Accesos/Pasarelas" {
                for index in configuration.hosts.indices
                where configuration.hosts[index].groupID == group.id {
                    configuration.hosts[index].isJumpProfile = true
                    configuration.hosts[index].usableAsJump = true
                    configuration.hosts[index].groupID = nil
                }
            } else if ["Accesos/STF", "Accesos/EXECUTION"].contains(location),
                let index = configuration.groups.firstIndex(where: { $0.id == group.id })
            {
                configuration.groups[index].parentID = model
                configuration.groups[index].name = location.hasSuffix("/STF") ? "STF" : "Execution"
                configuration.groups[index].expanded = false
            } else if location.hasPrefix("Accesos/Servicios/") {
                let parts = group.name.components(separatedBy: "·").map {
                    $0.trimmingCharacters(in: .whitespaces)
                }
                guard parts.count == 2, ["PRE", "PRO"].contains(parts[0]),
                    let index = configuration.groups.firstIndex(where: { $0.id == group.id })
                else { continue }
                let parent = ensure([parts[0]])
                configuration.groups[index].parentID = parent
                configuration.groups[index].name = parts[1]
                configuration.groups[index].expanded = false
            } else if location.hasSuffix("/Bastiones") {
                let parts = location.split(separator: "/").map(String.init)
                guard parts.count == 3 else { continue }
                let site = parts[1]
                let environment =
                    site.lowercased().hasPrefix("alc") || site.lowercased().hasPrefix("mmt")
                    ? "PRE" : "PRO"
                let parent = ensure([environment, "Bastiones"])
                if let index = configuration.groups.firstIndex(where: { $0.id == group.id }) {
                    configuration.groups[index].name = site.uppercased()
                    configuration.groups[index].parentID = parent
                    configuration.groups[index].expanded = false
                }
                let mmtHosts = configuration.hosts.filter {
                    $0.groupID == group.id && $0.name.lowercased().contains("mmt")
                }.map(\.id)
                if !mmtHosts.isEmpty {
                    let mmt = ensure(["PRE", "Bastiones", "Manuel Tobar"])
                    for index in configuration.hosts.indices
                    where mmtHosts.contains(configuration.hosts[index].id) {
                        configuration.hosts[index].groupID = mmt
                    }
                }
            }
        }
        // Remove only empty imported scaffolding; user-created folders and all host IDs survive.
        var changed = true
        while changed {
            let empty = Set(
                configuration.groups.filter { group in
                    group.id.hasPrefix("accesos-")
                        && group.notes.isEmpty
                        && !configuration.hosts.contains { $0.groupID == group.id }
                        && !configuration.groups.contains { $0.parentID == group.id }
                }.map(\.id))
            changed = !empty.isEmpty
            configuration.groups.removeAll { empty.contains($0.id) }
        }
    }
}
