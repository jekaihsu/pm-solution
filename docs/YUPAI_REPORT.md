# 預排核對報告（預排 vs 日誌合規）

一份給業主/主管看的 Lark 雲端 Docx，比對「工作預排」與各「工作單（日誌）」的填寫合規情形。
本文件說明：連結設定、單一判斷口徑、與 R04 既有邏輯的差異決議、對帳數字、每天的執行指令，以及哪些事依賴 PR 合併／部署。

## 1. 連結（總覽頁 + R04 人事頁）

- 目標文件：<https://yong-xiang-survey.jp.larksuite.com/docx/VCAgdgGFooejQ9xqiHZjaCGhpIe>（docId `VCAgdgGFooejQ9xqiHZjaCGhpIe`）。
- 連結的**單一設定來源**：`lib/yupaiReport.ts`。可用環境變數 `NEXT_PUBLIC_YUPAI_REPORT_URL` 覆寫（見 `.env.example`）。
- 入口：`components/Overview.tsx`（週報總覽）與 `components/HrBoard.tsx`（R04 人事頁）各有一個「預排核對報告」連結。
- 儀表板**只連過去、不讀取、不計算**這份文件；文件由產生器覆寫。

## 2. 單一判斷口徑（source of truth）

判斷口徑集中在 **`lib/yupaiCompliance.ts`**（純函式、不連 Lark、不依賴瀏覽器）。
- 產生器 `scripts/yupai-report/` 直接 import 它來算；
- 它與 R04 互動檢視（`components/DailyCheck`＝每日檢查、`components/ScheduleGaps`＝下週預排未填，邏輯在 `lib/scheduleCheck.ts`）**共用** `lib/scheduleCheck.ts` 的原始函式：`taipeiDay`（台北日序）、`NO_GROUP`、「人員名單在職過濾」「排除條類型＝休假／請假」等。
- `lib/scheduleCheck.ts` 是「選一天 / 選一週」的即時檢視；`lib/yupaiCompliance.ts` 是把整個區間逐人逐平日跑完的批次版本，並多加報告專用的規則（見第 3 節）。兩者口徑一致，差異只在「即時單點 vs 批次整段」。

### 架構

```
lib/yupaiReport.ts            連結設定（NEXT_PUBLIC_YUPAI_REPORT_URL + docId）
lib/yupaiCompliance.ts        ★ 單一判斷口徑（純函式）
lib/scheduleCheck.ts          R04 互動檢視原始函式（被上面共用）
scripts/yupai-report/
  load.ts                     讀 data/*.ndjson → YupaiData
  pull.ts                     以 lark-cli（--as user，唯讀）抓資料；紀錄歷史查詢
  render.ts                   由結果產出報告 Markdown
  spotlight.ts                專案查核（黃馨加）純函式 + 紀錄歷史介面
  main.ts                     CLI：抓資料 → 算 → 覆寫 Docx（npm run yupai:report）
  parity.ts                   對帳：TS 口徑 vs 舊版 Python（npm run yupai:parity）
  legacy/generate.py          舊版產生器（獨立第二實作，只當對帳基準，不再維護口徑）
scripts/test-yupai-compliance.mjs   口徑單元測試（node --import tsx --test）
```

## 3. 與 R04 既有邏輯的差異決議

把舊版產生器（`legacy/generate.py`）的規則和 R04 的「每日檢查 / 下週預排未填」逐條比對，最終決議如下（決議一律落在 `lib/yupaiCompliance.ts`）。

| 規則 | 舊版產生器 | R04 互動檢視 | 決議（本報告採用） |
|---|---|---|---|
| **離職排除** | `在職` 旗標 + 寫死本日離職名單 `陳星影/陳星穎` + 排除主管職級（經理/老闆/副總/顧問） | 只看 `在職` 旗標；不排除職級 | **採產生器**：`在職` + `EXCLUDE_NAMES` + `EXCLUDE_LEVELS`。名冊在職旗標會落後（本日離職尚未更新），且報告不該把主管自己列為缺失。`EXCLUDE_NAMES` 是**有時效的寫死值**，等名冊旗標更新後應移除。 |
| **僅平日** | `workdays = 週一～週五且非假日` | 即時檢視由使用者自己選日期/週 | **採「僅平日」**。假日以當週「休息日」比例 > 0.8 推測（啟發式，非正式假日曆，已於文件註明）。 |
| **日誌次日 1 日寬限** | 最近一個已過平日與當日之日誌標 `~`、不計未填 | 單日檢視無寬限（直接顯示當天狀態） | **採寬限**。批次報告要避免把「昨天的日誌今天還沒補」誤判為缺；即時檢視是主管自己看某一天，不需要。 |
| **業務免日誌** | `FILES_LOG = {外業:T, 內業:T, 業務:F}` | 每日檢查不分業別（會把業務也判成「沒填日誌」） | **採業務免填**。這是真正的分歧，決議偏向「業務制度上免填日誌、只檢核預排」。 |
| **請假來源** | 薪水計算 Base：每日考勤明細（核准假別/出勤狀態）＋ 詠翔請假（含審批中）。因 lark-cli user token 無法存取 Lark 出勤 API | Lark 出勤 API（伺服器端 tenant token，`getLeaveDays`） | **來源因執行環境不同而不同**（產生器在 box 上用 user token、只能走 Base；儀表板伺服器用 tenant token 走出勤 API），但**判斷相同**：整日請假（含「審批中」視為待核准請假）一律不計缺失。報告會在內文標明實際採用來源。 |
| **週五前不判下週** | 以該工作週的前一個週五為期限，期限前顯示 `待排`、不算缺 | 下週預排未填直接列出未排的人（可往前看，無期限閘門） | **採週五期限**。尚未到期的下週預排顯示「待排」，不列缺失。 |
| **只對有活動的日子判缺** | `活動日 = 有預排｜有日誌｜有打卡出勤`；無活動日不判缺 | 每日檢查對所有非請假的人都判缺（單日視角要看全部人） | **採活動日閘門**。批次報告只在當事人當天有訊號時才判缺，避免把「當天本就沒上班、又沒請假紀錄」的人誤判。此為最大分歧，決議偏向活動日閘門。 |

其他沿用（非分歧）：預排比對以「人員」record_id；預排日期一律用 field id（`fldMXOggGP`／`fldjWv1xST`，欄名曾被 UI 改）；ROV/休假條類型處理與 R09/R10 一致；異體字 `鄭秉彝＝鄭秉彜`。

## 4. 對帳（parity）

同一份快取、同一區間 **2026-10-12 ~ 2026-10-20（today=10-20）**，分別用
(A) 單一口徑 `lib/yupaiCompliance.ts`（TS）與 (B) 獨立的舊版 `legacy/generate.py`（Python）各自計算，計數全部一致：

```
npm run yupai:parity
```

| 指標 | 儀表板口徑 (TS) | 舊版產生器 (Py) | 一致 |
|---|---:|---:|:--:|
| 納入評估人數 | 46 | 46 | ✓ |
| 需關注人數 | 39 | 39 | ✓ |
| 無缺失人數 | 7 | 7 | ✓ |
| 需關注・外業 | 27 | 27 | ✓ |
| 需關注・內業 | 10 | 10 | ✓ |
| 需關注・業務 | 2 | 2 | ✓ |
| 需補登日誌人數 | 12 | 12 | ✓ |
| 僅未預排人數 | 27 | 27 | ✓ |
| 外業整組未排人數 | 21 | 21 | ✓ |

另：全區間漏填日誌 **14 人日**（10/12 兩人、10/14 一人、10/15 三人、10/16 八人），與審查紀錄（`/workspace/yupai_report/review.md`）一致。
報告正文的人名/列序採 zh-Hant 排序（與 Python 的 Unicode 碼位排序略有不同），**成員與計數完全相同**，純屬顯示順序。

對帳需要 `data/*.ndjson` 快取；`npm run yupai:parity` 若找不到快取會自動以 lark-cli 唯讀抓一次。

## 5. 每天的執行指令（box fallback）

產生器完全從 repo checkout + lark-cli（user 身分已授權）執行，**不需要已部署的儀表板**。每天一行：

```bash
cd /workspace/pm-solution && npm run yupai:report -- --doc-id VCAgdgGFooejQ9xqiHZjaCGhpIe
```

- **cwd**：`/workspace/pm-solution`
- 這會：唯讀抓 V3／薪水計算 Base → 用 `lib/yupaiCompliance.ts` 算 → 以 Markdown **覆寫** 既有 Docx（不建立新文件）。
- 其他參數：`--dry-run`（只產本地 `scripts/yupai-report/data/report.md`，不碰雲端）、`--no-pull`（用既有快取）、`--start/--end/--today`（預設 10-12～10-20）。
- 若 `tsx`／esbuild 缺失（全新環境），先 `npm install`。

安全：所有 Base 唯讀；唯一寫入是覆寫上述 Docx；不發送任何訊息；薪資金額、身分等欄位不讀。

## 6. 哪些事依賴 PR #1 合併／部署

- **不依賴**（box 上立即可用）：`npm run yupai:report`、`npm run yupai:parity`、覆寫 Docx、單元測試。這些只需 repo checkout 與 lark-cli。
- **依賴合併 + Zeabur 重新部署**：總覽頁與 R04 人事頁上的「預排核對報告」連結、`NEXT_PUBLIC_YUPAI_REPORT_URL` 環境變數。部署前這些連結不會出現在正式網站。
- 若要改連結，於 Zeabur 設 `NEXT_PUBLIC_YUPAI_REPORT_URL`（build 期注入 client bundle，改後需重新部署）。
