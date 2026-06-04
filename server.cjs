/**
 * 库存管理系统 - 后端服务器
 * 纯 Node.js 内置模块，0 外部依赖
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ====== 数据存储 ======
// 判断是否在应用包内运行（macOS .app 或 Windows 安装目录）
const inAppBundle = __dirname.includes('.app/Contents/Resources')
  || __dirname.includes('Program Files')
  || __dirname.includes('Program Files (x86)');
const DATA_DIR = inAppBundle
  ? path.join(os.homedir(), '.inventory-app')
  : __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadData() {
  ensureDataDir();
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { departments: [], operators: [], products: [], inventory: [], stockRecords: [], fixedAssets: [], tableConfigs: [], users: [], nextId: 1 };
}

function saveData(data) {
  ensureDataDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

let store = loadData();
let nextId = store.nextId || 1;

function genId() { return nextId++; }
function now() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

// 持久化
function persist() {
  store.nextId = nextId;
  saveData(store);
}

// ====== 认证 ======
function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// 初始化默认管理员
if (!store.users || store.users.length === 0) {
  store.users = [];
  const salt = crypto.randomBytes(16).toString('hex');
  store.users.push({
    id: 1, username: 'admin', password: hashPassword('admin', salt),
    salt, role: 'admin', created_at: now(),
  });
  persist();
  console.log('已创建默认管理员账号: admin / admin');
}

// 确保管理员操作人记录存在
if (!store.operators) store.operators = [];
if (!store.operators.find(o => o.username === 'admin')) {
  const opSalt = crypto.randomBytes(16).toString('hex');
  store.operators.push({
    id: genId(), name: '管理员', username: 'admin',
    password: hashPassword('admin', opSalt), salt: opSalt,
    department_id: null, created_at: now(), updated_at: now(),
  });
  persist();
}

// 会话管理（内存）
const sessions = new Map(); // token -> { username, createdAt }

function createSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, createdAt: now() });
  return token;
}

function verifySession(token) {
  return sessions.get(token) || null;
}

function getTokenFromReq(req) {
  const auth = req.headers['authorization'] || '';
  const match = auth.match(/^Bearer\s+(.+)$/);
  return match ? match[1] : null;
}

function requireAuth(req) {
  const token = getTokenFromReq(req);
  if (!token) return null;
  return verifySession(token);
}

// ====== HTTP 工具 ======
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function sendText(res, status, contentType, text, filename) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Disposition': filename ? `attachment; filename=${filename}` : '',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(text);
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function getIP(req) {
  return req.socket?.remoteAddress || '';
}

function isHostRequest(req) {
  const ip = getIP(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// ====== MIME 类型 ======
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

// ====== 路由处理 ======
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    return res.end();
  }

  // ====== API 路由 ======
  if (pathname.startsWith('/api/')) {
    await handleAPI(req, res, method, pathname);
    return;
  }

  // ====== 静态文件服务 ======
  serveStatic(req, res, pathname);
}

// ====== API 处理 ======
async function handleAPI(req, res, method, pathname) {
  // GET /api/departments
  if (method === 'GET' && pathname === '/api/departments') {
    const sorted = [...store.departments].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return sendJSON(res, 200, sorted);
  }

  // POST /api/departments
  if (method === 'POST' && pathname === '/api/departments') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const dept = { id: genId(), name: body.name || '', description: body.description || '',
      sort_order: body.sort_order ?? 0, created_at: now(), updated_at: now() };
    store.departments.push(dept);
    persist();
    return sendJSON(res, 200, { id: dept.id });
  }

  // PUT /api/departments/:id
  const deptPutMatch = pathname.match(/^\/api\/departments\/(\d+)$/);
  if (method === 'PUT' && deptPutMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const dept = store.departments.find(d => d.id === parseInt(deptPutMatch[1]));
    if (!dept) return sendJSON(res, 404, { error: '部门不存在' });
    dept.name = body.name || '';
    dept.description = body.description || '';
    dept.sort_order = body.sort_order ?? dept.sort_order ?? 0;
    dept.updated_at = now();
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // DELETE /api/departments/:id
  const deptDelMatch = pathname.match(/^\/api\/departments\/(\d+)$/);
  if (method === 'DELETE' && deptDelMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    store.departments = store.departments.filter(d => d.id !== parseInt(deptDelMatch[1]));
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // GET /api/operators
  if (method === 'GET' && pathname === '/api/operators') {
    const safeOps = store.operators.map(({ password, salt, ...op }) => op);
    return sendJSON(res, 200, safeOps);
  }

  // POST /api/operators
  if (method === 'POST' && pathname === '/api/operators') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    if (!body.username || body.username.length < 2) return sendJSON(res, 400, { error: '账号至少2个字符' });
    if (!body.password || body.password.length < 4) return sendJSON(res, 400, { error: '密码至少4个字符' });
    if (store.operators.find(o => o.username === body.username)) return sendJSON(res, 409, { error: '账号已存在' });
    const salt = crypto.randomBytes(16).toString('hex');
    const op = {
      id: genId(), name: body.name || '', username: body.username, department_id: body.department_id ?? null,
      password: hashPassword(body.password, salt), salt,
      created_at: now(), updated_at: now(),
    };
    store.operators.push(op);
    persist();
    return sendJSON(res, 200, { id: op.id, name: op.name, username: op.username });
  }

  // PUT /api/operators/:id
  const opPutMatch = pathname.match(/^\/api\/operators\/(\d+)$/);
  if (method === 'PUT' && opPutMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const op = store.operators.find(o => o.id === parseInt(opPutMatch[1]));
    if (!op) return sendJSON(res, 404, { error: '操作人不存在' });
    if (body.username && body.username !== op.username && store.operators.find(o => o.username === body.username)) {
      return sendJSON(res, 409, { error: '账号已存在' });
    }
    op.name = body.name || op.name;
    op.username = body.username || op.username;
    if (body.password) {
      if (body.password.length < 4) return sendJSON(res, 400, { error: '密码至少4个字符' });
      op.salt = crypto.randomBytes(16).toString('hex');
      op.password = hashPassword(body.password, op.salt);
    }
    op.department_id = body.department_id ?? op.department_id;
    op.updated_at = now();
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // DELETE /api/operators/:id
  const opDelMatch = pathname.match(/^\/api\/operators\/(\d+)$/);
  if (method === 'DELETE' && opDelMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    store.operators = store.operators.filter(o => o.id !== parseInt(opDelMatch[1]));
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // GET /api/products
  if (method === 'GET' && pathname === '/api/products') {
    return sendJSON(res, 200, store.products);
  }

  // POST /api/products
  if (method === 'POST' && pathname === '/api/products') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const product = {
      id: genId(), name: body.name || '', category: body.category || '', spec: body.spec || '',
      unit: body.unit || '件', cost_price: body.cost_price || 0,
      department_id: body.department_id ?? null, deleted: false, created_at: now(), updated_at: now(),
    };
    store.products.push(product);
    store.inventory.push({ id: genId(), product_id: product.id, quantity: 0, min_quantity: 10, updated_at: now() });
    persist();
    return sendJSON(res, 200, { id: product.id });
  }

  // DELETE /api/products/:id
  const productDelMatch = pathname.match(/^\/api\/products\/(\d+)$/);
  if (method === 'DELETE' && productDelMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const product = store.products.find(p => p.id === parseInt(productDelMatch[1]));
    if (!product) return sendJSON(res, 404, { error: '商品不存在' });
    product.deleted = true;
    product.updated_at = now();
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // GET /api/inventory
  if (method === 'GET' && pathname === '/api/inventory') {
    return sendJSON(res, 200, store.inventory);
  }

  // PUT /api/inventory — 批量更新库存
  if (method === 'PUT' && pathname === '/api/inventory') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    if (!Array.isArray(body)) return sendJSON(res, 400, { error: '无效数据' });
    let count = 0;
    for (const item of body) {
      const inv = store.inventory.find(iv => iv.product_id === item.product_id);
      if (inv) {
        if (item.quantity !== undefined) inv.quantity = item.quantity;
        if (item.min_quantity !== undefined) inv.min_quantity = item.min_quantity;
        inv.updated_at = now();
        count++;
      }
    }
    persist();
    return sendJSON(res, 200, { success: true, count });
  }

  // GET /api/stock-records
  if (method === 'GET' && pathname === '/api/stock-records') {
    const records = [...store.stockRecords].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sendJSON(res, 200, records);
  }

  // POST /api/stock-records
  if (method === 'POST' && pathname === '/api/stock-records') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const record = {
      id: genId(), product_id: body.product_id, type: body.type, quantity: body.quantity,
      operator_id: body.operator_id ?? null, department_id: body.department_id ?? null,
      remark: body.remark || '', created_at: body.created_at || now(),
    };
    store.stockRecords.push(record);

    // 更新库存
    const idx = store.inventory.findIndex(iv => iv.product_id === body.product_id);
    if (idx !== -1) {
      const qty = body.type === 'in' ? body.quantity : -body.quantity;
      store.inventory[idx].quantity += qty;
      store.inventory[idx].updated_at = now();
    }
    persist();
    return sendJSON(res, 200, { id: record.id });
  }

  // ====== 固定资产 ======
  if (!store.fixedAssets) store.fixedAssets = [];

  // GET /api/fixed-assets
  if (method === 'GET' && pathname === '/api/fixed-assets') {
    return sendJSON(res, 200, store.fixedAssets);
  }

  // POST /api/fixed-assets
  if (method === 'POST' && pathname === '/api/fixed-assets') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const fa = {
      id: genId(), name: body.name || '', model: body.model || '', unit: body.unit || '件',
      department_id: body.department_id ?? null, quantity: body.quantity ?? 1,
      setup_date: body.setup_date || '', asset_no: body.asset_no || '',
      custodian: body.custodian || '', remark: body.remark || '',
      created_at: now(), updated_at: now(),
    };
    store.fixedAssets.push(fa);
    persist();
    return sendJSON(res, 200, { id: fa.id });
  }

  // PUT /api/fixed-assets/:id
  const faPutMatch = pathname.match(/^\/api\/fixed-assets\/(\d+)$/);
  if (method === 'PUT' && faPutMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    const fa = store.fixedAssets.find(a => a.id === parseInt(faPutMatch[1]));
    if (!fa) return sendJSON(res, 404, { error: '固定资产不存在' });
    fa.name = body.name ?? fa.name; fa.model = body.model ?? fa.model; fa.unit = body.unit ?? fa.unit;
    fa.department_id = body.department_id ?? fa.department_id; fa.quantity = body.quantity ?? fa.quantity;
    fa.setup_date = body.setup_date ?? fa.setup_date; fa.asset_no = body.asset_no ?? fa.asset_no;
    fa.custodian = body.custodian ?? fa.custodian; fa.remark = body.remark ?? fa.remark;
    fa.updated_at = now();
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // DELETE /api/fixed-assets/:id
  const faDelMatch = pathname.match(/^\/api\/fixed-assets\/(\d+)$/);
  if (method === 'DELETE' && faDelMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    store.fixedAssets = store.fixedAssets.filter(a => a.id !== parseInt(faDelMatch[1]));
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // POST /api/export/:type
  const exportMatch = pathname.match(/^\/api\/export\/(\w[\w-]*)$/);
  if (method === 'POST' && exportMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const type = exportMatch[1];
    const body = await parseBody(req);
    const format = body.format || 'json';
    let data = [];
    switch (type) {
      case 'departments': data = store.departments; break;
      case 'operators': data = store.operators.map(({ password, salt, ...op }) => op); break;
      case 'products': data = store.products; break;
      case 'inventory':
        data = store.inventory.map(iv => {
          const p = store.products.find(pr => pr.id === iv.product_id);
          return { ...iv, product_name: p?.name || '', product_spec: p?.spec || '', product_unit: p?.unit || '' };
        });
        break;
      case 'stock-records': data = [...store.stockRecords].sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
      case 'fixed-assets': data = store.fixedAssets; break;
      default: return sendJSON(res, 400, { error: '无效的数据类型' });
    }
    if (format === 'csv') {
      if (!data.length) return sendText(res, 200, 'text/csv; charset=utf-8', '', `${type}.csv`);
      const headers = Object.keys(data[0]);
      const rows = data.map(row => headers.map(h => {
        const v = row[h];
        if (v === null || v === undefined) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(','));
      return sendText(res, 200, 'text/csv; charset=utf-8', '﻿' + headers.join(',') + '\n' + rows.join('\n'), `${type}.csv`);
    }
    return sendJSON(res, 200, data);
  }

  // POST /api/import/:type
  const importMatch = pathname.match(/^\/api\/import\/(\w[\w-]*)$/);
  if (method === 'POST' && importMatch) {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const type = importMatch[1];
    const body = await parseBody(req);
    const data = body.data;
    if (!Array.isArray(data) || !data.length) return sendJSON(res, 400, { error: '无效数据' });
    const allowed = ['departments', 'operators', 'products', 'stock-records', 'fixed-assets'];
    if (!allowed.includes(type)) return sendJSON(res, 400, { error: '不支持的类型' });

    try {
      let count = 0;
      for (const row of data) {
        if (type === 'departments' && row.name) {
          store.departments.push({ id: genId(), name: row.name, description: row.description || '',
            sort_order: row.sort_order ?? 0, created_at: now(), updated_at: now() });
          count++;
        } else if (type === 'operators' && row.name) {
          const salt = crypto.randomBytes(16).toString('hex');
          const defaultPw = row.password || '123456';
          store.operators.push({
            id: genId(), name: row.name, username: row.username || row.name,
            department_id: row.department_id ?? null,
            password: hashPassword(defaultPw, salt), salt,
            created_at: now(), updated_at: now(),
          });
          count++;
        } else if (type === 'products' && row.name) {
          const product = {
            id: genId(), name: row.name, category: row.category || '', spec: row.spec || '',
            unit: row.unit || '件', cost_price: row.cost_price || 0,
            department_id: row.department_id ?? null, deleted: false, created_at: now(), updated_at: now(),
          };
          store.products.push(product);
          store.inventory.push({ id: genId(), product_id: product.id, quantity: 0, min_quantity: 10, updated_at: now() });
          count++;
        } else if (type === 'stock-records' && row.product_id && row.type && row.quantity) {
          const record = {
            id: genId(), product_id: row.product_id, type: row.type, quantity: row.quantity,
            operator_id: row.operator_id ?? null, department_id: row.department_id ?? null,
            remark: row.remark || '', created_at: row.created_at || now(),
          };
          store.stockRecords.push(record);
          const idx = store.inventory.findIndex(iv => iv.product_id === row.product_id);
          if (idx !== -1) {
            store.inventory[idx].quantity += row.type === 'in' ? row.quantity : -row.quantity;
            store.inventory[idx].updated_at = now();
          }
          count++;
        } else if (type === 'fixed-assets' && row.name) {
          const fa = {
            id: genId(), name: row.name, model: row.model || '', unit: row.unit || '件',
            department_id: row.department_id ?? null, quantity: row.quantity ?? 1,
            setup_date: row.setup_date || '', asset_no: row.asset_no || '',
            custodian: row.custodian || '', remark: row.remark || '',
            created_at: now(), updated_at: now(),
          };
          store.fixedAssets.push(fa);
          count++;
        }
      }
      persist();
      return sendJSON(res, 200, { success: true, count });
    } catch (e) {
      return sendJSON(res, 500, { error: '导入失败: ' + e.message });
    }
  }

  // GET /api/table-configs
  if (method === 'GET' && pathname === '/api/table-configs') {
    return sendJSON(res, 200, store.tableConfigs.map(c => ({ ...c, columns: typeof c.columns === 'string' ? JSON.parse(c.columns) : c.columns })));
  }

  // GET /api/table-configs/:page
  const tcGetMatch = pathname.match(/^\/api\/table-configs\/(.+)$/);
  if (method === 'GET' && tcGetMatch) {
    const config = store.tableConfigs.find(c => c.page_key === tcGetMatch[1]);
    if (config) {
      config.columns = typeof config.columns === 'string' ? JSON.parse(config.columns) : config.columns;
      return sendJSON(res, 200, config);
    }
    return sendJSON(res, 200, null);
  }

  // PUT /api/table-configs/:page
  if (method === 'PUT' && tcGetMatch) {
    const pageKey = tcGetMatch[1];
    const body = await parseBody(req);
    if (!Array.isArray(body.columns)) return sendJSON(res, 400, { error: '无效的列配置' });
    const idx = store.tableConfigs.findIndex(c => c.page_key === pageKey);
    const entry = { page_key: pageKey, columns: body.columns, updated_at: now() };
    if (idx !== -1) store.tableConfigs[idx] = entry;
    else store.tableConfigs.push({ id: genId(), ...entry });
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // GET /api/system/info
  if (method === 'GET' && pathname === '/api/system/info') {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({ name, address: iface.address });
        }
      }
    }
    return sendJSON(res, 200, {
      hostname: os.hostname(), platform: os.platform(), isHost: isHostRequest(req), networkInterfaces: addresses,
    });
  }

  // ====== 认证 API ======

  // POST /api/auth/login
  if (method === 'POST' && pathname === '/api/auth/login') {
    const body = await parseBody(req);
    const user = store.users.find(u => u.username === body.username);
    if (!user) return sendJSON(res, 401, { error: '用户名或密码错误' });
    const pwHash = hashPassword(body.password || '', user.salt);
    if (pwHash !== user.password) return sendJSON(res, 401, { error: '用户名或密码错误' });
    const token = createSession(user.username);
    return sendJSON(res, 200, { token, username: user.username });
  }

  // POST /api/auth/register（仅主机可注册）
  if (method === 'POST' && pathname === '/api/auth/register') {
    if (!isHostRequest(req)) return sendJSON(res, 403, { error: '仅主机可注册' });
    const body = await parseBody(req);
    if (!body.username || !body.password) return sendJSON(res, 400, { error: '用户名和密码不能为空' });
    if (body.username.length < 2) return sendJSON(res, 400, { error: '用户名至少2个字符' });
    if (body.password.length < 4) return sendJSON(res, 400, { error: '密码至少4个字符' });
    if (store.users.find(u => u.username === body.username)) return sendJSON(res, 409, { error: '用户名已存在' });
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      id: genId(), username: body.username, password: hashPassword(body.password, salt),
      salt, role: 'user', created_at: now(),
    };
    store.users.push(user);
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // POST /api/operator-login
  if (method === 'POST' && pathname === '/api/operator-login') {
    const body = await parseBody(req);
    const operator = store.operators.find(o => o.username === body.username);
    if (!operator) return sendJSON(res, 401, { error: '账号或密码错误' });
    const pwHash = hashPassword(body.password || '', operator.salt);
    if (pwHash !== operator.password) return sendJSON(res, 401, { error: '账号或密码错误' });
    const token = createSession(operator.name);
    return sendJSON(res, 200, { token, name: operator.name });
  }

  // GET /api/auth/verify
  if (method === 'GET' && pathname === '/api/auth/verify') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    return sendJSON(res, 200, { valid: true, username: session.username });
  }

  // GET /api/backup - 导出全量数据备份
  if (method === 'GET' && pathname === '/api/backup') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    return sendJSON(res, 200, {
      departments: store.departments,
      operators: store.operators,
      products: store.products,
      inventory: store.inventory,
      stockRecords: store.stockRecords,
      fixedAssets: store.fixedAssets,
      tableConfigs: store.tableConfigs,
    });
  }

  // POST /api/restore - 导入全量数据恢复
  if (method === 'POST' && pathname === '/api/restore') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    const body = await parseBody(req);
    let maxId = store.nextId;
    let count = 0;
    if (body.departments) { store.departments = body.departments; count += body.departments.length; }
    if (body.operators) { store.operators = body.operators; count += body.operators.length; }
    if (body.products) { store.products = body.products; count += body.products.length; }
    if (body.inventory) { store.inventory = body.inventory; count += body.inventory.length; }
    if (body.stockRecords) { store.stockRecords = body.stockRecords; count += body.stockRecords.length; }
    if (body.fixedAssets) { store.fixedAssets = body.fixedAssets; count += body.fixedAssets.length; }
    if (body.tableConfigs) { store.tableConfigs = body.tableConfigs; count += body.tableConfigs.length; }
    // 更新 nextId
    const allIds = [];
    [...store.departments, ...store.operators, ...store.products, ...store.inventory, ...store.stockRecords, ...store.tableConfigs].forEach(item => {
      if (item.id) allIds.push(item.id);
    });
    if (allIds.length > 0) { const m = Math.max(...allIds); if (m >= maxId) maxId = m + 1; }
    store.nextId = maxId;
    persist();
    return sendJSON(res, 200, { success: true, count });
  }

  // POST /api/clear — 清空所有数据
  if (method === 'POST' && pathname === '/api/clear') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    store.departments = [];
    store.operators = [];
    store.products = [];
    store.inventory = [];
    store.stockRecords = [];
    store.fixedAssets = [];
    store.tableConfigs = [];
    store.nextId = 1;
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // 404
  sendJSON(res, 404, { error: 'Not found' });
}

// ====== 静态文件服务 ======
function serveStatic(req, res, pathname) {
  let filePath = path.join(__dirname, 'dist', pathname === '/' ? 'index.html' : pathname);

  // SPA fallback: 非 API 请求返回 index.html
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'dist', 'index.html');
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

// ====== 启动服务器 ======
const PORT = 8888;
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  const interfaces = os.networkInterfaces();
  let localIP = 'localhost';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) localIP = iface.address;
    }
  }
  console.log(`HTTP server listening on http://0.0.0.0:${PORT}`);
  console.log(`局域网访问: http://${localIP}:${PORT}`);
});
