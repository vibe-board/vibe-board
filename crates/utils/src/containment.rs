//! Path containment: determine whether one repo path is nested inside another.

use std::path::{Component, Path};

/// If `child` is a strict descendant of `parent` (component-wise, not string
/// prefix), return the child's path relative to the parent as a forward-slash
/// string (e.g. "child" or "a/b"). Returns None for siblings, equal paths, or
/// string-prefix-but-not-ancestor cases like /a/b vs /a/bc.
///
/// Both inputs should be canonicalized by the caller when they refer to real
/// on-disk paths; this function compares components as given.
pub fn relative_if_nested(parent: &Path, child: &Path) -> Option<String> {
    let parent_components: Vec<Component> = parent.components().collect();
    let child_components: Vec<Component> = child.components().collect();
    if child_components.len() <= parent_components.len() {
        return None;
    }
    for (p, c) in parent_components.iter().zip(child_components.iter()) {
        if p != c {
            return None;
        }
    }
    let rel: std::path::PathBuf = child_components[parent_components.len()..].iter().collect();
    Some(rel.to_string_lossy().replace('\\', "/"))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn ancestor_yields_relative_path() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open/child")),
            Some("child".to_string())
        );
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open/a/b")),
            Some("a/b".to_string())
        );
    }
    #[test]
    fn siblings_are_not_nested() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/other")),
            None
        );
    }
    #[test]
    fn string_prefix_is_not_ancestor() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open-other")),
            None
        );
    }
    #[test]
    fn equal_paths_are_not_nested() {
        assert_eq!(
            relative_if_nested(Path::new("/repos/open"), Path::new("/repos/open")),
            None
        );
    }
}
