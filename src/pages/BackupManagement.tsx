import { useState, useEffect } from 'react';
import { Card, Button, Upload, message, Modal, Result, Select, Form, Space } from 'antd';
import { DownloadOutlined, UploadOutlined, ExclamationCircleOutlined, DatabaseOutlined, DeleteOutlined } from '@ant-design/icons';
import { backupApi, departmentApi, productApi, stockRecordApi, saveFile } from '../api';
import type { Department } from '../types';
import type { UploadProps } from 'antd';
import * as XLSX from 'xlsx';

/** 计算某月第 N 周的第一天日期 */
function weekStartDate(year: number, month: number, weekNum: number): string {
  const startDay = (weekNum - 1) * 7 + 1;
  const d = new Date(year, month - 1, startDay);
  const daysInMonth = new Date(year, month, 0).getDate();
  if (startDay > daysInMonth) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(startDay, daysInMonth)).padStart(2, '0')}`;
}

/** 计算上个月最后一天的日期 */
function prevMonthLastDay(year: number, month: number): string {
  const d = new Date(year, month - 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function BackupManagement() {
  const [loading, setLoading] = useState(false);
  const [initVisible, setInitVisible] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [initYear, setInitYear] = useState(new Date().getFullYear());
  const [initMonth, setInitMonth] = useState(new Date().getMonth() + 1);
  const [initDept, setInitDept] = useState<number | null>(null);

  useEffect(() => {
    departmentApi.getAll().then(r => setDepartments(r.data)).catch(() => {});
  }, []);

  const handleExport = async () => {
    try {
      setLoading(true);
      const res = await backupApi.export();
      const json = JSON.stringify(res.data, null, 2);
      const now = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      saveFile(json, `inventory-backup-${now}.json`);
      message.success('数据备份导出成功');
    } catch { message.error('导出失败'); }
    finally { setLoading(false); }
  };

  const handleRestore = (file: File) => {
    Modal.confirm({
      title: '确认恢复数据',
      icon: <ExclamationCircleOutlined />,
      content: '恢复数据将覆盖当前所有数据，此操作不可撤销。确定要继续吗？',
      okText: '确认恢复', okType: 'danger', cancelText: '取消',
      onOk: async () => {
        try {
          setLoading(true);
          const text = await file.text();
          const data = JSON.parse(text);
          const res = await backupApi.restore(data);
          message.success(`数据恢复成功，共恢复 ${res.data.count} 条记录`);
        } catch (err: unknown) {
          message.error('恢复失败: ' + ((err as { message?: string }).message || '文件格式错误'));
        } finally { setLoading(false); }
      },
    });
    return false;
  };

  // ====== 数据初始化 ======
  const handleDataInit = (file: File) => {
    if (!initDept) { message.warning('请先选择部门'); return false; }
    setInitLoading(true);
    const deptName = departments.find(d => d.id === initDept)?.name || '';

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' });
        // 精确匹配部门 sheet，失败则尝试模糊匹配，避免回退到格式不同的汇总 sheet
        let sheetName = wb.SheetNames.find(n => n === deptName);
        if (!sheetName) {
          sheetName = wb.SheetNames.find(n => n.includes(deptName) || deptName.includes(n));
        }
        if (!sheetName) {
          message.error(`文件中没有匹配「${deptName}」的 sheet，可用 sheet：${wb.SheetNames.join('、')}`);
          setInitLoading(false); return;
        }
        const ws = wb.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

        // 跳过标题行（含「台账」），找到表头行（含「物品名称」）和子表头行（含「入库总数」）
        let headerRow = -1;
        let subHeaderRow = -1;
        for (let i = 0; i < rawRows.length; i++) {
          const row = rawRows[i];
          if (!row || !Array.isArray(row)) continue;
          const firstCell = String(row[0] || '').trim();
          // 跳过标题行（含「台账」）
          if (firstCell.includes('台账')) continue;
          // 找表头行：第一个单元格是「物品名称」
          if (headerRow < 0 && firstCell === '物品名称') {
            headerRow = i;
            continue;
          }
          // 在表头行之后找子表头行（含「入库总数」，由于合并单元格可能第一个单元格为空）
          if (headerRow >= 0) {
            const rowStr = row.map(c => String(c || '').trim()).join(' ');
            if (rowStr.includes('入库总数')) {
              subHeaderRow = i;
              break;
            }
          }
        }

        if (headerRow < 0) { message.error('无法识别的文件格式：未找到「物品名称」表头行'); setInitLoading(false); return; }
        if (subHeaderRow < 0) { message.error(`Sheet「${sheetName}」不是按周拆分的台账格式，未找到「入库总数」子表头`); setInitLoading(false); return; }

        // 数据从子表头下一行开始
        const dataStart = subHeaderRow + 1;

        // 从子表头检测周数和出库起始列
        let weekCount = 4;
        let outStartCol = 9; // 默认：第1周出库列
        if (subHeaderRow >= 0) {
          const subHeader = rawRows[subHeaderRow] as unknown[];
          const inTotalIdx = subHeader.findIndex((c: unknown) => String(c || '').includes('入库总数'));
          if (inTotalIdx > 4) {
            weekCount = inTotalIdx - 4; // 入库列从 col 4 开始（col 0-3: 名称/规格/单位/期初）
            outStartCol = inTotalIdx + 1; // 出库列紧接「入库总数」之后
          }
        }

        let productCount = 0, recordCount = 0;
        for (let i = dataStart; i < rawRows.length; i++) {
          const row = rawRows[i] as unknown[];
          if (!row || !Array.isArray(row)) continue;

          const name = String(row[0] || '').trim();
          if (!name) continue;
          // 跳过汇总行、公式行、纯数字行（说明列映射错误）
          if (name.includes('合计') || name.includes('总计') || name.includes('台账') || /^\d+$/.test(name)) continue;

          const spec = String(row[1] || '').trim();
          const unit = String(row[2] || '').trim() || '件';
          // 本月期初剩余数量作为初始库存
          const beginQty = parseFloat(String(row[3] || '0')) || 0;

          try {
            // 查找或创建商品
            let productId: number | null = null;
            try {
              const allProducts = await productApi.getAll();
              const existing = allProducts.data.find(p => p.name === name && !p.deleted);
              if (existing) {
                productId = existing.id;
              } else {
                const newP = await productApi.add({ name, category: deptName, spec, unit, cost_price: 0, department_id: initDept });
                productId = newP.data.id;
                productCount++;
              }
            } catch { /* skip */ }

            if (!productId) continue;

            // 期初库存：创建上月最后一天的入库记录，台账页面的 beginQty 依赖此记录
            const beginDate = prevMonthLastDay(initYear, initMonth);
            if (beginQty > 0) {
              try {
                await stockRecordApi.add({ product_id: productId, type: 'in', quantity: beginQty, operator_id: null, department_id: initDept, remark: '期初库存', created_at: beginDate });
                recordCount++;
              } catch { /* skip */ }
            }

            // 按周创建入库记录（从 col 4 开始，每周一列）
            for (let w = 0; w < weekCount; w++) {
              const val = parseFloat(String(row[4 + w] || '0')) || 0;
              if (val > 0) {
                const date = weekStartDate(initYear, initMonth, w + 1);
                if (date) {
                  try {
                    await stockRecordApi.add({ product_id: productId, type: 'in', quantity: val, operator_id: null, department_id: initDept, remark: '数据初始化', created_at: date });
                    recordCount++;
                  } catch { /* skip */ }
                }
              }
            }

            // 按周创建出库记录（从 outStartCol 开始，每周一列）
            for (let w = 0; w < weekCount; w++) {
              const val = parseFloat(String(row[outStartCol + w] || '0')) || 0;
              if (val > 0) {
                const date = weekStartDate(initYear, initMonth, w + 1);
                if (date) {
                  try {
                    await stockRecordApi.add({ product_id: productId, type: 'out', quantity: val, operator_id: null, department_id: initDept, remark: '数据初始化', created_at: date });
                    recordCount++;
                  } catch { /* skip */ }
                }
              }
            }
          } catch { /* skip individual rows */ }
        }

        message.success(`初始化完成：新增 ${productCount} 个商品，${recordCount} 条出入库记录`);
        setInitVisible(false);
      } catch (err: unknown) {
        message.error('初始化失败: ' + ((err as Error).message || '文件格式错误'));
      } finally { setInitLoading(false); }
    };
    reader.readAsArrayBuffer(file);
    return false;
  };


  const restoreProps: UploadProps = { accept: '.json', showUploadList: false, beforeUpload: (f) => { handleRestore(f); return false; } };
  const initProps: UploadProps = { accept: '.xlsx,.xls', showUploadList: false, beforeUpload: (f) => { handleDataInit(f); return false; } };

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div>
      <Result icon={<DownloadOutlined />} title="数据备份与恢复"
        subTitle="导出全量数据用于迁移主机，或从备份文件恢复数据" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, maxWidth: 1100, margin: '0 auto 24px' }}>
        <Card title="数据导出" style={{ textAlign: 'center' }}>
          <p style={{ color: '#888', marginBottom: 20 }}>将所有数据导出为 JSON 文件，用于迁移到其他主机。</p>
          <Button type="primary" size="large" icon={<DownloadOutlined />} onClick={handleExport} loading={loading}>导出备份</Button>
        </Card>

        <Card title="数据恢复" style={{ textAlign: 'center' }}>
          <p style={{ color: '#888', marginBottom: 20 }}>从之前导出的备份文件恢复数据。注意：恢复将覆盖当前所有数据。</p>
          <Upload {...restoreProps}>
            <Button type="primary" size="large" icon={<UploadOutlined />} danger loading={loading}>导入备份</Button>
          </Upload>
        </Card>

        <Card title="数据初始化" style={{ textAlign: 'center' }}>
          <p style={{ color: '#888', marginBottom: 20 }}>根据 Excel 台账文件批量初始化商品和出入库记录。</p>
          <Button type="primary" size="large" icon={<DatabaseOutlined />} onClick={() => setInitVisible(true)}>初始化数据</Button>
        </Card>

        <Card title="清空数据" style={{ textAlign: 'center', borderColor: '#ff4d4f' }}>
          <p style={{ color: '#888', marginBottom: 20 }}>清空所有数据（部门、商品、库存、操作记录等），不可恢复。</p>
          <Button type="primary" size="large" icon={<DeleteOutlined />} danger
            onClick={() => {
              Modal.confirm({
                title: '确认清空所有数据', icon: <ExclamationCircleOutlined />,
                content: '此操作将删除所有数据且不可恢复！确定要继续吗？',
                okText: '确认清空', okType: 'danger', cancelText: '取消',
                onOk: async () => {
                  try { await backupApi.clear(); message.success('数据已清空'); } catch { message.error('清空失败'); }
                },
              });
            }}
          >清空数据</Button>
        </Card>
      </div>

      <Modal title="数据初始化" open={initVisible} onCancel={() => setInitVisible(false)}
        footer={null} width={500} destroyOnClose>
        <p style={{ color: '#888', marginBottom: 16 }}>选择年月和部门，上传 Excel 台账文件进行批量导入。</p>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Space>
            <span>年月：</span>
            <Select value={initYear} onChange={setInitYear} style={{ width: 100 }}>
              {years.map(y => <Select.Option key={y} value={y}>{y}年</Select.Option>)}
            </Select>
            <Select value={initMonth} onChange={setInitMonth} style={{ width: 80 }}>
              {months.map(m => <Select.Option key={m} value={m}>{m}月</Select.Option>)}
            </Select>
          </Space>
          <Space>
            <span>部门：</span>
            <Select placeholder="选择部门" value={initDept} onChange={v => setInitDept(v ?? null)} style={{ width: 200 }}>
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          </Space>
          <Upload {...initProps}>
            <Button type="primary" icon={<UploadOutlined />} loading={initLoading} disabled={!initDept} block>
              选择文件并导入
            </Button>
          </Upload>
        </Space>
      </Modal>
    </div>
  );
}
