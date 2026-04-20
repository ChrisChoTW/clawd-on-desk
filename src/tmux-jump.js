// tmux-jump.js — Find tmux pane for a given PID and jump to it.
// Used by session-window double-click to bring the corresponding agent's
// tmux pane into focus in the attached terminal client.

const { execFileSync } = require("child_process");
const fs = require("fs");

const isWin = process.platform === "win32";

function readPPid(pid) {
  if (!pid || pid <= 1) return null;
  // Linux fast path via /proc
  try {
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const m = status.match(/^PPid:\s+(\d+)/m);
    if (m) return parseInt(m[1], 10);
  } catch {}
  // Portable fallback via ps
  try {
    const out = execFileSync("ps", ["-o", "ppid=", "-p", String(pid)], {
      encoding: "utf8", timeout: 500, windowsHide: true,
    });
    const ppid = parseInt(out.trim(), 10);
    return ppid > 0 ? ppid : null;
  } catch { return null; }
}

function listPanes() {
  if (isWin) return null;
  try {
    const out = execFileSync("tmux", [
      "list-panes", "-a",
      "-F", "#{pane_pid} #{session_name}:#{window_index}.#{pane_index}",
    ], { encoding: "utf8", timeout: 500 });
    const panes = new Map();
    for (const line of out.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      const sp = t.indexOf(" ");
      if (sp < 0) continue;
      const pid = parseInt(t.slice(0, sp), 10);
      const target = t.slice(sp + 1).trim();
      if (pid && target) panes.set(pid, target);
    }
    return panes;
  } catch { return null; }
}

function findTmuxPaneForPid(rootPid, pidChain) {
  if (!rootPid) return null;
  const panes = listPanes();
  if (!panes || panes.size === 0) return null;

  // Direct match against rootPid + any pid in pidChain
  const seen = new Set();
  const candidates = [rootPid];
  if (Array.isArray(pidChain)) {
    for (const p of pidChain) if (p && !seen.has(p)) { candidates.push(p); seen.add(p); }
  }
  for (const pid of candidates) {
    if (panes.has(pid)) return panes.get(pid);
  }

  // Walk up the process tree from rootPid
  let pid = rootPid;
  for (let depth = 0; pid > 1 && depth < 30; depth++) {
    if (panes.has(pid)) return panes.get(pid);
    const ppid = readPPid(pid);
    if (!ppid || ppid === pid) break;
    pid = ppid;
  }
  return null;
}

function jumpToPane(target) {
  if (isWin || !target) return false;
  // Reject anything that isn't "session:window[.pane]" — no shell metachars
  if (!/^[\w.-]+:\d+(\.\d+)?$/.test(target)) return false;

  let success = false;
  const run = (args) => {
    try {
      execFileSync("tmux", args, { timeout: 500, stdio: "ignore" });
      success = true;
    } catch {}
  };
  // Ensure the window/pane is active within its session
  run(["select-window", "-t", target]);
  run(["select-pane", "-t", target]);
  // Switch any attached client over to that session's new active pane
  run(["switch-client", "-t", target]);
  return success;
}

module.exports = { findTmuxPaneForPid, jumpToPane };
