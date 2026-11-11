import Foundation
import UniformTypeIdentifiers
import WebKit

/// Serves files from `OfflineCacheManager` under `onedayinkyiv://cache/...`.
final class CacheSchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        let relative = Self.relativePath(from: url)
        guard let fileURL = OfflineCacheManager.shared.localFileURL(forRelativePath: relative)
                ?? OfflineCacheManager.shared.localFileURL(forRelativePath: relative + "/index.html") else {
            let response = HTTPURLResponse(
                url: url,
                statusCode: 404,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "text/plain; charset=utf-8"]
            )!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(Data("Offline file not found.".utf8))
            urlSchemeTask.didFinish()
            return
        }

        do {
            let data = try Data(contentsOf: fileURL)
            let mime = Self.mimeType(for: fileURL)
            let response = URLResponse(
                url: url,
                mimeType: mime,
                expectedContentLength: data.count,
                textEncodingName: mime.hasPrefix("text/") || mime.contains("javascript") || mime.contains("json")
                    ? "utf-8" : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // No-op: reads are synchronous and short.
    }

    private static func relativePath(from url: URL) -> String {
        var path = url.path
        if path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty { return "menu/index.html" }
        if path.hasSuffix("/") {
            return path + "index.html"
        }
        // `/menu` → menu/index.html
        let ext = (path as NSString).pathExtension
        if ext.isEmpty {
            return path + "/index.html"
        }
        return path
    }

    private static func mimeType(for fileURL: URL) -> String {
        if #available(iOS 14.0, *) {
            if let type = UTType(filenameExtension: fileURL.pathExtension),
               let mime = type.preferredMIMEType {
                return mime
            }
        }
        switch fileURL.pathExtension.lowercased() {
        case "html", "htm": return "text/html"
        case "js": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "gif": return "image/gif"
        case "mp3": return "audio/mpeg"
        case "wav": return "audio/wav"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}
