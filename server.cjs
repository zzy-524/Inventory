/**
 * 库存管理系统 - 后端服务器
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const XLSX = require('xlsx');

// ====== 数据存储 ======
// 判断是否在应用包内运行
const inAppBundle = __dirname.includes('.app/Contents/Resources');
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
  return { departments: [], operators: [], products: [], inventory: [], stockRecords: [], tableConfigs: [], nextId: 1 };
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

// ====== multipart/form-data 解析 ======
function splitMultiPart(buf, boundary) {
  const parts = [];
  const delim = Buffer.from('--' + boundary);
  const endDelim = Buffer.from('--' + boundary + '--');
  let start = 0;
  while (start < buf.length) {
    const idx = buf.indexOf(delim, start);
    if (idx === -1) break;
    const partStart = buf.indexOf(Buffer.from('\r\n\r\n'), idx);
    if (partStart === -1) break;
    const headerEnd = partStart + 4;
    const nextDelim = buf.indexOf(delim, headerEnd);
    const partEnd = nextDelim !== -1 ? nextDelim - 2 : buf.indexOf(endDelim, headerEnd);
    if (partEnd === -1 || partEnd <= headerEnd) break;
    const headerBuf = buf.slice(idx + delim.length, partStart);
    const data = buf.slice(headerEnd, partEnd);
    const headers = headerBuf.toString().split('\r\n');
    const cd = headers.find(h => h.startsWith('Content-Disposition')) || '';
    const filenameMatch = cd.match(/filename="?([^"]*)"?/);
    parts.push({ data, filename: filenameMatch ? filenameMatch[1] : null, headers });
    start = partEnd + delim.length;
  }
  return parts;
}

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
    return sendJSON(res, 200, store.departments);
  }

  // POST /api/departments
  if (method === 'POST' && pathname === '/api/departments') {
    const body = await parseBody(req);
    const dept = { id: genId(), name: body.name || '', description: body.description || '', created_at: now(), updated_at: now() };
    store.departments.push(dept);
    persist();
    return sendJSON(res, 200, { id: dept.id });
  }

  // GET /api/operators
  if (method === 'GET' && pathname === '/api/operators') {
    return sendJSON(res, 200, store.operators);
  }

  // POST /api/operators
  if (method === 'POST' && pathname === '/api/operators') {
    const body = await parseBody(req);
    const op = { id: genId(), name: body.name || '', department_id: body.department_id ?? null, created_at: now(), updated_at: now() };
    store.operators.push(op);
    persist();
    return sendJSON(res, 200, { id: op.id });
  }

  // GET /api/products
  if (method === 'GET' && pathname === '/api/products') {
    return sendJSON(res, 200, store.products);
  }

  // POST /api/products
  if (method === 'POST' && pathname === '/api/products') {
    const body = await parseBody(req);
    const product = {
      id: genId(), name: body.name || '', category: body.category || '', spec: body.spec || '',
      unit: body.unit || '件', cost_price: body.cost_price || 0, sale_price: body.sale_price || 0,
      department_id: body.department_id ?? null, created_at: now(), updated_at: now(),
    };
    store.products.push(product);
    store.inventory.push({ id: genId(), product_id: product.id, quantity: 0, min_quantity: 10, updated_at: now() });
    persist();
    return sendJSON(res, 200, { id: product.id });
  }

  // GET /api/inventory
  if (method === 'GET' && pathname === '/api/inventory') {
    return sendJSON(res, 200, store.inventory);
  }

  // GET /api/stock-records
  if (method === 'GET' && pathname === '/api/stock-records') {
    const records = [...store.stockRecords].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sendJSON(res, 200, records);
  }

  // POST /api/stock-records
  if (method === 'POST' && pathname === '/api/stock-records') {
    const body = await parseBody(req);
    const record = {
      id: genId(), product_id: body.product_id, type: body.type, quantity: body.quantity,
      operator_id: body.operator_id ?? null, department_id: body.department_id ?? null,
      remark: body.remark || '', created_at: now(),
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

  // POST /api/export/:type（导出 xlsx）
  const exportMatch = pathname.match(/^\/api\/export\/(\w[\w-]*)$/);
  if (method === 'POST' && exportMatch) {
    const type = exportMatch[1];
    let data = [];
    switch (type) {
      case 'departments': data = store.departments; break;
      case 'operators': data = store.operators; break;
      case 'products': data = store.products; break;
      case 'inventory':
        data = store.inventory.map(iv => {
          const p = store.products.find(pr => pr.id === iv.product_id);
          return { ...iv, product_name: p?.name || '', product_spec: p?.spec || '', product_unit: p?.unit || '' };
        });
        break;
      case 'stock-records': data = [...store.stockRecords].sort((a, b) => b.created_at.localeCompare(a.created_at)); break;
      default: return sendJSON(res, 400, { error: '无效的数据类型' });
    }
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, type);
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=${type}.xlsx`,
        'Content-Length': buf.length,
        'Access-Control-Allow-Origin': '*',
      });
      return res.end(buf);
    } catch (e) {
      return sendJSON(res, 500, { error: '导出失败: ' + e.message });
    }
  }

  // POST /api/import/:type（导入 xlsx）
  const importMatch = pathname.match(/^\/api\/import\/(\w[\w-]*)$/);
  if (method === 'POST' && importMatch) {
    const type = importMatch[1];
    const allowed = ['departments', 'operators', 'products', 'stock-records'];
    if (!allowed.includes(type)) return sendJSON(res, 400, { error: '不支持的类型' });

    // 解析 multipart/form-data 上传的 xlsx 文件
    const boundary = req.headers['content-type']?.match(/boundary=(.+)/)?.[1];
    if (!boundary) return sendJSON(res, 400, { error: '请上传 xlsx 文件' });

    const bufs = [];
    for await (const chunk of req) bufs.push(chunk);
    const raw = Buffer.concat(bufs);

    // 从 multipart 中提取文件内容
    const parts = splitMultiPart(raw, boundary);
    const filePart = parts.find(p => p.filename);
    if (!filePart) return sendJSON(res, 400, { error: '未找到文件' });

    try {
      const wb = XLSX.read(filePart.data, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws);
      if (!rows.length) return sendJSON(res, 400, { error: '文件为空' });

      let count = 0;
      for (const row of rows) {
        if (type === 'departments' && row.name) {
          store.departments.push({ id: genId(), name: row.name, description: row.description || '', created_at: now(), updated_at: now() });
          count++;
        } else if (type === 'operators' && row.name) {
          store.operators.push({ id: genId(), name: row.name, department_id: row.department_id ?? null, created_at: now(), updated_at: now() });
          count++;
        } else if (type === 'products' && row.name) {
          const product = { id: genId(), name: row.name, category: row.category || '', spec: row.spec || '', unit: row.unit || '件', cost_price: row.cost_price || 0, sale_price: row.sale_price || 0, department_id: row.department_id ?? null, created_at: now(), updated_at: now() };
          store.products.push(product);
          store.inventory.push({ id: genId(), product_id: product.id, quantity: 0, min_quantity: 10, updated_at: now() });
          count++;
        } else if (type === 'stock-records' && row.product_id && row.type && row.quantity) {
          const record = { id: genId(), product_id: row.product_id, type: row.type, quantity: row.quantity, operator_id: row.operator_id ?? null, department_id: row.department_id ?? null, remark: row.remark || '', created_at: now() };
          store.stockRecords.push(record);
          const idx = store.inventory.findIndex(iv => iv.product_id === row.product_id);
          if (idx !== -1) { store.inventory[idx].quantity += row.type === 'in' ? row.quantity : -row.quantity; store.inventory[idx].updated_at = now(); }
          count++;
        }
      }
      persist();
      return sendJSON(res, 200, { success: true, count });
    } catch (e) {
      return sendJSON(res, 500, { error: '导入失败: ' + e.message });
    }
  }

  // ====== 用户管理 API（仅 admin 可操作）=====

  // GET /api/users
  if (method === 'GET' && pathname === '/api/users') {
    const session = requireAuth(req);
    if (!session || session.username !== 'admin') return sendJSON(res, 403, { error: '仅管理员可管理账号' });
    return sendJSON(res, 200, store.users.map(u => ({ id: u.id, username: u.username, role: u.role, created_at: u.created_at })));
  }

  // DELETE /api/users/:id
  const userDelMatch = pathname.match(/^\/api\/users\/(\d+)$/);
  if (method === 'DELETE' && userDelMatch) {
    const session = requireAuth(req);
    if (!session || session.username !== 'admin') return sendJSON(res, 403, { error: '仅管理员可管理账号' });
    const userId = parseInt(userDelMatch[1]);
    if (userId === 1) return sendJSON(res, 400, { error: '不能删除管理员账号' });
    const idx = store.users.findIndex(u => u.id === userId);
    if (idx === -1) return sendJSON(res, 404, { error: '用户不存在' });
    store.users.splice(idx, 1);
    persist();
    return sendJSON(res, 200, { success: true });
  }

  // PUT /api/users/:id/reset-password
  if (method === 'PUT' && pathname.match(/^\/api\/users\/\d+\/reset-password$/)) {
    const session = requireAuth(req);
    if (!session || session.username !== 'admin') return sendJSON(res, 403, { error: '仅管理员可管理账号' });
    const userId = parseInt(pathname.split('/')[3]);
    const body = await parseBody(req);
    if (!body.password || body.password.length < 4) return sendJSON(res, 400, { error: '密码至少4个字符' });
    const user = store.users.find(u => u.id === userId);
    if (!user) return sendJSON(res, 404, { error: '用户不存在' });
    const salt = crypto.randomBytes(16).toString('hex');
    user.salt = salt;
    user.password = hashPassword(body.password, salt);
    persist();
    return sendJSON(res, 200, { success: true });
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

  // GET /api/auth/verify
  if (method === 'GET' && pathname === '/api/auth/verify') {
    const session = requireAuth(req);
    if (!session) return sendJSON(res, 401, { error: '未登录' });
    return sendJSON(res, 200, { valid: true, username: session.username });
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
