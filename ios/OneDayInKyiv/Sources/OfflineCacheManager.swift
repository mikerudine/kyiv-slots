import Foundation

/// Downloads the live GitHub Pages site into Application Support for offline play.
/// A normal Pages publish is picked up the next time the app launches online.
final class OfflineCacheManager {
    static let shared = OfflineCacheManager()

    enum CacheError: LocalizedError {
        case manifestMissing
        case incomplete(downloaded: Int, expected: Int)

        var errorDescription: String? {
            switch self {
            case .manifestMissing:
                return "Cache manifest missing."
            case .incomplete(let downloaded, let expected):
                return "Cached \(downloaded) of \(expected) files."
            }
        }
    }

    private let fileManager = FileManager.default
    private let session: URLSession
    private let ioQueue = DispatchQueue(label: "onedayinkyiv.cache", qos: .utility)

    private(set) var lastRefreshSummary: String = ""

    var cacheRootURL: URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport.appendingPathComponent("OfflineSite", isDirectory: true)
    }

    var hasUsableCache: Bool {
        let marker = cacheRootURL.appendingPathComponent(".ready", isDirectory: false)
        let menu = cacheRootURL.appendingPathComponent("menu/index.html", isDirectory: false)
        return fileManager.fileExists(atPath: marker.path) && fileManager.fileExists(atPath: menu.path)
    }

    private init() {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120
        config.waitsForConnectivity = false
        session = URLSession(configuration: config)
    }

    /// Refresh from the live site. Safe to call on every online launch.
    func refresh(completion: @escaping (Result<Void, Error>) -> Void) {
        ioQueue.async {
            do {
                try self.performRefresh()
                DispatchQueue.main.async { completion(.success(())) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    func localFileURL(forRelativePath relativePath: String) -> URL? {
        let cleaned = Self.normalizeRelativePath(relativePath)
        guard !cleaned.isEmpty else { return nil }
        let url = cacheRootURL.appendingPathComponent(cleaned)
        let resolved = url.standardizedFileURL
        guard resolved.path.hasPrefix(cacheRootURL.standardizedFileURL.path) else { return nil }
        if fileManager.fileExists(atPath: resolved.path) {
            return resolved
        }
        // Directory → index.html
        if cleaned.hasSuffix("/") || !cleaned.contains(".") {
            let index = cacheRootURL.appendingPathComponent(
                cleaned.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/index.html"
            )
            if fileManager.fileExists(atPath: index.path) { return index }
        }
        return nil
    }

    // MARK: - Private

    private func performRefresh() throws {
        try fileManager.createDirectory(at: cacheRootURL, withIntermediateDirectories: true)

        let manifest = try loadManifest()
        let staging = cacheRootURL.deletingLastPathComponent()
            .appendingPathComponent("OfflineSite-staging-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: staging) }

        var ok = 0
        var failures: [String] = []

        for relative in manifest.files {
            let path = Self.normalizeRelativePath(relative)
            guard !path.isEmpty else { continue }
            let remote = URL(string: AppConfig.liveOrigin.absoluteString
                             + AppConfig.sitePathPrefix + "/" + path)!
            do {
                let (data, response) = try session.synchronousDataTask(with: remote)
                if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                    failures.append(path)
                    continue
                }
                let dest = staging.appendingPathComponent(path)
                try fileManager.createDirectory(
                    at: dest.deletingLastPathComponent(),
                    withIntermediateDirectories: true
                )
                try data.write(to: dest, options: .atomic)
                ok += 1
            } catch {
                failures.append(path)
            }
        }

        // Always keep a copy of the manifest used for this snapshot.
        let manifestData = try JSONEncoder().encode(manifest)
        try manifestData.write(to: staging.appendingPathComponent("cache-manifest.json"), options: .atomic)

        guard ok > 0, fileManager.fileExists(atPath: staging.appendingPathComponent("menu/index.html").path) else {
            throw CacheError.incomplete(downloaded: ok, expected: manifest.files.count)
        }

        let finalRoot = cacheRootURL
        let backup = cacheRootURL.deletingLastPathComponent()
            .appendingPathComponent("OfflineSite-backup-\(UUID().uuidString)", isDirectory: true)
        if fileManager.fileExists(atPath: finalRoot.path) {
            try fileManager.moveItem(at: finalRoot, to: backup)
        }
        do {
            try fileManager.moveItem(at: staging, to: finalRoot)
            try? fileManager.removeItem(at: backup)
        } catch {
            // Roll back if swap failed.
            if fileManager.fileExists(atPath: backup.path) {
                try? fileManager.removeItem(at: finalRoot)
                try? fileManager.moveItem(at: backup, to: finalRoot)
            }
            throw error
        }

        let marker = finalRoot.appendingPathComponent(".ready")
        let stamp = ISO8601DateFormatter().string(from: Date())
        try "\(stamp)\nfiles=\(ok)\n".write(to: marker, atomically: true, encoding: .utf8)

        lastRefreshSummary = "Cached \(ok)/\(manifest.files.count) files"
        if !failures.isEmpty {
            lastRefreshSummary += " (\(failures.count) skipped)"
        }
    }

    private func loadManifest() throws -> CacheManifest {
        // Prefer live manifest so newly added games appear without an App Store build.
        if let live = try? session.synchronousDataTask(with: AppConfig.liveManifestURL).0,
           let parsed = try? JSONDecoder().decode(CacheManifest.self, from: live),
           !parsed.files.isEmpty {
            return parsed
        }
        if let url = Bundle.main.url(forResource: "cache-manifest", withExtension: "json"),
           let data = try? Data(contentsOf: url),
           let parsed = try? JSONDecoder().decode(CacheManifest.self, from: data),
           !parsed.files.isEmpty {
            return parsed
        }
        throw CacheError.manifestMissing
    }

    static func normalizeRelativePath(_ raw: String) -> String {
        var path = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if path.hasPrefix("./") { path.removeFirst(2) }
        while path.hasPrefix("/") { path.removeFirst() }
        if path.contains("..") { return "" }
        return path
    }
}

struct CacheManifest: Codable {
    var version: Int
    var files: [String]
    var updatedHint: String?
}

private extension URLSession {
    func synchronousDataTask(with url: URL) throws -> (Data, URLResponse) {
        var resultData: Data?
        var resultResponse: URLResponse?
        var resultError: Error?
        let semaphore = DispatchSemaphore(value: 0)
        let task = dataTask(with: url) { data, response, error in
            resultData = data
            resultResponse = response
            resultError = error
            semaphore.signal()
        }
        task.resume()
        semaphore.wait()
        if let resultError { throw resultError }
        guard let resultData, let resultResponse else {
            throw URLError(.badServerResponse)
        }
        return (resultData, resultResponse)
    }
}
