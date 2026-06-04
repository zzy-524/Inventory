import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Space, Tag, Upload, Dropdown } from 'antd';
import { SearchOutlined, InboxOutlined, LogoutOutlined, DownloadOutlined, UploadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import type { Inventory, Product, Operator, Department, StockRecord } from '../types';
import { inventoryApi, productApi, operatorApi, departmentApi, stockRecordApi } from '../api';
import * as XLSX from 'xlsx';
import type { UploadProps } from 'antd';

const INV_HEADERS = ['商品名称', '规格', '单位', '当前库存', '最低库存'];
const EN_MAP: Record<string, string> = {
  '商品名称': 'product_name', '规格': 'spec', '单位': 'unit',
  '当前库存': 'quantity', '最低库存': 'min_quantity',
  'product_name': 'product_name', 'name': 'product_name',
  'spec': 'spec', 'unit': 'unit', 'quantity': 'quantity', 'min_quantity': 'min_quantity',
};

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('文件至少需要标题行和一行数据');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
    return row;
  });
}

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
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = () => {
    loadInventory();
    loadProducts();
    loadOperators();
    loadDepartments();
    loadStockRecords();
  };

  const loadInventory = async () => {
    try { const r = await inventoryApi.getAll(); setInventory(r.data); }
    catch { message.error('加载库存失败'); }
  };
  const loadProducts = async () => {
    try { const r = await productApi.getAll(); setProducts(r.data); }
    catch { message.error('加载商品失败'); }
  };
  const loadOperators = async () => {
    try { const r = await operatorApi.getAll(); setOperators(r.data); }
    catch { message.error('加载操作人失败'); }
  };
  const loadDepartments = async () => {
    try { const r = await departmentApi.getAll(); setDepartments(r.data); }
    catch { message.error('加载部门失败'); }
  };
  const loadStockRecords = async () => {
    try { const r = await stockRecordApi.getAll(); setStockRecords(r.data); }
    catch { message.error('加载库存记录失败'); }
  };

  const showModal = (type: 'in' | 'out') => {
    setModalType(type);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const currentUser = localStorage.getItem('username') || '';
      const op = operators.find(o => o.username === currentUser);
      await stockRecordApi.add({ ...values, type: modalType, operator_id: op?.id ?? null });
      message.success(modalType === 'in' ? '入库成功' : '出库成功');
      loadInventory();
      loadStockRecords();
      setIsModalVisible(false);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e || '操作失败'));
    }
  };

  const getProductInfo = (productId: number) => products.find(p => p.id === productId);
  const getOperatorName = (id: number | null) => {
    if (id) {
      const op = operators.find(o => o.id === id);
      return op ? op.name : localStorage.getItem('username') || '-';
    }
    return localStorage.getItem('username') || '-';
  };
  const getDepartmentName = (id: number | null) => id ? departments.find(d => d.id === id)?.name || '-' : '-';

  const filteredInventory = inventory.filter(iv => {
    const product = getProductInfo(iv.product_id);
    return product?.name.toLowerCase().includes(searchText.toLowerCase());
  });

  // ====== 导出库存 ======
  const handleExport = (format: 'csv' | 'xlsx') => {
    try {
      const exportData: Record<string, string | number>[] = inventory.map(iv => {
        const p = getProductInfo(iv.product_id);
        return {
          '商品名称': p?.name || '',
          '规格': p?.spec || '',
          '单位': p?.unit || '',
          '当前库存': iv.quantity,
          '最低库存': iv.min_quantity,
        };
      });

      const today = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const rows = exportData.length > 0
          ? exportData.map(row => INV_HEADERS.map(h => {
              const v = String(row[h] ?? '');
              return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
            }).join(','))
          : [];
        const csv = '﻿' + INV_HEADERS.join(',') + '\n' + rows.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        downloadBlob(blob, `库存列表_${today}.csv`);
      } else {
        const sheetData = exportData.length > 0
          ? exportData
          : INV_HEADERS.reduce((o, h) => ({ ...o, [h]: '' }), {} as Record<string, string>);
        const ws = XLSX.utils.json_to_sheet(exportData.length > 0 ? exportData : [sheetData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '库存列表');
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        downloadBlob(blob, `库存列表_${today}.xlsx`);
      }
      message.success(`导出成功 (${format.toUpperCase()})`);
    } catch { message.error('导出失败'); }
  };

  function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  // ====== 导入库存 ======
  const handleImportFile = (file: File) => {
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let rows: Record<string, string>[];
        if (file.name.endsWith('.csv')) {
          rows = parseCSV(e.target?.result as string);
        } else {
          const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
          if (rawRows.length < 2) { message.warning('文件中没有数据'); setImporting(false); return; }
          const headers = (rawRows[0] as unknown[]).map(h => String(h).trim());
          rows = rawRows.slice(1)
            .filter(r => (r as unknown[]).some(c => String(c ?? '').trim()))
            .map(r => {
              const obj: Record<string, string> = {};
              headers.forEach((h, idx) => { obj[h] = String((r as unknown[])[idx] ?? '').trim(); });
              return obj;
            });
        }

        if (rows.length === 0) { message.warning('文件中没有数据'); setImporting(false); return; }

        // 匹配商品：按名称查找
        const updates: { product_id: number; quantity: number; min_quantity?: number }[] = [];
        const skipped: string[] = [];
        for (const r of rows) {
          const nameKey = Object.keys(r).find(k => EN_MAP[k] === 'product_name');
          const name = nameKey ? r[nameKey] : '';
          const matchedProducts = products.filter(p =>
            p.name === name && !p.deleted
          );
          if (matchedProducts.length === 0) {
            skipped.push(name || '(空)');
            continue;
          }
          const qtyKey = Object.keys(r).find(k => EN_MAP[k] === 'quantity');
          const minQtyKey = Object.keys(r).find(k => EN_MAP[k] === 'min_quantity');
          const qty = qtyKey ? parseFloat(r[qtyKey]) : 0;
          const minQty = minQtyKey ? parseFloat(r[minQtyKey]) : undefined;
          // 取第一个匹配的商品
          const update: { product_id: number; quantity: number; min_quantity?: number } = {
            product_id: matchedProducts[0].id,
            quantity: isNaN(qty) ? 0 : qty,
          };
          if (minQty !== undefined && !isNaN(minQty)) update.min_quantity = minQty;
          updates.push(update);
        }

        if (updates.length === 0) {
          message.warning(`没有匹配到任何商品${skipped.length > 0 ? `，已跳过 ${skipped.length} 个：${skipped.join('、')}` : ''}`);
          setImporting(false);
          return;
        }

        const result = await inventoryApi.updateMany(updates);
        let msg = `成功更新 ${result.data.count} 条库存`;
        if (skipped.length > 0) msg += `，跳过 ${skipped.length} 个不存在商品：${skipped.slice(0, 5).join('、')}${skipped.length > 5 ? '...' : ''}`;
        message.success(msg);
        loadData();
      } catch (err: unknown) {
        message.error('导入失败: ' + ((err as Error).message || '文件格式错误'));
      } finally {
        setImporting(false);
      }
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
    return false;
  };

  const importProps: UploadProps = {
    accept: '.csv,.xls,.xlsx',
    showUploadList: false,
    beforeUpload: (file) => { handleImportFile(file); return false; },
  };

  const exportItems = [
    { key: 'csv', icon: <FileTextOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
    { key: 'xlsx', icon: <FileExcelOutlined />, label: '导出 Excel', onClick: () => handleExport('xlsx') },
  ];

  const allInventoryColumns = [
    { title: '商品名称', dataIndex: 'product_id', key: 'product_id', render: (id: number) => {
      const product = getProductInfo(id);
      return product ? <span>{product.name}{product.deleted ? <Tag color="error" style={{ marginLeft: 8 }}>已删除</Tag> : null}</span> : '-';
    }},
    { title: '规格', dataIndex: 'product_id', key: 'spec', render: (id: number) => getProductInfo(id)?.spec || '-' },
    { title: '单位', dataIndex: 'product_id', key: 'unit', render: (id: number) => getProductInfo(id)?.unit || '-' },
    { title: '当前库存', dataIndex: 'quantity', key: 'quantity' },
    { title: '最低库存', dataIndex: 'min_quantity', key: 'min_quantity' },
    { title: '状态', key: 'status', render: (_: unknown, record: Inventory) => {
      const product = getProductInfo(record.product_id);
      if (product?.deleted) return <Tag color="default">已删除</Tag>;
      return <Tag color={record.quantity <= record.min_quantity ? 'error' : 'success'}>
        {record.quantity <= record.min_quantity ? '库存不足' : '正常'}
      </Tag>;
    }},
    { title: '更新时间', dataIndex: 'updated_at', key: 'updated_at' },
  ];

  const allRecordColumns = [
    { title: '商品名称', dataIndex: 'product_id', key: 'record_product', render: (id: number) => getProductInfo(id)?.name || '-' },
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
    { title: '操作时间', dataIndex: 'created_at', key: 'created_at' },
  ];

  const activeProducts = products.filter(p => !p.deleted);

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input placeholder="搜索商品名称" prefix={<SearchOutlined />} value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} />
        <Space>
          <Dropdown menu={{ items: exportItems }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Upload {...importProps}>
            <Button icon={<UploadOutlined />} loading={importing}>导入</Button>
          </Upload>
          <Button type="primary" icon={<InboxOutlined />} onClick={() => showModal('in')}>入库</Button>
          <Button type="primary" icon={<LogoutOutlined />} onClick={() => showModal('out')}>出库</Button>
        </Space>
      </div>

      <h3 style={{ margin: '24px 0 12px' }}>库存列表</h3>
      <Table dataSource={filteredInventory} columns={allInventoryColumns} rowKey="id"
        pagination={{ pageSize: 10 }}
        rowClassName={(record) => {
          const p = getProductInfo(record.product_id);
          return p?.deleted ? 'row-disabled' : '';
        }}
      />

      <h3 style={{ margin: '24px 0 12px' }}>操作记录</h3>
      <Table dataSource={stockRecords} columns={allRecordColumns} rowKey="id" pagination={{ pageSize: 10 }} />

      <Modal title={modalType === 'in' ? '入库操作' : '出库操作'} open={isModalVisible}
        onOk={handleOk} onCancel={() => setIsModalVisible(false)}>
        <Form form={form} layout="vertical" className="modal-form">
          <Form.Item label="商品" name="product_id" rules={[{ required: true }]}>
            <Select placeholder="选择商品">
              {activeProducts.map(p => (
                <Select.Option key={p.id} value={p.id}>{p.name} ({p.spec})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item label="数量" name="quantity" rules={[{ required: true, type: 'number', min: 1 }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="部门" name="department_id">
            <Select placeholder="选择部门">
              <Select.Option value={null}>无</Select.Option>
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
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
