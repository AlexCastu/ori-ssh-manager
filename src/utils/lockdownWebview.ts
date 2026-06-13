// Make the desktop app stop behaving like a browser: the WebView ships a
// native right-click menu (Reload / Inspect / Back) and devtools shortcuts
// that make no sense in a shipped SSH manager. We block them at the JS layer
// (the only place that also covers macOS WKWebView, which has no config flag).
//
// Note: in release builds (`tauri build`) devtools is already compiled out
// because the `tauri` crate's `devtools` feature is not enabled; this only
// removes the leftover context menu and reload/inspect key combos.

export function lockdownWebview(): void {
  // Right-click context menu (Reload, Inspect, ...). Paste still works via
  // Cmd/Ctrl+V, so removing it everywhere is safe.
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    // Reload the page (would silently drop live SSH connections)
    const reload = mod && key === 'r';
    // DevTools: F12, Ctrl/Cmd+Shift+I/J, and macOS Cmd+Alt+I/J
    const devtools =
      key === 'f12' ||
      (mod && e.shiftKey && (key === 'i' || key === 'j')) ||
      (e.metaKey && e.altKey && (key === 'i' || key === 'j'));
    // View source
    const viewSource = mod && key === 'u';

    if (reload || devtools || viewSource) {
      e.preventDefault();
    }
  });
}
