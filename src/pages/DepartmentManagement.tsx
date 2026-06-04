import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, InputNumber, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { Department } from '../types';
import { departmentApi } from '../api';

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  useEffect(() => { loadDepartments(); }, []);

  const loadDepartments = async () => {
    try { const r = await departmentApi.getAll(); setDepartments(r.data); }
    catch { message.error('加载部门失败'); }
  };

  const showModal = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      form.setFieldsValue({ name: dept.name, description: dept.description, sort_order: dept.sort_order });
    } else {
      setEditingDept(null);
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingDept) {
        await departmentApi.update(editingDept.id, values);
        message.success('更新成功');
      } else {
        await departmentApi.add(values);
        message.success('添加成功');
      }
      loadDepartments();
      setIsModalVisible(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e || '提交失败');
      message.error(msg);
    }
  };

  const handleDelete = (dept: Department) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除部门「${dept.name}」吗？`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await departmentApi.delete(dept.id);
          message.success('删除成功');
          loadDepartments();
        } catch { message.error('删除失败'); }
      },
    });
  };

  const filteredDepts = departments.filter(d =>
    d.name.toLowerCase().includes(searchText.toLowerCase()) ||
    d.description.toLowerCase().includes(searchText.toLowerCase())
  );

  const allColumns = [
    { title: '序号', dataIndex: 'sort_order', key: 'sort_order', width: 60 },
    { title: '部门名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at' },
    { title: '操作', key: 'action', render: (_: unknown, record: Department) => (
      <Space>
        <Button icon={<EditOutlined />} onClick={() => showModal(record)}>编辑</Button>
        <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record)}>删除</Button>
      </Space>
    )},
  ];

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input placeholder="搜索部门名称或描述" prefix={<SearchOutlined />} value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>添加部门</Button>
      </div>
      <Table dataSource={filteredDepts} columns={allColumns} rowKey="id" pagination={{ pageSize: 10 }} />

      <Modal title={editingDept ? '编辑部门' : '添加部门'} open={isModalVisible}
        onOk={handleOk} onCancel={() => setIsModalVisible(false)}>
        <Form form={form} layout="vertical" className="modal-form">
          <Form.Item label="序号" name="sort_order" initialValue={0}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item label="部门名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
