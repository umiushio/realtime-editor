mod app;
mod handler;

use std::sync::Arc;
use axum::routing::get;
use app::AppState;
use handler::websocket_handler;

#[tokio::main]
async fn main() {
    // 初始化日志
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();

    let state = Arc::new(AppState::new());

    let app = axum::Router::new()
        .route("/ws", get(websocket_handler))
        .route("/health", get(|| async { "Ok" }))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080")
        .await
        .unwrap();

    tracing::info!("Server running on http://127.0.0.1:8080");
    axum::serve(listener, app).await.unwrap();
}