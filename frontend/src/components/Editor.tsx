// src/components/Editor.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Input, Alert, Space, Typography } from 'antd';
import { websocketService, WebSocketMessage } from '../services/websocket';

const { TextArea } = Input;
const { Title, Text } = Typography;

const Editor: React.FC = () => {
    const [content, setContent] = useState<string>('');
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [usersCount, setUsersCount] = useState<number>(1);
    const isRemoteUpdate = useRef<boolean>(false);

    // 处理WebSocket消息
    const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
        switch (message.type) {
            case 'content_update':
                isRemoteUpdate.current = true;
                setContent(message.payload.content);
                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 100);
                break;
            case 'user_count_update':
                // 直接从服务器中获取准确的用户数量
                setUsersCount(message.payload.count);
                break;
            case 'user_joined':
                console.log('User joined:', message.payload);
                break;
            default:
                console.log('Received message:', message);
        }
    }, []);

    // 初始化WebSocket连接
    useEffect(() => {
        console.log('Editor component mounted');
        
        const removeHandler = websocketService.onMessage(handleWebSocketMessage);

        // 检查是否已经连接
        if (websocketService.isConnected) {
            console.log('Reusing existing WebSocket connection');
            setIsConnected(true);
        } else {
            // 建立新连接
            const connectWebSocket = async () => {
                try {
                    console.log('Establishing new WebSocket connection');
                    await websocketService.connect();
                    setIsConnected(true);
                    console.log('WebSocket connected successfully from component');
                } catch (error) {
                    console.error('Failed to connect to WebSocket:', error);
                    setIsConnected(false);
                }
            };

            connectWebSocket();
        }

        return () => {
            console.log('Editor component unmounted - removing message handler');
            removeHandler();
            // 注意：不要在这里断开WebSocket连接，因为其他组件可能还在使用
            // 单例模式会自己管理连接生命周期
        };
    }, [handleWebSocketMessage]);

    // 处理内容变化
    const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setContent(newContent);
        
        // 只有本地编辑才发送到服务器
        if (!isRemoteUpdate.current && websocketService.isConnected) {
            websocketService.send({
                type: 'content_update',
                payload: { content: newContent }
            });
        }
    }, []);

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Title level={2}>Real-time Markdown Editor</Title>
                
                <Alert
                    message={
                        isConnected 
                            ? `Connected to server (${usersCount} user${usersCount > 1 ? 's' : ''} online)`
                            : 'Disconnected from server - attempting to reconnect...'
                    }
                    type={isConnected ? 'success' : 'warning'}
                    showIcon
                />

                <Card title="Editor" style={{ width: '100%' }}>
                    <TextArea
                        value={content}
                        onChange={handleContentChange}
                        placeholder="Start typing... Changes will be visible in real-time across all connected clients."
                        autoSize={{ minRows: 10, maxRows: 20 }}
                        style={{ width: '100%', fontSize: '16px' }}
                    />
                </Card>

                <Card title="Preview" style={{ width: '100%' }}>
                    <div
                        style={{
                            padding: '16px',
                            border: '1px solid #d9d9d9',
                            borderRadius: '6px',
                            minHeight: '200px',
                            background: '#fafafa'
                        }}
                    >
                        {content ? (
                            <div dangerouslySetInnerHTML={{ __html: content }} />
                        ) : (
                            <Text type="secondary">Content will appear here as you type...</Text>
                        )}
                    </div>
                </Card>

                <Card title="Connection Info" size="small">
                    <Space direction="vertical">
                        <Text>Status: {isConnected ? 'Connected' : 'Disconnected'}</Text>
                        <Text>Server: ws://localhost:3000/ws</Text>
                        <Text>Online users: {usersCount}</Text>
                    </Space>
                </Card>
            </Space>
        </div>
    );
};

export default Editor;