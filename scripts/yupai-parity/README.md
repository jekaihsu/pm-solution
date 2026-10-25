# R04 每日檢查 parity

唯讀比較兩個**既有引擎**，不更改 Dashboard 制度規則：

- Dashboard：記憶體轉譯 `lib/scheduleCheck.ts`，直接呼叫 `parseRoster`、`scheduledPersonIds`、`loggedPersonIds`、`dailyStatus`，組裝方式同 `components/DailyCheck.tsx`。
- Python：以 `python3 -B` 安全 import 指定的 `generate.py`，整段期間只建立一個 `Analysis(start,end,today)`，對其 scope 呼叫 `evaluate`。不執行原 CLI、`analyze_core.py`、main、pull、報告、歷史查詢或文件寫入。Python audit hook 禁止寫檔、subprocess 與網路，子行程另有 timeout／輸出上限。

需要 Node >=20、現有 `typescript` devDependency、Python 3.9+。不新增套件。直接載入 TS 的既有測試需要 Node 22；此工具與其測試支援 Node 20。

## 執行

```bash
# 固定預設：start=10/12、end=today=10/20（2026），含首尾、台北時區。
# 純快取，不執行 lark-cli；缺 Dashboard 快照時預期 exit 2。
npm run yupai:parity

# 使用已有的成本單與假勤快照
npm run yupai:parity -- --dashboard-data-dir /tmp/yupai-dashboard-snapshot

# 完整 JSON；--silent 移除 npm 本身的前言，方便 jq 等直接處理
npm run --silent yupai:parity -- --format json --strict \
  --dashboard-data-dir /tmp/yupai-dashboard-snapshot > /tmp/parity.json

# 明確啟用唯讀補取；路徑必須全新、父目錄已存在，不能位於受保護目錄。
npm run yupai:parity -- --pull --snapshot-dir /tmp/yupai-parity-new

# 可調日期及唯讀 reference/cache 位置
npm run yupai:parity -- --start 2026-10-12 --end 2026-10-20 \
  --today 2026-10-20 --data-dir /workspace/yupai_report/data \
  --reference /workspace/yupai_report/generate.py

node --test scripts/test-yupai-parity.mjs
```

`--help` 不讀快取、不執行 CLI。`--pull` 不登入、不擴權、不建立憑證，不寫 Base／Lark Doc、不發訊息。受保護的 `/workspace/yupai_report`、`/workspace/pm-solution`（含 symlink 解析後路徑）不可作 snapshot。snapshot 建立為 0700，工具所寫檔案為 0600；請放在 repo 外且不要提交真實人事資料。CLI 自身產生的 page artifacts 也只存在該私有目錄。所有 CLI 使用參數陣列，無 shell interpolation。

預設快取缺三張成本單及兩週假勤；這是 **partial 執行驗收**，不能宣稱完整 parity。`--pull` 僅使用現有 `user` 身分，成本單可讀但假勤／通訊錄被拒時仍輸出成本單比較，完整缺漏及請假數保留 unknown。可同時給 `--dashboard-data-dir`，用既有合法快照補上 pull 不可取得的來源。完整驗收需兩週假勤及全部成本單完整，並人工核對只在任一引擎缺漏、待核准假、成本單／工作單差異的來源 ID。

## 資料契約

七個 Python 快取名稱：`roster`、`preschedule_all`、`waiye`、`neiye`、`xingzheng`、`attendance_oct`、`leave_oct`，每個都有 `.ndjson` 及 `.manifest.json`。前五份為全表；後兩份接受既有 `filtered_records` 月份快取，完整性只代表**該指定查詢結果**，不代表所有月份。更換日期範圍時，呼叫者須提供涵蓋該期間的查詢快取，原 Python 仍使用上述固定檔名。不補查薪水 Base。

NDJSON 每列是扁平 `{record_id, 欄名: 原始值}`，不是工作單假冒成本單。manifest 至少有：

```json
{
  "table_id": "tbl8JdWLLwlPFuoF",
  "records_count": 0,
  "has_more": false,
  "timezone": "Asia/Taipei",
  "query_context": {"record_scope": "all_records"},
  "columns": {
    "record_id": {},
    "工作日期": {"field_id": "fldREALDATE", "field_type": "datetime"},
    "填報人": {"field_id": "fldREALPERSON", "field_type": "link"}
  }
}
```

欄位 ID 必須取真實 metadata，不能補造空欄。link 儲存 `[{"id":"rec…"}]`（可帶 name）；adapter 將 ID 放入 `records[].links`，不拿顯示姓名當 record_id。日期接受 epoch ms、帶時區 ISO timestamp、date-only（明確按台北午夜）；無時區 timestamp 或壞日期拒絕。Python 的公式日期序列原封不動交給 `serial_to_date`。

| Dashboard 檔案 | V3 table | 投影欄位 |
|---|---|---|
| `v3-internal-cost.ndjson` | `tbl8JdWLLwlPFuoF` | 工作日期、填報人 |
| `v3-field-cost.ndjson` | `tblQCy3eU0wsUj1I` | 工作日期、組長、實際出工人／舊名組員（存在才取） |
| `v3-admin-cost.ndjson` | `tbliyB0wgDhgUQbA` | 工作日期、填表人 |

每份仍需自己的 manifest。預排復用同一份 `preschedule_all`，真起／訖日依 `fldMXOggGP`／`fldjWv1xST`，即使欄名交換也不改 Dashboard 的判斷。Python 原有按欄名的行為照舊。

假勤優先使用 `daily-2026-10-12.json`、`daily-2026-10-19.json`。最小契約：

```json
{
  "weekStart": "2026-10-12",
  "asOf": "2026-10-20T12:00:00+08:00",
  "source": "legally obtained /api/attendance/daily snapshot",
  "complete": true,
  "rosterSha256": "SHA-256 of the shared roster.ndjson",
  "status": "ok",
  "members": [],
  "punch": {},
  "leave": {}
}
```

`members` 是 record_id 清單，`punch` 是 record_id → ISO 日期清單，`leave` 是 record_id → `[{date,kind:"leave"|"trip"|"out"}]`。空集合只在完整 envelope 才代表真空；不接受 demo。`asOf` 至少涵蓋 `today`。也可用全名冊 `rosterRecordIds` 清單取代 `rosterSha256`；不得只列考勤組人員。所有引用 ID 必須屬於共享 roster，日期必須落在對應週。保留 `list.find` 的第一筆假別優先序，半天假在每日檢查仍整天豁免。

若沒有 daily，可提供 `attendance-raw-YYYY-MM-DD.json`：同樣的 weekStart/asOf/source/complete/rosterSha256 envelope，加上 `employeeIds`（open_id→employee_id）、`groups`（bindUsers/bindDepts/exceptUsers/exceptDepts）、`deptUsers`（含子部門展開）、`tasks`、`approvals`，以及 `completeness` 將這五項逐一標 true。使用原 `attendanceCore.buildRoster`、`resolveMembers`、`weekDates`、`punchedDays`、`approvalDaysByUser`。名冊需含真正 `Lark帳號` 的 user 欄；可附 `accountRoster:"roster-account"`，指定同目錄另一份帶 manifest 的四欄 account roster。**不能使用 `同步_OpenID`，不能將 open_id 當 employee_id**。原始快照只供本地處理，不會原樣輸出。

Pull 先以 `base +field-list` 驗證欄位 metadata，再以 `base +record-list --as user --field-id … --offset …` 逐頁讀成本單；每頁檢查 has_more/count/table/schema/revision，最後才輸出完整 manifest。假勤依 `lib/attendance.ts` 的白名單：users/batch、全部考勤組／detail、部門 children/find_by_department、user_tasks/query、user_approvals/query；POST 僅為查詢。不得改成廣泛 API proxy。沒有既有權限就停止該來源。

## 結果與計數

JSON `schemaVersion:1` 包含完整 `rows`、`nameComparisons`、`summary`、`coverage`、來源路徑／內容與 manifest SHA-256、revision、可得的擷取時間。`fileMtime` **只表示本機檔案時間**。實作驗證時凍結的七份 cache/reference hash 指紋與計畫基準另列 `baseline`；hash 不同會警告 baseline 不同，不調整規則湊數。

- 主鍵是 Dashboard record_id × date；依原 Python NAME_ALIAS 對應，但保留兩邊原名／原 ID。Python 依姓名合併，一名對多個在職 record_id 時不猜、不複製計數，以獨立 name-level rows 呈現，退出 2。
- outer join 保留 Dashboard-only、Python-only、ambiguous、not-evaluated 與缺資料。Python 不評估週末／推測假日，顯示 N/A 而非 0。
- 每列顯示 planned/logged/punched/member/leave/missing 及 known 狀態、Python pre/log/kind/activity/leaveSources、可查核的預排／成本單／工作單／假勤快取 record_id。
- 假勤未知時 member/punch/leave/missing 都遮罩。`failureScenarioMissing` 僅呈現 UI 假勤失敗時退化為空集合的診斷，不是真實出勤結果。任一成本單缺失時，已找到的人仍 loggedKnown，沒找到的人 unknown。summary 的完整 attention、leaveCount 保持 N/A。
- daily 的 missingPlanning/missingLog 均套各自引擎的假勤豁免。Dashboard 另列 `planningAbsentBeforeLeave`／`logAbsentBeforeLeave`，表示豁免前的已知無預排／成本單人數，**不可叫做完整缺漏數**。Python 缺卡永遠 N/A。
- native delta 僅在同日期、同母數且來源完整時計；common delta 只算可唯一對應、Python 當天有評估的共同人員。不能比較時兩邊數字仍列出，delta=N/A。
- 原生期間 distinct 人數與每日人日分開。未排和未填可重疊，attention 取 missing 聯集，絕不直接相加。`knownAttention*` 是確定缺漏的下界，不代替完整總數。
- reasons 可重疊：scope、no-activity-day、log-source、grace-period、sales-exemption、leave-policy、planning-kind/deadline、punch-only、identity、unknown-source、mixed-snapshot、not-evaluated、unclassified。只有可查證條件才歸類；原因頻率不可相加當 distinct 人日數。
- 不同擷取時間或新 pull 與既有快取混用標 mixed-snapshot；來源沒有可驗證的擷取時間則 alignment=unverified。這是目前可見資料的回算，不能冒稱當日歷史快照或把差異全部當成規則錯誤。
- 不輸出 open_id、employee_id、token、API 原始回應、打卡時刻／GPS 或請假理由。stdout 的 JSON 可含任務所需姓名，請妥善保存。

| 退出碼 | 意義 |
|---|---|
| 0 | 完整執行；預設允許有差異 |
| 1 | 完整且 `--strict` 找到差異（含範圍不同） |
| 2 | 缺來源／不完整／無法唯一對應；先輸出可用 partial 結果 |
| 3 | 參數或引擎執行錯誤；引擎失敗時仍保留可算出的 partial 資料 |

基準（固定日期、指定快取）：Python 46 人，需關注 39（外業27／內業10／業務2），無缺失7；漏填12人／14人日，僅未預排27人，外業全期無預排21人；10/16漏填8人。這不是要求 Dashboard 符合的答案。

## 驗證與環境

合成測試涵蓋日期／欄位 ID、成本單與 partial masking、raw attendance 的半天假／午夜／部門排除／別名、身分 ambiguity、原因分類、分頁、CLI 拒絕與 timeout、Python import 禁止寫入、全部退出碼、text/JSON 人日一致、TZ 一致。`YUPAI_REFERENCE=/path/generate.py` 可指定原引擎進行全合成快取的政策測試；預設只在指定原引擎檔案存在時執行該項，不連網。

本 worktree 的預設 `node_modules` 是指向另一個專案的 symlink；Turbopack 會拒絕越出專案根的依賴。`npm run typecheck` 通過，建置可用 `npm run build -- --webpack` 驗證，不需要改設定或寫另一個專案。既有全部 TS 測試可用臨時 Node 22 runtime 執行，parity 自身仍以 Node 20 驗證。
