import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Department } from '../types';
import { departmentApi, tableConfigApi } from '../api';
import DataActions from '../components/DataActions';

export default function DepartmentManagement() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  const defaultColumns = [
    { key: 'name', title: '部门名称', visible: true },
    { key: 'description', title: '描述', visible: true },
    { key: 'created_at', title: '创建时间', visible: true },
    { key: 'updated_at', title: '更新时间', visible: true },
    { key: 'action', title: '操作', visible: true },
  ];

  const [columnDefs, setColumnDefs] = useState(defaultColumns);

  useEffect(() => {
    loadDepartments();
    loadColumnConfigs();
  }, []);

  const loadColumnConfigs = async () => {
    try {
      const res = await tableConfigApi.get('departments');
      if (res.data?.columns?.length) setColumnDefs(res.data.columns);
    } catch { /* use defaults */ }
  };

  const loadDepartments = async () => {
    try {
      const response = await departmentApi.getAll();
      setDepartments(response.data);
    } catch { message.error('加载部门失败'); }
  };

  const showModal = (dept?: Department) => {
    if (dept) {
      setEditingDept(dept);
      form.setFieldsValue(dept);
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
        message.info('编辑功能开发中');
      } else {
        await departmentApi.add(values);
        message.success('添加成功');
        loadDepartments();
      }
      setIsModalVisible(false);
    } catch { message.error('提交失败'); }
  };

  const handleDelete = (_id: number) => {
    message.info('删除功能开发中');
  };

  const filteredDepts = departments.filter(d =>
    d.name.toLowerCase().includes(searchText.toLowerCase()) ||
    d.description.toLowerCase().includes(searchText.toLowerCase())
  );

  const allColumns = [
    { title: '部门名称', dataIndex: 'name', key: 'name' },
    { title: '描述', dataIndex: 'description', key: 'description' },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => val.split(' ')[0] },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', render: (val: string) => val.split(' ')[0] },
    { title: '操作', key: 'action', render: (_: unknown, record: Department) => (
      <Space>
        <Button icon={<EditOutlined />} onClick={() => showModal(record)}>编辑</Button>
        <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record.id)}>删除</Button>
      </Space>
    )},
  ];

  const visibleColumns = allColumns.filter(
    col => columnDefs.find(d => d.key === col.key)?.visible !== false
  );

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input
          placeholder="搜索部门名称或描述"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
        />
        <Space>
          <DataActions
            pageKey="departments"
            columns={columnDefs}
            onColumnsChange={setColumnDefs}
            onDataImported={loadDepartments}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
            添加部门
          </Button>
        </Space>
      </div>
      <Table
        dataSource={filteredDepts}
        columns={visibleColumns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingDept ? '编辑部门' : '添加部门'}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical" className="modal-form">
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
