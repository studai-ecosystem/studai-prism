// Prism assessment shell — the institutional exam window.
//
// Deliberately minimal: it opens https://prism.studai.one in a fullscreen,
// undecorated, always-on-top WebView2 window with a `PrismShell/1.0` user
// agent. The web app detects that marker and treats the session as running
// in an app window (display_mode/app_blur telemetry, no install prompts).
//
// What this shell honestly is: a calmer, chrome-free exam frame with a
// single-instance guarantee. What it is NOT: a secure lockdown browser —
// Alt+F4 / Ctrl+Alt+Del still work (true kiosk lockdown is an OS policy,
// e.g. Windows Assigned Access). Prism's integrity model MEASURES focus
// loss rather than pretending to make it impossible; the page's own blur
// listener records app_blur events server-side.
//
// No IPC, no custom commands, no filesystem access: the page has exactly the
// same powers it has in a browser tab. The shell adds a window, nothing else.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // Second launches focus the existing exam window instead of opening a
        // parallel one (two rooms in one sitting would be an integrity mess).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .run(tauri::generate_context!())
        .expect("failed to launch the Prism assessment shell");
}
