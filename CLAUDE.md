# PM 週報 — 交接說明（給接手的 Agent）

這份文件讓本地 Agent 直接接手開發、部署與驗收。先讀完「硬規則」再動手。

## 1. 連結總覽

| 項目 | 位置 |
|---|---|
| GitHub repo | https://github.com/jekaihsu/pm-solution |
| 開發分支 | `claude/wonderful-feynman-ndrpha`（Zeabur 從這個分支部署） |
| 正式網址 | https://pmsolution.zeabur.app |
| 健康檢查（免登入） | https://pmsolution.zeabur.app/api/health |
| Zeabur | 專案 `pmsolution`，服務名稱 `settings`（以 Git URL 部署，Dockerfile 內容貼在服務設定裡） |
| Lark 自建應用 | `PM週報`，App ID `cli_aa464a1e04b8de2c`，權限 `bitable:app:readonly`、`contact:user.basic_profile:readonly` |
| Lark 網域 | 國際版，組織網址 https://yong-xiang-survey.jp.larksuite.com ，API `https://open.larksuite.com` |
| 圖文說明書 | https://claude.ai/artifact/PsfLBoQjPkdmkeSTqczg9F （R01／R02／R04 段落尚未補） |

## 2. 硬規則（不可違反）

- **網站唯讀**：只讀 Lark，不寫回 Lark、不發通知。SOP 勾選只存在網站自己的硬碟（`DATA_DIR`）。
- **機密不進 repo、不貼聊天**：`LARK_APP_SECRET`、`SESSION_SECRET` 只放在 Zeabur 環境變數或本機 `.env.local`（已被 git 忽略）。
- **薪水總表只讀加班欄位**：`lib/reports.ts` 的 `salaryField()` 白名單，Lark 請求帶 `field_names`，底薪、總薪資、加班費、扣款、身分資料一律不讀。不要放寬。人事資料只給 `HR_VIEWERS` 名單看。
- **V3、V4 不相加、不去重**，分開顯示。
- **V4 納入規則**：只納入建立時間 ≥ 2026-10-07 20:10:44.122（台北）的記錄；主檔（儀器、車輛）不套用。
- **未定義的口徑不要自己發明**，頁面顯示「—／待定義」並在註腳說明。
- **不要自行更改 Lark Base 權限**（不要改成可管理、不要關閉進階權限），需使用者決定。
- 週次：週一到週日，時區 Asia/Taipei；報表預設「上週」。

## 3. 技術架構

- Next.js 16（App Router，`proxy.ts` 取代 middleware，`output: standalone`）、React 19、TypeScript、Recharts、lucide-react。
- 伺服器端讀 Lark（tenant_access_token），快取在 `globalThis`（stale-while-revalidate），啟動後與每 5 分鐘預熱（`instrumentation.ts` → `lib/warm.ts`）。
- 登入：Lark OAuth（`app/api/auth/*`），HMAC 簽章 cookie（`lib/session.ts`），`proxy.ts` 擋未登入（`/api/health` 例外）。

| 檔案 | 用途 |
|---|---|
| `lib/reports.ts` | 所有資料來源（Base／表／欄位）與 R01–R10 定義 |
| `lib/lark.ts` | Lark API、快取、分頁、關聯欄位轉標題、`findFields` 診斷 |
| `lib/controlGroup.ts` | R01／R02 口徑：失誤率、預排點數、出錯（被修改）、違反 SOP、內業成本單 join |
| `lib/sopStore.ts` / `app/api/sop` | SOP 勾選存檔（`DATA_DIR/sop.json` + `sop-log.jsonl`） |
| `lib/roles.ts` | `sopPermission`（預設所有登入者可勾）、`hrPermission`（`HR_VIEWERS`） |
| `app/api/sources/[key]` | 讀單一來源；`fields=` 投影（`x*` 前綴、`~x` 包含、`@dates`）、`only=meta|dates`、`demo=1` |
| `app/api/health` | 版本、硬碟、各來源預熱結果、含「SOP」欄位的位置 |
| `components/GroupBoard.tsx` | R01／R02 看板：簡表、詳細、單組單週、每日出錯、失誤率明細、SOP |
| `components/OwnerProgress.tsx` | R02 業主進度（進度 % 先只顯示「待定義」） |
| `components/HrBoard.tsx` | R04 人事：招聘暫無、出勤／出差待權限、加班取自薪水總表 |
| `lib/demo.ts` | 示範資料（右下角「示範資料」開關） |
| `lib/version.ts` | `APP_VERSION`，每次改版都要更新，用來確認部署是否生效 |
| `scripts/inspect-lark.mjs` | 唯讀列出 Base 的表、欄位與筆數 |

## 4. 環境變數

| 變數 | 必填 | 說明 |
|---|---|---|
| `LARK_APP_ID` / `LARK_APP_SECRET` | 是 | PM週報 應用憑證 |
| `LARK_API_BASE` | 否 | 預設 `https://open.larksuite.com` |
| `APP_URL` | 建議 | `https://pmsolution.zeabur.app`（OAuth 回呼） |
| `LARK_TENANT_KEY` | 否 | 限定組織登入 |
| `SESSION_SECRET` | 否 | 未設定由 App Secret 衍生 |
| `DATA_DIR` | 是 | `/app/data`，並在 Zeabur 掛載硬碟到 `/app/data`；未設定時 health 顯示 `dataDirSet:false` |
| `SOP_EDITORS` | 否 | 留空＝所有登入者可勾（使用者決定）；填 open_id 清單可縮小 |
| `HR_VIEWERS` | 是（看人事） | 可看薪水總表加班的 open_id 清單；留空＝沒人能看 |
| `CACHE_TTL_SECONDS` | 否 | 預設 60 |
| `WARM_INTERVAL_SECONDS` | 否 | 預設 300 |
| `AUTH_DISABLED` | 只限本機 | `1` 時免登入、SOP 可勾，**不可在 Zeabur 設定** |

## 5. 本機開發與驗證

```bash
npm ci
cp .env.example .env.local   # 填入 LARK_APP_ID / LARK_APP_SECRET（不要提交）
AUTH_DISABLED=1 DATA_DIR=./data npm run dev     # http://localhost:3000
npm run typecheck && npm run build              # 推送前必跑
node --env-file=.env.local scripts/inspect-lark.mjs [baseToken]   # 看表與欄位
```

沒有 Lark 憑證時打開右下角「示範資料」即可看畫面。

## 6. 部署與上線確認

1. 改版時更新 `lib/version.ts` 的 `APP_VERSION`。
2. 跑 `npm run typecheck && npm run build`，commit，push 到 `claude/wonderful-feynman-ndrpha`。
3. Zeabur 重新部署服務 `settings`（網頁或 Zeabur CLI 皆可），等 Running。
4. 打開 `/api/health` 確認：`version` 是新版、`storage.dataDirSet` 為 `true`、`warm.sources` 各來源 `ok`。
5. Dockerfile 若有改，要同步貼到 Zeabur 服務設定的 Dockerfile 欄位（Git URL 部署不會自動讀 repo 裡的 Dockerfile）。

## 7. Lark 資料來源現況

| Base | Token | 狀態 |
|---|---|---|
| 詠翔日報系統 V3 | `Sdw1bG1djaHsVGsRPvmjyVWipgg` | 可讀 |
| 詠翔日報系統 V4 | `H7W6b0PFWaVF1BsgqXJj3pQ9pXb` | 1254302：進階權限「僅自訂角色可存取」，應用不在任何角色 |
| 報價 | `JoOqbggsVar0ATsVgbcjh6IIp1g` | 1254302，同上 |
| 薪水總表 | `VwAsbezz9app3YsramgjduLYp2U` | 新接入；需把 PM週報 應用加入（只給可閱讀），表名以 `/薪水總表|薪資總表|薪水|薪資/` 自動尋找 |

1254302 的處理方向：角色無法直接指派給應用，可建立一個群組、把 PM週報 機器人加入群組，再把群組指派到唯讀角色（需使用者同意）。

各表 table ID 見 `lib/reports.ts` 與 `README.md`。

## 8. 已確認的報表口徑

**R01 控制組（只看外業）**
- 每組上週：營業額點數（原值）、預排點數與差異、失誤率、異常、工作項目／編號／數量、SOP。
- 失誤率＝控制組檢核「不通過」÷ 已檢核（未檢核不計）。
- 預排點數＝預排表（業別不是內業）點數；未填以每組每天 1 點計。
- 出錯（被修改）＝`修改後數量` ≠ `完成數量`，或 `最終營業額點數`（若有 `修改後營業額` 優先）≠ `營業額點數`；兩邊都有值才比較。
- SOP：日報有「是否違反SOP」欄位就用它（任一違反＝紅、全部填且無違反＝綠「SOP 完成」）；沒有欄位才用網站勾選，所有登入者可勾。
- 版面：預設「簡表」（老闆偏好：一組一列純數字、合計列、右側總數），可切「詳細」；點組別看單組單週；每日出錯表；點失誤率卡片看哪組、哪位出工人。

**R02 內業檢查**：同 R01 六項＋業主進度；失誤率用「雅雯檢核」；預排取業別＝內業；組別與工作日期由「所屬成本單」帶入；只顯示所選週；進度 % 先不算，只顯示；天數＝距交期天數（交期欄位未定位）。

**R04 人事**：招聘暫無；出勤、出差需開通 Lark 假勤／審批權限；加班取自薪水總表（以月為單位）。

## 9. 待辦

- [ ] 部署 `2026-10-13.9 sheet+sop-field`，看 `/api/health` 的 `sopFields` 找出「是否違反SOP」在哪張表，必要時調整 `resolveWorkFields` 的 `sopViolation`。
- [ ] Zeabur 設定 `DATA_DIR=/app/data` 並掛載硬碟。
- [ ] 薪水總表：把 PM週報 應用加入 Base（唯讀），確認表名與加班欄位名；設定 `HR_VIEWERS`。
- [ ] V4 與報價 Base 的 1254302 權限。
- [ ] 用真實 V3 資料驗收 R01（兩組對 Lark 原表）；確認 V3 外業工作單是否有 `修改後數量`。
- [ ] R02 交期欄位位置；進度 % 口徑（使用者之後說明）。
- [ ] 圖文說明書補 R01／R02／R04。
