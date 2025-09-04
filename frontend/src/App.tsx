import React from 'react';
import { ConfigProvider } from 'antd';
import Editor from './components/Editor';
import 'antd/dist/reset.css'; // 引入Ant Design样式

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <div className="App">
        <Editor />
      </div>
    </ConfigProvider>
  );
}

export default App;
