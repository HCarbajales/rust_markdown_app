use pulldown_cmark::{html, Options, Parser};
use std::fs;

pub fn render_markdown(file_path: &str) -> Result<String, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);

    let parser = Parser::new_ext(&content, options);

    let mut html_output = String::with_capacity(content.len() * 3 / 2);
    html::push_html(&mut html_output, parser);

    Ok(html_output)
}
