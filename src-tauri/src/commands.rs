use crate::config::{self, AppConfig, CatalogEntry};
use crate::scanner;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<AppConfig, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(config::load_config(&data_dir))
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, config: AppConfig) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    config::save_config(&data_dir, &config)
}

#[tauri::command]
pub async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    match folder {
        Some(file_path) => Ok(Some(file_path.to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn add_catalog(app: tauri::AppHandle, name: String, path: String) -> Result<AppConfig, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&data_dir);
    cfg.catalogs.push(CatalogEntry { name, path });
    config::save_config(&data_dir, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn remove_catalog(app: tauri::AppHandle, index: usize) -> Result<AppConfig, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&data_dir);
    if index >= cfg.catalogs.len() {
        return Err(format!("Index {} out of range", index));
    }
    cfg.catalogs.remove(index);
    if let Some(selected) = cfg.last_selected {
        if selected >= cfg.catalogs.len() {
            cfg.last_selected = if cfg.catalogs.is_empty() {
                None
            } else {
                Some(0)
            };
        }
    }
    config::save_config(&data_dir, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn scan_directory(root_path: String) -> Result<Vec<scanner::TreeNode>, String> {
    scanner::scan_directory(&root_path)
}

#[tauri::command]
pub fn render_markdown(file_path: String) -> Result<String, String> {
    crate::markdown::render_markdown(&file_path)
}

#[tauri::command]
pub fn set_last_selected(app: tauri::AppHandle, index: Option<usize>) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&data_dir);
    cfg.last_selected = index;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub fn set_sidebar_width(app: tauri::AppHandle, width: f64) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&data_dir);
    cfg.sidebar_width = width;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub fn set_dark_mode(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&data_dir);
    cfg.dark_mode = enabled;
    config::save_config(&data_dir, &cfg)
}

#[tauri::command]
pub fn rename_catalog(app: tauri::AppHandle, index: usize, new_name: String) -> Result<AppConfig, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let mut cfg = config::load_config(&data_dir);
    if index >= cfg.catalogs.len() {
        return Err(format!("Index {} out of range", index));
    }
    cfg.catalogs[index].name = new_name;
    config::save_config(&data_dir, &cfg)?;
    Ok(cfg)
}

#[tauri::command]
pub fn count_markdown_files(root_path: String) -> Result<usize, String> {
    scanner::count_markdown_files(&root_path)
}
