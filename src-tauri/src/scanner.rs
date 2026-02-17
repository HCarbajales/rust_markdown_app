use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;
use walkdir::{DirEntry, WalkDir};

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

/// Skip hidden directories and common non-content directories
fn is_scannable(entry: &DirEntry) -> bool {
    let name = entry.file_name().to_str().unwrap_or("");
    if entry.file_type().is_dir() {
        return !name.starts_with('.') && name != "node_modules" && name != "target";
    }
    true
}

pub fn scan_directory(root: &str) -> Result<Vec<TreeNode>, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    let mut tree: BTreeMap<String, IntermediateNode> = BTreeMap::new();
    let mut found_any = false;

    for entry in WalkDir::new(root)
        .into_iter()
        .filter_entry(is_scannable)
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext_match = path
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case("md"))
            .unwrap_or(false);
        if !ext_match {
            continue;
        }

        found_any = true;
        let full_path_str = path.to_string_lossy().into_owned();
        let relative = path.strip_prefix(root_path).map_err(|e| e.to_string())?;
        let components: Vec<String> = relative
            .components()
            .map(|c| c.as_os_str().to_string_lossy().into_owned())
            .collect();

        insert_path(&mut tree, &components, &full_path_str);
    }

    if !found_any {
        return Ok(Vec::new());
    }

    Ok(convert_tree(&tree, root_path))
}

pub fn count_markdown_files(root: &str) -> Result<usize, String> {
    let root_path = Path::new(root);
    if !root_path.is_dir() {
        return Err(format!("Path is not a directory: {}", root));
    }

    let count = WalkDir::new(root)
        .into_iter()
        .filter_entry(is_scannable)
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_type().is_file()
                && e.path()
                    .extension()
                    .map(|ext| ext.eq_ignore_ascii_case("md"))
                    .unwrap_or(false)
        })
        .count();

    Ok(count)
}

fn insert_path(
    tree: &mut BTreeMap<String, IntermediateNode>,
    components: &[String],
    full_path: &str,
) {
    if components.is_empty() {
        return;
    }

    if components.len() == 1 {
        tree.insert(
            components[0].clone(),
            IntermediateNode::File(full_path.to_string()),
        );
    } else {
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
    let mut result = Vec::with_capacity(tree.len());

    // Directories first
    for (name, node) in tree {
        if let IntermediateNode::Dir(subtree) = node {
            let dir_path = current_path.join(name);
            let children = convert_tree(subtree, &dir_path);
            result.push(TreeNode::Directory {
                name: name.clone(),
                path: dir_path.to_string_lossy().into_owned(),
                children,
            });
        }
    }

    // Then files
    for (name, node) in tree {
        if let IntermediateNode::File(full_path) = node {
            result.push(TreeNode::File {
                name: name.clone(),
                path: full_path.clone(),
            });
        }
    }

    result
}
