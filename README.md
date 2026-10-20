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
- **以 Lark 帳號登入**：整站需登入組織的 Lark 帳號才能看（OAuth，登入狀態 7 天）

- **R01 控制組看板**：各組上週營業額點數、預排點數與差異（預排未填點數以每組每天 1 點計）、失誤率（控制組檢核不通過 ÷ 已檢核）、異常狀態、工作項目／編號／數量明細，以及主管勾選「是否符合 SOP」（存在本站，記錄勾選人與時間，不寫回 Lark）

**沒有做的（文件標為未定或未授權）**：營業額／失誤率／達成率／N+123 等公式、寫回 Lark、通知、補登覆核、角色權限、PDF 產報。

## 資料來源

設定在 `lib/reports.ts`：

V3 與 V4 是不同系統的原始資料，分開顯示、不相加也不去重；頂端「資料版本」可切換 V3＋V4／V3／V4。工作單、成本單、預排讀全表（不套 Lark 檢視）。

**V4 納入規則**：只納入原生建立時間在 2026-10-13 00:00（台北）之後的記錄（業主 2026-10-13 裁示：V4 從今天有人填寫才開始算），之前的測試與試填資料與建立時間不明者排除，排除筆數會顯示在頁面與 CSV。主檔（儀器費率、車輛）不套用。

| 來源 | V3（`Sdw1bG…`） | V4（`H7W6b0…`） | 用於 |
|---|---|---|---|
| 外業工作單 | `tbl97f1uXqi7Qz0k` | `tbl5zPLS0ExWNEty` | R01、R10 |
| 外業成本單 | — | `tbl8wRYCUCvbSoJG` | R01 |
| 內業工作單 | `tblTP5Naz52FBpFg` | `tblrCo8KeZiuJUNh` | R02、R03（V4 品管欄位）、R09 |
| 內業成本單 | `tbl8JdWLLwlPFuoF` | `tblKwSDRg6WaGHYr` | R02、R09 |
| 工作預排 | `tblN8c3WN44233aG` | `tblZz6Mkhv9gHrB2` | R09、R10 |
| 儀器費率 | `tblfgeEtMuBTg72O` | `tblg3Fo23T6Gos6S` | R07 |
| 車輛 | — | `tblTQv8l5ntnbwyp` | R07 |
| 案件應收未收（檢視 `vewUGIqzfl`） | `tblWsSaOcy4nKuGI` | — | R06 |

| 其他來源 | 位置 | 用於 |
|---|---|---|
| 報價總表 | `JoOqbg…` / `tblENZvYAya93Twa` | R05 |
| 業主連絡資訊表 | `JoOqbg…` / `tbl4fmZN6cBB7u1d` | R08（通訊錄，非聯繫紀錄） |
| 成果送出／業主回覆 | V3、V4 皆未找到 | R03 |
| 招聘／出勤／出差 | 暫不接入（個資範圍待定；差勤非 Base） | R04 |
| 業主聯繫紀錄 | 尚未找到正式資料表 | R08 |

## Lark 應用設定

1. [Lark 開發者後台](https://open.larksuite.com/app) → 建立企業自建應用
2. 權限管理開通 `bitable:app:readonly`，發布版本並經管理員審核
3. 在**三個 Base**（V3 `Sdw1bG…`、V4 `H7W6b0…`、報價 `JoOqbg…`）各自「…」→「新增文件應用」，加入此應用
4. **登入設定**：「安全設定」→「重新導向 URL」加入 `https://<你的網域>/api/auth/callback`
5. 「可用範圍」設定哪些同事可以登入（企業自建應用只有組織內成員能授權）
6. 檢查是否讀得到：
   ```bash
   LARK_APP_ID=... LARK_APP_SECRET=... node scripts/inspect-lark.mjs
   ```
   會列出每個 Base 的資料表、欄位型別與筆數（只讀）。

## 部署到 Zeabur

1. Zeabur → 建立 Project → Add Service → Git → 選 `jekaihsu/pm-solution` 與分支（使用 repo 內的 `Dockerfile` 建置，服務埠 8080）
2. Variables 加入下表的環境變數 → 重新部署
3. Networking 產生網域

| 變數 | 必填 | 說明 |
|---|---|---|
| `LARK_APP_ID` | ✔ | 自建應用 App ID |
| `LARK_APP_SECRET` | ✔ | 自建應用 App Secret |
| `LARK_API_BASE` | | 預設 `https://open.larksuite.com`（國際版） |
| `CACHE_TTL_SECONDS` | | 伺服器端快取秒數，預設 30 |
| `APP_URL` | | 網站對外網址（例如 `https://pm.zeabur.app`）；OAuth 回呼用，未設時自動判斷 |
| `LARK_TENANT_KEY` | | 只允許此組織的帳號登入 |
| `SESSION_SECRET` | | 登入 cookie 簽章密鑰，未設時由 App Secret 衍生 |
| `AUTH_DISABLED` | | 設為 `1` 可暫時關閉登入（本機開發用） |
| `SOP_EDITORS` | | 可勾選 R01「是否符合 SOP」的主管 Lark open_id，以逗號分隔；未設定時沒有人能勾選。主管在 R01 頁面可看到自己的 Lark ID |
| `HR_VIEWERS` | | 誰能看人事頁（R04 加班）：`*`＝所有登入者都能看；填 Lark open_id（逗號或空白分隔）＝只有名單內的人；留空＝沒有人能看（預設）。業主 2026-10-13 裁示全員可看，Zeabur 設 `HR_VIEWERS=*` |
| `DATA_DIR` | | R01「是否符合 SOP」勾選紀錄的儲存位置；在 Zeabur「硬碟」掛載 `/app/data` 並設 `DATA_DIR=/app/data`，未設定時重新部署會遺失 |

## 本機開發

```bash
cp .env.example .env.local
npm install
npm run dev
```

## 預排核對報告（Lark Docx）

總覽頁與 R04 人事頁有一個「預排核對報告」入口，連到一份 Lark 雲端文件（預排 vs 日誌合規）。
這份文件**不在儀表板內計算**，由 `scripts/yupai-report` 產生器每日覆寫；儀表板只連過去。

- 連結設定在單一來源 `lib/yupaiReport.ts`，可用環境變數 `NEXT_PUBLIC_YUPAI_REPORT_URL` 覆寫
  （預設指向 docId `VCAgdgGFooejQ9xqiHZjaCGhpIe`）。見 `.env.example`。
- 判斷口徑（離職排除、僅平日、日誌 1 日寬限、業務免日誌、請假來源、週五前不判下週、只算有活動的人）
  的**單一事實來源**是 `lib/yupaiCompliance.ts`，與 R04 的 `lib/scheduleCheck.ts` 共用同一組原始函式。
- 產生器用法、每日指令與口徑決議見 **`docs/YUPAI_REPORT.md`**。

```bash
# 產出報告並覆寫雲端文件（box 上 lark-cli 已以 user 身分授權）
cd /workspace/pm-solution && npm run yupai:report -- --doc-id VCAgdgGFooejQ9xqiHZjaCGhpIe
# 與舊版 Python 產生器對帳（不連 Lark，用快取資料）
npm run yupai:parity
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
app/api/auth/                Lark 登入（login / callback / logout / me）
lib/session.ts               簽章 cookie
proxy.ts                     未登入時導向 Lark 登入
```
