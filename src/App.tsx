import { useState, useEffect } from 'react';
import { Modal, Button, Space, message, Spin } from 'antd';
import { CopyOutlined, CheckOutlined, LaptopOutlined, GlobalOutlined, RightCircleOutlined } from '@ant-design/icons';
import { authApi, systemApi } from './api';
import AppLayout from './components/Layout';
import LoginPage from './pages/LoginPage';
import InventoryManagement from './pages/InventoryManagement';
import ProductManagement from './pages/ProductManagement';
import DepartmentManagement from './pages/DepartmentManagement';
import OperatorManagement from './pages/OperatorManagement';
import Reports from './pages/Reports';

type PageKey = 'inventory' | 'products' | 'departments' | 'operators' | 'reports';

const pageComponents: Record<PageKey, React.ComponentType> = {
  inventory: InventoryManagement,
  products: ProductManagement,
  departments: DepartmentManagement,
  operators: OperatorManagement,
  reports: Reports,
};

const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [currentPage, setCurrentPage] = useState<PageKey>('inventory');
  const [startupVisible, setStartupVisible] = useState(isTauri);
  const [serverInfo, setServerInfo] = useState<{ localUrl: string; lanUrls: string[] } | null>(null);
  const [copied, setCopied] = useState<'local' | 'lan' | null>(null);

  // 启动时检查 token 有效性
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) { setAuthLoading(false); return; }
    authApi.verify()
      .then(res => { setAuthed(true); setUsername(res.data.username); })
      .catch(() => localStorage.removeItem('auth_token'))
      .finally(() => setAuthLoading(false));
  }, []);

  // Tauri 启动弹窗
  useEffect(() => {
    if (!isTauri) return;
    let retries = 0;
    const check = () => {
      systemApi.getInfo()
        .then(res => {
          const urls = res.data.networkInterfaces.map(i => `http://${i.address}:8888`);
          setServerInfo({ localUrl: 'http://localhost:8888', lanUrls: urls });
        })
        .catch(() => { if (++retries < 15) setTimeout(check, 1000); });
    };
    check();
  }, []);

  const handleLogin = (token: string, name: string) => {
    localStorage.setItem('auth_token', token);
    setAuthed(true);
    setUsername(name);
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    setAuthed(false);
    setUsername('');
  };

  const copyUrl = async (url: string, type: 'local' | 'lan') => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      message.success('已复制到剪贴板');
      setTimeout(() => setCopied(null), 2000);
    } catch { message.error('复制失败'); }
  };

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spin size="large" tip="验证登录状态..." />
      </div>
    );
  }

  if (!authed) return <LoginPage onLogin={handleLogin} />;

  const CurrentComponent = pageComponents[currentPage];

  return (
    <>
      {isTauri && (
        <Modal title={null} open={startupVisible} closable={false} footer={null}
          width={460} centered maskClosable={false}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📦</div>
            <h2 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>库存管理系统</h2>
            <p style={{ color: '#888', marginBottom: 20, fontSize: 14 }}>
              已启动成功，在浏览器中打开以下地址访问
            </p>
            {serverInfo ? (
              <>
                <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 14, marginBottom: 12, textAlign: 'left' }}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
                    <LaptopOutlined style={{ marginRight: 4 }} />本机访问
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <code style={{
                      flex: 1, fontSize: 14, color: '#1890ff',
                      background: '#e6f7ff', padding: '6px 12px', borderRadius: 4,
                      fontFamily: 'monospace', wordBreak: 'break-all',
                    }}>{serverInfo.localUrl}</code>
                    <Button size="small"
                      icon={copied === 'local' ? <CheckOutlined /> : <CopyOutlined />}
                      onClick={() => copyUrl(serverInfo.localUrl, 'local')}
                      type={copied === 'local' ? 'primary' : 'default'}
                    />
                  </div>
                </div>
                <div style={{ background: '#f6f8fa', borderRadius: 8, padding: 14, marginBottom: 16, textAlign: 'left' }}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>
                    <GlobalOutlined style={{ marginRight: 4 }} />局域网访问
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                    同一局域网内的电脑在浏览器中打开以下任一地址
                  </div>
                  {serverInfo.lanUrls.map((url, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                      <code style={{
                        flex: 1, fontSize: 14, color: '#1890ff',
                        background: '#e6f7ff', padding: '6px 12px', borderRadius: 4,
                        fontFamily: 'monospace',
                      }}>{url}</code>
                      <Button size="small"
                        icon={copied === 'lan' ? <CheckOutlined /> : <CopyOutlined />}
                        onClick={() => copyUrl(url, 'lan')}
                        type={copied === 'lan' ? 'primary' : 'default'}
                      />
                    </div>
                  ))}
                </div>
                <Space style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}>
                  <Button type="primary" size="large" icon={<RightCircleOutlined />}
                    onClick={() => setStartupVisible(false)}>
                    进入管理页面
                  </Button>
                </Space>
              </>
            ) : (
              <div style={{ padding: '20px 0', color: '#999' }}>正在启动服务...</div>
            )}
          </div>
        </Modal>
      )}

      <AppLayout currentPage={currentPage} onPageChange={setCurrentPage} username={username} onLogout={handleLogout}>
        <CurrentComponent />
      </AppLayout>
    </>
  );
}
