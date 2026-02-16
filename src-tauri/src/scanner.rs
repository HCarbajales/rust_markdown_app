use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TreeNode {
    #[serde(rename = "directory")]
    Directory {
        name: String,
        path: String,
        children: Vec<TreeNode>,
    },
    #[serde(rename = "file")]
    File { name: String, path: String },
}

enum IntermediateNode {
    Dir(BTreeMap<String, IntermediateNode>),
    File(String),
}

pub fn scan_directory(root: &str) -> Result<Vec<TreeNode>, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    // Phase 1: Collect all .md file paths
    let mut md_files: Vec<String> = Vec::new();
    for entry in WalkDir::new(root).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.eq_ignore_ascii_case("md") {
                    md_files.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    if md_files.is_empty() {
        return Ok(Vec::new());
    }

    // Phase 2: Build an intermediate tree using BTreeMap for sorting
    let mut tree: BTreeMap<String, IntermediateNode> = BTreeMap::new();

    for file_path in &md_files {
        let full = Path::new(file_path);
        let relative = full
            .strip_prefix(root_path)
            .map_err(|e| e.to_string())?;

        let components: Vec<String> = relative
            .components()
            .map(|c| c.as_os_str().to_string_lossy().to_string())
            .collect();

        insert_path(&mut tree, &components, file_path);
    }

    // Phase 3: Convert intermediate tree to TreeNode vec
    let result = convert_tree(&tree, root_path);
    Ok(result)
}

pub fn count_markdown_files(root: &str) -> Result<usize, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    let count = WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path().is_file()
                && e.path()
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
        })
        .count();

    Ok(count)
}

fn insert_path(tree: &mut BTreeMap<String, IntermediateNode>, components: &[String], full_path: &str) {
    if components.is_empty() {
        return;
    }

    if components.len() == 1 {
        // This is a file
        tree.insert(
            components[0].clone(),
            IntermediateNode::File(full_path.to_string()),
        );
    } else {
        // This is a directory component
        let dir_name = &components[0];
        let entry = tree
            .entry(dir_name.clone())
            .or_insert_with(|| IntermediateNode::Dir(BTreeMap::new()));

        if let IntermediateNode::Dir(ref mut subtree) = entry {
            insert_path(subtree, &components[1..], full_path);
        }
    }
}

fn convert_tree(tree: &BTreeMap<String, IntermediateNode>, current_path: &Path) -> Vec<TreeNode> {
    let mut dirs: Vec<TreeNode> = Vec::new();
    let mut files: Vec<TreeNode> = Vec::new();

    for (name, node) in tree {
        match node {
            IntermediateNode::Dir(subtree) => {
                let dir_path = current_path.join(name);
                let children = convert_tree(subtree, &dir_path);
                dirs.push(TreeNode::Directory {
                    name: name.clone(),
                    path: dir_path.to_string_lossy().to_string(),
                    children,
                });
            }
            IntermediateNode::File(full_path) => {
                files.push(TreeNode::File {
                    name: name.clone(),
                    path: full_path.clone(),
                });
            }
        }
    }

    // Directories first, then files (both already sorted by BTreeMap)
    dirs.extend(files);
    dirs
}
