// session-label.js — Display session name label below the pet
(function () {
  var labelEl = document.getElementById("session-label");
  if (!labelEl || !window.electronAPI) return;

  window.electronAPI.onSessionLabel(function (label) {
    labelEl.textContent = label || "";
  });
})();
