use std::sync::Arc;
use tokio::sync::broadcast;
use dashmap::DashMap;

#[derive(Debug, Clone)]
pub struct User {
    id: String,
    connected_at: std::time::SystemTime,
    last_activity: std::time::SystemTime,
}

impl User {
    pub fn new(id: String) -> Self {
        Self {
            id,
            connected_at: std::time::SystemTime::now(),
            last_activity: std::time::SystemTime::now(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct Document {
    content: String,
    version: u64,
    last_modified: std::time::SystemTime,
}

impl Default for Document {
    fn default() -> Self {
        Self {
            content: String::new(),
            version: 0,
            last_modified: std::time::SystemTime::now(),
        }
    }
}

impl Document {
    pub fn update(&mut self, content: &str) {
        self.content = content.to_string();
        self.version += 1;
        self.last_modified = std::time::SystemTime::now();
    } 

    pub fn version(&self) -> u64 {
        self.version
    }

    pub fn content(&self) -> &str {
        &self.content
    }
}

#[derive(Debug, Clone)]
pub struct AppState {
    // 文档ID到内容的映射
    pub documents: Arc<DashMap<String, Document>>,
    // 用户列表
    users: Arc<DashMap<String, User>>,
    // 广播通道用于实时消息
    pub tx: broadcast::Sender<String>,
}

impl AppState {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(1000);
        Self { 
            documents: Arc::new(DashMap::new()), 
            users: Arc::new(DashMap::new()), 
            tx, 
        }
    }

    pub fn add_user(&self, user_id: String) -> usize {
        let user = User {
            id: user_id.clone(),
            connected_at: std::time::SystemTime::now(),
            last_activity: std::time::SystemTime::now(),
        };

        self.users.insert(user_id, user);
        self.users.len()
    }

    pub fn remove_user(&self, user_id: &str) -> usize {
        self.users.remove(user_id);
        self.users.len()
    }

    pub fn get_user_count(&self) -> usize {
        self.users.len()
    }

    pub fn update_user_activity(&self, user_id: &str) {
        if let Some(mut user) = self.users.get_mut(user_id) {
            user.last_activity = std::time::SystemTime::now();
        }
    }

    pub fn get_user_last_activity(&self, user_id: &str) -> Option<std::time::SystemTime> {
        self.users.get(user_id).map(|user| user.last_activity)
    }
}