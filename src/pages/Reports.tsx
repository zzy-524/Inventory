import { useState, useEffect } from 'react';
import { Card, Statistic, Table, message } from 'antd';
import { InboxOutlined, WarningOutlined, LeftCircleOutlined, DollarOutlined } from '@ant-design/icons';
import type { Inventory, Product, StockRecord } from '../types';
import { inventoryApi, productApi, stockRecordApi } from '../api';

export default function Reports() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockRecords, setStockRecords] = useState<StockRecord[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [invRes, prodRes, recRes] = await Promise.all([
        inventoryApi.getAll(),
        productApi.getAll(),
        stockRecordApi.getAll(),
      ]);
      setInventory(invRes.data);
      setProducts(prodRes.data);
      setStockRecords(recRes.data);
    } catch { message.error('加载数据失败'); }
  };

  const getProductInfo = (productId: number) => {
    return products.find(p => p.id === productId);
  };

  const totalProducts = products.filter(p => !p.deleted).length;
  const totalInventory = inventory.reduce((sum, iv) => sum + iv.quantity, 0);
  const lowStockCount = inventory.filter(iv => iv.quantity <= iv.min_quantity).length;

  const totalValue = inventory.reduce((sum, iv) => {
    const product = getProductInfo(iv.product_id);
    return sum + (product ? product.cost_price * iv.quantity : 0);
  }, 0);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayRecords = stockRecords.filter(r => r.created_at.startsWith(todayStr));
  const todayIn = todayRecords.filter(r => r.type === 'in').reduce((sum, r) => sum + r.quantity, 0);
  const todayOut = todayRecords.filter(r => r.type === 'out').reduce((sum, r) => sum + r.quantity, 0);

  const lowStockItems = inventory
    .filter(iv => iv.quantity <= iv.min_quantity)
    .filter(iv => {
      const product = getProductInfo(iv.product_id);
      return product && !product.deleted;
    })
    .map(iv => {
      const product = getProductInfo(iv.product_id);
      return {
        ...iv,
        productName: product?.name || '-',
        spec: product?.spec || '-',
        unit: product?.unit || '-',
      };
    });

  const lowStockColumns = [
    { title: '商品名称', dataIndex: 'productName', key: 'productName' },
    { title: '规格', dataIndex: 'spec', key: 'spec' },
    { title: '单位', dataIndex: 'unit', key: 'unit' },
    { title: '当前库存', dataIndex: 'quantity', key: 'quantity' },
    { title: '最低库存', dataIndex: 'min_quantity', key: 'min_quantity' },
    { title: '差额', key: 'diff', render: (_: unknown, record: { quantity: number; min_quantity: number }) => (
      <span style={{ color: '#ff4d4f' }}>{record.min_quantity - record.quantity}</span>
    )},
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <Card>
          <Statistic title="商品种类" value={totalProducts} prefix={<InboxOutlined />} />
        </Card>
        <Card>
          <Statistic title="总库存数量" value={totalInventory} prefix={<WarningOutlined />} />
        </Card>
        <Card>
          <Statistic title="库存预警" value={lowStockCount} prefix={<LeftCircleOutlined />}
            valueStyle={{ color: '#ff4d4f' }} />
        </Card>
        <Card>
          <Statistic title="库存总价值" value={totalValue.toFixed(2)} prefix={<DollarOutlined />} suffix="元" />
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
        <Card title="今日入库">
          <Statistic value={todayIn} valueStyle={{ fontSize: 48, color: '#52c41a' }} />
        </Card>
        <Card title="今日出库">
          <Statistic value={todayOut} valueStyle={{ fontSize: 48, color: '#fa8c16' }} />
        </Card>
      </div>

      <Card title="库存预警列表">
        <Table dataSource={lowStockItems} columns={lowStockColumns} rowKey="id" pagination={false} />
      </Card>
    </div>
  );
}
