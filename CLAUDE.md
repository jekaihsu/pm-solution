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
| `lib/people.ts` | 公司組織架構＝V3 人員名單（`tblmlpA6nG5Ou7NQ`）的純函式：`personRefs`（Lark 人員欄 → {open_id, 名字}）、`buildPeopleDirectory`（加班人 → 所屬組別） |
| `app/api/sources/[key]` | 讀單一來源；`fields=` 投影（`x*` 前綴、`~x` 包含、`#fld…` 依 field id、`@dates`）、`only=meta|dates`、`links=1`（附 link 欄的 record_id，預設不回）、`people=1`（附人員欄的 open_id，預設不回，且只有 `restricted:"hr"` 的來源才給）、`demo=1` |
| `app/api/health` | 版本、硬碟、各來源預熱結果、含「SOP」欄位的位置 |
| `components/GroupBoard.tsx` | R01／R02 看板：簡表、詳細、單組單週、每日出錯、失誤率明細、SOP |
| `components/OwnerProgress.tsx` | R02 業主進度（進度 % 先只顯示「待定義」） |
| `lib/adminBoard.ts` | R11 行政口徑（純函式）：成本單帶人與日期、預排以人員 record_id＋日期展開、與預排差異分區 |
| `components/AdminBoard.tsx` | R11 行政看板：一列一人（全部人）、合計列、點人展開工作單明細 |
| `scripts/test-admin-board.mjs` | R11 邏輯測試（`node --test`，不連 Lark） |
| `components/HrBoard.tsx` | R04 人事：招聘暫無、出勤／出差待權限、加班取自詠翔加班（純函式在 `lib/overtime.ts`，組別來自 `lib/people.ts`） |
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
node --test scripts/test-control-group.mjs scripts/test-r02-people.mjs   # R01／R02 邏輯測試（不連 Lark）
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
- 其餘：進度 % 先不算，只顯示；天數＝距交期天數（交期欄位未定位）。上週（2026-10-05～10-11）實測以人拆開後各組加總＝以組計算（控制 86 張／已檢核 61／營業額 28.25／被修改 19；圖報A 8／5／2.94／1；圖報B 2／2／1／1）。測試：`node --test scripts/test-r02-people.mjs`。

**R07 儀器車輛管理詳情**（`components/EquipmentBoard.tsx`，純函式在 `lib/equipment.ts`，測試 `scripts/test-equipment.mjs`）：五塊來自「儀器管理系統」Base（與 V3／V4 的儀器費率、車輛分開，不相加、不去重），另保留檢查與校驗兩塊。
- 儀器總表（`equipment-system`，138 筆）＝借用台帳：狀態是借用狀態（可借用／已借出）、`rent_type` 月租型／日租型、`系統封存` 勾選＝已下架，不列入清單與數量。
- 資料表（`equipment-rates`，144 筆）＝費率清單：日租金、啟用、狀態（正常／送修-損壞／出險）。可用＝啟用且狀態不含送修／損壞／故障／出險／停用／報廢；送修／出險數取自本表。兩份清單名稱格式不同、無共同鍵，**不去重、不相加**。
- 車輛（`equipment-vehicles`）：`next_maintenance` 保養到期、`insurance_date` 保險到期；以台北日曆日計，已過＝紅、30 天內（含當天、含第 30 天）＝黃，沒填＝「無資料」；系統封存的車不列；不推算里程保養。
- 預約與歸還（`equipment-bookings`／`equipment-returns`）：只算審批狀態「已通过」；借出依「借出日期」、歸還依「歸還日期」落在所選週；「已撤回」另計、不計入借出歸還。**借出未歸還＝待定義**（歸還單的「借出儀器/車輛」是顯示文字、歸還單的 ID／車牌全空，與預約單沒有明確對應鍵，不猜）。預約／歸還來源不讀申請人、處理人欄位（`allowField`）。
- 月租儀器／車輛檢查（`equipment-inspection`）、TAF／自校驗（`equipment-calibration`）：新 Base 沒有對應表，維持「尚未定位」。

**R11 行政數據**（`components/AdminBoard.tsx`、`lib/adminBoard.ts`；業主裁示 2026-10-13）
- 一列一個人＝行政成本單（V3 `tbliyB0wgDhgUQbA`）的「填表人」，加合計列。工作單（V3 `tbl2c5CLgwPZ3Pl2`）沒有日期與人員，經「所屬成本單」帶入：先用 link record_id，其次成本單「工作單列」對工作單號，成本單標題只在唯一時備援（標題常重複）。
- 欄位：工作單張數、出勤天數（所選週該人成本單的不重複日期）、營業額點數（最終營業額點數合計）、預排點數、與預排差異、⚠異常張數、加班時數；點人展開該週工作單明細（日期、單號、行政工項、件數、點數、異常、備註）。工項標準點數空白照實顯示。
- 預排取業別＝行政；比對主鍵＝人員 record_id＋日期（組別不參與）；日期一律用 field id（真起日 `fldMXOggGP`、真訖日 `fldjWv1xST`），不照欄名。人員欄可多人，一條對每人展開。點數：有填就用（按起訖天數平均分攤，多人時各自全額）；沒填則每人每天 1 點，同人同日多條只算一次、該人該日已有填點數的條就不再補。
- 與預排差異比照 R01/R02：主表列全部人，沒預排的人預排「未排」、差異「—」；合計的工作單、營業額含全部人，差異只算有預排的人並標「只算有預排的 n 人」。
- 失誤率／已檢核／不通過：行政沒有檢核欄，**待定義、看板不顯示**。
- link 的 record_id：`getSourceData` 另存 `record.links`（欄名→ids），`/api/sources/...?links=1` 才回傳且只含被投影的欄位；其他報表不帶此參數，回應與以前相同。
- V4 行政表以表名自動找（V4 應用目前讀不到 1254302），頁面顯示失敗原因；V3、V4 不相加。

**R04 人事**：招聘暫無；出勤、出差需開通 Lark 假勤／審批權限；加班取自薪水計算 Base 的「詠翔加班」逐筆審批單（`lib/overtime.ts`，測試 `scripts/test-hr-overtime.mjs`）：只計申請狀態「已通过」（不信 approved 旗標），依「開始時間」台北月份彙總；時數＝「薪資計算加班時數」（原始＋人工補正，缺時用原始時數）；每人平日（類型＝平日）／假日（休息日、例假日、國定假日）分開，類型空白另列待定義；**組別依公司組織架構（業主裁示 2026-10-13「加班的各組直接參考組織架構」）**＝V3 人員名單（`v3-people`，`tblmlpA6nG5Ou7NQ`，`restricted:"hr"`，白名單只讀 `姓名` 文字／`Lark帳號` 人員欄／`所屬組別` 單選／`在職` 核取；職級、備註、各種成本單連結、`同步_OpenID` 等一律不讀）的「所屬組別」：加班人（人員欄，多值）的 open_id → 人員名單「Lark帳號」open_id → 所屬組別；對不到 open_id 時以姓名完全相同備援；同名多列時有在職就只看在職，組別仍不唯一就不猜；仍對不到歸「未對應組別」（排最後，註腳列張數）。名單沒填所屬組別的人視同對不到。離職者的過去加班仍歸他名單上的組別。加班人填多位的單整張算一列、時數不拆分，全部同組才歸該組，否則歸未對應組別（註腳列張數）。人員名單讀不到時組別顯示「—」並提示，不亂歸。不再讀「发起人部门」。`同步_OpenID` 與 `Lark帳號` 的 id 不同（另一個應用的 open_id），不能用。金額、薪資、身分等欄一律不讀。

## 9. 待辦（依順序）

做事方式：可以直接用 Zeabur、Lark、瀏覽器查證；**要改權限、開通新應用權限、讀新的個資範圍，一律先問使用者**。要改程式就照第 6 節的流程（更新 `APP_VERSION` → typecheck → build → 推送 → 部署 → `/api/health` 確認）。

1. **部署與硬碟**：Zeabur 服務 `settings` 設 `DATA_DIR=/app/data`、掛載 `/app/data` 硬碟；部署最新版，確認 `/api/health` 的 `version`＝`lib/version.ts`、`storage.dataDirSet`＝true。
2. **是否違反SOP 欄位**：看 `/api/health` 的 `sopFields` 找出欄位所在的 Base／表／名稱。若不在外業工作單（例如在成本單，一組一天一筆），改 `lib/controlGroup.ts` 的 `sopViolation` 與 `GroupBoard` 讓它依「組別＋日期」套到工作單上。
3. **V3 外業工作單欄位**（`tbl97f1uXqi7Qz0k`）：確認「修改後數量」「修改後營業額」「備註」「控制組檢核」選項、組別欄位類型。名稱不同就改 `resolveWorkFields`／`resolveFixFields`。控制組頁面出現過記錄 ID：若組別是關聯欄位且標題沒轉成功，修 `lib/lark.ts` 的 `resolveLinks`。
4. **工作單聊天串留言**：跑 `scripts/probe-comments.mjs`（唯讀，只印結構）。
   - 需要新權限 → 問使用者。
   - 可讀且能對應記錄 → `lib/lark.ts` 加讀取與快取、`OrderDetail` 加「留言」欄。
   - 無法對應記錄 → 回報，替代方案是寫在「備註」欄（已顯示）。
5. **薪水計算 Base 的詠翔加班**（`VwAsbezz9app3YsramgjduLYp2U`／`tblomH0DXCzXgenE`）：等業主建好 PM週報 唯讀角色後確認能讀；必要時調整 `salaryField()`（只能更嚴，不能放寬到薪資金額）；`HR_VIEWERS=*`（業主 2026-10-13 裁示全員可看，Zeabur 設定）。表一讀得到，第一件事：實測「加班人」確實是人員欄、且 id 對得上人員名單的 Lark帳號（目前只依 B4 舊設定檔 `config/source_contract.json` 推斷＝人員欄、可多人，未實測），並看 R04 註腳的「未對應組別」張數合不合理。
6. **V4 與報價 Base（1254302）**：盤點進階權限與角色，提出開通方案（群組＋唯讀角色）給使用者決定，不要自行修改。
7. **R02 交期欄位**：找出案件交期所在的表與欄位，接到 `components/OwnerProgress.tsx` 的「距交期（天）」。進度 % 口徑等使用者說明，先維持「待定義」。
8. **真實資料驗收 R01**（V3、上週）：挑兩組對 Lark 原表核對營業額點數、不通過、異常、被修改、張數；檢查註腳「不列入：…」是否合理（只應排除行政、業務、內業、IT、未對應組別）。對不上就修並附組別、工作單號。
9. **手機版檢查**：用瀏覽器 390px 寬看 R01、R02、R04，不能有水平捲動整頁。
10. **出勤、出差**：需要 Lark 假勤／審批權限與可看名單，等使用者決定。
12. **R07 儀器管理系統**：向使用者要「儀器管理系統」的 Base 連結（或看 `/api/health` 的 `equipmentFields` 找含 TAF／校正／校驗／點檢／月租 的表），在 `lib/reports.ts` 填入 `equipment-system`、`equipment-inspection`、`equipment-calibration` 的 `baseToken` 與 `tableId`；欄位名稱不同就改 `EquipmentBoard.tsx` 的候選名稱。PM週報 應用需能讀該 Base（權限先問使用者）。確認檢查頻率（每週或每月）與自校驗週期。
11. ~~圖文說明書~~：已補 R01／R02／R04 與最上方操作動畫（2026-10-13）。之後功能有改，請同步更新說明書截圖。
