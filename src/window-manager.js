// src/window-manager.js — Per-session BrowserWindow manager
// Spawns an independent pet window for each Claude Code session.
// The primary window (managed by main.js) is NOT touched here.

const { BrowserWindow } = require("electron");
const path = require("path");

const MAX_SESSION_WINDOWS = 5;
const STALE_CHECK_INTERVAL = 10000; // 10s
const SESSION_STALE_MS = 600000;    // 10min — same as state.js
const ONESHOT_STATES = new Set(["attention", "error", "sweeping", "notification", "carrying"]);

const isLinux = process.platform === "linux";
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";
const LINUX_WINDOW_TYPE = "dock";

module.exports = function initWindowManager(ctx) {
  // Map<sessionId, { win, state, updatedAt, agentId }>
  const sessionWindows = new Map();
  let staleTimer = null;

  function spawnSessionWindow(sessionId, initialState, agentId) {
    if (sessionWindows.has(sessionId)) return sessionWindows.get(sessionId);
    if (sessionWindows.size >= MAX_SESSION_WINDOWS) {
      // Evict oldest
      let oldestId = null, oldestTime = Infinity;
      for (const [id, sw] of sessionWindows) {
        if (sw.updatedAt < oldestTime) { oldestTime = sw.updatedAt; oldestId = id; }
      }
      if (oldestId) destroySessionWindow(oldestId);
    }

    // Position: offset from primary window
    const primaryBounds = ctx.getPrimaryBounds();
    const offsetIdx = sessionWindows.size;
    const size = ctx.getWindowSize();
    const x = primaryBounds.x - ((offsetIdx + 1) * (size.width + 10));
    const y = primaryBounds.y;

    const win = new BrowserWindow({
      width: size.width,
      height: size.height,
      x, y,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      hasShadow: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      // "toolbar" on Linux: hides from taskbar while keeping drag support
      ...(isLinux ? { type: "toolbar" } : {}),
      ...(isMac ? { type: "panel", roundedCorners: false } : {}),
      webPreferences: {
        preload: path.join(__dirname, "preload-session.js"),
        backgroundThrottling: false,
        additionalArguments: [
          "--theme-config=" + JSON.stringify(ctx.getThemeRendererConfig()),
        ],
      },
    });

    // Session windows are focusable (unlike primary window) so they can
    // receive drag events directly via -webkit-app-region: drag.
    // No hitWin needed — just simple drag support.
    if (isLinux) {
      win.on("close", (event) => {
        if (!ctx.isQuitting()) {
          event.preventDefault();
          if (!win.isVisible()) win.showInactive();
        }
      });
    }
    if (isWin) {
      win.setAlwaysOnTop(true, "pop-up-menu");
    }
    win.loadFile(path.join(__dirname, "index-session.html"));
    win.showInactive();
    if (isLinux) win.setSkipTaskbar(true);

    // Send initial state and label once loaded
    win.webContents.on("did-finish-load", () => {
      const svgs = ctx.getStateSvgs();
      const stateEntry = svgs[initialState] || svgs.idle;
      const svg = stateEntry ? stateEntry[0] : null;
      if (svg) {
        win.webContents.send("state-change", initialState, svg);
      }
      // Send session label
      const label = sessionId.slice(-8);
      win.webContents.send("session-label", label);
    });

    // Crash recovery
    win.webContents.on("render-process-gone", (_event, details) => {
      console.error(`Clawd session window [${sessionId}] crashed:`, details.reason);
      if (!win.isDestroyed()) win.webContents.reload();
    });

    const entry = {
      win,
      sessionId,
      agentId: agentId || "claude-code",
      currentState: initialState || "idle",
      currentSvg: null,
      updatedAt: Date.now(),
    };
    sessionWindows.set(sessionId, entry);
    console.log(`Clawd: spawned session window [${sessionId}] (total: ${sessionWindows.size})`);
    return entry;
  }

  function destroySessionWindow(sessionId) {
    const entry = sessionWindows.get(sessionId);
    if (!entry) return;
    sessionWindows.delete(sessionId);
    if (entry.win && !entry.win.isDestroyed()) {
      entry.win.destroy();
    }
    console.log(`Clawd: destroyed session window [${sessionId}] (remaining: ${sessionWindows.size})`);
  }

  function updateSessionState(sessionId, state, event, agentId, cwd) {
    console.log(`Clawd WM: updateSessionState sid=${sessionId} state=${state} event=${event}`);
    // Handle SessionEnd or sleeping state — destroy the window
    if (event === "SessionEnd" || state === "sleeping") {
      // Play sweeping animation before destroying
      const entry = sessionWindows.get(sessionId);
      if (entry && entry.win && !entry.win.isDestroyed()) {
        const svgs = ctx.getStateSvgs();
        const sweepSvgs = svgs.sweeping || svgs.sleeping || svgs.idle;
        const svg = sweepSvgs ? sweepSvgs[0] : null;
        entry.win.webContents.send("state-change", "sleeping", svg);
        // Destroy after a short delay for visual feedback
        setTimeout(() => destroySessionWindow(sessionId), 2000);
      } else {
        destroySessionWindow(sessionId);
      }
      return;
    }

    // Skip permission events — let main window handle those
    if (event === "PermissionRequest") return;

    // Get or create window
    let entry = sessionWindows.get(sessionId);
    if (!entry) {
      entry = spawnSessionWindow(sessionId, state, agentId);
    }

    entry.updatedAt = Date.now();
    entry.currentState = state;
    if (agentId) entry.agentId = agentId;
    if (cwd) entry.cwd = cwd;

    // Send label (folder name from cwd, or short session id)
    if (entry.win && !entry.win.isDestroyed() && (cwd || !entry.labelSent)) {
      const label = cwd ? path.basename(cwd) : sessionId.slice(-8);
      entry.win.webContents.send("session-label", label);
      entry.labelSent = true;
    }

    // Send state to this session's window
    if (entry.win && !entry.win.isDestroyed()) {
      const svgs = ctx.getStateSvgs();
      const stateSvgs = svgs[state] || svgs.idle;
      const svg = stateSvgs ? stateSvgs[Math.floor(Math.random() * stateSvgs.length)] : null;
      entry.currentSvg = svg;
      entry.win.webContents.send("state-change", state, svg);

      // Oneshot states auto-return to idle after a delay
      if (ONESHOT_STATES.has(state)) {
        if (entry.autoReturnTimer) clearTimeout(entry.autoReturnTimer);
        entry.autoReturnTimer = setTimeout(() => {
          if (!entry.win || entry.win.isDestroyed()) return;
          const idleSvgs = svgs.idle;
          const idleSvg = idleSvgs ? idleSvgs[Math.floor(Math.random() * idleSvgs.length)] : null;
          entry.currentState = "idle";
          entry.currentSvg = idleSvg;
          entry.win.webContents.send("state-change", "idle", idleSvg);
        }, 3000);
      }
    }
  }

  function getSessionWindow(sessionId) {
    return sessionWindows.get(sessionId);
  }

  function cleanStaleWindows() {
    const now = Date.now();
    for (const [id, entry] of sessionWindows) {
      if (now - entry.updatedAt > SESSION_STALE_MS) {
        console.log(`Clawd: session window [${id}] stale — closing`);
        destroySessionWindow(id);
      }
    }
  }

  function startStaleCleanup() {
    if (staleTimer) return;
    staleTimer = setInterval(cleanStaleWindows, STALE_CHECK_INTERVAL);
  }

  function stopStaleCleanup() {
    if (staleTimer) { clearInterval(staleTimer); staleTimer = null; }
  }

  function cleanup() {
    stopStaleCleanup();
    for (const [id] of sessionWindows) {
      destroySessionWindow(id);
    }
  }

  function getAll() {
    return sessionWindows;
  }

  return {
    spawnSessionWindow,
    destroySessionWindow,
    updateSessionState,
    getSessionWindow,
    getAll,
    startStaleCleanup,
    stopStaleCleanup,
    cleanup,
  };
};
