// YTM 盲盒監控程式（無外部相依，Node 18+）
// 每小時查詢設定檔中的機台庫存，商品名稱含關鍵字（預設「盲盒」）的總數量
// 發生 0→N（到貨）或 N→0（售罄）轉變時發送 Discord 通知。
// 使用方式：node monitor.js
const fs = require('fs');
const path = require('path');

const YANNICK_BASE = 'https://www.yannick.com.tw';
const CONFIG_FILE = path.join(__dirname, 'monitor-config.json');
const STATE_FILE = path.join(__dirname, 'monitor-state.json');

const COMMON_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Referer': `${YANNICK_BASE}/ytm/service2`,
};

function log(msg) {
  console.log(`[${new Date().toLocaleString('zh-TW', { hour12: false })}] ${msg}`);
}

function loadConfig() {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  if (!Array.isArray(config.machines) || config.machines.length === 0) {
    throw new Error('monitor-config.json 的 machines 清單為空');
  }
  return config;
}

// 狀態檔：{ [tid]: { count, updatedAt } }，跨執行保留，用於偵測 0→N / N→0
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// 查詢單一站點庫存（與 server.js 相同端點）
async function fetchStock(tid) {
  const res = await fetch(`${YANNICK_BASE}/_zh-cht/ajaxTYTMStock.ashx`, {
    method: 'POST',
    headers: { ...COMMON_HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ TID: tid }).toString(),
  });
  if (!res.ok) throw new Error(`庫存 API 回應 ${res.status}`);
  const data = await res.json();
  const code = data.Status && data.Status.code;
  if (code !== '00') {
    const msg = (data.Alert && data.Alert.message) || `狀態碼 ${code}`;
    throw new Error(`庫存 API 錯誤：${msg}`);
  }
  return (data.Result && data.Result.StockList) || [];
}

async function sendDiscord(webhookUrl, content) {
  if (!webhookUrl) {
    log(`（未設定 Webhook，僅印出通知內容）\n${content}`);
    return;
  }
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  // Discord 成功回 204；失敗時記錄但不中斷監控
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    log(`Discord 通知失敗：${res.status} ${body}`);
  }
}

function formatItems(items) {
  return items.map(s => `・${s.ProductName}：${s.quantity} 個（NT$ ${s.Price}）`).join('\n');
}

async function checkOnce(config, state) {
  for (const machine of config.machines) {
    const { tid, name } = machine;
    let stockList;
    try {
      stockList = await fetchStock(tid);
    } catch (err) {
      // 查詢失敗不視為 0：跳過本輪比對、保留舊狀態，避免誤報售罄
      log(`${name} 查詢失敗，跳過本輪：${err.message}`);
      continue;
    }

    const items = stockList.filter(s => (s.ProductName || '').includes(config.keyword));
    const count = items.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);
    const prev = state[tid];

    if (prev === undefined) {
      // 首次執行只建立基準，不通知
      log(`${name} 首次查詢，建立基準：${config.keyword} ${count} 個`);
    } else if (prev.count === 0 && count > 0) {
      log(`${name} ${config.keyword} 到貨：0 → ${count}，發送通知`);
      await sendDiscord(config.webhookUrl,
        `🎁 **${config.keyword}到貨通知**\n📍 ${name}\n${formatItems(items)}\n共 ${count} 個`);
    } else if (prev.count > 0 && count === 0) {
      log(`${name} ${config.keyword} 售罄：${prev.count} → 0，發送通知`);
      await sendDiscord(config.webhookUrl,
        `⚠️ **${config.keyword}售罄通知**\n📍 ${name}\n${config.keyword}已全數售出（上次為 ${prev.count} 個）`);
    } else {
      log(`${name} ${config.keyword} 數量：${prev.count} → ${count}，無需通知`);
    }

    state[tid] = { count, name, updatedAt: new Date().toISOString() };
    saveState(state);

    // 台與台之間稍作延遲，避免高頻連續打官網
    await new Promise(r => setTimeout(r, 2000));
  }
}

async function main() {
  const config = loadConfig();
  const state = loadState();
  const intervalMs = (config.intervalMinutes || 60) * 60 * 1000;
  log(`監控啟動：${config.machines.map(m => m.name).join('、')}，每 ${config.intervalMinutes || 60} 分鐘查詢一次`);

  await checkOnce(config, state);
  setInterval(() => {
    checkOnce(config, state).catch(err => log(`本輪查詢發生錯誤：${err.message}`));
  }, intervalMs);
}

main().catch(err => {
  log(`啟動失敗：${err.message}`);
  process.exit(1);
});
