// session-drag.js — Drag handler for per-session pet windows
(function () {
  const overlay = document.getElementById("drag-overlay");
  if (!overlay) return;

  let dragging = false, startX = 0, startY = 0;

  overlay.addEventListener("mousedown", function (e) {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.screenX;
    startY = e.screenY;
    overlay.classList.add("dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    var dx = e.screenX - startX;
    var dy = e.screenY - startY;
    startX = e.screenX;
    startY = e.screenY;
    if (window.electronAPI && window.electronAPI.moveWindowBy) {
      window.electronAPI.moveWindowBy(dx, dy);
    }
  });

  window.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove("dragging");
  });

  // Right-click context menu
  overlay.addEventListener("contextmenu", function (e) {
    e.preventDefault();
    if (window.electronAPI && window.electronAPI.showContextMenu) {
      window.electronAPI.showContextMenu();
    }
  });
})();
