use std::sync::Arc;

use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade, Message},
        State,
    },
    response::IntoResponse,
    Error,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Serialize, Deserialize};
use tokio::time::{timeout, Duration};
use crate::app::{AppState, Document};

const CONNECTION_TEST_TIMEOUT: Duration = Duration::from_millis(100);

#[derive(Debug, Serialize, Deserialize)]
struct WebSocketMessage {
    r#type: String,
    payload: serde_json::Value,
}

pub async fn websocket_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_websocket_connection(socket, (*state).clone()))
}

async fn handle_websocket_connection(
    mut socket: WebSocket,
    state: AppState,
) {
    let user_id = uuid::Uuid::new_v4().to_string();
    tracing::info!("User {} connecting", user_id);

    if let Err(e) = test_connection(&mut socket, &state, &user_id).await {
        tracing::warn!(user_id = %user_id, error = %e, "Connection test failed");
        return
    }

    // 生成广播接收器
    let mut broadcast_rx = state.tx.subscribe();

    // 添加到用户状态
    let user_count = state.add_user(user_id.clone());
    broadcast_user_count(&state, user_count).await;

    // 同时处理发送和接收消息
    let (mut sender, mut receiver) = socket.split();

    let mut send_task = tokio::spawn({
        let user_id = user_id.clone();
        async move {
            while let Ok(msg) = broadcast_rx.recv().await {
                if let Err(e) = sender.send(Message::Text(msg.into())).await {
                    tracing::warn!(user_id = %user_id, "Failed to send message to socket: {}", e);
                    break;
                }
            }
        }
    });

    let mut recv_task = tokio::spawn({
        let state = state.clone();
        let user_id = user_id.clone();
        async move {
            while let Some(message) = receiver.next().await {
                match message {
                    Ok(Message::Text(text)) => {
                        // 处理文本消息
                        handle_text_message(&text, &state, &user_id).await;
                        // state.update_user_activity(&user_id);
                    }
                    Ok(Message::Close(_)) => {
                        tracing::info!(user_id = %user_id, "Socket requested close");
                        break;
                    }
                    Err(e) => {
                        tracing::warn!(user_id = %user_id, "WebSocket error: {}", e);
                    }
                    _ => {} //忽略其他消息类型
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => recv_task.abort(),
        _ = &mut recv_task => send_task.abort(),
    }

    // 清理资源
    cleanup_connection(&state, &user_id).await;
}

/// 快速连接测试: 立即发送测试消息验证连接有效性
async fn test_connection(
    socket: &mut WebSocket,
    state: &AppState,
    user_id: &str,
) -> Result<(), Error> {
    let (content, version) = state.documents.get("default")
        .map(|doc| (doc.content().to_string(), doc.version()))
        .unwrap_or_default();
    // 立即发送当前状态文档测试连接
    let doc_msg = serde_json::json!({
        "type": "content_update",
        "payload": { "content": content, "version": version }
    });
    match timeout(
        CONNECTION_TEST_TIMEOUT,
        socket.send(Message::Text(serde_json::to_string(&doc_msg).unwrap().into()))
    ).await {
        Ok(Ok(())) => {
            tracing::debug!(user_id = %user_id, "Connection test passed");
            Ok(())
        }
        Ok(Err(e)) => {
            tracing::warn!(user_id = %user_id, "Connection test failed - send error");
            Err(e)
        }
        Err(_) => {
            tracing::warn!(user_id = %user_id, "Connection test failed - timeout");
            Err(Error::new(std::io::Error::new(
                std::io::ErrorKind::TimedOut, 
            "connection test timeout"
            )))
        }
    }
}

async fn handle_text_message(text: &str, state: &AppState, user_id: &str) {
    match serde_json::from_str::<WebSocketMessage>(text) {
        Ok(message) => {
            match message.r#type.as_str() {
                "content_update" => {
                    if let Some(content) = message.payload.get("content").and_then(|v| v.as_str()) {
                        // 更新文档内容
                        let mut doc = state.documents.entry("default".to_string()).or_insert_with(|| Document::default());
                        doc.update(content);

                        // 广播更新
                        let broadcast_msg = serde_json::json!({
                            "type": "content_update",
                            "payload": { "content": content, "version": doc.version() }
                        });

                        if let Ok(msg_str) = serde_json::to_string(&broadcast_msg) {
                            let _ = state.tx.send(msg_str);
                        }
                    }
                }
                _ => {
                    tracing::info!("Unknown message type from user {}: {}", user_id, message.r#type);
                }
            }
        }
        Err(e) => {
            tracing::warn!("Failed to parse message from user {}: {}", user_id, e);
        }
    }
}

async fn broadcast_user_count(state: &AppState, count: usize) {
    let message = serde_json::json!({
        "type": "user_count_update",
        "payload": { "count": count }
    });

    if let Ok(msg_str) = serde_json::to_string(&message) {
        let _ = state.tx.send(msg_str);
    }
}

async fn cleanup_connection(state: &AppState, user_id: &str) {
    let user_count = state.remove_user(user_id);
    broadcast_user_count(state, user_count).await;
    tracing::info!("User {} removed, {} users remaining", user_id, user_count);
}