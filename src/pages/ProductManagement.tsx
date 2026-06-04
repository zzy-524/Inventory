import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, message, Space, Tag, Upload, Dropdown } from 'antd';
import { PlusOutlined, DeleteOutlined, SearchOutlined, DownloadOutlined, UploadOutlined, FileExcelOutlined, FileTextOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { Product, Department } from '../types';
import { productApi, departmentApi, saveFile } from '../api';
import usePageSize from '../hooks/usePageSize';
import * as XLSX from 'xlsx';
import type { UploadProps } from 'antd';

const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

/** 中英文表头映射 (导入用) */
const EN_HEADERS: Record<string, string> = {
  '商品名称': 'name', '类别': 'category', '规格': 'spec', '单位': 'unit',
  '成本价': 'cost_price', '所属部门': 'department_id',
  'name': 'name', 'category': 'category', 'spec': 'spec', 'unit': 'unit',
  'cost_price': 'cost_price', 'department_id': 'department_id',
};

function toENHeader(key: string) { return EN_HEADERS[key] || key; }

/** 解析 CSV 文本为数组 */
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

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState('');
  const { pagination } = usePageSize('products');
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadProducts(); loadDepartments(); }, []);

  const loadProducts = async () => {
    try { const r = await productApi.getAll(); setProducts(r.data); }
    catch { message.error('加载商品失败'); }
  };
  const loadDepartments = async () => {
    try { const r = await departmentApi.getAll(); setDepartments(r.data); }
    catch { message.error('加载部门失败'); }
  };

  const showAddModal = () => { form.resetFields(); setIsModalVisible(true); };

  const handleAdd = async () => {
    try {
      const values = await form.validateFields();
      await productApi.add(values);
      message.success('添加成功');
      loadProducts();
      setIsModalVisible(false);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : String(e || '提交失败'));
    }
  };

  const handleDelete = (product: Product) => {
    Modal.confirm({
      title: '确认删除', icon: <ExclamationCircleOutlined />,
      content: `确定要删除商品「${product.name}」吗？删除后库存记录将保留但不可再操作。`,
      okText: '确认删除', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try { await productApi.delete(product.id); message.success('删除成功'); loadProducts(); }
        catch { message.error('删除失败'); }
      },
    });
  };

  // ====== 导出 ======
  const PRODUCT_HEADERS = ['商品名称', '类别', '规格', '单位', '成本价', '所属部门'];

  const handleExport = (format: 'csv' | 'xlsx') => {
    try {
      const exportData: Record<string, string | number>[] = products.map(p => ({
        '商品名称': p.name,
        '类别': p.category,
        '规格': p.spec,
        '单位': p.unit,
        '成本价': p.cost_price,
        '所属部门': departments.find(d => d.id === p.department_id)?.name || '',
      }));

      const today = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const rows = exportData.length > 0
          ? exportData.map(row => PRODUCT_HEADERS.map(h => {
              const v = String(row[h] ?? '');
              return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
            }).join(','))
          : [];
        const csv = '﻿' + PRODUCT_HEADERS.join(',') + '\n' + rows.join('\n');
        saveFile(csv, `商品列表_${today}.csv`);
      } else {
        const sheetData = exportData.length > 0
          ? exportData
          : PRODUCT_HEADERS.reduce((o, h) => ({ ...o, [h]: '' }), {} as Record<string, string>);
        const ws = XLSX.utils.json_to_sheet(exportData.length > 0 ? exportData : [sheetData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '商品列表');
        saveFile(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), `商品列表_${today}.xlsx`);
      }
      message.success(`导出成功 (${format.toUpperCase()})`);
    } catch { message.error('导出失败'); }
  };


  // ====== 导入 ======
  const handleImportFile = (file: File) => {
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const raw = parseFile(file.name, e.target?.result as string | ArrayBuffer);
        const importedRows = raw.map(r => {
          const row: Record<string, string> = {};
          Object.keys(r).forEach(k => { row[toENHeader(k)] = k in EN_HEADERS ? toENHeader(k) : k; });
          // Remap: use EN field names as keys, but data from original CN/EN headers
          const mapped: Record<string, string> = {};
          Object.keys(r).forEach(k => { mapped[toENHeader(k)] = String(r[k] ?? ''); });
          return mapped;
        });

        if (importedRows.length === 0) { message.warning('文件中没有数据'); setImporting(false); return; }

        // 检测重复：按 name 匹配
        const existingNames = new Set(products.filter(p => !p.deleted).map(p => p.name));
        const duplicates = importedRows.filter(r => existingNames.has(r.name));
        const newOnes = importedRows.filter(r => !existingNames.has(r.name));

        if (duplicates.length > 0) {
          setImporting(false);
          showDuplicateModal(duplicates, newOnes, importedRows);
        } else {
          await doImport(importedRows, []);
        }
      } catch (err: unknown) {
        message.error('解析失败: ' + ((err as Error).message || '文件格式错误'));
        setImporting(false);
      }
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file, 'utf-8');
    else reader.readAsArrayBuffer(file);
    return false;
  };

  function parseFile(filename: string, data: string | ArrayBuffer): Record<string, string>[] {
    if (filename.endsWith('.csv')) {
      return parseCSV(data as string);
    }
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    if (rawRows.length < 2) return [];
    const headers = (rawRows[0] as unknown[]).map(h => String(h).trim());
    return rawRows.slice(1)
      .filter(row => (row as unknown[]).some(c => String(c ?? '').trim()))
      .map(row => {
        const obj: Record<string, string> = {};
        headers.forEach((h, idx) => { obj[h] = String((row as unknown[])[idx] ?? '').trim(); });
        return obj;
      });
  }

  const showDuplicateModal = (duplicates: Record<string, string>[], newOnes: Record<string, string>[], allRows: Record<string, string>[]) => {
    const dupNames = duplicates.map(r => r.name).join('、');
    Modal.confirm({
      title: '检测到重复商品',
      icon: <ExclamationCircleOutlined />,
      width: 500,
      content: (
        <div>
          <p>以下 {duplicates.length} 个商品已存在：</p>
          <p style={{ color: '#fa8c16', fontWeight: 'bold', wordBreak: 'break-all' }}>{dupNames}</p>
          <p>请选择处理方式：</p>
        </div>
      ),
      okText: '跳过已存在，仅导入新商品',
      cancelText: '删除旧商品，导入为新商品',
      okButtonProps: { type: 'primary' },
      cancelButtonProps: { danger: true },
      onOk: async () => {
        setImporting(true);
        await doImport(newOnes, []);
      },
      onCancel: async () => {
        setImporting(true);
        // 先软删除所有已存在的同名商品
        const dupNamesSet = new Set(duplicates.map(r => r.name));
        const toDelete = products.filter(p => dupNamesSet.has(p.name) && !p.deleted);
        for (const p of toDelete) {
          try { await productApi.delete(p.id); } catch { /* continue */ }
        }
        await doImport(allRows, []);
      },
    });
  };

  const doImport = async (rows: Record<string, string>[], _skipped: Record<string, string>[]) => {
    let count = 0;
    for (const row of rows) {
      try {
        const deptId = row.department_id
          ? (departments.find(d => d.name === row.department_id)?.id ?? null)
          : null;
        await productApi.add({
          name: row.name || '',
          category: row.category || '',
          spec: row.spec || '',
          unit: row.unit || '件',
          cost_price: parseFloat(row.cost_price) || 0,
          department_id: deptId,
        });
        count++;
      } catch { /* skip failed rows */ }
    }
    message.success(`成功导入 ${count} 条记录`);
    loadProducts();
    setImporting(false);
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

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchText.toLowerCase()) ||
    p.category.toLowerCase().includes(searchText.toLowerCase())
  );

  const allColumns = [
    { title: '商品名称', dataIndex: 'name', key: 'name', render: (val: string, record: Product) => (
      <span>{val}{record.deleted ? <Tag color="error" style={{ marginLeft: 8 }}>已删除</Tag> : null}</span>
    )},
    { title: '类别', dataIndex: 'category', key: 'category' },
    { title: '规格', dataIndex: 'spec', key: 'spec' },
    { title: '单位', dataIndex: 'unit', key: 'unit' },
    { title: '成本价', dataIndex: 'cost_price', key: 'cost_price', render: (val: number) => `¥${val.toFixed(2)}` },
    { title: '所属部门', dataIndex: 'department_id', key: 'department_id', render: (id: number | null) => {
      const dept = departments.find(d => d.id === id);
      return dept ? dept.name : '-';
    }},
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at' },
    { title: '操作', key: 'action', render: (_: unknown, record: Product) => (
      <Space>
        {isTauri && (
          <Button icon={<DeleteOutlined />} danger onClick={() => handleDelete(record)}>
            删除
          </Button>
        )}
      </Space>
    )},
  ];

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Input placeholder="搜索商品名称或类别" prefix={<SearchOutlined />} value={searchText}
          onChange={(e) => setSearchText(e.target.value)} style={{ width: 300 }} />
        <Space>
          <Dropdown menu={{ items: exportItems }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
          <Upload {...importProps}>
            <Button icon={<UploadOutlined />} loading={importing}>导入</Button>
          </Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={showAddModal}>添加商品</Button>
        </Space>
      </div>
      <Table dataSource={filteredProducts} columns={allColumns} rowKey="id" pagination={pagination}
        rowClassName={(record) => record.deleted ? 'row-disabled' : ''} />

      <Modal title="添加商品" open={isModalVisible} onOk={handleAdd} onCancel={() => setIsModalVisible(false)}>
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
