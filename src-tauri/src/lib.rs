mod commands;
mod config;
mod markdown;
mod scanner;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::pick_folder,
            commands::add_catalog,
            commands::remove_catalog,
            commands::scan_directory,
            commands::render_markdown,
            commands::set_last_selected,
            commands::set_sidebar_width,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
