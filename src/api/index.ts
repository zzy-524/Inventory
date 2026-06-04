import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';
import type {
  Department, Operator, Product, Inventory, StockRecord, FixedAsset,
  AddDepartmentRequest, AddOperatorRequest, AddProductRequest,
  AddStockRecordRequest, TableConfig, SystemInfo,
} from '../types';

/** 是否在 Tauri 桌面客户端内运行 */
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

const api = axios.create({
  baseURL: isTauri ? '' : '',
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器：自动添加 token（仅 web 模式）
api.interceptors.request.use(config => {
  const token = localStorage.getItem('auth_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** 返回与 axios response 一致的结构 { data, status, ... } */
function tauriResponse<T>(data: T) {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} as never };
}

/** Tauri 模式下的 API 请求适配 */
async function tauriRequest<T>(cmd: string, args?: Record<string, unknown>): Promise<{ data: T; status: number; statusText: string; headers: Record<string, string>; config: never }> {
  const data = await invoke<T>(cmd, args);
  return tauriResponse(data);
}

export const authApi = {
  login: async (username: string, password: string) => {
    if (isTauri) {
      return tauriRequest<{ token: string; username: string }>('cmd_login', { username, password });
    }
    return api.post<{ token: string; username: string }>('/api/auth/login', { username, password });
  },
  register: async (username: string, password: string) => {
    if (isTauri) {
      return tauriRequest<never>('cmd_register', { username, password });
    }
    return api.post('/api/auth/register', { username, password });
  },
  verify: async () => {
    const token = localStorage.getItem('auth_token');
    if (isTauri) {
      return tauriRequest<{ valid: boolean; username: string }>('cmd_verify', { token });
    }
    return api.get<{ valid: boolean; username: string }>('/api/auth/verify');
  },
};

export const departmentApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<Department[]>('cmd_get_departments');
    return api.get<Department[]>('/api/departments');
  },
  add: async (data: AddDepartmentRequest) => {
    if (isTauri) return tauriRequest<{ id: number }>('cmd_add_department', { name: data.name || '', description: data.description || '', sort_order: data.sort_order ?? 0 });
    return api.post('/api/departments', data);
  },
  update: async (id: number, data: { name: string; description: string; sort_order?: number }) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_update_department', { id, name: data.name || '', description: data.description || '', sort_order: data.sort_order ?? 0 });
    return api.put(`/api/departments/${id}`, data);
  },
  delete: async (id: number) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_delete_department', { id });
    return api.delete(`/api/departments/${id}`);
  },
};

export const operatorApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<Operator[]>('cmd_get_operators');
    return api.get<Operator[]>('/api/operators');
  },
  add: async (data: AddOperatorRequest) => {
    if (isTauri) return tauriRequest<{ id: number }>('cmd_add_operator', { args: data as unknown as Record<string, unknown> });
    return api.post('/api/operators', data);
  },
  update: async (id: number, data: { name: string; username: string; password?: string; department_id: number | null }) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_update_operator', { id, ...data });
    return api.put(`/api/operators/${id}`, data);
  },
  delete: async (id: number) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_delete_operator', { id });
    return api.delete(`/api/operators/${id}`);
  },
  login: async (username: string, password: string) => {
    if (isTauri) return tauriRequest<{ token: string; name: string }>('cmd_operator_login', { username, password });
    return api.post<{ token: string; name: string }>('/api/operator-login', { username, password });
  },
};

export const productApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<Product[]>('cmd_get_products');
    return api.get<Product[]>('/api/products');
  },
  add: async (data: AddProductRequest) => {
    if (isTauri) return tauriRequest<{ id: number }>('cmd_add_product', { args: data as unknown as Record<string, unknown> });
    return api.post('/api/products', data);
  },
  delete: async (id: number) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_delete_product', { id });
    return api.delete(`/api/products/${id}`);
  },
};

export const inventoryApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<Inventory[]>('cmd_get_inventory');
    return api.get<Inventory[]>('/api/inventory');
  },
  updateMany: async (items: { product_id: number; quantity?: number; min_quantity?: number }[]) => {
    if (isTauri) return tauriRequest<{ success: boolean; count: number }>('cmd_update_inventory', { items });
    return api.put('/api/inventory', items);
  },
};

export const stockRecordApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<StockRecord[]>('cmd_get_stock_records');
    return api.get<StockRecord[]>('/api/stock-records');
  },
  add: async (data: AddStockRecordRequest) => {
    if (isTauri) return tauriRequest<{ id: number }>('cmd_add_stock_record', { args: data as unknown as Record<string, unknown> });
    return api.post('/api/stock-records', data);
  },
};

export const fixedAssetApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<FixedAsset[]>('cmd_get_fixed_assets');
    return api.get<FixedAsset[]>('/api/fixed-assets');
  },
  add: async (data: Record<string, unknown>) => {
    if (isTauri) return tauriRequest<{ id: number }>('cmd_add_fixed_asset', { args: data });
    return api.post('/api/fixed-assets', data);
  },
  update: async (id: number, data: Record<string, unknown>) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_update_fixed_asset', { id, args: data });
    return api.put(`/api/fixed-assets/${id}`, data);
  },
  delete: async (id: number) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_delete_fixed_asset', { id });
    return api.delete(`/api/fixed-assets/${id}`);
  },
};

export const exportApi = {
  exportData: async (type: string, format: 'json' | 'csv' = 'json') => {
    if (isTauri) {
      return tauriRequest<{ data: string; filename: string }>('cmd_export', { exportType: type, format });
    }
    return api.post(`/api/export/${type}`, { format }, { responseType: 'blob' });
  },
  importData: async (importType: string, data: Record<string, unknown>[]) => {
    if (isTauri) return tauriRequest<{ success: boolean; count: number }>('cmd_import', { importType, data });
    return api.post(`/api/import/${importType}`, { data });
  },
};

export const tableConfigApi = {
  getAll: async () => {
    if (isTauri) return tauriRequest<TableConfig[]>('cmd_get_table_configs');
    return api.get<TableConfig[]>('/api/table-configs');
  },
  get: async (page: string) => {
    if (isTauri) return tauriRequest<TableConfig | null>('cmd_get_table_config', { page });
    return api.get<TableConfig | null>(`/api/table-configs/${page}`);
  },
  update: async (page: string, columns: { key: string; title: string; visible: boolean }[]) => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_update_table_config', { page, columns });
    return api.put(`/api/table-configs/${page}`, { columns });
  },
};

export const systemApi = {
  getInfo: async () => {
    if (isTauri) return tauriRequest<SystemInfo>('cmd_get_system_info');
    return api.get<SystemInfo>('/api/system/info');
  },
  getServerUrls: async () => {
    if (isTauri) return tauriRequest<{ localUrl: string; lanUrls: string[] }>('cmd_get_server_urls');
    const info = await api.get<SystemInfo>('/api/system/info');
    const urls = info.data.networkInterfaces?.map(i => `http://${i.address}:8888`) || [];
    return { data: { localUrl: 'http://localhost:8888', lanUrls: urls }, status: 200, statusText: 'OK', headers: {}, config: {} as never };
  },
};

export const backupApi = {
  export: async () => {
    if (isTauri) return tauriRequest<Record<string, unknown>>('cmd_backup');
    return api.get('/api/backup');
  },
  restore: async (data: Record<string, unknown>) => {
    if (isTauri) return tauriRequest<{ success: boolean; count: number }>('cmd_restore', { data });
    return api.post('/api/restore', data);
  },
  clear: async () => {
    if (isTauri) return tauriRequest<{ success: boolean }>('cmd_clear_all');
    return api.post('/api/clear');
  },
};

export default api;

/** 统一的文件下载/保存：Tauri 模式弹出保存对话框选择位置，浏览器模式触发下载 */
export async function saveFile(content: Uint8Array | string, filename: string): Promise<void> {
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const filepath = await save({
      defaultPath: filename,
      title: '保存文件',
    });
    if (!filepath) return; // user cancelled
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    await invoke('cmd_save_file', { filepath, content: bytes });
    return;
  }
  // 浏览器模式：blob URL 触发下载
  const blob = typeof content === 'string'
    ? new Blob([content], { type: 'text/plain;charset=utf-8' })
    : new Blob([content]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
