import { useState } from 'react';
import { Button, Dropdown, Modal, Upload, message, Checkbox, Space, Tooltip } from 'antd';
import {
  DownloadOutlined,
  UploadOutlined,
  SettingOutlined,
  FileExcelOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { exportApi, tableConfigApi, systemApi } from '../api';
import type { UploadProps } from 'antd';
import type { SystemInfo } from '../types';

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

export default function DataActions({ pageKey, columns, onColumnsChange, onDataImported }: DataActionsProps) {
  const [configVisible, setConfigVisible] = useState(false);
  const [localColumns, setLocalColumns] = useState<ColumnDef[]>(columns);
  const [isHost, setIsHost] = useState(false);

  // 每次打开配置时检查主机状态和加载最新配置
  const openConfig = async () => {
    setLocalColumns(columns);
    try {
      const infoRes = await systemApi.getInfo();
      setIsHost(infoRes.data.isHost);
    } catch {
      setIsHost(false);
    }
    setConfigVisible(true);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const response = await exportApi.exportData(pageKey, format);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pageKey}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.success(`导出成功 (${format.toUpperCase()})`);
    } catch {
      message.error('导出失败');
    }
  };

  const importProps: UploadProps = {
    accept: '.json,.csv',
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          let data: Record<string, unknown>[];

          if (file.name.endsWith('.json')) {
            data = JSON.parse(content);
          } else {
            // Parse CSV
            const lines = content.split('\n').filter(l => l.trim());
            if (lines.length < 2) throw new Error('CSV文件至少需要标题行和一行数据');
            const headers = lines[0].split(',').map(h => h.trim());
            data = lines.slice(1).map(line => {
              const values: string[] = [];
              let current = '';
              let inQuotes = false;
              for (const ch of line) {
                if (ch === '"') { inQuotes = !inQuotes; continue; }
                if (ch === ',' && !inQuotes) { values.push(current); current = ''; continue; }
                current += ch;
              }
              values.push(current);
              const row: Record<string, unknown> = {};
              headers.forEach((h, i) => { row[h] = values[i] || ''; });
              return row;
            });
          }

          const result = await exportApi.importData(pageKey, data);
          message.success(`成功导入 ${result.data.count} 条记录`);
          onDataImported();
        } catch (err: unknown) {
          message.error('导入失败: ' + ((err as { message?: string }).message || '文件格式错误'));
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
    } catch {
      message.error('保存失败');
    }
  };

  const toggleColumn = (key: string) => {
    setLocalColumns(prev => prev.map(col =>
      col.key === key ? { ...col, visible: !col.visible } : col
    ));
  };

  const exportItems = [
    { key: 'json', icon: <FileTextOutlined />, label: '导出 JSON', onClick: () => handleExport('json') },
    { key: 'csv', icon: <FileExcelOutlined />, label: '导出 CSV', onClick: () => handleExport('csv') },
  ];

  return (
    <Space>
      <Dropdown menu={{ items: exportItems }}>
        <Button icon={<DownloadOutlined />}>导出</Button>
      </Dropdown>

      <Upload {...importProps}>
        <Button icon={<UploadOutlined />}>导入</Button>
      </Upload>

      <Tooltip title={!isHost ? '仅主机可自定义表头' : '自定义表头'}>
        <Button
          icon={<SettingOutlined />}
          onClick={openConfig}
          type={isHost ? 'default' : 'text'}
          disabled={!isHost}
        >
          自定义表头
        </Button>
      </Tooltip>

      <Modal
        title="自定义表头"
        open={configVisible}
        onOk={saveColumnConfig}
        onCancel={() => setConfigVisible(false)}
      >
        <p style={{ marginBottom: 12, color: '#888' }}>勾选要显示的列，取消勾选隐藏列</p>
        {localColumns.map(col => (
          <div key={col.key} style={{ padding: '6px 0' }}>
            <Checkbox
              checked={col.visible}
              onChange={() => toggleColumn(col.key)}
            >
              {col.title}
            </Checkbox>
          </div>
        ))}
      </Modal>
    </Space>
  );
}
