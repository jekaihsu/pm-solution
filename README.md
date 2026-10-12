# PM 週報

依《PM App 完整功能清單與開發驗收依據》v1.0 建置的**唯讀**週報網站：10 張獨立報告（R01–R10），資料由伺服器端讀取 Lark Base（國際版）。Next.js + Recharts，部署在 Zeabur。

## 目前做了什麼

- **總覽**：10 張報告入口，各自的資料來源狀態與本期筆數（不跨報告相加，R01／R10 共用外業工作單）
- **報告頁**：報告目的、必備內容、**待確認定義**（未定的口徑只列出，不計算），以及每個來源的：
  - 週篩選（Asia/Taipei，週一至週日，可選依哪個日期欄位；日期空白的記錄另計，不歸入任何週）
  - 欄位篩選、搜尋、排序的明細表（空白顯示「—」，不當成 0）
  - 自訂圖表（筆數／加總／平均…，版面存在各自瀏覽器）
  - CSV 匯出（UTF-8、附報告／模式／擷取時間／週／篩選；處理公式注入）
- **資料來源與定義頁**：每個來源的 Base／表／視圖、讀取狀態、欄位與型別
- **狀態分開顯示**：來源未定位、未連接、讀取失敗、過期快照（讀取失敗時保留上次成功資料並標示）、分頁未讀完
- **示範資料**需手動開啟，全站顯示警示條；示範記錄 ID 以 `demo_` 開頭，不與真實資料混用
- 可選的整站密碼（HTTP Basic Auth）

**沒有做的（文件標為未定或未授權）**：營業額／失誤率／達成率／N+123 等公式、寫回 Lark、通知、補登覆核、角色權限、PDF 產報。

## 資料來源

設定在 `lib/reports.ts`：

| 來源 | Base / 資料表 | 用於 |
|---|---|---|
| 外業工作單 | `Sdw1bG…` / `tbl97f1uXqi7Qz0k` | R01、R10 |
| 工作預排 | `Sdw1bG…` / `tblN8c3WN44233aG` | R09、R10 |
| 案件應收未收 | `Sdw1bG…` / `tblWsSaOcy4nKuGI` | R06 |
| 儀器費率 | `Sdw1bG…` / `tblfgeEtMuBTg72O` | R07 |
| 報價總表 | `JoOqbg…` / `tblENZvYAya93Twa` | R05 |
| 業主連絡資訊表 | `JoOqbg…` / `tbl4fmZN6cBB7u1d` | R08（通訊錄，非聯繫紀錄） |
| 內業工作單、報告品管、人事、聯繫紀錄 | 尚未定位 | R02、R03、R04、R08、R09 |

## Lark 應用設定

1. [Lark 開發者後台](https://open.larksuite.com/app) → 建立企業自建應用
2. 權限管理開通 `bitable:app:readonly`，發布版本並經管理員審核
3. 在**兩個 Base** 各自「…」→「新增文件應用」，加入此應用
4. 檢查是否讀得到：
   ```bash
   LARK_APP_ID=... LARK_APP_SECRET=... node scripts/inspect-lark.mjs
   ```
   會列出每個 Base 的資料表、欄位型別與筆數（只讀）。

## 部署到 Zeabur

1. Zeabur → 建立 Project → Add Service → Git → 選 `jekaihsu/pm-solution` 與分支（自動偵測 Next.js）
2. Variables 加入下表的環境變數 → 重新部署
3. Networking 產生網域

| 變數 | 必填 | 說明 |
|---|---|---|
| `LARK_APP_ID` | ✔ | 自建應用 App ID |
| `LARK_APP_SECRET` | ✔ | 自建應用 App Secret |
| `LARK_API_BASE` | | 預設 `https://open.larksuite.com`（國際版） |
| `CACHE_TTL_SECONDS` | | 伺服器端快取秒數，預設 30 |
| `DASHBOARD_USER` / `DASHBOARD_PASSWORD` | | 設定後整站需要登入（帳號預設 `admin`） |

## 本機開發

```bash
cp .env.example .env.local
npm install
npm run dev
```

## 架構

```
app/                         頁面：總覽、/reports/[slug]、/sources
app/api/sources/[key]/       讀取單一來源（伺服器端，含快取與過期快照）
components/                  AppShell（導覽、週、示範切換）、SourcePanel、圖表
lib/reports.ts               R01–R10 與資料來源設定
lib/lark.ts                  Lark Open API（token、分頁、欄位值正規化）
lib/week.ts                  Asia/Taipei 週計算
scripts/inspect-lark.mjs     檢查 Base 結構
proxy.ts                     選用的 Basic Auth
```
