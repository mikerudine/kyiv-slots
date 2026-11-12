import Foundation

/// Downloads the live GitHub Pages site into Application Support for offline play.
/// A normal Pages publish is picked up the next time the app launches online.
final class OfflineCacheManager {
    static let shared = OfflineCacheManager()

    enum CacheError: LocalizedError {
        case manifestMissing
        case incomplete(downloaded: Int, expected: Int)
        case timedOut(downloaded: Int, expected: Int)

        var errorDescription: String? {
            switch self {
            case .manifestMissing:
                return "Cache manifest missing."
            case .incomplete(let downloaded, let expected):
                return "Cached \(downloaded) of \(expected) files."
            case .timedOut(let downloaded, let expected):
                return "Cache refresh timed out after \(downloaded) of \(expected) files."
            }
        }
    }

    /// Overall wall-clock budget for one refresh (manifest + files).
    private static let refreshDeadlineSeconds: TimeInterval = 45
    /// Cap parallel downloads so a flaky radio is not flooded.
    private static let maxConcurrentDownloads = 5

    private let fileManager = FileManager.default
    private let session: URLSession
    private let ioQueue = DispatchQueue(label: "onedayinkyiv.cache", qos: .utility)
    private let downloadQueue = DispatchQueue(
        label: "onedayinkyiv.cache.downloads",
        qos: .utility,
        attributes: .concurrent
    )

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
        // Short per-request budgets: a hung host must not stall the whole refresh.
        config.timeoutIntervalForRequest = 12
        config.timeoutIntervalForResource = 15
        config.waitsForConnectivity = false
        config.httpMaximumConnectionsPerHost = Self.maxConcurrentDownloads
        session = URLSession(configuration: config)
    }

    /// Refresh from the live site. Safe to call on every online launch.
    /// Never blocks the UI; failures leave the previous good snapshot untouched.
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
        let deadline = Date().addingTimeInterval(Self.refreshDeadlineSeconds)
        try fileManager.createDirectory(at: cacheRootURL, withIntermediateDirectories: true)

        let manifest = try loadManifest(deadline: deadline)
        let staging = cacheRootURL.deletingLastPathComponent()
            .appendingPathComponent("OfflineSite-staging-\(UUID().uuidString)", isDirectory: true)
        try fileManager.createDirectory(at: staging, withIntermediateDirectories: true)
        defer { try? fileManager.removeItem(at: staging) }

        let (ok, failures, hitDeadline) = downloadFiles(
            manifest.files,
            to: staging,
            deadline: deadline
        )

        // Always keep a copy of the manifest used for this snapshot.
        let manifestData = try JSONEncoder().encode(manifest)
        try manifestData.write(to: staging.appendingPathComponent("cache-manifest.json"), options: .atomic)

        guard ok > 0, fileManager.fileExists(atPath: staging.appendingPathComponent("menu/index.html").path) else {
            if hitDeadline {
                throw CacheError.timedOut(downloaded: ok, expected: manifest.files.count)
            }
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
            // Roll back if swap failed — previous good snapshot stays put.
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
        if hitDeadline {
            lastRefreshSummary += " (deadline)"
        }
    }

    /// Concurrent downloads with a small parallelism cap and a hard deadline.
    /// Returns counts; does not throw — caller decides whether the snapshot is usable.
    private func downloadFiles(
        _ files: [String],
        to staging: URL,
        deadline: Date
    ) -> (ok: Int, failures: [String], hitDeadline: Bool) {
        let lock = NSLock()
        var ok = 0
        var failures: [String] = []
        var hitDeadline = false
        let group = DispatchGroup()
        let limiter = DispatchSemaphore(value: Self.maxConcurrentDownloads)
        let taskLock = NSLock()
        var inflight: [URLSessionTask] = []

        for relative in files {
            let path = Self.normalizeRelativePath(relative)
            guard !path.isEmpty else { continue }

            if Date() >= deadline {
                lock.lock()
                hitDeadline = true
                failures.append(path)
                lock.unlock()
                continue
            }

            group.enter()
            downloadQueue.async {
                defer { group.leave() }

                // Respect the overall deadline before claiming a concurrency slot.
                guard Date() < deadline else {
                    lock.lock()
                    hitDeadline = true
                    failures.append(path)
                    lock.unlock()
                    return
                }

                limiter.wait()
                defer { limiter.signal() }

                guard Date() < deadline else {
                    lock.lock()
                    hitDeadline = true
                    failures.append(path)
                    lock.unlock()
                    return
                }

                let remote = URL(string: AppConfig.liveOrigin.absoluteString
                                 + AppConfig.sitePathPrefix + "/" + path)!

                let result: Result<(Data, URLResponse), Error> = self.session.synchronousDataTask(
                    with: remote,
                    onStart: { task in
                        taskLock.lock()
                        inflight.append(task)
                        taskLock.unlock()
                    }
                )

                taskLock.lock()
                inflight.removeAll { $0.state == .completed || $0.state == .canceling }
                taskLock.unlock()

                switch result {
                case .success(let (data, response)):
                    if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
                        lock.lock()
                        failures.append(path)
                        lock.unlock()
                        return
                    }
                    let dest = staging.appendingPathComponent(path)
                    do {
                        try self.fileManager.createDirectory(
                            at: dest.deletingLastPathComponent(),
                            withIntermediateDirectories: true
                        )
                        try data.write(to: dest, options: .atomic)
                        lock.lock()
                        ok += 1
                        lock.unlock()
                    } catch {
                        lock.lock()
                        failures.append(path)
                        lock.unlock()
                    }
                case .failure:
                    lock.lock()
                    failures.append(path)
                    lock.unlock()
                }
            }
        }

        let remaining = deadline.timeIntervalSinceNow
        if remaining > 0 {
            let waitResult = group.wait(timeout: .now() + remaining)
            if waitResult == .timedOut {
                lock.lock()
                hitDeadline = true
                lock.unlock()
            }
        } else {
            lock.lock()
            hitDeadline = true
            lock.unlock()
        }

        // Cancel anything still hanging so the refresh can finish promptly.
        taskLock.lock()
        let toCancel = inflight
        taskLock.unlock()
        for task in toCancel {
            task.cancel()
        }
        _ = group.wait(timeout: .now() + 2)

        lock.lock()
        let result = (ok, failures, hitDeadline)
        lock.unlock()
        return result
    }

    private func loadManifest(deadline: Date) throws -> CacheManifest {
        // Prefer live manifest so newly added games appear without an App Store build.
        if Date() < deadline,
           let live = try? session.synchronousDataTask(with: AppConfig.liveManifestURL).0,
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
        try synchronousDataTask(with: url, onStart: { _ in }).get()
    }

    func synchronousDataTask(
        with url: URL,
        onStart: ((URLSessionTask) -> Void)?
    ) -> Result<(Data, URLResponse), Error> {
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
        onStart?(task)
        task.resume()
        semaphore.wait()
        if let resultError { return .failure(resultError) }
        guard let resultData, let resultResponse else {
            return .failure(URLError(.badServerResponse))
        }
        return .success((resultData, resultResponse))
    }
}
