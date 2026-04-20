// preload-session.js — Preload for per-session pet windows
// Supports state-change rendering + drag via mouse events
const { contextBridge, ipcRenderer } = require("electron");

// Parse theme config from additionalArguments
const themeArg = process.argv.find(a => a.startsWith("--theme-config="));
const themeConfig = themeArg ? JSON.parse(themeArg.slice("--theme-config=".length)) : null;

contextBridge.exposeInMainWorld("themeConfig", themeConfig);

contextBridge.exposeInMainWorld("electronAPI", {
  onThemeConfig: (cb) => ipcRenderer.on("theme-config", (_, cfg) => cb(cfg)),
  onStateChange: (callback) => ipcRenderer.on("state-change", (_, state, svg) => callback(state, svg)),
  // Stubs for renderer.js compatibility (not used in session windows)
  onEyeMove: () => {},
  onWakeFromDoze: () => {},
  onDndChange: () => {},
  onMiniModeChange: () => {},
  onStartDragReaction: () => {},
  onEndDragReaction: () => {},
  onPlayClickReaction: () => {},
  onPlaySound: () => {},
  pauseCursorPolling: () => {},
  resumeFromReaction: () => {},
  // Drag support
  moveWindowBy: (dx, dy) => ipcRenderer.send("session-move-window-by", dx, dy),
  // Session label
  onSessionLabel: (cb) => ipcRenderer.on("session-label", (_, label) => cb(label)),
  // Right-click context menu
  showContextMenu: () => ipcRenderer.send("session-context-menu"),
  // Double-click to jump to this session's tmux pane
  jumpToPane: () => ipcRenderer.send("session-jump-to-pane"),
});
