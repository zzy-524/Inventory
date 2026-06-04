import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, InputNumber, DatePicker, message, Space, Upload, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, DownloadOutlined, UploadOutlined, FileExcelOutlined, FileTextOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { FixedAsset, Department } from '../types';
import { fixedAssetApi, departmentApi } from '../api';
import * as XLSX from 'xlsx';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';

/** 解析 CSV */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('文件至少需要标题行和一行数据');
  const h = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const vals: string[] = []; let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
      cur += ch;
    }
    vals.push(cur);
    const row: Record<string, string> = {}; h.forEach((k, i) => { row[k.trim()] = (vals[i] || '').trim(); }); return row;
  });
}

/** 从 XLSX raw rows 中自动寻找表头行（跳过开头空行） */
function findHeaderRow(rawRows: unknown[][]): { headers: string[]; dataStart: number } {
  for (let r = 0; r < rawRows.length; r++) {
    const row = rawRows[r];
    if (!row || !Array.isArray(row)) continue;
    const strRow = row.map(c => String(c ?? '').trim());
    if (strRow.some(c => ['部门', '名称', '资产名称', '序号'].includes(c))) {
      return { headers: strRow, dataStart: r + 1 };
    }
  }
  return { headers: (rawRows[0] as unknown[]).map(c => String(c).trim()), dataStart: 1 };
}

/** 字段映射：Excel 列名 → 内部字段 */
const FIELD_MAP: Record<string, string> = {
  '部门': 'dept', '使用部门': 'dept', 'department': 'dept',
  '资产名称': 'name', '名称': 'name', 'name': 'name',
  '规格型号': 'model', '型号': 'model', 'model': 'model',
  '单位': 'unit', 'unit': 'unit',
  '数量': 'quantity', 'quantity': 'quantity',
  '建账日期': 'setup_date', 'setup_date': 'setup_date',
  '资产编号': 'asset_no', 'asset_no': 'asset_no',
  '实物使用/保管人': 'custodian', '使用人/保管人': 'custodian', 'custodian': 'custodian',
  '备注': 'remark', 'remark': 'remark',
};

/** 将 YYYYMM 格式转换为 YYYY-MM-DD */
function normalizeDate(v: string): string {
  const s = v.trim();
  if (/^\d{6}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  return s;
}

export default function FixedAssetManagement() {
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [searchName, setSearchName] = useState('');
  const [searchDept, setSearchDept] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => { loadData(); }, []);
  const loadData = async () => {
    try { const [ar, dr] = await Promise.all([fixedAssetApi.getAll(), departmentApi.getAll()]); setAssets(ar.data); setDepartments(dr.data); }
    catch { message.error('加载数据失败'); }
  };

  const getDeptName = (id: number | null) => id ? departments.find(d => d.id === id)?.name || '-' : '-';

  const showModal = (asset?: FixedAsset) => {
    if (asset) {
      setEditingId(asset.id);
      form.setFieldsValue({ ...asset, setup_date: asset.setup_date ? dayjs(asset.setup_date) : null });
    } else { setEditingId(null); form.resetFields(); }
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const data = { ...values, setup_date: values.setup_date ? values.setup_date.format('YYYY-MM-DD') : '' };
      if (editingId) { await fixedAssetApi.update(editingId, data); message.success('更新成功'); }
      else { await fixedAssetApi.add(data); message.success('添加成功'); }
      loadData(); setIsModalVisible(false);
    } catch { message.error('提交失败'); }
  };

  const handleDelete = (asset: FixedAsset) => {
    Modal.confirm({
      title: '确认删除', icon: <ExclamationCircleOutlined />,
      content: `确定删除固定资产「${asset.name}」吗？`,
      okText: '确认删除', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await fixedAssetApi.delete(asset.id); message.success('删除成功'); loadData(); } catch { message.error('删除失败'); } },
    });
  };

  // Export — 按当前筛选条件导出
  const handleExport = (format: 'csv' | 'xlsx') => {
    try {
      const exportAssets = searchDept !== null ? assets.filter(a => a.department_id === searchDept) : assets;
      const exportData = exportAssets.map((a, i) => ({
        '序号': i + 1, '部门': getDeptName(a.department_id), '资产名称': a.name, '规格型号': a.model,
        '单位': a.unit, '数量': a.quantity, '建账日期': a.setup_date, '资产编号': a.asset_no, '实物使用/保管人': a.custodian, '备注': a.remark,
      }));
      const keys = ['序号', '部门', '资产名称', '规格型号', '单位', '数量', '建账日期', '资产编号', '实物使用/保管人', '备注'];
      const deptLabel = searchDept !== null ? `_${getDeptName(searchDept)}` : '';
      const today = new Date().toISOString().slice(0, 10);
      if (format === 'csv') {
        const rows = exportData.length > 0 ? exportData.map(r => keys.map(k => { const v = String(r[k] ?? ''); return v.includes(',') ? `"${v}"` : v; }).join(',')) : [];
        downloadBlob(new Blob(['﻿' + keys.join(',') + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8' }), `固定资产${deptLabel}_${today}.csv`);
      } else {
        const ws = XLSX.utils.json_to_sheet(exportData.length > 0 ? exportData : [keys.reduce((o, k) => ({ ...o, [k]: '' }), {} as Record<string, string>)]);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '固定资产');
        downloadBlob(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `固定资产${deptLabel}_${today}.xlsx`);
      }
      message.success('导出成功');
    } catch { message.error('导出失败'); }
  };

  function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
  }

  /** 解析导入行并映射字段 */
  function parseImportRow(rawRow: Record<string, string>) {
    const mapped: Record<string, string> = {};
    Object.keys(rawRow).forEach(k => { const f = FIELD_MAP[k.trim()]; if (f) mapped[f] = mapped[f] || rawRow[k]; });
    // 资产名称也可能存在没有映射的情况（如只有 name 列）
    if (!mapped['name']) mapped['name'] = rawRow['资产名称'] || rawRow['名称'] || rawRow['name'] || '';
    return mapped;
  }

  // Import
  const handleImport = async (file: File) => {
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let rows: Record<string, string>[];
        if (file.name.endsWith('.csv')) { rows = parseCSV(e.target?.result as string); }
        else {
          const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
          const { headers, dataStart } = findHeaderRow(rawRows);
          rows = rawRows.slice(dataStart).filter(r => (r as unknown[]).some(c => String(c ?? '').trim())).map(r => {
            const obj: Record<string, string> = {}; headers.forEach((h, i) => { obj[h] = String((r as unknown[])[i] ?? '').trim(); }); return obj;
          });
        }
        if (rows.length === 0) { message.warning('文件中没有数据'); setImporting(false); return; }

        let count = 0;
        // 预加载部门缓存，导入过程动态更新
        let deptCache = [...departments];
        const ensureDept = async (deptName: string): Promise<number | null> => {
          if (!deptName) return null;
          let d = deptCache.find(x => x.name === deptName);
          if (!d) {
            const res = await departmentApi.add({ name: deptName, description: '' });
            deptCache.push({ id: res.data.id, name: deptName, description: '', created_at: '', updated_at: '' });
            return res.data.id;
          }
          return d.id;
        };

        for (const row of rows) {
          try {
            const m = parseImportRow(row);
            const name = m['name'];
            if (!name) continue;
            const deptId = await ensureDept(m['dept'] || '');
            const setupDate = normalizeDate(m['setup_date'] || '');
            const remark = m['remark'] || row['资产性质'] || '';
            await fixedAssetApi.add({
              name, model: m['model'] || '', unit: m['unit'] || '件',
              department_id: deptId, quantity: parseFloat(m['quantity']) || 1,
              setup_date: setupDate, asset_no: m['asset_no'] || '',
              custodian: m['custodian'] || '', remark,
            });
            count++;
          } catch { /* skip */ }
        }
        message.success(`成功导入 ${count} 条记录`);
        loadData();
      } catch (err: unknown) { message.error('导入失败: ' + ((err as Error).message || '文件格式错误')); }
      finally { setImporting(false); }
    };
    if (file.name.endsWith('.csv')) reader.readAsText(file, 'utf-8'); else reader.readAsArrayBuffer(file);
    return false;
  };

  const filteredAssets = assets.filter(a => {
    const nameMatch = !searchName || a.name.toLowerCase().includes(searchName.toLowerCase());
    const deptMatch = searchDept === null || a.department_id === searchDept;
    return nameMatch && deptMatch;
  });

  const columns = [
    { title: '序号', dataIndex: 'id', key: 'index', width: 60, render: (_: unknown, __: unknown, i: number) => i + 1 },
    { title: '名称', dataIndex: 'name', key: 'name', width: 120 },
    { title: '型号', dataIndex: 'model', key: 'model', width: 100 },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
    { title: '使用部门', dataIndex: 'department_id', key: 'department_id', width: 100, render: getDeptName },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 60 },
    { title: '建账日期', dataIndex: 'setup_date', key: 'setup_date', width: 100 },
    { title: '资产编号', dataIndex: 'asset_no', key: 'asset_no', width: 120 },
    { title: '使用人/保管人', dataIndex: 'custodian', key: 'custodian', width: 120 },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 100 },
    { title: '操作', key: 'action', width: 120, render: (_: unknown, record: FixedAsset) => (
      <Space>
        <Button icon={<EditOutlined />} size="small" onClick={() => showModal(record)}>编辑</Button>
        <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDelete(record)}>删除</Button>
      </Space>
    )},
  ];

  const importProps: UploadProps = { accept: '.csv,.xls,.xlsx', showUploadList: false, beforeUpload: (f) => { handleImport(f); return false; } };
  const exportItems = [
    { key: 'csv', icon: <FileTextOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
    { key: 'xlsx', icon: <FileExcelOutlined />, label: '导出 Excel', onClick: () => handleExport('xlsx') },
  ];

  return (
    <div>
      <div className="search-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Input placeholder="搜索名称" prefix={<SearchOutlined />} value={searchName}
            onChange={e => setSearchName(e.target.value)} style={{ width: 180 }} allowClear />
          <Select placeholder="全部部门" value={searchDept} onChange={v => setSearchDept(v ?? null)}
            allowClear style={{ width: 150 }}>
            {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
          </Select>
        </Space>
        <Space>
          <Dropdown menu={{ items: exportItems }}><Button icon={<DownloadOutlined />}>导出</Button></Dropdown>
          <Upload {...importProps}><Button icon={<UploadOutlined />} loading={importing}>导入</Button></Upload>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => showModal()}>新增资产</Button>
        </Space>
      </div>
      <Table dataSource={filteredAssets} columns={columns} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 1300 }} />

      <Modal title={editingId ? '编辑固定资产' : '新增固定资产'} open={isModalVisible} onOk={handleOk} onCancel={() => setIsModalVisible(false)} width={600}>
        <Form form={form} layout="vertical">
          <Space size="middle" wrap>
            <Form.Item label="名称" name="name" rules={[{ required: true }]}><Input style={{ width: 160 }} /></Form.Item>
            <Form.Item label="型号" name="model"><Input style={{ width: 160 }} /></Form.Item>
            <Form.Item label="单位" name="unit" initialValue="件"><Input style={{ width: 100 }} /></Form.Item>
          </Space>
          <Space size="middle" wrap>
            <Form.Item label="使用部门" name="department_id">
              <Select placeholder="选择部门" style={{ width: 160 }} allowClear>
                {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
              </Select>
            </Form.Item>
            <Form.Item label="数量" name="quantity" initialValue={1} rules={[{ required: true }]}>
              <InputNumber style={{ width: 100 }} min={1} />
            </Form.Item>
            <Form.Item label="建账日期" name="setup_date"><DatePicker style={{ width: 160 }} /></Form.Item>
          </Space>
          <Space size="middle" wrap>
            <Form.Item label="资产编号" name="asset_no"><Input style={{ width: 160 }} /></Form.Item>
            <Form.Item label="使用人/保管人" name="custodian"><Input style={{ width: 160 }} /></Form.Item>
            <Form.Item label="备注" name="remark"><Input style={{ width: 160 }} /></Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
