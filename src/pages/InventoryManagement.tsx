import { useState, useEffect, useCallback } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Space, Tag } from 'antd';
import { SearchOutlined, InboxOutlined, LogoutOutlined } from '@ant-design/icons';
import type { Inventory, Product, Operator, Department, StockRecord } from '../types';
import { inventoryApi, productApi, operatorApi, departmentApi, stockRecordApi, tableConfigApi } from '../api';
import DataActions from '../components/DataActions';

export default function InventoryManagement() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [stockRecords, setStockRecords] = useState<StockRecord[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const [modalType, setModalType] = useState<'in' | 'out'>('in');

  const defaultInventoryColumns = [
    { key: 'product_id', title: '商品名称', visible: true },
    { key: 'spec', title: '规格', visible: true },
    { key: 'unit', title: '单位', visible: true },
    { key: 'quantity', title: '当前库存', visible: true },
    { key: 'min_quantity', title: '最低库存', visible: true },
    { key: 'status', title: '状态', visible: true },
    { key: 'updated_at', title: '更新时间', visible: true },
  ];

  const defaultRecordColumns = [
    { key: 'record_product', title: '商品名称', visible: true },
    { key: 'type', title: '类型', visible: true },
    { key: 'record_quantity', title: '数量', visible: true },
    { key: 'operator_id', title: '操作人', visible: true },
    { key: 'department_id', title: '部门', visible: true },
    { key: 'remark', title: '备注', visible: true },
    { key: 'created_at', title: '操作时间', visible: true },
  ];

  const [inventoryColumnDefs, setInventoryColumnDefs] = useState(defaultInventoryColumns);
  const [recordColumnDefs, setRecordColumnDefs] = useState(defaultRecordColumns);

  useEffect(() => {
    loadData();
    loadColumnConfigs();
  }, []);

  const loadColumnConfigs = async () => {
    try {
      const res = await tableConfigApi.get('inventory');
      if (res.data?.columns?.length) setInventoryColumnDefs(res.data.columns);
      const recRes = await tableConfigApi.get('inventory-records');
      if (recRes.data?.columns?.length) setRecordColumnDefs(recRes.data.columns);
    } catch { /* use defaults */ }
  };

  const loadData = () => {
    loadInventory();
    loadProducts();
    loadOperators();
    loadDepartments();
    loadStockRecords();
  };

  const loadInventory = async () => {
    try {
      const response = await inventoryApi.getAll();
      setInventory(response.data);
    } catch { message.error('加载库存失败'); }
  };

  const loadProducts = async () => {
    try {
      const response = await productApi.getAll();
      setProducts(response.data);
    } catch { message.error('加载商品失败'); }
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

  const loadStockRecords = async () => {
    try {
      const response = await stockRecordApi.getAll();
      setStockRecords(response.data);
    } catch { message.error('加载库存记录失败'); }
  };

  const showModal = (type: 'in' | 'out') => {
    setModalType(type);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await stockRecordApi.add({ ...values, type: modalType });
      message.success(modalType === 'in' ? '入库成功' : '出库成功');
      loadInventory();
      loadStockRecords();
      setIsModalVisible(false);
    } catch { message.error('操作失败'); }
  };

  const getProductInfo = (productId: number) => products.find(p => p.id === productId);
  const getOperatorName = (operatorId: number | null) => {
    if (!operatorId) return '-';
    const op = operators.find(o => o.id === operatorId);
    return op ? op.name : '-';
  };
  const getDepartmentName = (deptId: number | null) => {
    if (!deptId) return '-';
    const dept = departments.find(d => d.id === deptId);
    return dept ? dept.name : '-';
  };

  const filteredInventory = inventory.filter(iv => {
    const product = getProductInfo(iv.product_id);
    return product?.name.toLowerCase().includes(searchText.toLowerCase());
  });

  const allInventoryColumns = [
    { title: '商品名称', dataIndex: 'product_id', key: 'product_id', render: (id: number) => {
      const product = getProductInfo(id);
      return product ? product.name : '-';
    }},
    { title: '规格', dataIndex: 'product_id', key: 'spec', render: (id: number) => {
      const product = getProductInfo(id);
      return product ? product.spec : '-';
    }},
    { title: '单位', dataIndex: 'product_id', key: 'unit', render: (id: number) => {
      const product = getProductInfo(id);
      return product ? product.unit : '-';
    }},
    { title: '当前库存', dataIndex: 'quantity', key: 'quantity' },
    { title: '最低库存', dataIndex: 'min_quantity', key: 'min_quantity' },
    { title: '状态', dataIndex: 'quantity', key: 'status', render: (qty: number, record: Inventory) => (
      <Tag color={qty <= record.min_quantity ? 'error' : 'success'}>
        {qty <= record.min_quantity ? '库存不足' : '正常'}
      </Tag>
    )},
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at', render: (val: string) => val.split(' ')[0] },
  ];

  const visibleInventoryColumns = allInventoryColumns.filter(
    col => inventoryColumnDefs.find(d => d.key === col.key)?.visible !== false
  );

  const allRecordColumns = [
    { title: '商品名称', dataIndex: 'product_id', key: 'record_product', render: (id: number) => {
      const product = getProductInfo(id);
      return product ? product.name : '-';
    }},
    { title: '类型', dataIndex: 'type', key: 'type', render: (type: string) => (
      <Tag color={type === 'in' ? 'success' : 'warning'}>{type === 'in' ? '入库' : '出库'}</Tag>
    )},
    { title: '数量', dataIndex: 'quantity', key: 'record_quantity', render: (qty: number, record: StockRecord) => (
      <span style={{ color: record.type === 'in' ? '#52c41a' : '#fa8c16' }}>
        {record.type === 'in' ? '+' : '-'}{qty}
      </span>
    )},
    { title: '操作人', dataIndex: 'operator_id', key: 'operator_id', render: getOperatorName },
    { title: '部门', dataIndex: 'department_id', key: 'department_id', render: getDepartmentName },
    { title: '备注', dataIndex: 'remark', key: 'remark' },
    { title: '操作时间', dataIndex: 'created_at', key: 'created_at', render: (val: string) => val.split(' ')[1]?.substring(0, 5) },
  ];

  const visibleRecordColumns = allRecordColumns.filter(
    col => recordColumnDefs.find(d => d.key === col.key)?.visible !== false
  );

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input
          placeholder="搜索商品名称"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 300 }}
        />
        <Space>
          <DataActions
            pageKey="inventory"
            columns={inventoryColumnDefs}
            onColumnsChange={setInventoryColumnDefs}
            onDataImported={loadData}
          />
          <Button type="primary" icon={<InboxOutlined />} onClick={() => showModal('in')}>
            入库
          </Button>
          <Button type="primary" icon={<LogoutOutlined />} onClick={() => showModal('out')}>
            出库
          </Button>
        </Space>
      </div>

      <h3 style={{ margin: '24px 0 12px' }}>库存列表</h3>
      <Table
        dataSource={filteredInventory}
        columns={visibleInventoryColumns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <h3 style={{ margin: '24px 0 12px' }}>操作记录</h3>
      <div style={{ marginBottom: 12 }}>
        <DataActions
          pageKey="inventory-records"
          columns={recordColumnDefs}
          onColumnsChange={setRecordColumnDefs}
          onDataImported={loadData}
        />
      </div>
      <Table
        dataSource={stockRecords}
        columns={visibleRecordColumns}
        rowKey="id"
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={modalType === 'in' ? '入库操作' : '出库操作'}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
      >
        <Form form={form} layout="vertical" className="modal-form">
          <Form.Item label="商品" name="product_id" rules={[{ required: true }]}>
            <Select placeholder="选择商品">
              {products.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name} ({p.spec})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="数量" name="quantity" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="操作人" name="operator_id">
            <Select placeholder="选择操作人">
              <Select.Option value={null}>无</Select.Option>
              {operators.map(o => (
                <Select.Option key={o.id} value={o.id}>{o.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="部门" name="department_id">
            <Select placeholder="选择部门">
              <Select.Option value={null}>无</Select.Option>
              {departments.map(d => (
                <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
