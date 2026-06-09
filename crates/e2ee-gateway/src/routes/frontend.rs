use axum::{
    body::Body,
    response::{IntoResponse, Response},
};
use http::{header, HeaderValue, StatusCode};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "../../frontend/dist"]
pub struct GatewayAssets;

/// Decide whether an unmatched path should return 404 or fall back to
/// `index.html`. Returns `true` (→ 404) when the path is clearly not a
/// SPA client-side route: API/WebSocket namespaces, or anything that
/// looks like a static asset (has a file extension). Returns `false`
/// (→ serve index.html) for genuine React Router paths.
///
/// The expected input is the stripped path (no leading `/`), matching
/// what `serve_frontend` passes to `serve_file`.
fn should_404_when_missing(path: &str) -> bool {
    path.starts_with("api/") || path.starts_with("ws/") || path.contains('.')
}

pub async fn serve_frontend(uri: axum::extract::Path<String>) -> impl IntoResponse {
    let path = uri.trim_start_matches('/');
    serve_file(path).await
}

pub async fn serve_frontend_root() -> impl IntoResponse {
    serve_file("index.html").await
}

fn cache_control(path: &str) -> HeaderValue {
    if path.starts_with("assets/") {
        HeaderValue::from_static("public, max-age=31536000, immutable")
    } else {
        HeaderValue::from_static("no-cache")
    }
}

async fn serve_file(path: &str) -> impl IntoResponse + use<> {
    let file = GatewayAssets::get(path);

    match file {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();

            Response::builder()
                .status(StatusCode::OK)
                .header(
                    header::CONTENT_TYPE,
                    HeaderValue::from_str(mime.as_ref()).unwrap(),
                )
                .header(header::CACHE_CONTROL, cache_control(path))
                .body(Body::from(content.data.into_owned()))
                .unwrap()
        }
        None => {
            if should_404_when_missing(path) {
                return Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap();
            }

            if let Some(index) = GatewayAssets::get("index.html") {
                Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, HeaderValue::from_static("text/html"))
                    .header(header::CACHE_CONTROL, HeaderValue::from_static("no-cache"))
                    .body(Body::from(index.data.into_owned()))
                    .unwrap()
            } else {
                Response::builder()
                    .status(StatusCode::NOT_FOUND)
                    .body(Body::from("404 Not Found"))
                    .unwrap()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn api_paths_should_404_when_missing() {
        assert!(should_404_when_missing("api/config/info"));
        assert!(should_404_when_missing("api/"));
        assert!(should_404_when_missing("api/projects/stream/ws"));
    }

    #[test]
    fn ws_paths_should_404_when_missing() {
        assert!(should_404_when_missing("ws/webui"));
        assert!(should_404_when_missing("ws/daemon"));
    }

    #[test]
    fn asset_looking_paths_should_404_when_missing() {
        // Any path with a file extension — these are asset requests,
        // not SPA routes. Returning index.html with text/html would
        // break script/image/stylesheet loading.
        assert!(should_404_when_missing("assets/index-abc.js"));
        assert!(should_404_when_missing("favicon.svg"));
        assert!(should_404_when_missing("site.webmanifest"));
    }

    #[test]
    fn spa_routes_should_fall_back() {
        // Client-side React Router paths. No extension, not api/ws.
        assert!(!should_404_when_missing(""));
        assert!(!should_404_when_missing("local-projects/abc/tasks"));
        assert!(!should_404_when_missing("settings/general"));
    }
}
