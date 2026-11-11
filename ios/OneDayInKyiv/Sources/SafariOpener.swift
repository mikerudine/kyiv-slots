import SafariServices
import UIKit

enum SafariOpener {
    /// Opens http(s) links outside the game origin in Safari / SFSafariViewController.
    /// Never used for In-App Purchase — donate stays a normal web page.
    static func open(_ url: URL, from presenter: UIViewController) {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
            return
        }
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = UIColor(red: 0.992, green: 0.878, blue: 0.278, alpha: 1) // #fde047
        safari.dismissButtonStyle = .done
        presenter.present(safari, animated: !UIAccessibility.isReduceMotionEnabled)
    }
}
