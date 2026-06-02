use regex::Regex;
use uuid::Uuid;

pub fn git_branch_id(input: &str) -> String {
    // 1. lowercase
    let lower = input.to_lowercase();

    // 2. replace non-alphanumerics with hyphens
    let re = Regex::new(r"[^a-z0-9]+").unwrap();
    let slug = re.replace_all(&lower, "-");

    // 3. trim extra hyphens
    let trimmed = slug.trim_matches('-');

    // 4. take up to 16 chars, then trim trailing hyphens again
    let cut: String = trimmed.chars().take(16).collect();
    cut.trim_end_matches('-').to_string()
}

pub fn short_uuid(u: &Uuid) -> String {
    // to_simple() gives you a 32-char hex string with no hyphens
    let full = u.simple().to_string();
    full.chars().take(4).collect() // grab the first 4 chars
}

pub fn truncate_to_char_boundary(content: &str, max_len: usize) -> &str {
    if content.len() <= max_len {
        return content;
    }

    let cutoff = content
        .char_indices()
        .map(|(idx, _)| idx)
        .chain(std::iter::once(content.len()))
        .take_while(|&idx| idx <= max_len)
        .last()
        .unwrap_or(0);

    debug_assert!(content.is_char_boundary(cutoff));
    &content[..cutoff]
}

/// Stateful UTF-8 decoder for byte streams that arrive in arbitrary chunks.
///
/// `String::from_utf8_lossy` applied to each chunk independently corrupts any
/// multi-byte character that straddles a chunk boundary: each side becomes a
/// `U+FFFD` replacement character. When a process's stdout is read with a fixed
/// buffer (e.g. `ReaderStream`'s 4096-byte default), a CJK char or emoji landing
/// on the boundary is destroyed.
///
/// This decoder holds the incomplete trailing bytes of a chunk and prepends them
/// to the next chunk, so a character split across chunks is reassembled intact.
/// Genuinely invalid byte sequences are still replaced with `U+FFFD`.
#[derive(Debug, Default)]
pub struct Utf8ChunkDecoder {
    /// Bytes left over from the previous chunk that form an incomplete UTF-8
    /// sequence (at most 3 bytes).
    remainder: Vec<u8>,
}

impl Utf8ChunkDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Decode the next chunk of bytes, returning the text that can be emitted now.
    /// Incomplete trailing bytes are buffered for the next call.
    pub fn decode(&mut self, chunk: &[u8]) -> String {
        // Prepend any bytes held back from the previous chunk.
        let bytes: Vec<u8> = if self.remainder.is_empty() {
            chunk.to_vec()
        } else {
            let mut combined = std::mem::take(&mut self.remainder);
            combined.extend_from_slice(chunk);
            combined
        };

        match std::str::from_utf8(&bytes) {
            Ok(s) => s.to_owned(),
            Err(e) => {
                let valid_up_to = e.valid_up_to();
                // SAFETY: from_utf8 reported these bytes as valid UTF-8.
                let mut out =
                    unsafe { std::str::from_utf8_unchecked(&bytes[..valid_up_to]) }.to_owned();

                match e.error_len() {
                    // A genuine decode error mid-stream: emit a replacement char
                    // and continue after the bad bytes.
                    Some(bad_len) => {
                        out.push('\u{FFFD}');
                        let rest = &bytes[valid_up_to + bad_len..];
                        // Recurse on the remaining bytes to handle further errors
                        // and/or a trailing incomplete sequence.
                        out.push_str(&self.decode(rest));
                    }
                    // Incomplete trailing sequence: hold it for the next chunk.
                    None => {
                        self.remainder = bytes[valid_up_to..].to_vec();
                    }
                }
                out
            }
        }
    }

    /// Flush any held-back bytes at end of stream. A leftover incomplete sequence
    /// is emitted as a single `U+FFFD`.
    pub fn finish(&mut self) -> String {
        if self.remainder.is_empty() {
            String::new()
        } else {
            self.remainder.clear();
            '\u{FFFD}'.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_chunk_decoder_reassembles_char_split_across_chunks() {
        // '储' is E5 82 A8. A 4096-byte read boundary can split it mid-character.
        // Per-chunk String::from_utf8_lossy would emit U+FFFD for each fragment,
        // corrupting it to "存\u{FFFD}\u{FFFD}". The stateful decoder must hold the
        // incomplete trailing bytes and reassemble the char intact.
        let full = "结果存储".as_bytes(); // ...存 = E5 AD 98, 储 = E5 82 A8
        let split = full.len() - 2; // cut INSIDE the final '储' (after its first byte)

        let mut decoder = Utf8ChunkDecoder::new();
        let mut out = String::new();
        out.push_str(&decoder.decode(&full[..split]));
        out.push_str(&decoder.decode(&full[split..]));
        out.push_str(&decoder.finish());

        assert_eq!(out, "结果存储");
        assert!(!out.contains('\u{FFFD}'), "must not introduce replacement chars");
    }

    #[test]
    fn utf8_chunk_decoder_handles_emoji_split_at_every_boundary() {
        // 🔥 is 4 bytes (F0 9F 94 A5). Verify reassembly no matter where the cut lands.
        let full = "a🔥b".as_bytes();
        for split in 0..=full.len() {
            let mut decoder = Utf8ChunkDecoder::new();
            let mut out = String::new();
            out.push_str(&decoder.decode(&full[..split]));
            out.push_str(&decoder.decode(&full[split..]));
            out.push_str(&decoder.finish());
            assert_eq!(out, "a🔥b", "failed at split {split}");
        }
    }

    #[test]
    fn utf8_chunk_decoder_replaces_genuinely_invalid_bytes() {
        // A lone 0xFF is not valid UTF-8 and must become U+FFFD, like from_utf8_lossy.
        let mut decoder = Utf8ChunkDecoder::new();
        let out = decoder.decode(&[b'a', 0xFF, b'b']) + &decoder.finish();
        assert_eq!(out, "a\u{FFFD}b");
    }

    #[test]
    fn utf8_chunk_decoder_flushes_truncated_trailing_sequence_as_replacement() {
        // Stream ends mid-character (only the first byte of '储' arrives).
        let mut decoder = Utf8ChunkDecoder::new();
        let mut out = decoder.decode(&[0xE5]); // incomplete; held back, nothing emitted yet
        assert_eq!(out, "");
        out.push_str(&decoder.finish());
        assert_eq!(out, "\u{FFFD}");
    }

    #[test]
    fn utf8_chunk_decoder_matches_lossy_when_not_split() {
        // Whole-string decode must be byte-identical to from_utf8_lossy.
        let mut decoder = Utf8ChunkDecoder::new();
        let s = "结果存储 + Bus 进度 🔥";
        let out = decoder.decode(s.as_bytes()) + &decoder.finish();
        assert_eq!(out, String::from_utf8_lossy(s.as_bytes()));
    }

    #[test]
    fn test_truncate_to_char_boundary() {
        use super::truncate_to_char_boundary;

        let input = "a".repeat(10);
        assert_eq!(truncate_to_char_boundary(&input, 7), "a".repeat(7));

        let input = "hello world";
        assert_eq!(truncate_to_char_boundary(input, input.len()), input);

        let input = "🔥🔥🔥"; // each fire emoji is 4 bytes
        assert_eq!(truncate_to_char_boundary(input, 5), "🔥");
        assert_eq!(truncate_to_char_boundary(input, 3), "");
    }
}
