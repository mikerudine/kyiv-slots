import Network
import UIKit
import WebKit

/// Thin native shell: WKWebView + offline cache + Safari for external links.
final class RootViewController: UIViewController {
    /// If the live menu has not settled by then, fall back to cache or retry UI.
    private static let liveLoadSafetySeconds: TimeInterval = 15

    private let webView: WKWebView
    private let statusLabel = UILabel()
    private let statusOverlay = UIView()
    private let retryButton = UIButton(type: .system)
    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "onedayinkyiv.net")
    private let messageProxy = ShellMessageProxy()

    private var didStartInitialLoad = false
    private var isOnline = false
    private var servingFromCache = false
    /// Bumped on each live-menu attempt so late callbacks / safety nets stay coherent.
    private var liveLoadGeneration = 0
    private var liveLoadSafetyWorkItem: DispatchWorkItem?
    /// True once the current online attempt hid the overlay or showed retry/cache.
    private var liveLoadSettled = true

    init() {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.setURLSchemeHandler(CacheSchemeHandler(), forURLScheme: AppConfig.cacheScheme)
        config.userContentController.addUserScript(Self.shellBridgeScript)

        webView = WKWebView(frame: .zero, configuration: config)
        super.init(nibName: nil, bundle: nil)

        messageProxy.owner = self
        webView.configuration.userContentController.add(messageProxy, name: "openExternal")
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    deinit {
        pathMonitor.cancel()
        cancelLiveLoadSafetyNet()
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "openExternal")
    }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.125, alpha: 1) // #0b1020

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = true
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        configureStatusOverlay()
        startNetworkMonitor()
    }

    // MARK: - Status overlay (calm fade only)

    private func configureStatusOverlay() {
        statusOverlay.backgroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.125, alpha: 1)
        statusOverlay.translatesAutoresizingMaskIntoConstraints = false
        statusOverlay.alpha = 1

        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.textColor = UIColor(red: 0.992, green: 0.878, blue: 0.278, alpha: 1)
        statusLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.text = "One Day in Kyiv"

        retryButton.translatesAutoresizingMaskIntoConstraints = false
        var retryConfig = UIButton.Configuration.filled()
        retryConfig.title = "Try again"
        retryConfig.baseForegroundColor = UIColor(red: 0.043, green: 0.063, blue: 0.125, alpha: 1)
        retryConfig.baseBackgroundColor = UIColor(red: 0.992, green: 0.878, blue: 0.278, alpha: 1)
        retryConfig.cornerStyle = .medium
        retryConfig.contentInsets = NSDirectionalEdgeInsets(top: 10, leading: 18, bottom: 10, trailing: 18)
        retryButton.configuration = retryConfig
        retryButton.isHidden = true
        retryButton.addTarget(self, action: #selector(retryTapped), for: .touchUpInside)

        view.addSubview(statusOverlay)
        statusOverlay.addSubview(statusLabel)
        statusOverlay.addSubview(retryButton)
        NSLayoutConstraint.activate([
            statusOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            statusOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            statusOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            statusOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            statusLabel.centerXAnchor.constraint(equalTo: statusOverlay.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: statusOverlay.centerYAnchor, constant: -16),
            statusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: statusOverlay.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: statusOverlay.trailingAnchor, constant: -24),
            retryButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 18),
            retryButton.centerXAnchor.constraint(equalTo: statusOverlay.centerXAnchor)
        ])
    }

    private func setStatus(_ text: String, visible: Bool, showRetry: Bool = false) {
        statusLabel.text = text
        retryButton.isHidden = !showRetry
        let duration: TimeInterval = UIAccessibility.isReduceMotionEnabled ? 0 : 0.25
        if visible {
            statusOverlay.isHidden = false
            UIView.animate(withDuration: duration) { self.statusOverlay.alpha = 1 }
        } else {
            UIView.animate(withDuration: duration, animations: {
                self.statusOverlay.alpha = 0
            }, completion: { _ in
                self.statusOverlay.isHidden = true
                self.retryButton.isHidden = true
            })
        }
    }

    @objc private func retryTapped() {
        retryButton.isHidden = true
        bootstrap()
    }

    // MARK: - Networking / load policy

    private func startNetworkMonitor() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let online = path.status == .satisfied
                let becameOnline = online && !self.isOnline
                self.isOnline = online
                if !self.didStartInitialLoad {
                    self.didStartInitialLoad = true
                    self.bootstrap()
                } else if becameOnline {
                    self.refreshCacheInBackground()
                }
            }
        }
        pathMonitor.start(queue: monitorQueue)
    }

    private func bootstrap() {
        cancelLiveLoadSafetyNet()

        if isOnline {
            // First paint must not wait on the offline snapshot refresh.
            // Keep the calm brand overlay; fade it out when the live menu settles.
            setStatus("One Day in Kyiv", visible: true)
            loadLiveMenu()
            refreshCacheInBackground()
            scheduleLiveLoadSafetyNet()
        } else if OfflineCacheManager.shared.hasUsableCache {
            liveLoadSettled = true
            loadOfflineMenu(reason: nil)
        } else {
            liveLoadSettled = true
            setStatus(
                "No network yet.\nConnect once to download the games for offline play.",
                visible: true,
                showRetry: true
            )
        }
    }

    private func refreshCacheInBackground() {
        OfflineCacheManager.shared.refresh { _ in }
    }

    private func loadLiveMenu() {
        servingFromCache = false
        liveLoadGeneration += 1
        liveLoadSettled = false
        webView.load(URLRequest(
            url: AppConfig.liveMenuURL,
            cachePolicy: .reloadIgnoringLocalCacheData,
            timeoutInterval: 30
        ))
    }

    private func loadOfflineMenu(reason: String?) {
        servingFromCache = true
        liveLoadSettled = true
        cancelLiveLoadSafetyNet()
        if let reason {
            setStatus(reason, visible: true)
        } else {
            setStatus("Offline · cached games", visible: true)
        }
        webView.load(URLRequest(url: AppConfig.offlineMenuURL))
    }

    // MARK: - Live-load safety net

    private func scheduleLiveLoadSafetyNet() {
        let generation = liveLoadGeneration
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard generation == self.liveLoadGeneration, !self.liveLoadSettled else { return }
            self.liveLoadSettled = true
            self.webView.stopLoading()
            if OfflineCacheManager.shared.hasUsableCache {
                self.loadOfflineMenu(reason: "Taking too long — opening cache.")
            } else {
                self.setStatus(
                    "Couldn’t load games.\nCheck the network and try again.",
                    visible: true,
                    showRetry: true
                )
            }
        }
        liveLoadSafetyWorkItem = work
        DispatchQueue.main.asyncAfter(
            deadline: .now() + Self.liveLoadSafetySeconds,
            execute: work
        )
    }

    private func cancelLiveLoadSafetyNet() {
        liveLoadSafetyWorkItem?.cancel()
        liveLoadSafetyWorkItem = nil
    }

    private func markLiveLoadSettled() {
        liveLoadSettled = true
        cancelLiveLoadSafetyNet()
    }

    // MARK: - External links

    func openExternal(_ url: URL) {
        SafariOpener.open(url, from: self)
    }

    private func isInternalURL(_ url: URL) -> Bool {
        if url.scheme == AppConfig.cacheScheme {
            return url.host == AppConfig.cacheHost
        }
        guard let host = url.host?.lowercased() else { return false }
        guard AppConfig.allowedWebHosts.contains(host) else { return false }
        let path = url.path
        return path == AppConfig.sitePathPrefix
            || path.hasPrefix(AppConfig.sitePathPrefix + "/")
    }

    private static let shellBridgeScript: WKUserScript = {
        let source = """
        (function () {
          if (window.KYIV_IOS_SHELL) return;
          window.KYIV_IOS_SHELL = true;
          document.documentElement.dataset.iosShell = '1';
          window.KYIV_OPEN_EXTERNAL = function (href) {
            try {
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.openExternal) {
                window.webkit.messageHandlers.openExternal.postMessage(String(href));
                return true;
              }
            } catch (e) {}
            return false;
          };
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: false)
    }()
}

// MARK: - WKNavigationDelegate

extension RootViewController: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }

        if isInternalURL(url) {
            decisionHandler(.allow)
            return
        }

        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            openExternal(url)
            decisionHandler(.cancel)
            return
        }

        if let scheme = url.scheme, scheme != "about" {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.cancel)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        markLiveLoadSettled()
        setStatus("One Day in Kyiv", visible: false)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadFailure(error)
    }

    private func handleLoadFailure(_ error: Error) {
        let ns = error as NSError
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        markLiveLoadSettled()
        if !servingFromCache, OfflineCacheManager.shared.hasUsableCache {
            loadOfflineMenu(reason: "Couldn’t reach the live site — opening cache.")
        } else {
            setStatus(
                "Couldn’t load games.\nCheck the network and try again.",
                visible: true,
                showRetry: true
            )
        }
    }
}

// MARK: - WKUIDelegate (target=_blank → Safari when external)

extension RootViewController: WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        guard let url = navigationAction.request.url else { return nil }
        if isInternalURL(url) {
            webView.load(URLRequest(url: url))
        } else if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            openExternal(url)
        }
        return nil
    }
}

// MARK: - JS → native bridge

final class ShellMessageProxy: NSObject, WKScriptMessageHandler {
    weak var owner: RootViewController?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "openExternal" else { return }
        let href: String?
        if let s = message.body as? String {
            href = s
        } else if let dict = message.body as? [String: Any] {
            href = dict["href"] as? String
        } else {
            href = nil
        }
        guard let href, let url = URL(string: href), let owner else { return }
        owner.openExternal(url)
    }
}
