use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogEntry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub catalogs: Vec<CatalogEntry>,
    pub last_selected: Option<usize>,
    pub sidebar_width: f64,
    #[serde(default)]
    pub dark_mode: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            catalogs: Vec::new(),
            last_selected: None,
            sidebar_width: 300.0,
            dark_mode: false,
        }
    }
}

fn config_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("config.json")
}

pub fn load_config(app_data_dir: &PathBuf) -> AppConfig {
    let path = config_path(app_data_dir);
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

pub fn save_config(app_data_dir: &PathBuf, config: &AppConfig) -> Result<(), String> {
    fs::create_dir_all(app_data_dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_path(app_data_dir), json).map_err(|e| e.to_string())?;
    Ok(())
}
