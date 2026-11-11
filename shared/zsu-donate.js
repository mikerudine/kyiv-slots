/**
 * ЗСУ donate banner — shared across mini-game final-score / game-over screens.
 *
 * Temporary donate URL («пока что»): change ZSU_DONATE_URL below when it updates.
 * Every [data-zsu-donate] link is patched from this constant on load.
 */
(function () {
  var ZSU_DONATE_URL = 'https://www.sternenkofund.org/donate';
  var ZSU_DONATE_LABEL = 'Підтримати ЗСУ';

  window.ZSU_DONATE_URL = ZSU_DONATE_URL;

  function openDonateExternally(href) {
    // iOS shell injects KYIV_OPEN_EXTERNAL / webkit messageHandlers.openExternal.
    // Regular browsers ignore this and keep normal target=_blank behavior.
    try {
      if (typeof window.KYIV_OPEN_EXTERNAL === 'function' && window.KYIV_OPEN_EXTERNAL(href)) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  function patchLinks(root) {
    (root || document).querySelectorAll('[data-zsu-donate]').forEach(function (a) {
      a.href = ZSU_DONATE_URL;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      if (!a.textContent.trim()) a.textContent = ZSU_DONATE_LABEL;
      if (a.dataset.zsuShellBound === '1') return;
      a.dataset.zsuShellBound = '1';
      a.addEventListener('click', function (ev) {
        if (openDonateExternally(a.href)) {
          ev.preventDefault();
        }
      });
    });
  }

  /**
   * Show or hide donate banners under `root` (defaults to document).
   * Optional one-shot fade/slide-in when becoming visible (no looping motion).
   */
  window.setZsuDonateVisible = function (visible, root) {
    (root || document).querySelectorAll('[data-zsu-donate]').forEach(function (a) {
      var show = !!visible;
      if (show) {
        a.hidden = false;
        a.classList.remove('zsu-in');
        // reflow so the enter animation can replay when re-shown
        void a.offsetWidth;
        a.classList.add('zsu-in');
      } else {
        a.hidden = true;
        a.classList.remove('zsu-in');
      }
    });
  };

  patchLinks(document);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { patchLinks(document); });
  }
})();
