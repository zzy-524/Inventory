import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { Operator, Department } from '../types';
import { operatorApi, departmentApi } from '../api';
import usePageSize from '../hooks/usePageSize';

export default function OperatorManagement() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editingOp, setEditingOp] = useState<Operator | null>(null);
  const { pagination } = usePageSize('operators');

  useEffect(() => {
    loadOperators();
    loadDepartments();
  }, []);

  const loadOperators = async () => {
    try { const r = await operatorApi.getAll(); setOperators(r.data); }
    catch { message.error('加载操作人失败'); }
  };
  const loadDepartments = async () => {
    try { const r = await departmentApi.getAll(); setDepartments(r.data); }
    catch { message.error('加载部门失败'); }
  };

  const showModal = (op?: Operator) => {
    if (op) {
      setEditingOp(op);
      form.setFieldsValue({ name: op.name, username: op.username, department_id: op.department_id, password: '' });
    } else {
      setEditingOp(null);
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingOp) {
        const updateData: Record<string, unknown> = { name: values.name, username: values.username, department_id: values.department_id };
        if (values.password) updateData.password = values.password;
        await operatorApi.update(editingOp.id, updateData as { name: string; username: string; password?: string; department_id: number | null });
        message.success('更新成功');
      } else {
        await operatorApi.add(values);
        message.success('添加成功');
      }
      loadOperators();
      setIsModalVisible(false);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e || '提交失败'));
    }
  };

  const handleDelete = (op: Operator) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除操作人「${op.name}」(${op.username}) 吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await operatorApi.delete(op.id);
          message.success('删除成功');
          loadOperators();
        } catch { message.error('删除失败'); }
      },
    });
  };

  const filteredOperators = operators.filter(o =>
    o.name.toLowerCase().includes(searchText.toLowerCase()) ||
    o.username.toLowerCase().includes(searchText.toLowerCase())
  );

  const allColumns = [
    { title: '操作人姓名', dataIndex: 'name', key: 'name' },
    { title: '账号', dataIndex: 'username', key: 'username' },
    { title: '所属部门', dataIndex: 'department_id', key: 'department_id', render: (id: number | null) => {
      const dept = departments.find(d => d.id === id);
      return dept ? dept.name : '-';
    }},
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at' },
    { title: '操作', key: 'action', render: (_: unknown, record: Operator) => (
      <Space>
        {record.username !== 'admin' && (
          <>
            <Button icon={<EditOutlined />} onClick={() => showModal(record)}>编辑</Button>
            <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record)}>删除</Button>
          </>
        )}
        {record.username === 'admin' && <span style={{ color: '#999', fontSize: 12 }}>系统内置</span>}
      </Space>
    )},
  ];

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input placeholder="搜索操作人姓名或账号" prefix={<SearchOutlined />} value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} />
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>添加操作人</Button>
        </Space>
      </div>
      <Table dataSource={filteredOperators} columns={allColumns} rowKey="id" pagination={pagination} />

      <Modal title={editingOp ? '编辑操作人' : '添加操作人'} open={isModalVisible}
        onOk={handleOk} onCancel={() => setIsModalVisible(false)}>
        <Form form={form} layout="vertical" className="modal-form">
          <Form.Item label="操作人姓名" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="登录账号" name="username" rules={[{ required: true, min: 2, message: '账号至少2个字符' }]}>
            <Input />
          </Form.Item>
          <Form.Item label={editingOp ? '新密码（留空不修改）' : '登录密码'} name="password"
            rules={editingOp ? [] : [{ required: true, min: 4, message: '密码至少4个字符' }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label="所属部门" name="department_id">
            <Select placeholder="选择部门">
              <Select.Option value={null}>无</Select.Option>
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
