use std::sync::Arc;

use axum::{
    Extension, Router,
    body::HttpBody,
    http::header,
    routing::{IntoMakeService, get},
};
use tower_http::{
    compression::{
        CompressionLayer,
        predicate::{DefaultPredicate, Predicate},
    },
    validate_request::ValidateRequestHeaderLayer,
};

use crate::{DeploymentImpl, e2ee_manager::BridgeManager, middleware};

/// Skip compression for responses larger than ~4 MB.
///
/// Why: gzipping a giant JSON response (e.g. workspace diff with many large
/// files) replaces a precise `Content-Length` with `Transfer-Encoding: chunked`,
/// forcing the browser to grow its read buffer dynamically. For 50 MB+ payloads
/// this peaks at 2–3× memory and OOMs the tab. In the e2ee-gateway path the
/// compressed-but-base64'd body also approaches the 64 MB tungstenite message
/// cap and saturates the 256-frame sub-channel, producing "Machine offline"
/// the instant the diff page mounts. Below this threshold compression still
/// gives the documented 60–80% bandwidth win on REST responses.
const COMPRESSION_MAX_SIZE: u64 = 4 * 1024 * 1024;

#[derive(Clone, Copy)]
struct SizeBelow(u64);

impl Predicate for SizeBelow {
    fn should_compress<B: HttpBody>(&self, response: &axum::http::Response<B>) -> bool {
        let content_size = response.body().size_hint().exact().or_else(|| {
            response
                .headers()
                .get(header::CONTENT_LENGTH)
                .and_then(|h| h.to_str().ok())
                .and_then(|val| val.parse().ok())
        });
        match content_size {
            Some(size) => size <= self.0,
            // Unknown size: refuse to compress to avoid the chunked-encoding
            // dynamic-buffer-growth blow-up described above.
            None => false,
        }
    }
}

pub mod approvals;
pub mod config;
pub mod config_transfer;
pub mod containers;
pub mod filesystem;
// pub mod github;
pub mod events;
pub mod execution_processes;
pub mod frontend;
pub mod health;
pub mod images;
pub mod migration;
pub mod oauth;
pub mod projects;
pub mod repo;
pub mod scratch;
pub mod search;
pub mod sessions;
pub mod tags;
pub mod task_attempts;
pub mod tasks;
pub mod terminal;

pub fn router(
    deployment: DeploymentImpl,
    bridge_manager: Arc<BridgeManager>,
) -> IntoMakeService<Router> {
    // Create routers with different middleware layers
    let base_routes = Router::new()
        .route("/health", get(health::health_check))
        .merge(config::router())
        .merge(config_transfer::router())
        .merge(containers::router(&deployment))
        .merge(projects::router(&deployment))
        .merge(tasks::router(&deployment))
        .merge(task_attempts::router(&deployment))
        .merge(execution_processes::router(&deployment))
        .merge(tags::router(&deployment))
        .merge(oauth::router())
        .merge(filesystem::router())
        .merge(repo::router())
        .merge(events::router(&deployment))
        .merge(approvals::router())
        .merge(scratch::router(&deployment))
        .merge(search::router(&deployment))
        .merge(migration::router())
        .merge(sessions::router(&deployment))
        .merge(terminal::router())
        .nest("/images", images::routes())
        .layer(ValidateRequestHeaderLayer::custom(
            middleware::validate_origin,
        ))
        .layer(
            CompressionLayer::new()
                .compress_when(DefaultPredicate::new().and(SizeBelow(COMPRESSION_MAX_SIZE))),
        )
        .layer(Extension(bridge_manager))
        .with_state(deployment);

    Router::new()
        .route("/", get(frontend::serve_frontend_root))
        .route("/{*path}", get(frontend::serve_frontend))
        .nest("/api", base_routes)
        .into_make_service()
}
