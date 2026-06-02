export interface Department {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Operator {
  id: number;
  name: string;
  department_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  name: string;
  category: string;
  spec: string;
  unit: string;
  cost_price: number;
  sale_price: number;
  department_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface Inventory {
  id: number;
  product_id: number;
  quantity: number;
  min_quantity: number;
  updated_at: string;
}

export interface StockRecord {
  id: number;
  product_id: number;
  type: 'in' | 'out';
  quantity: number;
  operator_id: number | null;
  department_id: number | null;
  remark: string;
  created_at: string;
}

export interface AddDepartmentRequest {
  name: string;
  description: string;
}

export interface AddOperatorRequest {
  name: string;
  department_id: number | null;
}

export interface AddProductRequest {
  name: string;
  category: string;
  spec: string;
  unit: string;
  cost_price: number;
  sale_price: number;
  department_id: number | null;
}

export interface AddStockRecordRequest {
  product_id: number;
  type: 'in' | 'out';
  quantity: number;
  operator_id: number | null;
  department_id: number | null;
  remark: string;
}

export interface IdResponse {
  id: number;
}

export interface TableConfig {
  id: number;
  page_key: string;
  columns: { key: string; title: string; visible: boolean }[];
  updated_at: string;
}

export interface SystemInfo {
  hostname: string;
  platform: string;
  isHost: boolean;
  networkInterfaces: { name: string; address: string }[];
}
