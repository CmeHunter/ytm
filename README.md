# YTM 庫存查詢工具

維護自選亞尼克 YTM 站點清單，一鍵查詢所有站點的即時庫存。
資料來源：[亞尼克官網庫存查詢頁](https://www.yannick.com.tw/ytm/service2)。

## 兩種版本

| 版本 | 位置 | 說明 |
|---|---|---|
| GitHub Pages 靜態版 | `docs/index.html` | 純前端，透過公開 CORS 代理（cors.eu.org）呼叫官網 API，放上 GitHub Pages 即可使用 |
| 本機伺服器版 | `server.js` + `public/index.html` | 由本機 Node 伺服器代理 API，不依賴第三方代理服務，較穩定 |

## 功能

- 兩層下拉選單（據點分類 → YTM 站點）加入自選站點，清單存於瀏覽器 localStorage
- 「查詢庫存」一次查詢清單中所有站點，依站點分組列出商品、價格、庫存數量
- 商品名稱含「盲盒」者置頂並以粗體顯示；庫存 ≤1 以紅色標示
- 「更新站點資料」按鈕可手動重抓官網最新站點清單（無任何定時自動抓取）

## 本機伺服器版使用方式

需要 Node.js 18 以上（使用內建 fetch，無任何 npm 相依套件）：

```
node server.js
```

然後開啟 http://localhost:3000

## 盲盒監控（Discord 通知）

`monitor.js` 為常駐監控程式，依 `monitor-config.json` 設定的機台清單，每小時查詢一次庫存，
統計商品名稱含「盲盒」的總數量，並在以下兩種轉變時發送 Discord Webhook 通知：

- **0 → N**：盲盒到貨（附品項明細與數量）
- **N → 0**：盲盒售罄

啟動方式（需保持視窗開啟，關閉即停止監控）：

```
node monitor.js
```

行為說明：

- 首次執行只建立基準、不發通知；狀態存於 `monitor-state.json`（自動產生）
- 查詢失敗的機台跳過該輪比對、保留舊狀態，避免官網暫時故障誤報售罄
- 非零數量之間的變動（例如 3 → 1）只更新狀態、不通知
- `monitor-config.json` 內含 Discord Webhook URL（機密），已列入 `.gitignore` 不進版控

`monitor-config.json` 格式範例：

```json
{
  "webhookUrl": "https://discord.com/api/webhooks/...",
  "keyword": "盲盒",
  "intervalMinutes": 60,
  "machines": [
    { "tid": "F7D4C469168B78", "name": "淡水信義線-民權西路站" }
  ]
}
```

## GitHub Pages 部署

1. 將整個專案推上 GitHub 倉庫
2. 倉庫 Settings → Pages → Build and deployment → Source 選「Deploy from a branch」
3. Branch 選 `main`、資料夾選 `/docs`，按 Save
4. 等待約 1 分鐘，開啟 `https://<帳號>.github.io/<倉庫名>/`

## 注意事項

- 庫存 API 為亞尼克官網內部端點，非公開 API，官網改版時可能需要調整解析規則
- 靜態版依賴 cors.eu.org 免費代理服務；若該服務失效，改用本機伺服器版即可
- 請以合理頻率查詢（按鈕觸發），勿高頻自動輪詢
