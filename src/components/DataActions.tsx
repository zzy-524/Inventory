import { useState } from 'react';
import { Button, Modal, Upload, message, Checkbox, Space, Tooltip } from 'antd';
import { DownloadOutlined, UploadOutlined, SettingOutlined, FileExcelOutlined } from '@ant-design/icons';
import { exportApi, tableConfigApi, systemApi } from '../api';
import type { UploadProps } from 'antd';

interface ColumnDef {
  key: string;
  title: string;
  visible: boolean;
}

interface DataActionsProps {
  pageKey: string;
  columns: ColumnDef[];
  onColumnsChange: (columns: ColumnDef[]) => void;
  onDataImported: () => void;
}

/** 解析 CSV 文本为 JSON 数组 */
function parseCSV(text: string): Record<string, unknown>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV 文件至少需要标题行和一行数据');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === ',' && !inQ) { values.push(cur); cur = ''; continue; }
      cur += ch;
    }
    values.push(cur);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

export default function DataActions({ pageKey, columns, onColumnsChange, onDataImported }: DataActionsProps) {
  const [configVisible, setConfigVisible] = useState(false);
  const [localColumns, setLocalColumns] = useState<ColumnDef[]>(columns);
  const [isHost, setIsHost] = useState(false);

  const openConfig = async () => {
    setLocalColumns(columns);
    try {
      const infoRes = await systemApi.getInfo();
      setIsHost(infoRes.data.isHost);
    } catch { setIsHost(false); }
    setConfigVisible(true);
  };

  const handleExport = async () => {
    try {
      const response = await exportApi.exportData(pageKey);
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pageKey}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.success('导出成功 (CSV)');
    } catch { message.error('导出失败'); }
  };

  const importProps: UploadProps = {
    accept: '.csv',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const text = e.target?.result as string;
          const data = parseCSV(text);
          const res = await exportApi.importData(pageKey, data);
          message.success(`成功导入 ${res.data.count} 条记录`);
          onDataImported();
        } catch (err: unknown) {
          const msg = (err as { message?: string }).message || '文件格式错误';
          message.error('导入失败: ' + msg);
        }
      };
      reader.readAsText(file);
      return false;
    },
  };

  const saveColumnConfig = async () => {
    try {
      await tableConfigApi.update(pageKey, localColumns);
      onColumnsChange(localColumns);
      setConfigVisible(false);
      message.success('表头配置已保存');
    } catch { message.error('保存失败'); }
  };

  const toggleColumn = (key: string) => {
    setLocalColumns(prev => prev.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    ));
  };

  return (
    <Space>
      <Button icon={<DownloadOutlined />} onClick={handleExport}>
        <FileExcelOutlined style={{ marginRight: 4 }} />导出 CSV
      </Button>

      <Upload {...importProps}>
        <Button icon={<UploadOutlined />}>导入 CSV</Button>
      </Upload>

      <Tooltip title={!isHost ? '仅主机可自定义表头' : '自定义表头'}>
        <Button icon={<SettingOutlined />} onClick={openConfig}
          type={isHost ? 'default' : 'text'} disabled={!isHost}>
          自定义表头
        </Button>
      </Tooltip>

      <Modal title="自定义表头" open={configVisible} onOk={saveColumnConfig}
        onCancel={() => setConfigVisible(false)}>
        <p style={{ marginBottom: 12, color: '#888' }}>勾选要显示的列，取消勾选隐藏列</p>
        {localColumns.map(col => (
          <div key={col.key} style={{ padding: '6px 0' }}>
            <Checkbox checked={col.visible} onChange={() => toggleColumn(col.key)}>
              {col.title}
            </Checkbox>
          </div>
        ))}
      </Modal>
    </Space>
  );
}
