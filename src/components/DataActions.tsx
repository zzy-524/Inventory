import { Button, Dropdown, Upload, message, Space } from 'antd';
import { DownloadOutlined, UploadOutlined, FileExcelOutlined, FileTextOutlined } from '@ant-design/icons';
import { exportApi } from '../api';
import type { UploadProps } from 'antd';

interface DataActionsProps {
  pageKey: string;
  onDataImported: () => void;
}

export default function DataActions({ pageKey, onDataImported }: DataActionsProps) {
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
    </Space>
  );
}
