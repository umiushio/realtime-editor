// src/services/websocket.ts

export interface WebSocketMessage {
    type: 'content_update' | 'cursor_position' | 'user_joined' | 'user_left' | 'user_count_update';
    payload: any;
}

export class WebSocketService {
    private static instance: WebSocketService | null = null;
    private socket: WebSocket | null = null;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 1000;
    private messageHandlers: ((message: WebSocketMessage) => void)[] = [];
    private connectionPromise: Promise<void> | null = null;
    private url: string;

    private constructor(url: string) {
        this.url = url;
    }

    // 单例模式获取实例
    public static getInstance(): WebSocketService {
        if (!WebSocketService.instance) {
            // 默认URL，可以在使用时覆盖
            WebSocketService.instance = new WebSocketService('ws://localhost:8080/ws');
        }
        return WebSocketService.instance;
    }

    // 设置URL（可选）
    public setUrl(url: string): void {
        this.url = url;
    }

    async connect(): Promise<void> {
        // 如果已经连接，直接返回
        if (this.isConnected) {
            console.log('WebSocket already connected');
            return Promise.resolve();
        }

        // 如果正在连接中，返回同一个Promise
        if (this.connectionPromise) {
            console.log('WebSocket connection in progress');
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            try {
                console.log('Attempting to connect to:', this.url);
                this.socket = new WebSocket(this.url);
                
                this.socket.onopen = () => {
                    console.log('WebSocket connected successfully');
                    this.reconnectAttempts = 0;
                    this.connectionPromise = null;
                    resolve();
                };

                this.socket.onmessage = (event) => {
                    try {
                        const message: WebSocketMessage = JSON.parse(event.data);
                        console.log('Received message:', message);
                        this.notifyHandlers(message);
                    } catch (error) {
                        console.error('Error parsing WebSocket message:', error);
                    }
                };

                this.socket.onclose = (event) => {
                    console.log('WebSocket disconnected:', event.code, event.reason);
                    this.connectionPromise = null;
                    this.socket = null;
                    this.attemptReconnect();
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.connectionPromise = null;
                    this.socket = null;
                    reject(error);
                };
            } catch (error) {
                console.error('Failed to create WebSocket:', error);
                this.connectionPromise = null;
                reject(error);
            }
        });

        return this.connectionPromise;
    }

    send(message: WebSocketMessage): void {
        if (this.isConnected) {
            this.socket!.send(JSON.stringify(message));
        } else {
            console.warn('WebSocket is not connected. Message not sent:', message);
            // 可选：缓存消息，等连接恢复后发送
        }
    }

    onMessage(handler: (message: WebSocketMessage) => void): () => void {
        this.messageHandlers.push(handler);
        return () => {
            this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        };
    }

    private notifyHandlers(message: WebSocketMessage): void {
        this.messageHandlers.forEach(handler => handler(message));
    }

    private attemptReconnect(): void {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * this.reconnectAttempts;
            
            console.log(`Attempting to reconnect in ${delay}ms... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect().catch(error => {
                    console.error('Reconnection failed:', error);
                });
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.messageHandlers = [];
        this.connectionPromise = null;
    }

    get isConnected(): boolean {
        return this.socket?.readyState === WebSocket.OPEN;
    }

    get readyState(): number {
        return this.socket?.readyState || WebSocket.CLOSED;
    }
}

// 导出单例实例
export const websocketService = WebSocketService.getInstance();