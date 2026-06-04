import { useState } from 'react';
import { Card, Form, Input, Button, message, Modal } from 'antd';
import { UserOutlined, LockOutlined, LaptopOutlined } from '@ant-design/icons';
import { authApi, operatorApi } from '../api';

interface LoginPageProps {
  onLogin: (token: string, username: string) => void;
}

/** 是否在 Tauri 桌面客户端内 */
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [loading, setLoading] = useState(false);
  const [registerVisible, setRegisterVisible] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regForm] = Form.useForm();

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      // 先尝试管理员登录
      try {
        const res = await authApi.login(values.username, values.password);
        onLogin(res.data.token, res.data.username);
        return;
      } catch {
        // 管理员登录失败，尝试操作人登录
      }

      const opRes = await operatorApi.login(values.username, values.password);
      onLogin(opRes.data.token, values.username);
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      message.error(typeof err === 'string' ? err : (err.error || err.message || '登录失败'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: { username: string; password: string; confirm: string }) => {
    if (values.password !== values.confirm) return message.error('两次密码不一致');
    setRegLoading(true);
    try {
      await authApi.register(values.username, values.password);
      message.success('注册成功，请登录');
      setRegisterVisible(false);
      regForm.resetFields();
    } catch (e: unknown) {
      const err = e as { error?: string; message?: string };
      message.error(typeof err === 'string' ? err : (err.error || err.message || '注册失败'));
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    }}>
      <Card style={{ width: 400, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
          <h2 style={{ fontSize: 22, fontWeight: 600 }}>库存管理系统</h2>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>登录以继续</p>
        </div>

        <Form onFinish={handleLogin} layout="vertical" size="large">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} style={{ height: 44 }}>
              登 录
            </Button>
          </Form.Item>
        </Form>

        {isTauri && (
          <div style={{ textAlign: 'center', borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Button type="link" icon={<LaptopOutlined />} onClick={() => setRegisterVisible(true)}>
              注册新账号（仅本机）
            </Button>
          </div>
        )}
      </Card>

      <Modal
        title="注册新账号"
        open={registerVisible}
        onCancel={() => setRegisterVisible(false)}
        footer={null}
        width={380}
      >
        <p style={{ color: '#888', fontSize: 13, marginBottom: 16 }}>
          注册仅限本机操作，注册后局域网内其他设备可用此账号登录
        </p>
        <Form form={regForm} onFinish={handleRegister} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 2, message: '至少2个字符' }]}>
            <Input placeholder="输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 4, message: '至少4个字符' }]}>
            <Input.Password placeholder="输入密码" />
          </Form.Item>
          <Form.Item name="confirm" label="确认密码" rules={[{ required: true, message: '请再次输入密码' }]}>
            <Input.Password placeholder="再次输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={regLoading}>
            注册
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
