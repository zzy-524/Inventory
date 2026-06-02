import axios from 'axios';
import type {
  Department,
  Operator,
  Product,
  Inventory,
  StockRecord,
  AddDepartmentRequest,
  AddOperatorRequest,
  AddProductRequest,
  AddStockRecordRequest,
  TableConfig,
  SystemInfo,
} from '../types';

/** 是否在 Tauri 桌面客户端内运行 */
const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;

const api = axios.create({
  baseURL: isTauri ? 'http://localhost:8888' : '',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const departmentApi = {
  getAll: () => api.get<Department[]>('/api/departments'),
  add: (data: AddDepartmentRequest) => api.post('/api/departments', data),
};

export const operatorApi = {
  getAll: () => api.get<Operator[]>('/api/operators'),
  add: (data: AddOperatorRequest) => api.post('/api/operators', data),
};

export const productApi = {
  getAll: () => api.get<Product[]>('/api/products'),
  add: (data: AddProductRequest) => api.post('/api/products', data),
};

export const inventoryApi = {
  getAll: () => api.get<Inventory[]>('/api/inventory'),
};

export const stockRecordApi = {
  getAll: () => api.get<StockRecord[]>('/api/stock-records'),
  add: (data: AddStockRecordRequest) => api.post('/api/stock-records', data),
};

export const exportApi = {
  exportData: (type: string, format: 'json' | 'csv' = 'json') =>
    api.post(`/api/export/${type}`, { format }, { responseType: 'blob' }),
  importData: (type: string, data: Record<string, unknown>[]) =>
    api.post(`/api/import/${type}`, { data }),
};

export const tableConfigApi = {
  getAll: () => api.get<TableConfig[]>('/api/table-configs'),
  get: (page: string) => api.get<TableConfig | null>(`/api/table-configs/${page}`),
  update: (page: string, columns: { key: string; title: string; visible: boolean }[]) =>
    api.put(`/api/table-configs/${page}`, { columns }),
};

export const systemApi = {
  getInfo: () => api.get<SystemInfo>('/api/system/info'),
};

export default api;
