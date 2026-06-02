use bytes::Bytes;
use futures::{Stream, StreamExt, TryStreamExt};
use tokio_util::{
    codec::{FramedRead, LinesCodec},
    io::StreamReader,
};

use crate::text::Utf8ChunkDecoder;

/// Extension trait for converting chunked string streams to line streams.
pub trait LinesStreamExt: Stream<Item = Result<String, std::io::Error>> + Sized {
    /// Convert a chunked string stream to a line stream.
    fn lines(self) -> futures::stream::BoxStream<'static, std::io::Result<String>>
    where
        Self: Send + 'static,
    {
        let reader = StreamReader::new(self.map(|result| result.map(Bytes::from)));
        FramedRead::new(reader, LinesCodec::new())
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
            .boxed()
    }
}

impl<S> LinesStreamExt for S where S: Stream<Item = Result<String, std::io::Error>> {}

/// Decode a stream of raw byte chunks into a stream of UTF-8 strings, correctly
/// reassembling multi-byte characters that straddle chunk boundaries.
///
/// `String::from_utf8_lossy` applied per chunk corrupts a character split across
/// two chunks into `U+FFFD`. A fixed-size reader (e.g. `ReaderStream`'s 4096-byte
/// default) makes this happen for any CJK char or emoji on a boundary. This adapter
/// threads a [`Utf8ChunkDecoder`] through the stream and flushes the trailing
/// remainder when the byte stream ends.
pub fn decode_utf8_chunks<S>(
    byte_stream: S,
) -> impl Stream<Item = std::io::Result<String>> + Send + 'static
where
    S: Stream<Item = std::io::Result<bytes::Bytes>> + Send + 'static,
{
    // State: (underlying stream, decoder, finished flag for the final flush).
    futures::stream::unfold(
        (byte_stream.boxed(), Utf8ChunkDecoder::new(), false),
        |(mut stream, mut decoder, mut done)| async move {
            loop {
                if done {
                    return None;
                }
                match stream.next().await {
                    Some(Ok(chunk)) => {
                        let s = decoder.decode(&chunk);
                        if s.is_empty() {
                            // Whole chunk was held back as an incomplete sequence;
                            // pull the next chunk rather than emit an empty item.
                            continue;
                        }
                        return Some((Ok(s), (stream, decoder, done)));
                    }
                    Some(Err(e)) => return Some((Err(e), (stream, decoder, done))),
                    None => {
                        // Underlying stream ended: emit the final flush (if any), once.
                        done = true;
                        let tail = decoder.finish();
                        if tail.is_empty() {
                            return None;
                        }
                        return Some((Ok(tail), (stream, decoder, done)));
                    }
                }
            }
        },
    )
}

#[cfg(test)]
mod tests {
    use futures::StreamExt;

    use super::*;

    #[tokio::test]
    async fn decode_utf8_chunks_reassembles_multibyte_split_across_chunks() {
        // Two byte chunks that split '储' (E5 82 A8) down the middle, mimicking a
        // read-buffer boundary. Per-chunk lossy decoding would yield U+FFFD; the
        // adapter must reassemble the original text.
        let full = "结果存储".as_bytes().to_vec();
        let split = full.len() - 2;
        let chunks: Vec<std::io::Result<bytes::Bytes>> = vec![
            Ok(bytes::Bytes::copy_from_slice(&full[..split])),
            Ok(bytes::Bytes::copy_from_slice(&full[split..])),
        ];

        let decoded: String = decode_utf8_chunks(futures::stream::iter(chunks))
            .map(|r| r.unwrap())
            .collect::<Vec<_>>()
            .await
            .concat();

        assert_eq!(decoded, "结果存储");
        assert!(!decoded.contains('\u{FFFD}'));
    }

    #[tokio::test]
    async fn decode_utf8_chunks_flushes_trailing_partial_at_end() {
        // Stream ends with a lone incomplete byte; it must surface as one U+FFFD,
        // not vanish.
        let chunks: Vec<std::io::Result<bytes::Bytes>> =
            vec![Ok(bytes::Bytes::from_static(&[b'h', b'i', 0xE5]))];
        let decoded: String = decode_utf8_chunks(futures::stream::iter(chunks))
            .map(|r| r.unwrap())
            .collect::<Vec<_>>()
            .await
            .concat();
        assert_eq!(decoded, "hi\u{FFFD}");
    }
}
