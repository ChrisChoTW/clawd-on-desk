// rename-prompt-renderer.js
const { ipcRenderer } = require("electron");

const input = document.getElementById("name-input");
const btnOk = document.getElementById("btn-ok");
const btnCancel = document.getElementById("btn-cancel");

// Receive current name
ipcRenderer.on("set-current-name", (_, name) => {
  input.value = name || "";
  input.select();
});

function submit() {
  ipcRenderer.send("rename-result", input.value.trim());
}

btnOk.addEventListener("click", submit);
btnCancel.addEventListener("click", () => {
  ipcRenderer.send("rename-result", null);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submit();
  if (e.key === "Escape") ipcRenderer.send("rename-result", null);
});
