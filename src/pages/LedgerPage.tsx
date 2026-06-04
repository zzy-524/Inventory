import { useState, useEffect, useMemo } from 'react';
import { Table, Select, Space, Button, Dropdown, message, Card, Radio } from 'antd';
import { DownloadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import type { Product, Department, StockRecord } from '../types';
import { productApi, departmentApi, stockRecordApi } from '../api';
import * as XLSX from 'xlsx';

interface LedgerRow {
  key: string; index: number; category: string; name: string; spec: string; unit: string;
  beginQty: number; inQty: number; outQty: number; endQty: number;
}
interface WeekRow {
  key: string; index: number; name: string; spec: string; unit: string; beginQty: number;
  inW1: number; inW2: number; inW3: number; inW4: number; inW5: number; inTotal: number;
  outW1: number; outW2: number; outW3: number; outW4: number; outW5: number; outTotal: number;
  endQty: number;
}

export default function LedgerPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [records, setRecords] = useState<StockRecord[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [mode, setMode] = useState<'monthly' | 'weekly'>('monthly');
  const [deptFilter, setDeptFilter] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([productApi.getAll(), departmentApi.getAll(), stockRecordApi.getAll()])
      .then(([pr, dr, sr]) => { setProducts(pr.data); setDepartments(dr.data); setRecords(sr.data); })
      .catch(() => message.error('加载数据失败'));
  }, []);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const activeProducts = products.filter(p => !p.deleted);
  const filteredProducts = deptFilter ? activeProducts.filter(p => p.department_id === deptFilter) : activeProducts;

  const ledgerData = useMemo((): LedgerRow[] => {
    return filteredProducts.map((p, idx) => {
      const pr = records.filter(r => r.product_id === p.id);
      const before = pr.filter(r => r.created_at < `${monthStr}-01`);
      const cur = pr.filter(r => r.created_at.startsWith(monthStr));
      const beginQty = before.reduce((s, r) => s + (r.type === 'in' ? r.quantity : -r.quantity), 0);
      const inQty = cur.filter(r => r.type === 'in').reduce((s, r) => s + r.quantity, 0);
      const outQty = cur.filter(r => r.type === 'out').reduce((s, r) => s + r.quantity, 0);
      return { key: `${p.id}`, index: idx + 1, category: p.category || '-', name: p.name, spec: p.spec || '-', unit: p.unit || '件', beginQty, inQty, outQty, endQty: beginQty + inQty - outQty };
    });
  }, [filteredProducts, records, monthStr]);

  const weekData = useMemo((): WeekRow[] => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const weeks: { start: number; end: number }[] = [];
    let ws = 1;
    for (let w = 0; w < 5 && ws <= daysInMonth; w++) {
      weeks.push({ start: ws, end: Math.min(ws + 6, daysInMonth) });
      ws = weeks[w].end + 1;
    }

    return filteredProducts.map((p, idx) => {
      const pr = records.filter(r => r.product_id === p.id);
      const beginQty = pr.filter(r => r.created_at < `${monthStr}-01`).reduce((s, r) => s + (r.type === 'in' ? r.quantity : -r.quantity), 0);
      const wSum = (wIdx: number, isIn: boolean) => {
        if (wIdx >= weeks.length) return 0;
        const { start, end } = weeks[wIdx];
        return pr.filter(r => {
          if (!r.created_at.startsWith(monthStr)) return false;
          const d = parseInt(r.created_at.substring(8, 10));
          return d >= start && d <= end && r.type === (isIn ? 'in' : 'out');
        }).reduce((s, r) => s + r.quantity, 0);
      };
      const iw = [0,1,2,3,4].map(w => wSum(w, true));
      const ow = [0,1,2,3,4].map(w => wSum(w, false));
      const inTotal = iw.reduce((a,b) => a+b, 0);
      const outTotal = ow.reduce((a,b) => a+b, 0);

      return {
        key: `${p.id}`, index: idx + 1, name: p.name, spec: p.spec || '-', unit: p.unit || '件',
        beginQty, inW1: iw[0], inW2: iw[1], inW3: iw[2], inW4: iw[3], inW5: iw[4], inTotal,
        outW1: ow[0], outW2: ow[1], outW3: ow[2], outW4: ow[3], outW5: ow[4], outTotal,
        endQty: beginQty + inTotal - outTotal,
      };
    });
  }, [filteredProducts, records, year, month, monthStr]);

  const nowrap = { whiteSpace: 'nowrap' as const };
  const wrap4 = (t: string) => <span>{t.slice(0, 4)}<br/>{t.slice(4)}</span>;
  const baseCol = (t: string | React.ReactNode, d: string, w: number, extra?: Record<string, unknown>) =>
    ({ title: typeof t === 'string' ? <span style={nowrap}>{t}</span> : t, dataIndex: d, key: d, width: w, align: 'center' as const, ...(extra || {}) });

  const monthCols = [
    baseCol('序号', 'index', 60), baseCol('分类', 'category', 80),
    baseCol('物品名称', 'name', 130), baseCol('规格型号', 'spec', 110), baseCol('单位', 'unit', 55),
    baseCol('期初库存', 'beginQty', 100),
    baseCol('本月入库数量', 'inQty', 100),
    baseCol('本月出库数量', 'outQty', 100),
    baseCol('期末库存', 'endQty', 100, { title: <span style={{color: '#d48806'}}>期末库存</span> }),
  ];

  const weekCols = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    const wc = Math.min(5, Math.ceil(daysInMonth / 7));
    const base = [
      baseCol('序号', 'index', 55), baseCol('物品名称', 'name', 120),
      baseCol('规格型号', 'spec', 100), baseCol('单位', 'unit', 50),
      baseCol(wrap4('期初库存数量合计'), 'beginQty', 90),
    ];
    const inGroup = [];
    for (let i = 1; i <= wc; i++) inGroup.push(baseCol(`入库第${i}周`, `inW${i}`, 80));
    inGroup.push({
      ...baseCol('入库合计', 'inTotal', 80),
      onHeaderCell: () => ({ style: { background: '#e6f7ff' } }),
    });
    const outGroup = [];
    for (let i = 1; i <= wc; i++) outGroup.push(baseCol(`出库第${i}周`, `outW${i}`, 80));
    outGroup.push({
      ...baseCol('出库合计', 'outTotal', 80),
      onHeaderCell: () => ({ style: { background: '#fff1f0' } }),
    });

    return [
      ...base,
      { title: <span style={nowrap}>本月入库记录</span>, children: inGroup },
      { title: <span style={nowrap}>本月出库记录</span>, children: outGroup },
      { ...baseCol(wrap4('期末库存数量合计'), 'endQty', 90), onHeaderCell: () => ({ style: { background: '#fffbe6' } }) },
    ];
  }, [year, month]);

  // ====== 导出 ======
  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      const title = `${year}年${month}月物资进销存台账`;
      const wb = XLSX.utils.book_new();
      const daysInMonth = new Date(year, month, 0).getDate();
      const wc = Math.min(5, Math.ceil(daysInMonth / 7));

      if (mode === 'monthly') {
        // Monthly export with multi-level header
        const h1 = [title, null, null, null, null, null, null, null, null];
        const h2 = ['序号', '分类', '物品名称', '规格型号', '单位', '期初库存', '本月入库数量', '本月出库数量', '期末库存'];
        const dataRows = ledgerData.map(r => [r.index, r.category, r.name, r.spec, r.unit, r.beginQty, r.inQty, r.outQty, r.endQty]);
        const ws = XLSX.utils.aoa_to_sheet([h1, h2, ...dataRows]);
        ws['!merges'] = [{ s: { c: 0, r: 0 }, e: { c: 8, r: 0 } }];
        ws['!cols'] = [5,8,12,10,5,12,12,12,12].map(w => ({ wch: w }));
        // Title styling: bold + large font
        const titleCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
        ws[titleCell] = { v: title, t: 's', s: { font: { bold: true, sz: 18 }, alignment: { horizontal: 'center' } } };
        if (format === 'csv') {
          downloadBlob(new Blob(['﻿' + [h2].concat(dataRows).map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), `${title}.csv`);
        } else {
          XLSX.utils.book_append_sheet(wb, ws, '月度汇总');
        }
      } else {
        // Weekly export with multi-level header matching the Excel template
        const baseCnt = 4;
        const weekColsCnt = wc; // number of week columns per group
        const totalCnt = baseCnt + weekColsCnt * 2 + 3; // base + in(weeks+total) + out(weeks+total) + endQty
        const h1Row = Array(totalCnt).fill(null);
        h1Row[0] = title;
        // 数据列索引: [0]名称 [1]规格 [2]单位 [3]期初 [4..3+wc]入库周 [3+wc+1]入库合计 [4+wc+1..3+wc*2+1]出库周 [4+wc*2+1]出库合计 [5+wc*2+1]期末
        const inStart = baseCnt;
        const inWeeksEnd = inStart + wc - 1;
        const inTotalIdx = inWeeksEnd + 1;
        const outStart = inTotalIdx + 1;
        const outWeeksEnd = outStart + wc - 1;
        const outTotalIdx = outWeeksEnd + 1;
        const endIdx = outTotalIdx + 1;

        const h2: (string | null)[] = Array(totalCnt).fill(null);
        h2[0] = '物品名称'; h2[1] = '规格型号'; h2[2] = '单位'; h2[3] = '期初库存数量合计';
        h2[inStart] = '本月入库记录'; // spans weeks+total
        h2[outStart] = '本月出库记录'; // spans weeks+total
        h2[endIdx] = '期末库存数量合计';

        const h3: (string | null)[] = Array(totalCnt).fill(null);
        h3[0] = '序号';
        for (let i = 1; i <= wc; i++) h3[inStart + i - 1] = `入库第${i}周`;
        h3[inTotalIdx] = '入库合计';
        for (let i = 1; i <= wc; i++) h3[outStart + i - 1] = `出库第${i}周`;
        h3[outTotalIdx] = '出库合计';

        const dataRows = weekData.map(r => {
          const row: (string | number)[] = [r.name, r.spec, r.unit, r.beginQty];
          for (let i = 1; i <= wc; i++) row.push((r as unknown as Record<string,number>)[`inW${i}`]);
          row.push(r.inTotal);
          for (let i = 1; i <= wc; i++) row.push((r as Record<string,number>)[`outW${i}`]);
          row.push(r.outTotal);
          row.push(r.endQty);
          return row;
        });

        const mergeH1    = { s: { c: 0, r: 0 }, e: { c: totalCnt - 1, r: 0 } };
        const mergeName  = { s: { c: 0, r: 1 }, e: { c: 0, r: 2 } };
        const mergeSpec  = { s: { c: 1, r: 1 }, e: { c: 1, r: 2 } };
        const mergeUnit  = { s: { c: 2, r: 1 }, e: { c: 2, r: 2 } };
        const mergeBegin = { s: { c: 3, r: 1 }, e: { c: 3, r: 2 } };
        // 本月入库记录 spans weeks + total
        const mergeIn  = { s: { c: inStart, r: 1 }, e: { c: inTotalIdx, r: 1 } };
        // 本月出库记录 spans weeks + total
        const mergeOut = { s: { c: outStart, r: 1 }, e: { c: outTotalIdx, r: 1 } };

        const ws = XLSX.utils.aoa_to_sheet([h1Row, h2, h3, ...dataRows]);
        ws['!merges'] = [mergeH1, mergeIn, mergeOut, mergeName, mergeSpec, mergeUnit, mergeBegin];
        const tCell = XLSX.utils.encode_cell({ r: 0, c: 0 });
        ws[tCell] = { v: title, t: 's', s: { font: { bold: true, sz: 18 }, alignment: { horizontal: 'center' } } };

        if (format === 'csv') {
          const csvH = ['物品名称', '规格型号', '单位', '期初库存数量合计',
            ...Array.from({length:wc}, (_,i) => `入库第${i+1}周`), '入库合计',
            ...Array.from({length:wc}, (_,i) => `出库第${i+1}周`), '出库合计', '期末库存数量合计'];
          downloadBlob(new Blob(['﻿' + [csvH].concat(dataRows).map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }), `${title}(周明细).csv`);
        } else {
          XLSX.utils.book_append_sheet(wb, ws, '周明细');
        }
      }

      if (format === 'xlsx') {
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${title}.xlsx`);
      }
      message.success('导出成功');
    } catch { message.error('导出失败'); }
  };

  function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const exportItems = [
    { key: 'csv', icon: <FileTextOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
    { key: 'xlsx', icon: <FileExcelOutlined />, label: '导出 Excel', onClick: () => handleExport('xlsx') },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
        <Radio.Group value={mode} onChange={e => setMode(e.target.value)} optionType="button" buttonStyle="solid" size="large">
          <Radio.Button value="monthly" style={{ padding: '0 40px', fontSize: 15, lineHeight: '36px' }}>月度汇总</Radio.Button>
          <Radio.Button value="weekly" style={{ padding: '0 40px', fontSize: 15, lineHeight: '36px' }}>周明细</Radio.Button>
        </Radio.Group>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space size="middle" wrap>
          <span style={{ fontWeight: 500 }}>年月：</span>
          <Select value={year} onChange={setYear} style={{ width: 100 }}>
            {years.map(y => <Select.Option key={y} value={y}>{y}年</Select.Option>)}
          </Select>
          <Select value={month} onChange={setMonth} style={{ width: 80 }}>
            {months.map(m => <Select.Option key={m} value={m}>{m}月</Select.Option>)}
          </Select>
          {mode === 'weekly' && (
            <Select placeholder="全部部门" allowClear value={deptFilter} onChange={v => setDeptFilter(v ?? null)} style={{ width: 140 }}>
              {departments.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          )}
          <Dropdown menu={{ items: exportItems }}>
            <Button icon={<DownloadOutlined />}>导出</Button>
          </Dropdown>
        </Space>
      </Card>

      <h3 style={{ marginBottom: 16, textAlign: 'center', fontSize: 18, fontWeight: 600 }}>
        {year}年{month}月物资进销存台账{mode === 'weekly' ? '（周明细）' : ''}
      </h3>

      {mode === 'monthly' ? (
        <Table dataSource={ledgerData} columns={monthCols} rowKey="key" pagination={false} bordered scroll={{ x: 900 }} />
      ) : (
        <Table dataSource={weekData} columns={weekCols} rowKey="key" pagination={false} bordered size="small" scroll={{ x: 1800 }} />
      )}
    </div>
  );
}
