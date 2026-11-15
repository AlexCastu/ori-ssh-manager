// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "ORINative",
    platforms: [.macOS(.v15)],
    products: [
        .executable(name: "ORI", targets: ["ORIApp"]),
        .library(name: "ORICore", targets: ["ORICore"]),
    ],
    dependencies: [
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", exact: "1.99.1"),
        .package(url: "https://github.com/groue/GRDB.swift.git", exact: "7.12.0"),
    ],
    targets: [
        .target(name: "ORICore", dependencies: [.product(name: "GRDB", package: "GRDB.swift")]),
        .executableTarget(
            name: "ORIApp",
            dependencies: [
                "ORICore", .product(name: "SwiftTerm", package: "SwiftTerm"),
            ]),
        .testTarget(name: "ORICoreTests", dependencies: ["ORICore"]),
        .testTarget(
            name: "ORITerminalTests",
            dependencies: [
                "ORIApp", "ORICore", .product(name: "SwiftTerm", package: "SwiftTerm"),
            ]),
    ],
    swiftLanguageModes: [.v6]
)
