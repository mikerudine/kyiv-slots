import Foundation

/// Central place to change identity / live origin without hunting through the project.
enum AppConfig {
    /// Change this in Xcode target → Signing & Capabilities as well when you register the App ID.
    static let bundleID = "com.mikerudine.onedayinkyiv"

    /// Home screen / SpringBoard name. Matches the EN product title on the menu.
    static let displayName = "One Day in Kyiv"

    /// Live GitHub Pages origin (no trailing slash).
    static let liveOrigin = URL(string: "https://mikerudine.github.io")!

    /// Path prefix on GitHub Pages for this repo.
    static let sitePathPrefix = "/kyiv-slots"

    /// Entry page inside the site.
    static let menuPath = "/menu/"

    /// Custom scheme used only for the offline cache (not registered as a universal link).
    static let cacheScheme = "onedayinkyiv"

    /// Host component for offline URLs: onedayinkyiv://cache/menu/
    static let cacheHost = "cache"

    static var liveSiteRoot: URL {
        liveOrigin.appendingPathComponent(String(sitePathPrefix.drop(while: { $0 == "/" })))
    }

    static var liveMenuURL: URL {
        URL(string: liveOrigin.absoluteString + sitePathPrefix + menuPath)!
    }

    static var liveManifestURL: URL {
        URL(string: liveOrigin.absoluteString + sitePathPrefix + "/cache-manifest.json")!
    }

    static var offlineMenuURL: URL {
        var components = URLComponents()
        components.scheme = cacheScheme
        components.host = cacheHost
        components.path = menuPath
        return components.url!
    }

    /// Absolute https hosts that may stay inside the WKWebView.
    static var allowedWebHosts: Set<String> {
        ["mikerudine.github.io"]
    }
}
