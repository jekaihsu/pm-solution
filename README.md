# PM Dashboard

以 **Lark Base（多維表格）** 為資料來源的動態儀表板，使用 Next.js + Recharts，部署在 **Zeabur**。

## 功能

- 自動讀取 Base 內所有資料表與欄位，依欄位類型自動產生預設圖表
- 圖表可自由新增 / 編輯 / 刪除 / 排序：長條、橫向長條、堆疊、折線、面積、圓餅
- 計算方式：筆數、加總、平均、最小、最大；日期欄位可依日 / 週 / 月 / 季 / 年分組
- 篩選列（單選、多選、人員、核取方塊欄位），KPI 卡片，可搜尋 / 排序的資料表檢視
- 自動更新（30 秒 / 1 分 / 5 分），伺服器端快取避免頻繁呼叫 Lark API
- 圖表版面存在瀏覽器（localStorage），每個資料表各自一份
- 未設定 Lark 憑證時自動使用示範資料，可以先部署看效果
- 可選的帳密保護（HTTP Basic Auth）
- 支援深色模式、手機版

## 1. 建立 Lark 自建應用

1. 到 [Lark 開發者後台](https://open.larksuite.com/app)（飛書為 open.feishu.cn）→ 建立「企業自建應用」
2. 「權限管理」開通：
   - `bitable:app:readonly`（查看多維表格）
3. 發布應用版本，讓管理員審核通過
4. 打開要讀取的 Base → 右上角「…」→「新增文件應用」（Add document app）→ 加入剛建立的應用，讓應用有權限讀這個 Base
5. 記下：
   - 應用的 **App ID** 與 **App Secret**（「憑證與基礎資訊」頁）
   - Base 的 **app_token**：網址 `https://xxx.larksuite.com/base/<app_token>?table=<table_id>` 中的 `<app_token>`

> 如果 Base 是放在 Wiki（知識庫）裡，網址會是 `/wiki/<token>`，那個 token 不是 app_token，需要用 Wiki API 換取 `obj_token`，或直接把 Base 移出 Wiki。

## 2. 部署到 Zeabur

1. 登入 [Zeabur](https://zeabur.com) → 建立 Project（選一個區域）
2. 「Add Service」→「Git」→ 第一次使用時授權 Zeabur GitHub App 並選擇 `jekaihsu/pm-solution`
3. 選擇分支，Zeabur 會自動偵測為 Next.js 並建置
4. 到服務的「Variables」加入環境變數（見下表），儲存後重新部署
5. 「Networking」→ 產生 `*.zeabur.app` 網域或綁定自己的網域

之後每次 push 到該分支，Zeabur 會自動重新部署。

### 環境變數

| 變數 | 必填 | 說明 |
|---|---|---|
| `LARK_APP_ID` | ✔ | 自建應用 App ID |
| `LARK_APP_SECRET` | ✔ | 自建應用 App Secret |
| `LARK_BASE_APP_TOKEN` | ✔ | Base 的 app_token |
| `LARK_API_BASE` | | Lark 國際版 `https://open.larksuite.com`（預設），飛書 `https://open.feishu.cn` |
| `LARK_DEFAULT_TABLE_ID` | | 預設打開的資料表 |
| `CACHE_TTL_SECONDS` | | 伺服器端快取秒數，預設 30 |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | | 設定密碼後整站需要登入（帳號預設 `admin`） |

三個必填變數任一沒設，網站會顯示示範資料。

## 本機開發

```bash
cp .env.example .env.local   # 填入憑證
npm install
npm run dev                  # http://localhost:3000
```

## 架構

```
app/
  page.tsx                    儀表板頁面
  api/tables/route.ts         列出 Base 中的資料表
  api/tables/[tableId]/       取得欄位 + 所有記錄（已正規化）
components/
  Dashboard.tsx               主畫面：篩選、KPI、圖表格、資料表
  ChartView.tsx               Recharts 圖表
  WidgetEditor.tsx            新增 / 編輯圖表
lib/
  lark.ts                     Lark Open API（token 快取、分頁、欄位值正規化）
  aggregate.ts                分組 / 聚合 / 預設圖表
  demo.ts                     示範資料
proxy.ts                      選用的 Basic Auth
```

App Secret 只存在伺服器端，瀏覽器只會呼叫本站的 `/api/*`。
