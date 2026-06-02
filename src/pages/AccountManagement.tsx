import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space, Tag, Popconfirm } from 'antd';
import { PlusOutlined, DeleteOutlined, KeyOutlined, UserAddOutlined } from '@ant-design/icons';
import { userApi, authApi } from '../api';

export default function AccountManagement() {
  const [users, setUsers] = useState<{ id: number; username: string; role: string; created_at: string }[]>([]);
  const [createVisible, setCreateVisible] = useState(false);
  const [resetVisible, setResetVisible] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [createForm] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [username, setUsername] = useState('');

  useEffect(() => {
    loadUsers();
    const uname = localStorage.getItem('auth_username') || '';
    setUsername(uname);
  }, []);

  const loadUsers = async () => {
    try {
      const res = await userApi.getAll();
      setUsers(res.data);
    } catch { message.error('加载用户失败'); }
  };

  const handleCreate = async (values: { username: string; password: string; confirm: string }) => {
    if (values.password !== values.confirm) return message.error('两次密码不一致');
    try {
      await authApi.register(values.username, values.password);
      message.success('创建成功');
      setCreateVisible(false);
      createForm.resetFields();
      loadUsers();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '创建失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await userApi.remove(id);
      message.success('已删除');
      loadUsers();
    } catch { message.error('删除失败'); }
  };

  const handleResetPassword = async (values: { password: string; confirm: string }) => {
    if (values.password !== values.confirm) return message.error('两次密码不一致');
    if (!resetUserId) return;
    try {
      await userApi.resetPassword(resetUserId, values.password);
      message.success('密码已重置');
      setResetVisible(false);
      resetForm.resetFields();
    } catch { message.error('重置失败'); }
  };

  const openReset = (id: number) => {
    setResetUserId(id);
    resetForm.resetFields();
    setResetVisible(true);
  };

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
    { title: '用户名', dataIndex: 'username', key: 'username' },
    { title: '角色', dataIndex: 'role', key: 'role', render: (r: string) => (
      <Tag color={r === 'admin' ? 'red' : 'blue'}>{r === 'admin' ? '管理员' : '普通用户'}</Tag>
    )},
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (v: string) => v?.split(' ')[0] },
    { title: '操作', key: 'action', render: (_: unknown, record: { id: number; username: string }) => (
      <Space>
        <Button size="small" icon={<KeyOutlined />} onClick={() => openReset(record.id)}>重置密码</Button>
        {record.id !== 1 && (
          <Popconfirm title="确定删除此账号？" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" icon={<DeleteOutlined />} danger>删除</Button>
          </Popconfirm>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>账号管理</h3>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { createForm.resetFields(); setCreateVisible(true); }}>
          新建账号
        </Button>
      </div>

      <Table dataSource={users} columns={columns} rowKey="id" pagination={false} />

      {/* 新建账号 */}
      <Modal title="新建账号" open={createVisible} onCancel={() => setCreateVisible(false)} footer={null} width={380}>
        <Form form={createForm} onFinish={handleCreate} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, min: 2, message: '至少2个字符' }]}>
            <Input placeholder="输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, min: 4, message: '至少4个字符' }]}>
            <Input.Password placeholder="输入密码" />
          </Form.Item>
          <Form.Item name="confirm" label="确认密码" rules={[{ required: true, message: '请再次输入密码' }]}>
            <Input.Password placeholder="再次输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block icon={<UserAddOutlined />}>创建账号</Button>
        </Form>
      </Modal>

      {/* 重置密码 */}
      <Modal title="重置密码" open={resetVisible} onCancel={() => setResetVisible(false)} footer={null} width={380}>
        <Form form={resetForm} onFinish={handleResetPassword} layout="vertical">
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 4, message: '至少4个字符' }]}>
            <Input.Password placeholder="输入新密码" />
          </Form.Item>
          <Form.Item name="confirm" label="确认密码" rules={[{ required: true, message: '请再次输入密码' }]}>
            <Input.Password placeholder="再次输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block icon={<KeyOutlined />}>重置密码</Button>
        </Form>
      </Modal>
    </div>
  );
}
