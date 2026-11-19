/**
 * Shared back-to-menu control for mini-games.
 *
 * - Enhances any [data-game-nav] link, or injects a floating top-left button.
 * - Syncs ≡ Меню / ≡ Menu (and В меню / To menu) via setGameNavLang(lang).
 * - Href is relative: ../menu/ from game folders, menu/ from repo root (slots).
 */
(function () {
  var LABEL = { ua: '≡ Меню', en: '≡ Menu' };
  var TO_MENU = { ua: 'В меню', en: 'To menu' };

  function menuHref() {
    var nodes = document.querySelectorAll('script[src], link[rel="stylesheet"]');
    for (var i = 0; i < nodes.length; i++) {
      var src = nodes[i].getAttribute('src') || nodes[i].getAttribute('href') || '';
      if (src.indexOf('../shared/') === 0) return '../menu/';
      if (src.indexOf('shared/') === 0) return 'menu/';
    }
    return '../menu/';
  }

  function detectLang() {
    var htmlLang = (document.documentElement.lang || '').toLowerCase();
    if (htmlLang.indexOf('en') === 0) return 'en';
    if (htmlLang.indexOf('uk') === 0 || htmlLang.indexOf('ua') === 0) return 'ua';
    try {
      var keys = [
        'menu-lang', 'commute-lang', 'dice-lang', 'coloring-lang', 'minesweeper-lang',
        'tetris-lang', 'merge-lang', 'laundry-lang', 'scooter-lang', 'dogwalk-runner-lang'
      ];
      for (var i = 0; i < keys.length; i++) {
        var v = localStorage.getItem(keys[i]);
        if (v === 'en' || v === 'ua') return v;
      }
    } catch (e) {}
    return 'ua';
  }

  function ensureNav() {
    var existing = document.querySelector('[data-game-nav]');
    if (existing) {
      existing.classList.add('game-nav');
      if (!existing.getAttribute('href')) existing.setAttribute('href', menuHref());
      return existing;
    }
    var a = document.createElement('a');
    a.className = 'game-nav game-nav-float';
    a.setAttribute('data-game-nav', '');
    a.href = menuHref();
    a.setAttribute('aria-label', 'Menu');
    document.body.appendChild(a);
    return a;
  }

  function patchToMenu(lang, href) {
    document.querySelectorAll('[data-game-nav-to-menu]').forEach(function (a) {
      a.href = href;
      a.textContent = TO_MENU[lang] || TO_MENU.ua;
      a.classList.add('game-nav-to-menu');
    });
  }

  window.setGameNavLang = function (lang) {
    var L = lang === 'en' ? 'en' : 'ua';
    var href = menuHref();
    document.querySelectorAll('[data-game-nav]').forEach(function (a) {
      a.href = href;
      a.textContent = LABEL[L];
      a.setAttribute('aria-label', L === 'en' ? 'Menu' : 'Меню');
    });
    patchToMenu(L, href);
  };

  window.setGameNavToMenuVisible = function (visible, root) {
    (root || document).querySelectorAll('[data-game-nav-to-menu]').forEach(function (a) {
      a.hidden = !visible;
    });
  };

  function init() {
    ensureNav();
    window.setGameNavLang(detectLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
