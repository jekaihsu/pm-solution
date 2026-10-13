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
| 圖文說明書 | https://claude.ai/artifact/PsfLBoQjPkdmkeSTqczg9F （含 R01／R02／R04 與操作動畫） |

## 2. 硬規則（不可違反）

- **網站唯讀**：只讀 Lark，不寫回 Lark、不發通知。SOP 勾選只存在網站自己的硬碟（`DATA_DIR`）。
- **機密不進 repo、不貼聊天**：`LARK_APP_SECRET`、`SESSION_SECRET` 只放在 Zeabur 環境變數或本機 `.env.local`（已被 git 忽略）。
- **薪水總表只讀加班欄位**：`lib/reports.ts` 的 `salaryField()` 白名單，Lark 請求帶 `field_names`，底薪、總薪資、加班費、扣款、身分資料一律不讀。不要放寬。人事資料只給 `HR_VIEWERS` 名單看；業主 2026-10-13 裁示全員可看，Zeabur 設 `HR_VIEWERS=*`。
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
| `lib/roles.ts` | `sopPermission`（預設所有登入者可勾）、`hrPermission`（`HR_VIEWERS`：`*`＝所有登入者、open_id 清單、留空＝沒人；測試 `scripts/test-roles.mjs`） |
| `lib/people.ts` | 公司組織架構＝V3 人員名單（`tblmlpA6nG5Ou7NQ`）的純函式：`personRefs`（Lark 人員欄 → {open_id, 名字}）、`buildPeopleDirectory`（發起人／加班人 → 所屬組別） |
| `app/api/sources/[key]` | 讀單一來源；`fields=` 投影（`x*` 前綴、`~x` 包含、`#fld…` 依 field id、`@dates`）、`only=meta|dates`、`links=1`（附 link 欄的 record_id，預設不回）、`people=1`（附人員欄的 open_id，預設不回，且只有 `restricted:"hr"` 的來源才給）、`demo=1` |
| `app/api/health` | 版本、硬碟、各來源預熱結果、含「SOP」欄位的位置 |
| `components/GroupBoard.tsx` | R01／R02 看板：簡表、詳細、單組單週、每日出錯、失誤率明細、SOP |
| `components/OwnerProgress.tsx` | R02 業主進度（進度 % 先只顯示「待定義」） |
| `lib/adminBoard.ts` | R11 行政口徑（純函式）：成本單帶人與日期、預排以人員 record_id＋日期展開、與預排差異分區 |
| `components/AdminBoard.tsx` | R11 行政看板：一列一人（全部人）、合計列、點人展開工作單明細 |
| `scripts/test-admin-board.mjs` | R11 邏輯測試（`node --test`，不連 Lark） |
| `lib/internalReport.ts` | R09 內業報告口徑（純函式）：成本單 record_id 帶人與日期、預排以人員 record_id＋日期展開、人日吻合／有排未填／未排有填、案件結果、異常與人工確認列 |
| `components/InternalReport.tsx` | R09 內業報告頁：人日表、案件表、異常與人工確認表、待定義區塊（讀 `v3-internal-work`／`v3-internal-cost`／`v3-schedule`／`v3-cases`） |
| `scripts/test-internal-report.mjs` | R09 邏輯測試（`node --test`，不連 Lark） |
| `lib/fieldReport.ts` | R10 外業報告口徑（純函式，不 import 其他 lib 檔）：組日×案件的預排 vs 實際、異常與人工確認、檢核待辦 |
| `components/FieldReport.tsx` | R10 外業經理專用頁：預排 vs 實際（以案件為單位）、異常與人工確認案件、檢核待辦、待定義區塊 |
| `scripts/test-field-report.mjs` | R10 邏輯測試（`node --test`，不連 Lark；含與 R01 口徑的走樣對照） |
| `lib/attendanceCore.ts` / `lib/attendance.ts` | R04 出勤／出差：純函式（狀態判定、成員、週摘要、出差清單、白名單輸出）／Lark 假勤抓取與記憶體快取（server-only） |
| `app/api/attendance` | 出勤／出差 API（`week=`、`demo=1`、`refresh=1`），經 `hrPermission`，只回白名單欄位；權限未開回 `{status:"needs-permission",missing,hint}` |
| `components/AttendanceCards.tsx` / `scripts/test-attendance.mjs` | 出勤卡＋出差卡／口徑測試 |
| `components/HrBoard.tsx` | R04 人事：招聘暫無、出勤／出差（`AttendanceCards`）、加班取自詠翔加班（頂部三張卡、組別總結表、依組分段人員表；純函式在 `lib/overtime.ts`，組別來自 `lib/people.ts`） |
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
| `HR_VIEWERS` | 是（看人事） | 誰能看人事頁（R04）：`*`＝所有登入者都能看（業主 2026-10-13 裁示，Zeabur 設 `HR_VIEWERS=*`）；open_id 清單（逗號或空白分隔）＝只有名單內的人；留空／未設定＝沒人能看（安全預設，不要改成預設全開） |
| `CACHE_TTL_SECONDS` | 否 | 預設 60 |
| `WARM_INTERVAL_SECONDS` | 否 | 預設 300 |
| `AUTH_DISABLED` | 只限本機 | `1` 時免登入、SOP 可勾，**不可在 Zeabur 設定** |

## 5. 本機開發與驗證

```bash
npm ci
cp .env.example .env.local   # 填入 LARK_APP_ID / LARK_APP_SECRET（不要提交）
AUTH_DISABLED=1 DATA_DIR=./data npm run dev     # http://localhost:3000
npm run typecheck && npm run build              # 推送前必跑
node --test scripts/test-*.mjs   # 全部邏輯測試（不連 Lark）：R01／R02、R04、R07、R09、R10、R11
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
| 薪水計算 | `VwAsbezz9app3YsramgjduLYp2U` | 只讀「詠翔加班」`tblomH0DXCzXgenE`（逐筆加班審批單，`salary-overtime`，直接指定 tableId，不再用表名找）。**需 PM週報 在該 Base 有只開「詠翔加班」的唯讀角色**（業主於 Lark UI 建立，未完成前讀不到）；其他表（含「每月薪水結算」）不讀。欄位白名單見 `salaryField()` |
| 儀器管理系統 | `YHqcbb8MHa4VdGsA0UnjajNDpgd` | 可讀（2026-10-13 業主提供；已開進階權限，但 PM週報 應用實測可讀全部 5 張表）。R07 來源 `equipment-system`／`equipment-rates`／`equipment-vehicles`／`equipment-bookings`／`equipment-returns` |

1254302 的處理方向：角色無法直接指派給應用，可建立一個群組、把 PM週報 機器人加入群組，再把群組指派到唯讀角色（需使用者同意）。

各表 table ID 見 `lib/reports.ts` 與 `README.md`。

## 8. 已確認的報表口徑

**R01 控制組（只看外業）**
- 組別只列外業組：不列「行政」「業務」「內業」「IT／資訊」與未轉成名稱的記錄 ID（`BOARDS.r01.keepGroup`），註腳列出被排除的組別與張數。
- 每組上週：營業額點數（原值）、預排點數與差異、失誤率、異常、工作項目／編號／數量、SOP。
- 失誤率＝控制組檢核「不通過」÷ 已檢核（未檢核不計）。
- 預排點數＝預排表（業別＝外業）點數；未填以每組每天 1 點計。預排日期與點數欄依 field id（真起日 `fldMXOggGP`、真訖日 `fldjWv1xST`、預估營業額點數 `fld5lTSN1r`），找不到 id 才退回欄名（`resolveScheduleFields`，與 R02 共用 `SCHEDULE_FIDS`）。預排組名結尾的「組」比對時去掉（預排「水深A組」＝工作單「水深A」，`groupKey`）。
- 出錯（被修改）＝`修改後數量` ≠ `完成數量`，或 `最終營業額點數`（若有 `修改後營業額` 優先）≠ `營業額點數`；兩邊都有值才比較。
- SOP：日報有「是否違反SOP」欄位就用它（任一違反＝紅、全部填且無違反＝綠「SOP 完成」）；沒有欄位才用網站勾選，所有登入者可勾。
- 備註：工作單明細與失誤明細顯示「備註／留言／退回原因／覆寫原因／重工原因」欄位。
- 第四張卡片＝違反 SOP 次數（原「異常工作單」），點開列出違反的工作單。
- 拆組出工：所選週內同一組別、同一工作日期，工作單所屬外業成本單（V3 `tblQCy3eU0wsUj1I`）的「組長」有 ≥2 個不同的人 → 該組拆組，簡表／詳細保留「組別合計」列並加子列「{組別}・{組長}組」（組長空白歸「未填組長」）；預排點數只掛合計列、子列顯示「—」；子列不重複計入合計；同組長多張單不算拆組；讀不到成本單（如 V4 1254302）就不拆。邏輯在 `splitCrews`。
- 主表列出全部組（簡表／詳細、桌機／手機皆同，不再有「沒有預排的組」收合區）；沒預排的組預排點數顯示「未排」、差異「—」。合計列的工作單、已檢核、不通過、失誤率、被修改、營業額＝全部組；預排點數只加有預排的組；與預排差異＝Σ(營業額−預排) 只算有預排的組，並標「只算有預排的 n 組」。頁首卡片含全部；拆組子列跟著所屬組走。排程表讀不到時差異不顯示。邏輯在 `planDiffTotals`。
- ROV 組是外業（業主裁示 2026-10-13）：預排列組別為 ROV（`groupKey`、大小寫不拘）一律計入 R01、不計入 R02，不管業別欄；其他組照舊用業別（`keepFieldSchedule`／`keepInternalSchedule`）。
- 版面：預設「簡表」（老闆偏好：一組一列純數字、合計列、右側總數），可切「詳細」；點組別看單組單週；每日出錯表；點失誤率卡片看哪組、哪位出工人。

**R02 內業檢查（以人為單位，業主裁示 2026-10-13）**：外業以組別排、填；內業一人填一張，仍分組別，但以人為單位計算。R01 維持以組為單位（兩者共用 `GroupBoard`，用 `BOARDS.r02.unit="person"` 區分）。
- 一列一個人＝內業成本單（V3 `tbl8JdWLLwlPFuoF`）的「填報人」（link→人員名單 `tblmlpA6nG5Ou7NQ`），依成本單的「內業組別」分段：每組一列小計，下面是該組的人；整體合計列照舊。同一人一週內在不同內業組別填單，每組各一列（工作單依成本單歸屬，不重複計）。工作單經 `joinInternal` 帶入工作日期、內業組別、填報人。
- 每人欄位同 R01（工作單、已檢核、不通過、失誤率、被修改、違反 SOP、營業額點數、預排點數、與預排差異）；點人看該人該週工作單；每日出錯表一人一列。失誤率仍用「雅雯檢核」（目前沒有不通過來源，口徑業主未定，不另發明）。
- 預排以「人員 record_id ＋ 日期」比對，組別不參與 join（`plannedByPerson`）。預排「人員」欄 `fld7KNCsVe` 可多人，逐人展開；有填「預估營業額點數」`fld5lTSN1r` 就平均分攤到每天（每位被排的人各得一份），沒填的每人每天 1 點（同人同日多條只算一次）；條類型＝休假不算。業別取內業，ROV 一律算外業（`keepInternalSchedule`）。**預排日期一律用欄位 id**：真起日 `fldMXOggGP`、真訖日 `fldjWv1xST`（欄名曾被 UI 改反），V3 找不到 id 才退回欄名（V4 表 id 不同）。
- 預排點數掛在「那天他填報的內業組別」；那天沒填成本單就掛他張數最多的組；整週沒有工作單才用預排上的組別（只用來決定顯示位置）。
- 主表列出全部人（不分區）；沒預排的人預排「未排」、差異「—」。組小計與合計的工作單、營業額等含全部人（`teamSections`／`sumRows`）；與預排差異只算有預排的人並標「只算有預排的 n 人」（`planDiffTotals`）；人員下拉同名跨組時顯示「名字・組別」。
- record_id 保留：`lib/lark.ts` 讀表時 link 欄的 record_id 另存在 `TableData.records[].links[欄名]`（與 `fields` 內標題文字 index 對齊），`/api/sources` 投影時一併帶出；`fields` 的行為不變，其他報表不受影響。
- 組別總結（業主要求 2026-10-13）：R02 人員表上方有「組別總結」表，每個內業組別一列（控制、圖報A、圖報B、經理…依實際出現），再加「圖報合計（報告）」＝圖報A＋圖報B（兩者至少一個存在才有），最後「全部合計」；欄位同人員表加「人數」。人數同一人跨組只算一次（圖報合計、全部合計去重），工作單、點數等直接加總；與預排差異只算有預排的人（標「只算有預排的 n 人」，n 也去重）。上方組別按鈕（全部、各組、圖報合計）或點總結列＝篩組別：人員表、每日出錯、失誤率明細、頁首卡片只看該組的人（圖報合計＝A＋B），網址 `?team=控制`／`?team=圖報合計` 可分享（人員 `?group=` 照舊）；人員下拉只列該組的人。邏輯在 `teamSummary`／`filterByTeam`（`lib/controlGroup.ts`）。人員表尾列「合計（全部 n 人）」的 n 也改為去重人數。
- 其餘：進度 % 先不算，只顯示；天數＝距交期天數（交期欄位未定位）。上週（2026-10-05～10-11）實測以人拆開後各組加總＝以組計算（控制 86 張／已檢核 61／營業額 28.25／被修改 19；圖報A 8／5／2.94／1；圖報B 2／2／1／1）。測試：`node --test scripts/test-r02-people.mjs`。

**R09 內業報告**（`components/InternalReport.tsx`、`lib/internalReport.ts`；業主裁示 2026-10-13，測試 `scripts/test-internal-report.mjs`）：內業經理看上週「預排及實際完成檢討」，只做不需要新口徑的部分。
- 內業**以人為單位**；人員一律用人員名單 record_id。**實際人日**＝所選週內內業成本單（V3 `tbl8JdWLLwlPFuoF`）的不重複（填報人，工作日期）——沒有工作單的成本單也算；**預排人日**＝工作預排（業別含「內業」、ROV 一律算外業排除、條類型＝休假不算）「人員」欄（可多人）逐人展開後的不重複（人員，日期），同人同日多條只算 1。比對主鍵＝人員 record_id＋日期，**組別不參與 join**，只顯示成本單的「內業組別」（同週在兩個組別填單的人一人一列，名字後接「・控制／圖報A」，組別欄顯示「跨組」）。預排日期一律用 field id（`fldMXOggGP`／`fldjWv1xST`）。
- 吻合＝預排與實際都有的（人，日）；有排未填＝預排了沒成本單；未排有填＝有成本單沒預排；**人日達成率＝吻合 ÷ 預排人日**（人日口徑，不混用營業額或案件）。上週（2026-10-05～10-11）實測：預排 34 人日（9 人）、實際 42 人日（12 人）、吻合 32、有排未填 2、未排有填 10、達成率 94.1%。
- 內業工作單（`tblTP5Naz52FBpFg`）沒有組別與日期，經「所屬成本單」link 的 **record_id** 接成本單（成本單單號有 9 組重複，不用單號文字；link 完全讀不到〔示範資料〕才用唯一標題備援，標題不唯一不猜）；成本單對不到才用工作單自己的「工作日期-營業額明細」備援日期。週篩選的來源設定 `v3-internal-work.dateField = "工作日期-營業額明細"`（原本預設「填報時間」會把補填的單排除：上週 84 張，應為 96 張／32.185 點）。
- 案件表：以**案件記錄 record_id** 為單位（案件編號＝案件表主欄，工程名稱＝案件名稱，來源 `v3-cases`＝`tblWsSaOcy4nKuGI` 不套視圖，頁面只投影這兩欄）。「工程編號是否取案件編號前 7 碼」業主未回覆，先不裁。結果：有排有做／有排未做／未排有做（只看案件有沒有工作單，不看人與日）。預排或工作單沒填案件的不列入案件比對，只在註腳計數。同人同日排／做多案時各案各算 1 天，所以案件人日合計可大於人日。
- 「上週異常與人工確認案件」：未排有填、有排未填的人日，加上 ⚠組別權重=0／⚠案件不符／⚠工項不符亮燈與檢核狀態＝已退回的工作單（其他 ⚠ 欄不列）。同人同案同類別、日曆連續的日期合併成 起～迄；「說明」顯示工作單備註原文（有排未填顯示預排備註）。檢核說明要在 Lark 填寫，網站唯讀。
- **待定義（不算）**：圖資／報告節點期限（n+2、N+2、N+1）、節點狀態（未逾期／預計逾期／已逾期／無工作）、確認單營業額與執行比例——口徑待業主說明，確認單營業額來源為工程確認單，V4／報價 Base 尚未開放讀取，頁面只留標示區塊。
- 敏感欄位：成本單只向伺服器要 單號、工作日期、填報人、內業組別（組別）；出工成本、人力成本、方案日成本、加班費、雜支金額一律不要、不顯示（測試會檢查輸出不含這些字）。V4 讀不到時顯示原因、不報錯；V3、V4 不相加。

**R07 儀器車輛管理詳情**（`components/EquipmentBoard.tsx`，純函式在 `lib/equipment.ts`，測試 `scripts/test-equipment.mjs`）：五塊來自「儀器管理系統」Base（與 V3／V4 的儀器費率、車輛分開，不相加、不去重），另保留檢查與校驗兩塊。
- 儀器總表（`equipment-system`，138 筆）＝借用台帳：狀態是借用狀態（可借用／已借出）、`rent_type` 月租型／日租型、`系統封存` 勾選＝已下架，不列入清單與數量。
- 資料表（`equipment-rates`，144 筆）＝費率清單：日租金、啟用、狀態（正常／送修-損壞／出險）。可用＝啟用且狀態不含送修／損壞／故障／出險／停用／報廢；送修／出險數取自本表。兩份清單名稱格式不同、無共同鍵，**不去重、不相加**。
- 車輛（`equipment-vehicles`）：`next_maintenance` 保養到期、`insurance_date` 保險到期；以台北日曆日計，已過＝紅、30 天內（含當天、含第 30 天）＝黃，沒填＝「無資料」；系統封存的車不列；不推算里程保養。
- 預約與歸還（`equipment-bookings`／`equipment-returns`）：只算審批狀態「已通过」；借出依「借出日期」、歸還依「歸還日期」落在所選週；「已撤回」另計、不計入借出歸還。**借出未歸還＝待定義**（歸還單的「借出儀器/車輛」是顯示文字、歸還單的 ID／車牌全空，與預約單沒有明確對應鍵，不猜）。預約／歸還來源不讀申請人、處理人欄位（`allowField`）。
- 月租儀器／車輛檢查（`equipment-inspection`）、TAF／自校驗（`equipment-calibration`）：新 Base 沒有對應表，維持「尚未定位」。

**R10 外業報告（外業經理用）**（`components/FieldReport.tsx`、`lib/fieldReport.ts`；業主 2026-10-13 同意先做不需新口徑的兩塊）
- 資料：V3 外業工作單、工作預排、案件表（新來源 `v3-cases`，只取案件編號、案件名稱＝工程簡稱）。V4 讀不到顯示原因、不報錯；V3、V4 不相加。
- 沿用 R01：以「組」為單位；預排只取業別＝外業，ROV 一律算外業；預排組名去尾「組」比對；排除行政／業務／內業／資訊組與未對應組別（`keepFieldGroup`，與 R01 的 `keepGroup` 同規則，測試比對原文防走樣）；週一至週日台北，預設上週。預排日期依 field id（真起日 `fldMXOggGP`、真訖日 `fldjWv1xST`）；條類型＝休假的預排不算。
- **案件比對用 link record_id**，不用案件編號文字（有 7 案編號重複、2 筆全 0 占位碼 `C000000`，列上標「編號重複」，兩筆分開計）。讀不到 record_id（示範資料）才退回用標題文字。
- 組日＝（組別, 日期）。預排 vs 實際：預排組日、命中組日（預排的組日當天該組有出工）、計畫外出工組日（該組該日完全沒預排）、案件交集數（預排案件 ∩ 出工案件）。案件列：預排組日／實際出工組日／吻合組日（同組同日同案）／營業額點數／工作單張數，結果＝有排有做／有排未做／未排有做。預排只填組日沒填案件者（例如 ROV）只算組日、不進案件比對；工作單沒連案件者只算組日。預排日 ≥ 今天不納入（尚未到期不算「沒做」）。預排讀不到時不判「未排有做」，結果顯示「預排讀不到」。
- 異常與人工確認（組×案件，連續日期合併成 起～迄）：未排有做、有排未做；工作單異常＝「突發狀況」有填、檢核狀態 trim 後＝「已退回」（選項結尾有空白）、修改後數量≠完成數量（兩邊都有值才比）。說明顯示工作單「突發狀況」「備註」原文（已退回另顯示「修改意見」）。**檢核說明需在 Lark 填，網站唯讀。**
- 檢核待辦：依組統計外業經理檢核未勾、控制組檢核未勾（兩者是核取方塊，沒勾＝未勾）、已退回張數。
- **待定義（這次不算、頁面留區塊）**：圖資／報告節點期限（N+1／N+2）與節點狀態（未逾期／預計逾期／已逾期／無工作）；工程編號是否合併成案件編號前 7 碼（目前以案件記錄為單位）；進行中工作營業額剩餘。
- 上週（2026-10-05～10-11）實測：工作單 38 張／39.65 點；預排 10 組日、命中 8；實際出工 24 組日、計畫外 16；案件預排 7、出工 16、交集 6。

**R11 行政數據**（`components/AdminBoard.tsx`、`lib/adminBoard.ts`；業主裁示 2026-10-13）
- 一列一個人＝行政成本單（V3 `tbliyB0wgDhgUQbA`）的「填表人」，加合計列。工作單（V3 `tbl2c5CLgwPZ3Pl2`）沒有日期與人員，經「所屬成本單」帶入：先用 link record_id，其次成本單「工作單列」對工作單號，成本單標題只在唯一時備援（標題常重複）。
- 欄位：工作單張數、出勤天數（所選週該人成本單的不重複日期）、營業額點數（最終營業額點數合計）、預排點數、與預排差異、⚠異常張數、加班時數；點人展開該週工作單明細（日期、單號、行政工項、件數、點數、異常、備註）。工項標準點數空白照實顯示。
- 預排取業別＝行政；比對主鍵＝人員 record_id＋日期（組別不參與）；日期一律用 field id（真起日 `fldMXOggGP`、真訖日 `fldjWv1xST`），不照欄名。人員欄可多人，一條對每人展開。點數：有填就用（按起訖天數平均分攤，多人時各自全額）；沒填則每人每天 1 點，同人同日多條只算一次、該人該日已有填點數的條就不再補。
- 與預排差異比照 R01/R02：主表列全部人，沒預排的人預排「未排」、差異「—」；合計的工作單、營業額含全部人，差異只算有預排的人並標「只算有預排的 n 人」。
- 失誤率／已檢核／不通過：行政沒有檢核欄，**待定義、看板不顯示**。
- link 的 record_id：`getSourceData` 另存 `record.links`（欄名→ids），`/api/sources/...?links=1` 才回傳且只含被投影的欄位；其他報表不帶此參數，回應與以前相同。
- V4 行政表以表名自動找（V4 應用目前讀不到 1254302），頁面顯示失敗原因；V3、V4 不相加。

**R04 人事**：招聘暫無；出勤、出差取自 Lark 假勤（PM週報 需 `attendance:task:readonly`、`attendance:rule:readonly`、`contact:contact.base:readonly`、`contact:user.employee_id:readonly`，通訊錄範圍＝全部成員；2026-10-13 已開通）。**以下為預設口徑，待業主確認**：①分母＝考勤組成員（全部考勤組的綁定人員＋展開綁定部門含子部門－排除人員／部門）×應打卡日，外業不打卡不列入；②到班＝Normal／SystemCheck／Late／Early，補卡（CardReplacement／CardReplacementApplication／ManagerModification）救回 Lack，Lack 算缺卡，同日缺卡優先於遲到早退；③先看 supplement 再看 NoNeedCheck：Leave／Travel／GoOut 的日子（NoNeedCheck＋supplement 是常態）與 user_approvals 覆蓋的應打卡日從分母扣除、另列天數（半天也算 1 天），免打卡日（週末）不被審批誤算；審批覆蓋日以起訖區間為準（實測 entry 的 date 會多一天；結束時間為跨日 00:00:00 視為不含該日）；④出差只計已通過，以 approval_id 去重，範圍＝名冊在職且有 Lark帳號的全公司（不限考勤組），顯示姓名、組別、起訖日、天數、本週內天數、事由（截斷 40 字）；⑤在職沒有 Lark帳號者不計、只列人數；⑥週一～週日台北，本週只查到今天，未來日不算缺卡，今天的缺卡顯示「進行中」。員工 id＝名冊 Lark帳號 open_id 經 contact `users/batch` 換 `user_id`（attendance 只吃 employee_id）。輸出白名單：不含 employee_id、open_id、地點、GPS、照片、打卡時間。快取（記憶體）：對照與考勤組 24 小時、本週 5 分鐘、過去週 6 小時，權限未開／失敗只快取 1 分鐘，併發 ≤3。`lib/lark.ts` 的 `larkReadApi` 是唯讀白名單呼叫（要多讀一種 API 須在 `READ_ONLY_CALLS` 明確加一行）。測試 `scripts/test-attendance.mjs`。加班取自薪水計算 Base 的「詠翔加班」逐筆審批單（`lib/overtime.ts`，測試 `scripts/test-hr-overtime.mjs`）。
- **口徑**：只計申請狀態「已通过」（不信 approved 旗標），依「開始時間」台北月份彙總（預設所選週所在月份，可切月）；時數＝「薪資計算加班時數」（原始＋人工補正，缺時用原始時數），顯示到小數 1 位；平日（類型＝平日）／假日（休息日、例假日、國定假日）分開，類型空白另列待定義。被排除的筆數依申請狀態分列在註腳（已撤回、已拒绝、已删除、审批中…）。
- **人＝「發起人」**（2026-10-13 實測：人員欄、繁體「發」，126/126 有填且帶 open_id；「加班人」126/126 全空）：發起人空白才用「加班人」（備援，註腳列張數）。與舊文件 `加班表單README`（依發起人分組、不得改用加班人）和薪水公式（優先發起人、空白才用加班人）一致。白名單 `SALARY_ALLOW`（`lib/reports.ts`）含 `發起人`、`加班人`；簡體的 `发起人部门`、`当前处理人`，以及事由、金額等一律不讀。`發起人` 欄不見時頁面報「缺少必要欄位」，不悄悄全變「—」。
- **組別依公司組織架構（業主裁示 2026-10-13「加班的各組直接參考組織架構」）**＝V3 人員名單（`v3-people`，`tblmlpA6nG5Ou7NQ`，`restricted:"hr"`，白名單只讀 `姓名` 文字／`Lark帳號` 人員欄／`所屬組別` 單選／`在職` 核取；職級、備註、各種成本單連結、`同步_OpenID` 等一律不讀）的「所屬組別」：發起人（`people=1` 取得 open_id）→ 人員名單「Lark帳號」open_id → 所屬組別；對不到 open_id 時以姓名完全相同備援；同名多列時有在職就只看在職，組別仍不唯一就不猜；仍對不到歸「未對應組別」（排最後，註腳列張數）。名單沒填所屬組別的人視同對不到。離職者的過去加班仍歸他名單上的組別。人填多位的單（只可能出現在加班人備援）整張算一列、時數不拆分，全部同組才歸該組，否則歸未對應組別。人員名單讀不到時組別顯示「—」並提示，不亂歸。不讀「发起人部门」。`同步_OpenID` 與 `Lark帳號` 的 id 不同（另一個應用的 open_id），不能用。金額、薪資、身分等欄一律不讀。
- **版面（業主 2026-10-13 原話：「加班那邊我要組別也要名稱，然後還要加幾個小時，可以參考其他 dashboard 的展示方式」；比照 R02／R11）**：① 頂部三張卡：本月加班總時數、加班人數（同一人只算一次）、計入張數，月份按鈕保留。② 組別總結表（`TeamTable`）：每組一列＝組別、人數、平日時數、假日時數、合計時數、張數（有類型空白的單才多一欄「類型待定義」），最後一列「全部合計」，「未對應組別」固定排最後，其餘依合計時數大到小。③ 點組別列或上方組別按鈕＝只看該組的人，網址 `?otTeam=`（避開 R02 的 `?team=`），點「全部合計」列或「全部組別」回全部；卡片與總結表永遠是全月全部。④ 人員表（`PeopleTable`）依組別分段，每段一列組小計（`{組別}小計・n 人`），下面每人一列＝姓名、組別、平日、假日、合計時數、張數，尾列合計。⑤ 表格放 `.cg-sheet`（可橫捲，手機 390px 整頁不橫捲，實測 scrollWidth＝390），格線子元素 `min-width:0`。純函式 `teamSummary`／`teamSections`（人數以 open_id 去重，同名不同 open_id 算兩人）。
- **註腳**：只計「已通过」；被排除筆數（各狀態）；時數空白筆數；平日／假日定義；人與組別依「發起人」對 V3 人員名單所屬組別；未對應組別張數（當月與全部月份）。
- **實測（2026-10-13，PM週報 應用身分，只列數字）**：詠翔加班 126 筆，已通过 111 筆（已撤回 11、已拒绝 2、已删除 1、审批中 1 不計）、計入 456.9 小時、32 人；發起人 open_id 全部對上人員名單「Lark帳號」，**未對應組別 0 張**（人員名單 79 列，有 7 列所屬組別空白，但這些人沒有加班單）。預設月份 2026-10：84.7 小時／11 人／24 張／8 個組別。

## 9. 待辦（依順序）

做事方式：可以直接用 Zeabur、Lark、瀏覽器查證；**要改權限、開通新應用權限、讀新的個資範圍，一律先問使用者**。要改程式就照第 6 節的流程（更新 `APP_VERSION` → typecheck → build → 推送 → 部署 → `/api/health` 確認）。

1. **部署與硬碟**：Zeabur 服務 `settings` 設 `DATA_DIR=/app/data`、掛載 `/app/data` 硬碟；部署最新版，確認 `/api/health` 的 `version`＝`lib/version.ts`、`storage.dataDirSet`＝true。
2. **是否違反SOP 欄位**：看 `/api/health` 的 `sopFields` 找出欄位所在的 Base／表／名稱。若不在外業工作單（例如在成本單，一組一天一筆），改 `lib/controlGroup.ts` 的 `sopViolation` 與 `GroupBoard` 讓它依「組別＋日期」套到工作單上。
3. **V3 外業工作單欄位**（`tbl97f1uXqi7Qz0k`）：確認「修改後數量」「修改後營業額」「備註」「控制組檢核」選項、組別欄位類型。名稱不同就改 `resolveWorkFields`／`resolveFixFields`。控制組頁面出現過記錄 ID：若組別是關聯欄位且標題沒轉成功，修 `lib/lark.ts` 的 `resolveLinks`。
4. **工作單聊天串留言**：跑 `scripts/probe-comments.mjs`（唯讀，只印結構）。
   - 需要新權限 → 問使用者。
   - 可讀且能對應記錄 → `lib/lark.ts` 加讀取與快取、`OrderDetail` 加「留言」欄。
   - 無法對應記錄 → 回報，替代方案是寫在「備註」欄（已顯示）。
5. **薪水計算 Base 的詠翔加班**（`VwAsbezz9app3YsramgjduLYp2U`／`tblomH0DXCzXgenE`）：等業主建好 PM週報 唯讀角色後確認能讀；必要時調整 `salaryField()`（只能更嚴，不能放寬到薪資金額）；`HR_VIEWERS=*`（業主 2026-10-13 裁示全員可看，Zeabur 設定）。~~表一讀得到後實測 id 對應~~：**已完成（2026-10-13）**：表已可讀；「加班人」126/126 全空，改用「發起人」（人員欄、全有填），open_id 全部對上人員名單 Lark帳號，未對應組別 0 張。若日後出現未對應組別偏高，先查發起人 open_id 是否在人員名單「Lark帳號」、所屬組別是否空白。
6. **V4 與報價 Base（1254302）**：盤點進階權限與角色，提出開通方案（群組＋唯讀角色）給使用者決定，不要自行修改。
7. **R02 交期欄位**：找出案件交期所在的表與欄位，接到 `components/OwnerProgress.tsx` 的「距交期（天）」。進度 % 口徑等使用者說明，先維持「待定義」。
8. **真實資料驗收 R01**（V3、上週）：挑兩組對 Lark 原表核對營業額點數、不通過、異常、被修改、張數；檢查註腳「不列入：…」是否合理（只應排除行政、業務、內業、IT、未對應組別）。對不上就修並附組別、工作單號。
9. **手機版檢查**：用瀏覽器 390px 寬看 R01、R02、R04，不能有水平捲動整頁。
10. **出勤、出差**：程式與權限都已就緒（2026-10-13.29），等業主確認預設口徑（見第 8 節 R04）：外業是否納入分母、半天假算法、出差與外出是否都扣分母、今天缺卡的處理。
12. **R07 儀器管理系統**：向使用者要「儀器管理系統」的 Base 連結（或看 `/api/health` 的 `equipmentFields` 找含 TAF／校正／校驗／點檢／月租 的表），在 `lib/reports.ts` 填入 `equipment-system`、`equipment-inspection`、`equipment-calibration` 的 `baseToken` 與 `tableId`；欄位名稱不同就改 `EquipmentBoard.tsx` 的候選名稱。PM週報 應用需能讀該 Base（權限先問使用者）。確認檢查頻率（每週或每月）與自校驗週期。
11. ~~圖文說明書~~：已補 R01／R02／R04 與最上方操作動畫（2026-10-13）。之後功能有改，請同步更新說明書截圖。
