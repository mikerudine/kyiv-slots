/**
 * Shared iOS Safari / mobile WebKit page-zoom guard.
 *
 * Viewport meta user-scalable=no is ignored on modern iOS; this script blocks
 * Safari gesture zoom, double-tap zoom, and multi-touch page pinch while
 * leaving in-game PointerEvent gestures (e.g. coloring canvas pinch) alone.
 */
(function () {
  if (window.__kyivNoZoom) return;
  window.__kyivNoZoom = true;

  var css = [
    'html,body{',
    'touch-action:manipulation;',
    '-webkit-text-size-adjust:100%;text-size-adjust:100%;',
    '-webkit-user-select:none;user-select:none;',
    '-webkit-touch-callout:none;',
    '}',
    'input,textarea,select,[contenteditable]{',
    '-webkit-user-select:text;user-select:text;',
    '-webkit-touch-callout:default;',
    '}',
    /* Game canvases / pinch hosts own their gestures */
    'canvas,[data-pinch-zoom]{touch-action:none;-ms-touch-action:none;}'
  ].join('');

  function injectCss() {
    if (document.getElementById('kyiv-no-zoom-css')) return;
    var style = document.createElement('style');
    style.id = 'kyiv-no-zoom-css';
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function stop(e) {
    e.preventDefault();
  }

  function ownsPinchGesture(el) {
    if (!el || !el.closest) return false;
    return !!el.closest('canvas,[data-pinch-zoom]');
  }

  injectCss();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCss);
  }

  // Older / current iOS Safari pinch via non-standard gesture* events.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    document.addEventListener(type, stop, { passive: false, capture: true });
  });

  // Multi-touch page pinch outside hosts that implement their own zoom.
  // Coloring listens on #mapViewport[data-pinch-zoom] via Pointer Events;
  // skipping preventDefault there avoids interfering with those handlers.
  // gesture* + touch-action:none already suppress Safari page zoom on that host.
  document.addEventListener(
    'touchmove',
    function (e) {
      if (!e.touches || e.touches.length < 2) return;
      if (ownsPinchGesture(e.target)) return;
      e.preventDefault();
    },
    { passive: false, capture: true }
  );

  // Double-tap zoom: block only a quick second touchend near the first.
  // First-tap clicks / pointerdown paint strokes are unaffected.
  var lastTouchEnd = 0;
  var lastX = 0;
  var lastY = 0;
  document.addEventListener(
    'touchend',
    function (e) {
      if (!e.changedTouches || !e.changedTouches.length) return;
      var t = e.changedTouches[0];
      var now = Date.now();
      var dt = now - lastTouchEnd;
      var dx = Math.abs(t.clientX - lastX);
      var dy = Math.abs(t.clientY - lastY);
      // lastTouchEnd===0 → first tap ever; allow dt===0 for same-ms synthetic pairs
      if (lastTouchEnd && dt < 350 && dx < 28 && dy < 28) {
        e.preventDefault();
      }
      lastTouchEnd = now;
      lastX = t.clientX;
      lastY = t.clientY;
    },
    { passive: false, capture: true }
  );

  document.addEventListener('dblclick', stop, { passive: false, capture: true });
})();
