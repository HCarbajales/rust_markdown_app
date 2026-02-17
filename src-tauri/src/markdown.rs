use pulldown_cmark::{Event, Options, Parser, Tag, TagEnd};
use std::fs;

fn slugify(text: &str) -> String {
    text.chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else if c == ' ' || c == '-' || c == '_' {
                '-'
            } else {
                '\0'
            }
        })
        .filter(|&c| c != '\0')
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

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
    let mut in_heading = false;
    let mut heading_slug_text = String::new();
    let mut heading_events: Vec<Event> = Vec::new();
    let mut heading_level = 0u8;

    for event in parser {
        match &event {
            Event::Start(Tag::Heading { level, .. }) => {
                in_heading = true;
                heading_slug_text.clear();
                heading_events.clear();
                heading_level = *level as u8;
            }
            Event::End(TagEnd::Heading(_)) => {
                in_heading = false;
                let id = slugify(&heading_slug_text);
                html_output.push_str(&format!("<h{} id=\"{}\">", heading_level, id));
                pulldown_cmark::html::push_html(&mut html_output, heading_events.drain(..));
                html_output.push_str(&format!("</h{}>\n", heading_level));
            }
            Event::Text(t) if in_heading => {
                heading_slug_text.push_str(t);
                heading_events.push(event);
            }
            Event::Code(c) if in_heading => {
                heading_slug_text.push_str(c);
                heading_events.push(event);
            }
            _ if in_heading => {
                heading_events.push(event);
            }
            _ => {
                pulldown_cmark::html::push_html(&mut html_output, std::iter::once(event));
            }
        }
    }

    Ok(html_output)
}
