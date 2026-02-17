use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use std::fs;

const MAX_FILE_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

fn slugify(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut prev_dash = true; // suppress leading dashes

    for c in text.chars() {
        if c.is_alphanumeric() {
            result.push(c.to_ascii_lowercase());
            prev_dash = false;
        } else if c == ' ' || c == '-' || c == '_' {
            if !prev_dash {
                result.push('-');
                prev_dash = true;
            }
        }
    }

    if result.ends_with('-') {
        result.pop();
    }
    result
}

pub fn render_markdown(file_path: &str) -> Result<String, String> {
    // File size guard
    let metadata = fs::metadata(file_path)
        .map_err(|e| format!("Cannot read file {}: {}", file_path, e))?;
    if metadata.len() > MAX_FILE_SIZE {
        return Err(format!(
            "File too large: {} bytes (max {} MB)",
            metadata.len(),
            MAX_FILE_SIZE / 1024 / 1024
        ));
    }

    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read file {}: {}", file_path, e))?;

    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_FOOTNOTES);

    let parser = Parser::new_ext(&content, options);

    // Collect all events, injecting heading IDs for anchor link support
    let mut events: Vec<Event> = Vec::new();
    let mut in_heading = false;
    let mut heading_text = String::new();
    let mut heading_start_idx = 0;
    let mut heading_level = HeadingLevel::H1;

    for event in parser {
        match &event {
            Event::Start(Tag::Heading { level, .. }) => {
                in_heading = true;
                heading_text.clear();
                heading_start_idx = events.len();
                heading_level = *level;
                events.push(event);
            }
            Event::End(TagEnd::Heading(_)) => {
                in_heading = false;
                let id = slugify(&heading_text);
                // Replace the Start(Heading) with one that carries the id
                events[heading_start_idx] = Event::Start(Tag::Heading {
                    level: heading_level,
                    id: Some(id.into()),
                    classes: vec![],
                    attrs: vec![],
                });
                events.push(event);
            }
            Event::Text(t) if in_heading => {
                heading_text.push_str(t);
                events.push(event);
            }
            Event::Code(c) if in_heading => {
                heading_text.push_str(c);
                events.push(event);
            }
            _ => {
                events.push(event);
            }
        }
    }

    // Single batch push_html call — much faster than per-event calls
    let mut html_output = String::with_capacity(content.len() * 3 / 2);
    pulldown_cmark::html::push_html(&mut html_output, events.into_iter());

    Ok(html_output)
}
