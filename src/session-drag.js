// session-drag.js — Drag + click handler for per-session pet windows.
// Drag moves the window; a double-click (no drag) jumps to the session's tmux pane.
(function () {
  const overlay = document.getElementById("drag-overlay");
  if (!overlay) return;

  const DRAG_THRESHOLD_PX = 3;
  const DOUBLE_CLICK_MS = 400;

  let dragging = false, startX = 0, startY = 0;
  let totalDx = 0, totalDy = 0;
  let lastClickAt = 0;

  overlay.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.screenX;
    startY = e.screenY;
    totalDx = 0;
    totalDy = 0;
    overlay.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var dx = e.screenX - startX;
    var dy = e.screenY - startY;
    startX = e.screenX;
    startY = e.screenY;
    totalDx += dx;
    totalDy += dy;
    if (window.electronAPI && window.electronAPI.moveWindowBy) {
      window.electronAPI.moveWindowBy(dx, dy);
    }
  });

  window.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove("dragging");

    const moved = Math.abs(totalDx) >= DRAG_THRESHOLD_PX || Math.abs(totalDy) >= DRAG_THRESHOLD_PX;
    if (moved) { lastClickAt = 0; return; }

    const now = Date.now();
    if (now - lastClickAt < DOUBLE_CLICK_MS) {
      lastClickAt = 0;
      if (window.electronAPI && window.electronAPI.jumpToPane) {
        window.electronAPI.jumpToPane();
      }
    } else {
      lastClickAt = now;
    }
  });

  // Right-click context menu
  overlay.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (window.electronAPI && window.electronAPI.showContextMenu) {
      window.electronAPI.showContextMenu();
    }
  });
})();
