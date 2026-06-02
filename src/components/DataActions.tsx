import { useState } from 'react';
import { Button, Modal, Upload, message, Checkbox, Space, Tooltip } from 'antd';
import {
  DownloadOutlined, UploadOutlined, SettingOutlined, FileExcelOutlined,
} from '@ant-design/icons';
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
      const response = await exportApi.exportData(pageKey, 'xlsx');
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${pageKey}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      message.success('导出成功 (XLSX)');
    } catch { message.error('导出失败'); }
  };

  const importProps: UploadProps = {
    accept: '.xlsx,.xls',
    showUploadList: false,
    beforeUpload: (file) => {
      const formData = new FormData();
      formData.append('file', file);
      fetch(`/api/import/${pageKey}`, { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
          if (data.error) return message.error(data.error);
          message.success(`成功导入 ${data.count} 条记录`);
          onDataImported();
        })
        .catch(() => message.error('导入失败'));
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
        <FileExcelOutlined style={{ marginRight: 4 }} />导出 XLSX
      </Button>

      <Upload {...importProps}>
        <Button icon={<UploadOutlined />}>导入 XLSX</Button>
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
