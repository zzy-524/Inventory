import { useEffect, useState } from 'react';
import { Layout, Menu, Tag, Tooltip, message, Dropdown } from 'antd';
import {
  InboxOutlined, BarChartOutlined, UserOutlined, HomeOutlined,
  FileTextOutlined, CopyOutlined, LogoutOutlined,
} from '@ant-design/icons';
import { systemApi } from '../api';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: 'inventory', icon: HomeOutlined, label: '库存管理' },
  { key: 'products', icon: InboxOutlined, label: '商品管理' },
  { key: 'departments', icon: UserOutlined, label: '部门管理' },
  { key: 'operators', icon: FileTextOutlined, label: '操作人管理' },
  { key: 'reports', icon: BarChartOutlined, label: '统计报表' },
];

interface LayoutProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  children: React.ReactNode;
  username: string;
  onLogout: () => void;
}

export default function AppLayout({ currentPage, onPageChange, children, username, onLogout }: LayoutProps) {
  const [lanUrl, setLanUrl] = useState('');

  useEffect(() => {
    systemApi.getInfo().then(res => {
      const ifaces = res.data.networkInterfaces;
      if (ifaces.length > 0) setLanUrl(`http://${ifaces[0].address}:8888`);
    }).catch(() => {});
  }, []);

  const copyAddr = async () => {
    try {
      await navigator.clipboard.writeText(lanUrl);
      message.success('已复制，分享给局域网其他电脑');
    } catch { message.error('复制失败'); }
  };

  return (
    <Layout>
      <Header style={{
        padding: '0 24px', background: '#001529',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>库存管理系统</div>
          {lanUrl && (
            <Tooltip title="点击复制，发给局域网内其他电脑">
              <Tag style={{ cursor: 'pointer', fontSize: 12, padding: '2px 10px' }} color="blue" onClick={copyAddr}>
                <CopyOutlined style={{ marginRight: 4 }} />{lanUrl}
              </Tag>
            </Tooltip>
          )}
        </div>
        <Dropdown menu={{
          items: [{ key: 'logout', icon: <LogoutOutlined />, label: '退出登录', onClick: onLogout }],
        }}>
          <Tag style={{ cursor: 'pointer', fontSize: 12 }} color="default">
            <UserOutlined style={{ marginRight: 4 }} />{username}
          </Tag>
        </Dropdown>
      </Header>
      <Layout>
        <Sider theme="dark" style={{ background: '#001529' }}>
          <Menu mode="inline" selectedKeys={[currentPage]}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems.map(item => ({ key: item.key, icon: <item.icon />, label: item.label }))}
            onClick={({ key }) => onPageChange(key)}
          />
        </Sider>
        <Content style={{ padding: 24, background: '#f0f2f5', overflow: 'auto' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
