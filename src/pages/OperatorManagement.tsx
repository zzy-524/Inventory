import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Operator, Department } from '../types';
import { operatorApi, departmentApi, tableConfigApi } from '../api';
import DataActions from '../components/DataActions';

export default function OperatorManagement() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);

  const defaultColumns = [
    { key: 'name', title: '操作人姓名', visible: true },
    { key: 'department_id', title: '所属部门', visible: true },
    { key: 'created_at', title: '创建时间', visible: true },
    { key: 'updated_at', title: '更新时间', visible: true },
    { key: 'action', title: '操作', visible: true },
  ];

  const [columnDefs, setColumnDefs] = useState(defaultColumns);

  useEffect(() => {
    loadOperators();
    loadDepartments();
    loadColumnConfigs();
  }, []);

  const loadColumnConfigs = async () => {
    try {
      const res = await tableConfigApi.get('operators');
      if (res.data?.columns?.length) setColumnDefs(res.data.columns);
    } catch { /* use defaults */ }
  };

  const loadOperators = async () => {
    try {
      const response = await operatorApi.getAll();
      setOperators(response.data);
    } catch { message.error('加载操作人失败'); }
  };

  const loadDepartments = async () => {
    try {
      const response = await departmentApi.getAll();
      setDepartments(response.data);
    } catch { message.error('加载部门失败'); }
  };

  const showModal = (operator?: Operator) => {
    if (operator) {
      setEditingOperator(operator);
      form.setFieldsValue(operator);
    } else {
      setEditingOperator(null);
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingOperator) {
        message.info('编辑功能开发中');
      } else {
        await operatorApi.add(values);
        message.success('添加成功');
        loadOperators();
      }
      setIsModalVisible(false);
    } catch { message.error('提交失败'); }
  };

  const handleDelete = (_id: number) => {
    message.info('删除功能开发中');
  };

  const filteredOperators = operators.filter(o =>
    o.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const allColumns = [
    { title: '操作人姓名', dataIndex: 'name', key: 'name' },
    { title: '所属部门', dataIndex: 'department_id', key: 'department_id', render: (id: number | null) => {
      const dept = departments.find(d => d.id === id);
      return dept ? dept.name : '-';
    }},
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => val.split(' ')[0] },
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', render: (val: string) => val.split(' ')[0] },
    { title: '操作', key: 'action', render: (_: unknown, record: Operator) => (
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
          placeholder="搜索操作人姓名"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
        />
        <Space>
          <DataActions
            pageKey="operators"
            columns={columnDefs}
            onColumnsChange={setColumnDefs}
            onDataImported={loadOperators}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
            添加操作人
          </Button>
        </Space>
      </div>
      <Table
        dataSource={filteredOperators}
        columns={visibleColumns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingOperator ? '编辑操作人' : '添加操作人'}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical" className="modal-form">
          <Form.Item label="操作人姓名" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="所属部门" name="department_id">
            <Select placeholder="选择部门">
              <Select.Option value={null}>无</Select.Option>
              {departments.map(d => (
                <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
