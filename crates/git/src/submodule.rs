//! Parsing of .gitmodules and submodule helpers.

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SubmoduleEntry {
    pub path: String,
    pub url: String,
}

/// Parse the contents of a .gitmodules file. Returns direct submodules in
/// declaration order. Tolerant of blank lines and indentation.
pub fn parse_gitmodules(contents: &str) -> Vec<SubmoduleEntry> {
    let mut entries: Vec<SubmoduleEntry> = Vec::new();
    let mut cur_path: Option<String> = None;
    let mut cur_url: Option<String> = None;

    fn flush(
        entries: &mut Vec<SubmoduleEntry>,
        path: &mut Option<String>,
        url: &mut Option<String>,
    ) {
        if let (Some(p), Some(u)) = (path.take(), url.take()) {
            entries.push(SubmoduleEntry { path: p, url: u });
        } else {
            *path = None;
            *url = None;
        }
    }

    for line in contents.lines() {
        let line = line.trim();
        if line.starts_with("[submodule") {
            flush(&mut entries, &mut cur_path, &mut cur_url);
        } else if let Some(rest) = line.strip_prefix("path")
            && let Some(v) = rest.split('=').nth(1)
        {
            cur_path = Some(v.trim().to_string());
        } else if let Some(rest) = line.strip_prefix("url")
            && let Some(v) = rest.split('=').nth(1)
        {
            cur_url = Some(v.trim().to_string());
        }
    }
    flush(&mut entries, &mut cur_path, &mut cur_url);
    entries
}

/// Read and parse <repo_root>/.gitmodules. Returns empty if the file is absent.
pub fn read_submodules(repo_root: &std::path::Path) -> Vec<SubmoduleEntry> {
    match std::fs::read_to_string(repo_root.join(".gitmodules")) {
        Ok(contents) => parse_gitmodules(&contents),
        Err(_) => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiple_submodules() {
        let contents = r#"
[submodule "libs/foo"]
    path = libs/foo
    url = https://example.com/foo.git
[submodule "vendor/bar"]
    path = vendor/bar
    url = git@example.com:bar.git
"#;
        let subs = parse_gitmodules(contents);
        assert_eq!(subs.len(), 2);
        assert_eq!(subs[0].path, "libs/foo");
        assert_eq!(subs[0].url, "https://example.com/foo.git");
        assert_eq!(subs[1].path, "vendor/bar");
    }

    #[test]
    fn empty_when_absent() {
        assert!(parse_gitmodules("").is_empty());
    }
}
