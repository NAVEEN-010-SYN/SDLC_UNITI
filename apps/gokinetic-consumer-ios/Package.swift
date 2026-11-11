// swift-tools-version:5.9
//
// Go Kinetic Consumer iOS app - Swift package layout.
//
// The Xcode app target (see `App/`) is a thin shell that depends on these
// library products. Splitting the code into packages keeps the business
// logic (networking, auth, repositories) testable on any Apple platform and
// keeps the SwiftUI feature layer free of I/O concerns.

import PackageDescription

let package = Package(
    name: "GoKineticConsumer",
    defaultLocalization: "en",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "GoKineticCore", targets: ["GoKineticCore"]),
        .library(name: "GoKineticUI", targets: ["GoKineticUI"]),
        .library(name: "GoKineticFeatures", targets: ["GoKineticFeatures"])
    ],
    targets: [
        // Models, networking, auth, repositories, caching, analytics, DI.
        .target(
            name: "GoKineticCore",
            path: "Sources/GoKineticCore"
        ),
        // Theme + reusable SwiftUI components + localized strings.
        .target(
            name: "GoKineticUI",
            dependencies: ["GoKineticCore"],
            path: "Sources/GoKineticUI",
            resources: [.process("Resources")]
        ),
        // Feature folders: view models (MVVM) and screens.
        .target(
            name: "GoKineticFeatures",
            dependencies: ["GoKineticCore", "GoKineticUI"],
            path: "Sources/GoKineticFeatures"
        ),
        // Test doubles shared by the test targets.
        .target(
            name: "GoKineticTestSupport",
            dependencies: ["GoKineticCore"],
            path: "Tests/GoKineticTestSupport"
        ),
        .testTarget(
            name: "GoKineticCoreTests",
            dependencies: ["GoKineticCore", "GoKineticTestSupport"],
            path: "Tests/GoKineticCoreTests"
        ),
        .testTarget(
            name: "GoKineticFeaturesTests",
            dependencies: ["GoKineticFeatures", "GoKineticCore", "GoKineticTestSupport"],
            path: "Tests/GoKineticFeaturesTests"
        )
    ]
)
