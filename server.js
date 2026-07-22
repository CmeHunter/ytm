// YTM 庫存查詢工具 - 輕量伺服器（無外部相依，Node 18+）
// 職責：1) 提供 public/ 靜態頁面 2) 代理亞尼克站點清單與庫存 API（解決 CORS）
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const YANNICK_BASE = 'https://www.yannick.com.tw';
const CACHE_FILE = path.join(__dirname, 'stations-cache.json');

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': `${YANNICK_BASE}/ytm/service2`,
};

let stationsCache = null; // { fetchedAt, branchs, machines }

// 從 service2 頁面原始碼解析內嵌的據點分類與站點清單
async function fetchStations() {
  const res = await fetch(`${YANNICK_BASE}/ytm/service2`, { headers: COMMON_HEADERS });
  if (!res.ok) throw new Error(`service2 頁面回應 ${res.status}`);
  const html = await res.text();

  const branchsMatch = html.match(/let\s+Branchs\s*=\s*(\[.*\]);/);
  const machinesMatch = html.match(/let\s+Machines\s*=\s*(\[.*\]);/);
  if (!branchsMatch || !machinesMatch) throw new Error('無法從頁面解析站點資料，網站可能已改版');

  return {
    fetchedAt: Date.now(),
    branchs: JSON.parse(branchsMatch[1]),
    machines: JSON.parse(machinesMatch[1]),
  };
}

// 站點資料只抓一次並永久沿用；forceRefresh 為使用者手動按「更新站點資料」時才重抓
async function getStations(forceRefresh) {
  if (!forceRefresh) {
    // 記憶體快取
    if (stationsCache) return stationsCache;
    // 檔案快取（跨重啟）
    if (fs.existsSync(CACHE_FILE)) {
      try {
        stationsCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        return stationsCache;
      } catch { /* 快取檔損毀就重抓 */ }
    }
  }
  try {
    stationsCache = await fetchStations();
    fs.writeFileSync(CACHE_FILE, JSON.stringify(stationsCache));
  } catch (err) {
    // 抓取失敗時退回既有快取，至少讓頁面可用
    if (stationsCache) return stationsCache;
    if (fs.existsSync(CACHE_FILE)) {
      stationsCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      return stationsCache;
    }
    throw err;
  }
  return stationsCache;
}

// 查詢單一站點庫存
async function fetchStock(tid) {
  const res = await fetch(`${YANNICK_BASE}/_zh-cht/ajaxTYTMStock.ashx`, {
    method: 'POST',
    headers: { ...COMMON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ TID: tid }).toString(),
  });
  if (!res.ok) throw new Error(`庫存 API 回應 ${res.status}`);
  return res.json();
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/stations') {
      const data = await getStations(url.searchParams.get('refresh') === '1');
      return sendJson(res, 200, { branchs: data.branchs, machines: data.machines, fetchedAt: data.fetchedAt });
    }
    if (url.pathname === '/api/stock') {
      const tid = url.searchParams.get('tid');
      if (!tid || !/^[A-Za-z0-9]+$/.test(tid)) return sendJson(res, 400, { error: 'tid 參數無效' });
      const data = await fetchStock(tid);
      return sendJson(res, 200, data);
    }
    // 靜態檔案（僅限 public/ 目錄內）
    const filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved = path.join(__dirname, 'public', path.normalize(filePath));
    if (resolved.startsWith(path.join(__dirname, 'public')) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
      const type = types[path.extname(resolved)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
      return res.end(fs.readFileSync(resolved));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('找不到頁面');
  } catch (err) {
    console.error(`[錯誤] ${req.url}:`, err.message);
    sendJson(res, 502, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`YTM 庫存查詢工具已啟動：http://localhost:${PORT}`);
});
