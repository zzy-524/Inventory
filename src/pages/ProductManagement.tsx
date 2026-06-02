import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Space } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import type { Product, Department } from '../types';
import { productApi, departmentApi, tableConfigApi } from '../api';
import DataActions from '../components/DataActions';

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const defaultColumns = [
    { key: 'name', title: '商品名称', visible: true },
    { key: 'category', title: '类别', visible: true },
    { key: 'spec', title: '规格', visible: true },
    { key: 'unit', title: '单位', visible: true },
    { key: 'cost_price', title: '成本价', visible: true },
    { key: 'sale_price', title: '售价', visible: true },
    { key: 'department_id', title: '所属部门', visible: true },
    { key: 'created_at', title: '创建时间', visible: true },
    { key: 'action', title: '操作', visible: true },
  ];

  const [columnDefs, setColumnDefs] = useState(defaultColumns);

  useEffect(() => {
    loadProducts();
    loadDepartments();
    loadColumnConfigs();
  }, []);

  const loadColumnConfigs = async () => {
    try {
      const res = await tableConfigApi.get('products');
      if (res.data?.columns?.length) setColumnDefs(res.data.columns);
    } catch { /* use defaults */ }
  };

  const loadProducts = async () => {
    try {
      const response = await productApi.getAll();
      setProducts(response.data);
    } catch { message.error('加载商品失败'); }
  };

  const loadDepartments = async () => {
    try {
      const response = await departmentApi.getAll();
      setDepartments(response.data);
    } catch { message.error('加载部门失败'); }
  };

  const showModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      form.setFieldsValue(product);
    } else {
      setEditingProduct(null);
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingProduct) {
        message.info('编辑功能开发中');
      } else {
        await productApi.add(values);
        message.success('添加成功');
        loadProducts();
      }
      setIsModalVisible(false);
    } catch { message.error('提交失败'); }
  };

  const handleDelete = (_id: number) => {
    message.info('删除功能开发中');
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    p.category.toLowerCase().includes(searchText.toLowerCase())
  );

  const allColumns = [
    { title: '商品名称', dataIndex: 'name', key: 'name' },
    { title: '类别', dataIndex: 'category', key: 'category' },
    { title: '规格', dataIndex: 'spec', key: 'spec' },
    { title: '单位', dataIndex: 'unit', key: 'unit' },
    { title: '成本价', dataIndex: 'cost_price', key: 'cost_price', render: (val: number) => `¥${val.toFixed(2)}` },
    { title: '售价', dataIndex: 'sale_price', key: 'sale_price', render: (val: number) => `¥${val.toFixed(2)}` },
    { title: '所属部门', dataIndex: 'department_id', key: 'department_id', render: (id: number | null) => {
      const dept = departments.find(d => d.id === id);
      return dept ? dept.name : '-';
    }},
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => val.split(' ')[0] },
    { title: '操作', key: 'action', render: (_: unknown, record: Product) => (
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
          placeholder="搜索商品名称或类别"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
        />
        <Space>
          <DataActions
            pageKey="products"
            columns={columnDefs}
            onColumnsChange={setColumnDefs}
            onDataImported={loadProducts}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>
            添加商品
          </Button>
        </Space>
      </div>
      <Table
        dataSource={filteredProducts}
        columns={visibleColumns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingProduct ? '编辑商品' : '添加商品'}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical" className="modal-form">
          <Form.Item label="商品名称" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="类别" name="category">
            <Input />
          </Form.Item>
          <Form.Item label="规格" name="spec">
            <Input />
          </Form.Item>
          <Form.Item label="单位" name="unit" initialValue="件">
            <Input />
          </Form.Item>
          <Form.Item label="成本价" name="cost_price" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="售价" name="sale_price" rules={[{ required: true, type: 'number', min: 0 }]}>
            <InputNumber style={{ width: '100%' }} />
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
