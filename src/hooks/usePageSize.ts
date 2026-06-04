import { useState, useMemo } from 'react';

const PAGE_SIZE_OPTIONS: number[] = [10, 20, 50, 100, 200];

function readSavedPageSize(storageKey: string): number {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const n = parseInt(saved, 10);
      if (PAGE_SIZE_OPTIONS.includes(n)) return n;
    }
  } catch { /* localStorage unavailable */ }
  return 10;
}

export default function usePageSize(tableKey: string) {
  const storageKey = `table_page_size_${tableKey}`;

  const [pageSize, setPageSize] = useState(() => readSavedPageSize(storageKey));

  const pagination = useMemo(() => ({
    pageSize,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    showTotal: (total: number) => `共 ${total} 条`,
    onShowSizeChange: (_current: number, size: number) => {
      setPageSize(size);
      try { localStorage.setItem(storageKey, String(size)); } catch { /* skip */ }
    },
  }), [pageSize, storageKey]);

  return { pageSize, pagination };
}
