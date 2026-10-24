# 預排／日誌規則與 Dashboard R04 稽核

稽核日期：2026-10-20（Asia/Taipei）。比較對象是 **generate.py 報告的逾期合規判斷**與 **R04 管理工具的填寫現況**，兩者目前不能直接對照「需關注人數」。本次只讀本地原始碼，以匿名記憶體資料驗證；沒有重新核對真實人數、讀取原始人事快取、呼叫遠端 API 或存取 Lark 文件。

完成 **24 項規則比較、33 組案例、103 個通過斷言（Python 47＋Node 56）**。主要七項為離職、工作日、日誌寬限、業務免填、請假來源、週五期限、活動日人口。沒有修改規則或產品程式；以下「建議」都不是已實施的變更。

## 1. 版本與證據層級

- Worktree：`/workspace/wt-yupai-b`，分支 `yupai-codex-b`，稽核基線 HEAD：`f284ed844efcd80c3441189adbc443eabc1ca678`；開始時工作區乾淨。
- 計畫：`/workspace/yupai_report/plans/codex_b.plan.md`，核准時間 2026-10-20 13:20:08 CST。本文件為計畫指定的唯一 repo 新檔；提交與 repo 外摘要依本次使用者指示執行。
- 原始碼行號以本次讀取的 `nl -ba` 為準；外部來源使用絕對路徑，repo 來源使用相對路徑。
- 不執行產生器 CLI，包括 `--dry-run`：`/workspace/yupai_report/generate.py:658-669` 仍會拉資料及寫本地報告，`:580-582` 會進入專章流程。本次也不執行 `main`、`pull_all`、`build_report`、spotlight。
- 沒有 push、merge、deploy、auth login、Base 寫入、Lark 文件讀寫；沒有操作 `/workspace/pm-solution`，沒有修改 `/workspace/yupai_report`。

| 證據層級 | 使用方式與限制 |
|---|---|
| 明文需求／已確認規則 | `/workspace/yupai_report/BRIEF.md:3-8`：工作單＝日誌、逐人工作日、排除離職、週五前不標下週缺排、指定離職個案。Dashboard 的 `CLAUDE.md:181-185` 記載 R04 出勤週摘要的既有裁示；不能自動延伸為每日合規豁免。 |
| 實作行為 | 以產生器與 Dashboard 的實際判斷分支為準，只能證明「程式目前怎麼算」。 |
| README 宣稱 | `/workspace/yupai_report/README.md:33-54`，須與可執行行為分開；不是額外制度授權。 |
| review 限制 | `/workspace/yupai_report/review.md:23-30,69-79` 說明先前已修正項目及制度證據缺口；本次不把舊缺陷再報成現行缺陷。 |
| 本次建議 | 下表與第 5 節提出的推薦方向；待制度決定者明標，沒有直接改程式、擴讀職級或薪水 Base。 |

外部檔案 SHA-256（本次讀取版本；完成前已再次核對，5 份皆未變）：

| 檔案（均位於 /workspace/yupai_report） | SHA-256 |
|---|---|
| generate.py | `991e9a5ed26dfd59e4dc1459550d548548c48cf2c2ef4c7cf20af0dc6e0ba69a` |
| analyze_core.py | `65330933a3e6cb8143af712dbd2e1e53e7964a78955d50e5bd4c1ad5550009f6` |
| README.md | `2ada3bfbad33c65e14ed478f3c6a8b0c74d0ad55b675db2f439492ac846bdbcb` |
| review.md | `65feee6d916d59d361ffdfbced148cd8abbb14586f4506dca9dec562d42fec8f` |
| BRIEF.md | `1e15499cb6f572f82adf6e82a9b36f224d2f02e0103681541512d08c94e78dc7` |

## 2. 實際呼叫鏈、資料來源與計數單位

產生器路徑：`pull_all`（`/workspace/yupai_report/generate.py:130-167`）→ `Analysis._load`（`:200-271`）→ `_detect_holidays`（`:273-281`）→ 工作日與 cutoff（`:188-198`）→ `_build_scope`（`:308-325`）→ `evaluate`（`:327-363`）→ `build_report` 的人數與逐日統計（`:495-521,533-561,596-605`）。

Dashboard 路徑：`components/HrBoard.tsx:303-307` 分別掛載出勤卡、`ScheduleGaps`、`DailyCheck`；這是三條流程。`DailyCheck` 來源投影（`components/DailyCheck.tsx:15,25-29`）→ `weekDates` 選日（`:31-38`）→ `parseRoster / scheduledPersonIds / loggedPersonIds`（`:69-80`）＋ `/api/attendance/daily`（`:43-59`）→ `dailyStatus`（`:81-89`）→ 缺漏名單／計數／CSV（`:115-124,149,175-182`）。API 經 `app/api/attendance/daily/route.ts:20-27` 的 HR 守門，呼叫 `lib/attendance.ts:312-361`；不能拿週摘要的半天權重推定此路徑有相同權重。

下週預排：`components/ScheduleGaps.tsx:15-26` → `weekRange(week.offset + 1)` → `scheduledPersonIds` → `unfilledPlanning` → KPI、名單與 CSV（`:57-80,95-107`）。沒有每日完整率或到期閘門。

| 資料 | generate.py 實際讀取與對應 | Dashboard R04 實際讀取與對應 |
|---|---|---|
| 名冊 | V3 `tblmlpA6nG5Ou7NQ`，姓名、在職、所屬組別、職級、同步欄；ID 先轉姓名，後以姓名作鍵（`/workspace/yupai_report/generate.py:133-134,200-205`）。 | 同表；白名單僅姓名、Lark帳號、所屬組別、在職（`lib/reports.ts:48-52,122-125`）。每日名冊用 record_id；假勤另外以帳號換 employee_id。 |
| 預排 | V3 `tblN8c3WN44233aG`，欄名「開始日期／結束日期」、人員 link ID→姓名、業別與條類型（`/workspace/yupai_report/generate.py:135-136,232-255`）。日期字串取前 10 碼。 | 同表，請求 field id＋欄名並保留 links；日期 fid 優先、數值視為 epoch ms，台北日曆日判交集（`lib/scheduleCheck.ts:13,35-71`）。 |
| 日誌／內業 | 工作單 `tblTP5Naz52FBpFg`：「姓名」＋工作日期序列；不是填報時間（`/workspace/yupai_report/generate.py:139-140,264-267`）。 | 成本單 `tbl8JdWLLwlPFuoF`：「填報人」record_id＋「工作日期」（`lib/reports.ts:119`；`components/DailyCheck.tsx:27,76`）。 |
| 日誌／外業 | 工作單 `tbl97f1uXqi7Qz0k`：「此單出工人」逗號分割＋出工日期（`/workspace/yupai_report/generate.py:137-138,258-263`）。 | 成本單 `tblQCy3eU0wsUj1I`：「組長＋實際出工人＋舊名組員」，收集所有 link ID（`lib/reports.ts:115`；`components/DailyCheck.tsx:28,77`）。組長出現不代表每位組員都出現。 |
| 日誌／行政 | 工作單 `tbl2c5CLgwPZ3Pl2`：「營業額人員-明細」＋工作日期序列；通常不進三大組人口，但資料仍載入（`/workspace/yupai_report/generate.py:141-142,268-271,283-295`）。 | 成本單 `tbliyB0wgDhgUQbA`：「填表人」＋「工作日期」（`lib/reports.ts:131`；`components/DailyCheck.tsx:29,78`）。 |
| 請假／出勤 | 實際使用薪水 Base 的每日考勤明細＋詠翔請假；逐月考勤、請假起日 > start−31 天（`/workspace/yupai_report/generate.py:145-166`）。姓名正規化，不使用帳號 join。 | 應用身分 Attendance API；`employeeIdMap`、考勤組、tasks 與 approvals（`lib/attendance.ts:75-92,112-159,318-340`）。沒有帳號或換不到 employee_id 的人，仍可出現在每日名冊，但沒有對應的假勤資訊。 |
| API 投影／完整性 | NDJSON 與 manifest；見 R22。 | `app/api/sources/[key]/route.ts:20-35,50-57` 保留投影欄位與指定 links，`:79-87` 回狀態或舊值。`components/useSource.ts:40-43` 不另檢查 complete／stale；來源完整性不能僅以 status=ok 代表。 |

建議後續統計同時保留以下單位，不能把它們相減或互當分母：

| 指標 | 定義及現況限制 |
|---|---|
| 名冊人數 | 適用人口中的穩定身分鍵去重人數；現行產生器為姓名集合，DailyCheck 為名冊列，兩者尚不等價。 |
| 可評估人口 | 通過人口資格且證據足以評估者；不能把產生器 scope 直接稱為「全公司人數」。scope 甚至可由週末日誌加入。 |
| 應評估人日 | 適用人口 × 明確工作日，扣除已定義的免責部分；這是推薦指標，現行兩端均未完整實作。 |
| 活動人日 | 同人同日有工作預排／工作日誌／指定出勤訊號任一，去重算 1；產生器在此範圍才判缺失。 |
| 無訊號／未知／免責人日 | 無訊號不等於合規；來源未知不等於未填；請假／出差／免填應分開，不能都當作「無缺失」。 |
| 缺失人日／需關注人數 | 前者同人同日去重，仍須分預排、日誌、打卡；後者區間內有任一確定缺失的穩定身分鍵去重。現行報告 attention 是姓名集合；每日 KPI 是當日列數。 |
| 每週有排覆蓋 | 一週內出現任一筆工作預排的人數／適用名冊人數。ScheduleGaps 算這個；不代表逐日齊全，也沒有請假週豁免。 |

## 3. 規則差異表

狀態可複列：「已確認需求」只表示有明文要求，不表示已符合；「實作差異」「共同限制」是本地證據結論；「待制度確認」表示不得當成現行正式制度。案例 C01–C33 見第 4 節，P／N 為附錄斷言 ID。

| ID | 規則 | 需求或制度依據 | generate.py 現況與 file:line | Dashboard 現況與 file:line | 差異或共同風險及影響 | 建議規則 | 狀態 | 驗證案例 |
|---|---|---|---|---|---|---|---|---|
| R01 | 離職排除、在職缺欄 | `/workspace/yupai_report/BRIEF.md:4,8` 明定離職及指定個案排除。 | `/workspace/yupai_report/generate.py:49-50,203,317-325`：在職 truthy 姓名集合，另排兩種姓名寫法；缺旗標不納入。 | `lib/scheduleCheck.ts:23-32`：有在職 metadata 才要求 true，缺 metadata 會納入所有列；每日 API 的 `lib/attendanceCore.ts:174-185` 則嚴格要求 true。 | 個案仍 true 時兩端不同；缺欄時每日名冊與假勤名冊也不同；truthy 字串的純函式行為不同，實際 schema 是否可能出現須另查。 | 一般規則依名冊有效在職狀態；明文例外改用穩定 ID、有效日期與理由；缺必要欄標未知。 | 已確認需求、實作差異 | C01／P19-P20,P28-P29,N01-N02,N45 |
| R02 | 三大組、主管、未填組別 | BRIEF `:5-6` 有逐人與三組主管呈現，未明訂全部職級豁免；`/workspace/yupai_report/review.md:71-72` 指制度不足。 | `/workspace/yupai_report/generate.py:43-54,283-295,317-325`：預排業別眾數優先，否則名冊組別分類，排經理／老闆／副總／顧問。行政／IT／PM 通常不分類，但可被預排三大業別帶入。 | `lib/scheduleCheck.ts:23-32,132-156` 不篩組或職級，未填組別留列；`lib/reports.ts:48-52` 不讀職級。 | 評估人口不同；不能籠統說「產生器絕對排除所有行政名冊列」。 | 公布適用人口、分類優先序與豁免清單；建議先不默認主管豁免；不擴讀 Dashboard 職級欄。 | 實作差異、待制度確認 | C02／P21,P30,N03 |
| R03 | 平日、週末、國定假日 | `/workspace/yupai_report/BRIEF.md:4`：週末／假日另列或排除；review `:74` 限制。 | `/workspace/yupai_report/generate.py:194,273-281`：週一至五且排除全表當日休息日比例 >80% 的推測假日。恰好 80% 不排除。 | `components/DailyCheck.tsx:31-38,134-139` 可選七天；`lib/scheduleCheck.ts:56-70,132-153` 沒工作日閘門，週末同樣判未排／未填。 | 休息日比例不是法定日曆；Dashboard 週末警示不能直接視為逾期違規。 | 合規採明確工作日日曆及補班；沒有日曆時揭露限制。週末仍可查現況，但逾期警示要分開。 | 已確認需求、實作差異 | C03／P03,P10-P11,N04,N38 |
| R04 | 日誌一工作日寬限 | `/workspace/yupai_report/README.md:39` 宣稱；review `:72` 指非完整制度依據。 | `/workspace/yupai_report/generate.py:195-197,350-357`：報告區間內最近一個已過工作日及其後都待填。歷史 end=10/16、today=10/20，cutoff 仍 10/16，末日錯留寬限。 | `components/DailyCheck.tsx:69-89`→`lib/scheduleCheck.ts:121-153`，沒有 as-of／期限參數，選到當天即可能缺日誌。 | 現況未填與逾期未填混用；產生器 cutoff 依報告區間，不能稱為固定 24 小時。 | 推薦明定「下一工作日結束前可補填」，台北 as-of、跨週末／假日且不依歷史區間截止；正式採用及日內截止待確認。 | 實作差異、待制度確認 | C04-C05／P07-P10,N05,N13 |
| R05 | 業務免日誌，不免預排 | `/workspace/yupai_report/README.md:36` 與實作宣稱；review `:72`：缺制度佐證。 | `/workspace/yupai_report/generate.py:46-47,337-357`：業務 log=免；仍可能 pre=未排。 | `components/DailyCheck.tsx:75-89`→`lib/scheduleCheck.ts:139-153`：所有在職列皆須任一成本單，沒有業務不適用狀態。 | 同樣業務有排無日誌：報告不缺，Dashboard 缺；免填不代表免預排。 | 建議確認業務是否豁免，確定後用「不適用」狀態，不能用空集合假裝已填。 | 實作差異、待制度確認 | C06／P13,N08 |
| R06 | 請假實際來源 | `/workspace/yupai_report/BRIEF.md:3` 要求說明來源。 | `/workspace/yupai_report/generate.py:143-182,207-226,297-301`：API 僅探測，結果未用；實際總是每日考勤明細＋詠翔請假。 | `lib/attendance.ts:153-159,312-340` 用 tenant Attendance API，`lib/lark.ts:102-118` 唯讀呼叫白名單。 | README 優先 API 不等於已採用；不同來源可能有同步時間與帳號覆蓋差異。 | 回報真正來源、查詢區間、更新時間及覆蓋，不自行新增 Dashboard 薪水 Base 讀取。 | 已確認需求、實作差異 | C07／靜態呼叫鏈 |
| R07 | 核准、待核准、拒絕及請假件數 | review `:67,72-73` 指待核准非已核准。 | `/workspace/yupai_report/generate.py:213-226,297-301,333-343`：接受已通过／审批中；件數非零或核准假別也可整日豁免，拒絕單本身不納入。 | `lib/attendance.ts:335-339`→`lib/attendanceCore.ts:267-294,317-332` 不檢查審批狀態欄；本地 payload 型別 `:57-73` 未列狀態。 | Dashboard 是否只收到已核准資料，不能由本地證明；人工 fixture 的 pending／rejected 照樣被正規化，只證明函式忽略該額外欄。 | 待核准單獨顯示「待審／待確認」，不要稱已核准；建議暫緩確定違規，正式免責仍待制度；件數不是整日證據。 | 實作差異、共同限制、待制度確認 | C08／P14,P16,N30 |
| R08 | 半天假權重與整日免缺漏 | `CLAUDE.md:181-184` 的半天 0.5 裁示針對出勤週摘要；review `:73` 指合規風險。 | `/workspace/yupai_report/generate.py:221-226,333-343` 只要覆蓋日期便整日免預排／日誌。 | `lib/attendanceCore.ts:317-328,368-385` 雖可算涵蓋半天，daily 只保留 date/kind；`components/DailyCheck.tsx:84-89`→`lib/scheduleCheck.ts:135,153` 任一假即整日免缺漏。 | **共同限制**：每日合規都未保留另半天的義務，不能說 Dashboard daily 已算 0.5。 | 保留時段與剩餘應工作部分；半天需不需要預排／日誌待制度確認；推薦不直接整日免責。 | 共同限制、待制度確認 | C09／P14,N26-N27 |
| R09 | 跨日午夜、出差／外出 | review `:73-74` 指日期覆蓋限制；出差不是請假。 | `/workspace/yupai_report/generate.py:221-226,297-306,333-343` 含結束日 00:00；沒有獨立 trip/out 豁免類別，取決於 Base 假別／出勤狀態映射。 | `lib/attendanceCore.ts:280-288,317-328` 對字串結尾 00:00:00 的跨日結束退一天；`lib/scheduleCheck.ts:93,153` trip/out 都免全部缺漏。 | 午夜多免一天的差異；出差／短暫外出也可能整日免日誌。午夜正規化僅證實目前程式支援的字串形狀，非所有 ISO 格式。 | 使用半開時段處理午夜；請假、出差、外出分列，後兩者不自動免工作紀錄義務，制度另定。 | 實作差異、待制度確認 | C10／P15,N28-N29 |
| R10 | 長假與查詢涵蓋 | review `:74` 明列長假限制。 | `/workspace/yupai_report/generate.py:161-166` 僅請假開始日 > start−31 天，可能漏更早開始且延續至區間的假單；考勤 Base 另可能補到，但無法保證。 | `lib/attendance.ts:335-339` 送所選週範圍；`lib/attendanceCore.ts:287-288,317-328` 收到跨週長單能取交集（有 400 天展開上限）。 | 遠端是否會回傳開始早於本週的長假，本地無法驗證；不可把能解析等同查得到。 | 查詢契約採起訖重疊；明列查詢涵蓋與截斷。跨週 API 行為列未驗證，不連線補證。 | 實作差異、共同限制 | C11／N31＋靜態查詢 |
| R11 | 週五前不標下週缺排 | `/workspace/yupai_report/BRIEF.md:4` 明文；review `:27,79` 說明現行已修。 | `/workspace/yupai_report/generate.py:341-349`：目標工作日所屬週一−3 天，today 早於此日=待排，週五起未排；仍須先有活動。 | `components/ScheduleGaps.tsx:15-26,57-80`→`lib/scheduleCheck.ts:75-78`：沒有 now／deadline；任何時點未出現即未填並紅字。daily 的 `:153` 也無期限。 | 週四同一目標週可產生不同警示；**不是產生器仍未修週五期限**。週五到了但無活動者，產生器仍不缺排。 | 週五前為待排且不計逾期；週五後依確認人口與工作日計。日內截止未定義，先不要發明時刻。 | 已確認需求、實作差異 | C12／P12,N04,N14 |
| R12 | 下週相對哪一週、自訂區間 | `components/ScheduleGaps.tsx:3,116` 宣稱所選週下一週。 | `/workspace/yupai_report/generate.py:331,347-349` 對區間每個工作日各算所屬週，不產生固定「所選週下一週」名單。 | `components/ScheduleGaps.tsx:17` 只用 offset；`lib/week.ts:13-22,97-106` 的 custom offset 取起日所屬週；daily 用 `weekDates`（`components/DailyCheck.tsx:31-38`）。 | 自訂 10/14–10/28：daily 僅 10/12–18，下週卡看 10/19–25，不是自訂範圍結束後的週。 | 清楚標實際日期；建議管理工具採起日所屬標準週並明示，不假裝覆蓋整段自訂區間；如需區間版另案實作。 | 實作差異、待制度確認 | C13／N38-N39 |
| R13 | 整週任一預排 vs 逐日完整 | BRIEF `:5` 要逐人工作日；下週卡本身設計為週覆蓋。 | `/workspace/yupai_report/generate.py:246-252,331-349` 每工作日展開，缺失仍受活動閘門；只排週一且其他日無訊號，亦不會自動判其他日缺失。 | `lib/scheduleCheck.ts:56-78` 整週 Set 聯集；`components/ScheduleGaps.tsx:24-26,112-116` 任一日出現即已排，甚至只排週末；整週休假仍列未填。 | 「每位都有預排」不代表週一到五齊全；也不能反推產生器已檢查所有無訊號日。 | 保留「週內曾排」與「逐工作日完整」兩個指標；全週假狀態另列，請假不當工作已排。 | 實作差異、待制度確認 | C14／P27,N14-N15,N32 |
| R14 | 活動日、評估人口及分母 | BRIEF `:5` 逐人逐工作日；review `:26,71-72` 指限制。 | `/workspace/yupai_report/generate.py:308-325,335-345,495-504,596-598`：區間訊號建 scope；逐日活動才缺失。純假單可留在 no_signal；週末日誌可進 scope 卻所有工作日 none，仍可算 clean 並同時列無法評估。 | `components/DailyCheck.tsx:69-89,115-124,149`→`lib/scheduleCheck.ts:132-153`：掃全部名冊，沒有活動閘門，無訊號也可能缺漏。 | 無缺失／無法評估可重疊；兩邊 attention 數字不可比較，也不能把無訊號當合規。 | 推薦名冊資格、可評估、活動、無訊號、未知、免責、確定缺失分列；是否改逐人全工作日是制度決策。 | 實作差異、待制度確認 | C15／P01-P06,P27,N04-N07 |
| R15 | 工作單＝日誌 vs 成本單＝日誌 | `/workspace/yupai_report/BRIEF.md:3` 明定工作單＝日誌；Dashboard 註腳 `components/DailyCheck.tsx:197` 明定成本單。 | `/workspace/yupai_report/generate.py:257-271,339,352-357` 收三種工作單；不讀成本單。 | `components/DailyCheck.tsx:27-29,75-80`→`lib/scheduleCheck.ts:104-117` 收三種成本單，外業組長及出工人都算。 | 只有成本單、無工作單：報告未填、daily 已填；反之亦可能。外業組長代建成本單不是每人親填日誌證據。 | 合規依 BRIEF 工作單；將成本單改標「成本單已建立」並保留獨立指標。若要接工作單另案實作，不在本次改。 | 已確認需求、實作差異 | C16／P31,N20-N23 |
| R16 | 預排日期 fid、日期序列與時區 | `CLAUDE.md:136,145` 等既有口徑強調 fid；此處比較實際 parser。 | `/workspace/yupai_report/generate.py:77-84,233-237,259-270` 預排／外業取日期字串前 10 碼；內業／行政 int(float(serial))，不把小數當 UTC 時間移日。 | `lib/scheduleCheck.ts:9,35-44,63-68,107-114` 預排 fid 優先、成本日期靠欄名；只接受數字 epoch ms，`lib/lark.ts:290-292` date 只保留數字。 | 欄名對調產生器可能不同；成本日期改名可讓來源 status=ok 卻無日誌證據。日期序列不能直接塞到 Dashboard 期待 epoch 的欄。 | 日期欄採穩定 fid、明確型別與台北日曆日；轉換序列和 epoch 的責任寫入來源契約，缺必要欄標未知。 | 實作差異、共同限制 | C17／P25,N19,N24-N25,N46 |
| R17 | 條類型、休假與工作混合 | README `:35` 宣稱出工／待命／支援；未知種類沒有制度定義。 | `/workspace/yupai_report/generate.py:241-251,336-345` 白名單工作種類，僅「休假」且無工作排程時當假；「請假」或未知本身不形成工作活動，仍可能進 scope。 | `lib/scheduleCheck.ts:65-69` 排除符合休假／請假 regex，其餘含空白／未知都當工作；`lib/scheduleCheck.ts:153` 不把休假排程當假勤。 | 無 Attendance 假單時，僅排休假者 daily 仍可能缺漏；同日休假＋出工兩邊均算有工作排程。 | 明列工作／休假／未知三類，未知不默認有效工作；排休與核准假勤分別顯示，混合時段規則待確認。 | 實作差異、待制度確認 | C18／P17-P18,N16-N17 |
| R18 | 主鍵、同名、舊列、異體字、多人 | BRIEF 沒有授權合併同名不同人；README `:54` 記錄別名。 | `/workspace/yupai_report/generate.py:50-52,73-75,202-210,217,240,257-271` 姓名集合合併同名，level/group 同名後列覆寫；別名只用在部分來源；多人預排逐人、外業逗號分割，假單多人姓名串接。 | `lib/scheduleCheck.ts:23-32,47-52,69,114` 用 record_id、不合併同帳號列；缺 links 才退回欄值。daily API `lib/attendanceCore.ts:161-210` 合併帳號並保留舊 ID，`lib/attendance.ts:349-358` 映回多列；預排／成本集合沒有此別名轉換。 | 同名不同 ID 在報告被合併；Dashboard 同人多在職列可重複計數，舊 ID 預排未必命中新列；帳號去重只對假勤有效。 | 穩定人員鍵＋有依據的舊 ID 對照；姓名只顯示／明確別名備援。同名不猜同人，多人逐人而非串接；不擴讀個資。 | 實作差異、共同限制 | C19／P22-P24,P26,N18,N40,N42-N44 |
| R19 | 假勤帳號覆蓋與名冊不一致 | `lib/reports.ts:48-52` 四欄白名單；沒有帳號不能視為無假單。 | `/workspace/yupai_report/generate.py:207-226,297-306` Base 姓名對應，可涵蓋無 Lark 帳號者，但同名與別名品質有限。 | `lib/attendance.ts:318-329,349-358` 僅 buildRoster.people 查 employee_id，無帳號者不查；`lib/scheduleCheck.ts:23-32,134-153` 仍顯示為非考勤組、沒有假勤豁免。 | 未對應帳號的人可能被當作不打卡，且失去已請假資訊；這不是已證明沒有請假。 | 顯示假勤對應覆蓋及未知人數；未對應不能宣稱無假／不需打卡，仍保留已知預排／日誌現況。 | 實作差異、共同限制 | C20／N41＋靜態映射 |
| R20 | 打卡是否屬預排／日誌合規 | BRIEF `:5` 缺失定義為預排或日誌；Dashboard 額外提供打卡管理。 | `/workspace/yupai_report/generate.py:304-306,339-360` 打卡／出勤僅作活動訊號，不因無卡直接缺失。 | `lib/attendanceCore.ts:297-309` 任一側有效即 punched；`lib/scheduleCheck.ts:134,153` 考勤組無有效卡也是缺漏。 | 有預排＋日誌但沒卡，僅 daily 缺漏；一側有效不代表整日完整出勤，不能當出勤率。 | 預排逾期、日誌逾期、打卡缺漏分項計數；聯集人數標明三項範圍。 | 實作差異 | C21／N13,N33 |
| R21 | 今天／未來日與 as-of | README `:22` today=end；review `:75` 警告；今天缺卡裁示只適用出勤流程。 | `/workspace/yupai_report/generate.py:195-197,331-357,644-656` today 預設 end，未裁掉未來訊號，future 日誌為待、預排到週五可未排。 | `components/DailyCheck.tsx:35-38,81-89` 可選未來；`lib/attendance.ts:331-337` tasks 只查到今天、approvals 查整週，但 members 仍回；`lib/scheduleCheck.ts:153` 不排除未來。週摘要另有 `lib/attendanceCore.ts:690-693` future 閘門。 | 未來日可能因空 punch 集合缺卡，即使已排已建成本單；不能套用週摘要「未來不算」到 daily。 | 固定台北 as-of；未來為待發生、未到期缺填不列逾期，今天現況與到期狀態分開。 | 實作差異、共同限制 | C22／P32,N37 |
| R22 | 來源失敗、截斷、stale 與未知 | review `:28,79` 的 has_more 現已修；未知不能判確定缺失。 | `/workspace/yupai_report/generate.py:103-120` 非零退出／has_more=true 停止；非法 JSON manifest 被放行，沒有自動分頁；`:200-271` 缺欄多退空值。 | `components/DailyCheck.tsx:64-89,156-159` 非 ok 預排／成本有 known 保護且正面證據優先；daily API 失敗變 null，members/leave 空。`lib/lark.ts:463-477` complete 可 false；`app/api/sources/[key]/route.ts:80-86` 不完整或 stale 仍 ok，ScheduleGaps `:22-26` 也只看 ok。 | API 失敗可隱藏缺卡、失去假勤豁免而誤報預排／日誌；complete=false／缺必要欄／舊值沒阻止確定否定。不能說「所有來源失敗都已安全處理」。 | 狀態採已知有／確定無／未知／不適用；完整性、schema、freshness、帳號覆蓋分開驗證；不完整只接受正面證據，負面不計逾期。 | 實作差異、共同限制 | C23-C25／P33-P34,N10-N12,N34-N36,N46 |
| R23 | 舊腳本與 README 漂移 | review `:23-30,69-79` 列修正與限制；README 是宣稱層。 | `/workspace/yupai_report/analyze_core.py:9-20,81-107` 硬編碼日期、無假日排除、scope 未濾歷史日誌、沒有週五閘門；現行 generate `:194-197,308-325,347-349` 已不同。README `:52` 主管名仍舊；generate `:586-587` 固定錯誤文案，`:536` 仍寫多為整組未排。 | `components/DailyCheck.tsx:197-199`、`components/ScheduleGaps.tsx:112-116` 說明現況；最終函式 `lib/scheduleCheck.ts:56-78,121-153` 仍是週覆蓋／當日缺漏，不是報告逾期制度。 | 不應重報舊歷史污染／週五未修，也不能沿用 README 名字或固定錯誤當本次實測；「個人沒排」不能推成「整組沒排」。 | 以版本化規則表對應各指標；後續另案同步文案與舊腳本標記，現有歷史統計不當新驗收基準。 | 實作差異、共同限制 | C26／P02,P12＋靜態比對 |
| R24 | 報表顯示、去重與空集合結論 | BRIEF `:5-6` 要需關注人員、結論計數；不是「查無＝合規」授權。 | `/workspace/yupai_report/generate.py:495-521,533-561,596-605` attention 以姓名去重；clean 只指依現行規則未缺失，與無法評估可能重疊。 | `components/DailyCheck.tsx:115-124,149,185-188` KPI 為列數，CSV 依 onlyMissing 篩選，空畫面文案含「或資料未讀取」；`components/ScheduleGaps.tsx:25-26,63,112` 週覆蓋人數亦按名冊列。 | 無訊號／未知／免責混為非缺漏時，不能把 0 缺漏說成全員合規；同人多列可放大人數。 | 各 KPI 與 CSV 都帶單位、適用／可判人口、未知數、as-of、來源完整性；未知不放入合規分母。 | 共同限制、待制度確認 | C27-C33／P01,P03,P24,P27,N10-N11,N23,N42 |

## 4. 固定日期匿名案例與實測結果

所有 A／B／rA／rB／uA 都是合成值；指定離職測試只引用程式既有例外集合，不輸出人名。預設區間 2026-10-12–20，as-of=10/20；沒有遠端真實員工統計。結果「缺漏」是 daily 的布林聯集，「未填」是 generator.log，「未排」是 generator.pre，單位不能混用。

「動態」表示實際執行附錄純函式斷言；「靜態」表示追過呼叫路徑但未啟動 UI／API。N34–N37 是依元件／API 的已讀分支構造邊界輸入，驗證下游純函式，不宣稱已執行 React 或遠端失敗流程。

| 案例 | 最小輸入／重現 ID | 當前產生器結果 | 當前 Dashboard 結果 | 建議結果或待定義／證據方式 |
|---|---|---|---|---|
| C01 | true／false／缺欄／truthy 字串，例外離職者仍 true；P19-P20,P28-P29,N01-N02,N45 | true 納入、false／缺欄排除，字串 truthy 納入；指定離職例外排除。 | 有 metadata 只收 true；無在職 metadata，兩列均收，即使欄值 false。 | 缺欄未知、例外用 ID＋日期；動態。字串測試不代表遠端真會產生此 schema。 |
| C02 | 行政／未填組別／經理；行政但有內業預排；P21,P30,N03 | 無業別訊號前三者排除；行政列可因內業預排納入。 | 保留所有在職、空組別標未填。 | 範圍／主管豁免待確認；動態＋R02 靜態分支。 |
| C03 | 只在 10/17 週末有日誌；10/19 休息日 4/5 與 5/6；P03,P11,N38 | 週末日誌讓 scope=1、attention=false，7 個工作日全 none；80% 非假日、83.3% 假日。 | 日期下拉含週末；無排無成本時 daily=true，沒有假日條件。 | 採日曆；週末現況不直接逾期；動態＋UI 靜態。 |
| C04 | 10/16、19、20 只有預排；as-of=10/20；改 as-of=10/19；P07-P08,N05 | 10/20 時 log=[未填,待,待]；10/19 時 10/16=待。 | 對缺成本單的任一選日 missing=true，無寬限參數。 | 明確下一工作日期限；動態。 |
| C05 | end=10/16、as-of=10/20；另把 10/19 設推測假日；P09-P10 | 歷史末日 cutoff=10/16 且待；假日案例 cutoff 亦=10/16。 | 同樣無成本仍缺漏。 | 歷史 cutoff 不隨區間收縮；假日用明確日曆；動態。 |
| C06 | 業務有出勤、分別有排／無排；P13,N08 | [排,免] 不缺；[未排,免] 需關注。 | 有排但無成本仍缺漏。 | 業務豁免待制度確認，非免預排；動態。 |
| C07 | API 探測成功但後續採 Base | 實際來源固定 base，成功探測值未被使用。 | 實際採 tenant API，沒有薪水請假 Base 讀取。 | 說明實際來源；靜態，未呼叫 API。 |
| C08 | 半日假單狀態已通过／审批中／已拒绝；請假件數=1；P14,P16,N30 | 前兩者整日 leave；拒絕不豁免；僅件數=1 也整日 leave。 | 人工額外 status=approved／pending／rejected 時正規化皆收；**不能推論遠端會回拒絕單**。 | 待審另標；核准契約未遠端驗證；動態純函式＋靜態來源限制。 |
| C09 | 10/12 08:00–12:00 半日假，無預排無卡；P14,N26-N27 | 整日 pre/log=假。 | date/kind 一筆，missing=false；沒有另半天缺漏。 | 保留半天義務，待制度確認；動態。 |
| C10 | 假到 10/13 00:00:00；一小時 trip/out；P15,N28-N29,N09 | 10/13 亦假；trip/out 沒獨立輸入分類。 | 午夜排除 10/13；trip/out 涵蓋當日便免全部缺漏。 | 午夜半開區間、出差／外出義務分列；動態。 |
| C11 | 假自 8/1 到 10/16，查 10/12 週；N31 | 起日查詢門檻會漏這張假單；考勤 Base 是否補到未驗證。 | 若 API 回此單，純函式得到 5 個涵蓋日；API 是否回傳未驗證。 | 起訖重疊查詢；動態解析＋靜態查詢，不冒稱端到端覆蓋。 |
| C12 | 目標 10/26–11/01，as-of 10/22 與 10/23，各有活動／無活動；P12 | 有日誌無預排：週四待排、週五未排；無訊號兩天均 none。 | 無排即下週未填；daily 無排有成本仍缺漏，沒有期限輸入。 | 週五期限和活動閘門分開決定；動態＋卡片靜態。 |
| C13 | 自訂 10/14–10/28，as-of=10/20；N38-N39 | 每個目標日各算所屬週。 | daily 展開 10/12–18；下週預排從 10/19 起。 | UI 明標標準週實際日期；動態。 |
| C14 | 只排週一、只排週末、跨週 10/23–27；全週休假；N14-N15,N32,P27 | 預排只展平日；全週假而無其他訊號：scope=0、no_signal=1，但 evaluate 可全 leave。 | 三種工作排程均週覆蓋已排；只週一的週二未排；全週休假仍週未填=1。 | 週覆蓋不等於每日完整、假週另列；動態。 |
| C15 | 在職無任何訊號／僅區間外日誌／僅當日排、誌、卡；P01-P06,N04-N07 | 無訊號／舊日誌 scope=0；當日任一活動會進 scope，對另一缺項判缺失。 | 全掃名冊；三個「僅有」及無訊號輸入皆缺漏。 | 無訊號不稱合規，政策決定是否全工作日；動態。 |
| C16 | 成本單有組長 A、組員 B，無工作單；反之只有工作單；P31,N20-N23 | 只有成本不算 log；外業工作單有姓名才算 log。 | A/B 均 logged，重複單／跨成本來源各只計一 ID；工作單不進成本集合。 | 日誌用工作單、成本建立另標；動態。 |
| C17 | fid 與欄名對調；序列 46307.66667；台北午夜；P25,N19,N24-N25,N46 | 序列還原 10/12；預排照欄名。 | fid 優先；把序列誤當 epoch 不能命中 10/12；UTC 10/11 16:00 是台北 10/12；缺 start 欄回空。 | 穩定 fid＋型別契約，缺欄未知；動態。 |
| C18 | 休假／請假／未知／空種類；休假＋出工同日；P17-P18,N16-N17 | 休假=leave；請假／未知僅排程時=none；混合=排。 | 休假／請假排除，未知／空白算已排；混合=排。 | 分類明訂，排休不等同 Attendance 假單；動態。 |
| C19 | 同名不同 ID、同人舊列、新列；多人；P22-P24,P26,N18,N40,N42-N44 | 同名兩人 active/scope=1；離職舊 ID 排程可透過同名命中新列；兩人兩日=4 人日。 | 同名不同帳號=2；同帳號兩在職列 daily=2、假勤 roster=1；舊 ID 排程未命中新在職列。 | 統一身分鍵及別名；動態。異體字與多人假單串接為靜態補充。 |
| C20 | 在職但無帳號；N41 | 姓名來源不要求帳號。 | daily 名冊=1，假勤 people=0，沒有請假／members 映射。 | 假勤未知，不宣稱無假或不打卡；動態名冊＋映射靜態。 |
| C21 | 已排已建成本單但考勤組無有效卡；只有上班 Normal／下班 Lack；N13,N33 | 缺卡本身不設 need。 | 無有效卡缺漏；一側 Normal 就 punched=true。 | 分打卡缺漏與工作紀錄合規；動態。 |
| C22 | 今日／未來日已排但無日誌，未來考勤組空 punch；P32,N37 | 未來排程可計入，log=待。 | daily 無日期閘門，已排已成本仍可能缺卡。 | 未來待發生、今日另看期限；動態下游＋API 查詢截至今天的靜態證據。 |
| C23 | 預排／成本皆未知；單一成本失敗但已有正面證據；N10-N12 | 來源拉取退出錯誤會停止；缺欄並非一律停止。 | 無已知缺項時不缺漏；已填正面證據使 loggedKnown=true；成本未知但預排確定沒排，仍缺漏。 | 各項三態、聯集只含確定缺項；動態。 |
| C24 | daily API 失敗→null，原有假勤／members 消失；N35-N36 | 本次不執行 API，Base 路徑不受同一 API null 邏輯影響。 | 已排已成本時 isMember=false、missing=false，隱藏缺卡；無排無成本時 missing=true，失去豁免可誤報。 | 保留假勤未知及帳號覆蓋；動態下游輸入，失敗到 null 是靜態。 |
| C25 | has_more=true／非法 JSON manifest；status=ok 但 complete=false；P33-P34,N34,N46 | mock manifest true 拋錯；非法 JSON 仍回 data/fixture 路徑，沒有實際寫檔。 | UI known 判斷只看 status/data；同樣缺排輸入 missing=true；未驗證實際分頁 API。 | 不完整／缺 schema／stale 不能確定「無」；動態 mock／下游＋靜態傳遞。 |
| C26 | 較早 analyze_core、現行 generate、README／review | 現行已修區間污染與週五期限，舊腳本仍有；主管及錯誤／整組文案另有漂移。 | 卡片仍按現況／週覆蓋，不能當已同步到報告制度。 | 版本化與標註歷史；靜態＋P02,P12。 |
| C27 | 在職無訊號，所有來源可讀；P01,N04 | no_signal=1、scope=0，不能算無缺失一人。 | 缺漏列一人。 | 可評估、無訊號與缺失分列；動態。 |
| C28 | 僅週末日誌，工作日全 none；P03 | scope=1、attention=false，可成 clean 且列無法評估。 | 週末可查但沒有自動休息豁免。 | 無法評估與無缺失互斥呈現；動態＋靜態顯示分支。 |
| C29 | 全週請假，無工作訊號；P27,N32 | scope=0、no_signal=1；純 evaluate 全 leave。 | 預排卡仍未填一人，daily 有成功假勤時不缺漏。 | 請假、無訊號與週覆蓋分開；動態。 |
| C30 | 一人多單、跨成本來源、多人成本；P24,P26,N20,N23 | 同姓名同日去重，兩人兩日四個鍵。 | 同 ID 同日去重，但名冊重複列不去重。 | 人日主鍵與名冊主鍵統一；動態。 |
| C31 | 無已知缺漏且來源未知；N10-N11 | 拉取失敗通常停止，並無與 daily 等價的三態輸出。 | missing=false 可以只是未知；有正面證據仍保留已填。 | 0 缺漏不能寫全員合規；動態＋靜態顯示。 |
| C32 | 同帳號兩在職名冊列；N42 | 姓名集合相同時只算一人。 | 每日名冊 2 列、假勤去重 1 人；KPI 可能按 2 列。 | 明列列數與去重人數，未統一不稱同一分母；動態。 |
| C33 | onlyMissing 切換與 CSV，所有來源未知 | 報告只列 attention，人數以 scope 姓名集合。 | CSV 對 shown 匯出；未知本身不 missing，清單可空且文案含「或資料未讀取」。 | CSV 附未知／免責／適用人口，不把空清單當全合規；靜態 `components/DailyCheck.tsx:115-124,185-188`。 |

## 5. 建議口徑與待確認決策

以下均是後續決策與修正入口，本次沒有實作。

1. **先區分產品目的。** 報告合規以 BRIEF 的工作單為日誌；管理卡保留成本單現況並明確命名。預排、工作日誌與打卡各自列「未填現況／尚未到期／已逾期／不適用／未知」。優先入口：`lib/scheduleCheck.ts:83-95,121-153` 與 `components/DailyCheck.tsx:115-124`。
2. **適用人口與工作日。** 推薦先以在職且身分可對應的指定人口 × 明確工作日日曆作應評估基礎，無訊號另列。三大組範圍、主管豁免、業務免日誌、外業無日報日的義務都待確認；review 已指出制度證據不足。不得因此增加 Dashboard 職級或薪水個資讀取。
3. **期限。** 週五前不標下週缺排有明文依據，建議優先對齊卡片與 CSV；週五日內截止尚未定義。日誌推薦下一工作日結束前可補，但寬限制度本身、截止時刻、假日補班日曆仍須確認。修正產生器 cutoff 時不能只在報告區間找最近工作日。
4. **假勤。** 推薦核准、待審、拒絕、無法對應分列；待審暫列待確認，不宣稱已核准或正式豁免。半天假保留另半天義務；請假、出差、外出分列，短暫外出不直接免整天工作紀錄。Attendance 回傳的狀態契約及跨週長假覆蓋留待後續唯讀驗證，不在本次連線。
5. **身分與品質。** 推薦 stable record_id 與有依據的舊 ID 對照，保留同名不同人。以來源完整、必要欄存在、freshness、帳號覆蓋判斷是否可下「無」的結論；已有正面已填證據仍保留。入口：`lib/attendance.ts:318-358`、`lib/scheduleCheck.ts:23-52,104-117`、`components/DailyCheck.tsx:64-89`、`components/ScheduleGaps.tsx:21-26`。
6. **指標與文字。** 週內任一預排覆蓋與逐日完整率各列一項；名冊人數、可評估人數、無訊號／免責／未知人日、缺失人日、需關注去重人數都註明來源、單位和 as-of。去除「個人沒排＝整組沒排」推論；不要把 README 的舊主管名、固定 API 錯誤當成實測。

沒有待答覆才能完成的文件工作。上述政策決策不代表本次未完成，也不授權自動實作。

## 6. 驗證方式與限制

- Python 3.13.5：以 `python3 -B` 載入模組，所有 NDJSON 由記憶體替身提供，不讀 data/；攔截 subprocess、socket、寫檔及報告／遠端入口。P33/P34 僅 mock `run_cli` 回傳 manifest，不執行 CLI。**47/47 斷言通過**。
- Node v20.19.2：現有環境不能直接把 TypeScript 當 Node 模組使用，因此用已安裝 TypeScript 的 `transpileModule` 與 `Module._compile` 在記憶體載入 scheduleCheck、attendanceCore、week；沒有安裝依賴或輸出編譯檔。**56/56 斷言通過**。
- 只執行上述必要純函式案例；沒有 build、typecheck、全套測試或網站啟動。本次未跑既有 attendance 測試；週摘要測試也不能取代 daily 比較。
- N30 的 status 是合成的額外欄位，僅證明 parser 不檢查；N31 僅證明「若 API 回傳長假」可解析；N34–N37 是下游邊界模擬。API 真實狀態／長假涵蓋、遠端資料完整性、UI 執行效果均未驗證。
- review 的 39 人等數字是歷史背景，本次沒有重新拉資料，也不引用作新結論。個人表單消失問題沒有新證據，不作任何推論。
- 附錄保留本次執行的完整記憶體腳本，供同版本重現。文件以靜態／動態分列，不把推測或建議當現行規則。
- 文件檢查：127 處完整路徑／行號引用皆存在，24 列規則與 33 列案例的 Markdown 欄數正確，程式區塊成對；5 份外部來源 SHA-256 未變。工作區相對基線僅新增本文件。

## 附錄 A：Python 記憶體案例

在本 worktree 執行以下命令；只讀指定 generate.py，最後一行應為 `PYTHON_PASS 47`。

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B - <<'PY'
import builtins, datetime as dt, importlib.util, json, os, socket, subprocess
from collections import defaultdict
path = "/workspace/yupai_report/generate.py"
spec = importlib.util.spec_from_file_location("audit_generator", path)
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)  # __name__ != "__main__"; -B prevents pyc
def blocked(*a, **k): raise AssertionError("side effect forbidden")
real_open = builtins.open
def read_only_open(file, mode="r", *a, **k):
    if any(c in mode for c in "wax+"): blocked()
    return real_open(file, mode, *a, **k)
builtins.open = read_only_open
subprocess.run = subprocess.Popen = socket.socket = os.system = blocked
g.run_cli = g.pull_all = g.build_report = g.build_spotlight = blocked
D = dt.date.fromisoformat
passed = 0
def check(label, actual, expected):
    global passed
    assert actual == expected, (label, actual, expected)
    passed += 1
    print(label, json.dumps(actual, ensure_ascii=False, sort_keys=True))
def person(name="A", rid="rA", active=True, group="內業", level="員工"):
    return dict(record_id=rid, 姓名=name, 在職=active, 所屬組別=[group], 職級=[level])
def make(start="2026-10-12", end="2026-10-20", today="2026-10-20", **data):
    files = {"roster": [person()], **data}
    g.load_ndjson = lambda p: files.get(os.path.basename(p).removesuffix(".ndjson"), [])
    return g.Analysis(D(start), D(end), D(today))
def states(a, date, name="A"):
    c = next(c for c in a.evaluate(name)[2] if c["date"] == date)
    return [c["pre"], c["log"], c["kind"]]
def pre(day, kind="出工", ids=("rA",), end=None):
    return {"開始日期": day, "結束日期": end or day, "人員": [{"id": x} for x in ids], "條類型": [kind], "業別": ["內業"]}
def att(day, status="已出勤", name="A", **extra):
    return {"姓名": name, "日期": day, "出勤狀態": status, **extra}
a = make()
check("P01 no_signal", [len(a.scope), len(a.no_signal), states(a,"2026-10-12")], [0,1,["·","·","none"]])
a = make(waiye=[{"出工日期":"2026-10-01","此單出工人":"A"}])
check("P02 old_log", [len(a.scope),len(a.no_signal)], [0,1])
a = make(waiye=[{"出工日期":"2026-10-17","此單出工人":"A"}])
check("P03 weekend_scope", [len(a.scope),a.evaluate("A")[1],len(a.workdays)], [1,False,7])
for n, data in [
    ("P04 only_pre", dict(preschedule_all=[pre("2026-10-12")])),
    ("P05 only_log", dict(waiye=[{"出工日期":"2026-10-12","此單出工人":"A"}])),
    ("P06 only_att", dict(attendance_oct=[att("2026-10-12")]))]:
    a = make(**data)
    expected = {"P04 only_pre":["排","未填","work"],"P05 only_log":["未排","填","work"],"P06 only_att":["未排","未填","work"]}[n]
    check(n, states(a,"2026-10-12"), expected)
a = make(preschedule_all=[pre("2026-10-16"),pre("2026-10-19"),pre("2026-10-20")])
check("P07 grace_20", [states(a,d)[1] for d in ["2026-10-16","2026-10-19","2026-10-20"]], ["未填","待","待"])
a = make(today="2026-10-19",preschedule_all=[pre("2026-10-16")])
check("P08 grace_19", states(a,"2026-10-16")[1], "待")
a = make(end="2026-10-16",preschedule_all=[pre("2026-10-16")])
check("P09 historical_cutoff", [str(a.log_due_cutoff),states(a,"2026-10-16")[1]], ["2026-10-16","待"])
a = make(preschedule_all=[pre("2026-10-16")],attendance_oct=[att("2026-10-19","休息日")])
check("P10 inferred_holiday", [sorted(a.holidays),str(a.log_due_cutoff),states(a,"2026-10-16")[1]], [["2026-10-19"],"2026-10-16","待"])
for rest,total,expected in [(4,5,False),(5,6,True)]:
    a=make(attendance_oct=[att("2026-10-19","休息日" if i<rest else "已出勤",str(i)) for i in range(total)])
    check("P11 holiday_"+str(total), "2026-10-19" in a.holidays, expected)
for today,active,expected in [("2026-10-22",True,["待排","填","work"]),("2026-10-23",True,["未排","填","work"]),("2026-10-22",False,["·","·","none"]),("2026-10-23",False,["·","·","none"])]:
    a=make(start="2026-10-26",end="2026-11-01",today=today,waiye=[{"出工日期":"2026-10-26","此單出工人":"A"}] if active else [])
    check("P12 friday_"+today+"_"+str(active),states(a,"2026-10-26"),expected)
for scheduled in [False,True]:
    a=make(roster=[person(group="業務")],preschedule_all=[{**pre("2026-10-12"),"業別":["業務"]}] if scheduled else [],attendance_oct=[att("2026-10-12")])
    check("P13 sales_"+str(scheduled),states(a,"2026-10-12")[:2],["排" if scheduled else "未排","免"])
for status,expected in [("已通过","leave"),("审批中","leave"),("已拒绝","work")]:
    lv={"发起人":[{"name":"A"}],"开始时间":"2026-10-12 08:00:00","结束时间":"2026-10-12 12:00:00","申请状态":[status]}
    a=make(preschedule_all=[pre("2026-10-12")],leave_oct=[lv])
    check("P14 leave_"+status,states(a,"2026-10-12")[2],expected)
lv={**lv,"申请状态":["已通过"],"结束时间":"2026-10-13 00:00:00"}
a=make(leave_oct=[lv])
check("P15 midnight",states(a,"2026-10-13"),["假","假","leave"])
a=make(attendance_oct=[att("2026-10-12","待確認",請假件數=1)])
check("P16 leave_count",states(a,"2026-10-12"),["假","假","leave"])
for kind,expected in [("休假",["假","假","leave"]),("請假",["·","·","none"]),("未知",["·","·","none"])]:
    a=make(preschedule_all=[pre("2026-10-12",kind)])
    check("P17 kind_"+kind,states(a,"2026-10-12"),expected)
a=make(preschedule_all=[pre("2026-10-12","休假"),pre("2026-10-12")])
check("P18 mixed",states(a,"2026-10-12"),["排","未填","work"])
for flag in [True,False,None]:
    a=make(roster=[person(active=flag)],preschedule_all=[pre("2026-10-12")])
    check("P19 active_"+str(flag),len(a.scope),int(flag is True))
a=make(roster=[person(name=next(iter(g.EXCLUDE_NAMES)))],preschedule_all=[pre("2026-10-12")])
check("P20 departure_exception",len(a.scope),0)
for group,level in [("行政","員工"),("","員工"),("內業","經理")]:
    a=make(roster=[person(group=group,level=level)],waiye=[{"出工日期":"2026-10-12","此單出工人":"A"}])
    check("P21 population_"+(group or "empty")+"_"+level,len(a.scope),0)
a=make(roster=[person(rid="r1"),person(rid="r2")],preschedule_all=[pre("2026-10-12",ids=("r1","r2"))])
check("P22 same_name", [len(a.active),len(a.scope),len(a.presch)], [1,1,1])
a=make(roster=[person(rid="old",active=False,group="業務"),person(rid="new")],preschedule_all=[pre("2026-10-12",ids=("old",))])
check("P23 inactive_old_link",len(a.scope),1)
a=make(preschedule_all=[pre("2026-10-12"),pre("2026-10-12")],waiye=[{"出工日期":"2026-10-12","此單出工人":"A,A"}])
check("P24 dedup_person_day",[len(a.presch),len(a.log)],[1,1])
check("P25 serial",str(g.serial_to_date("46307.66667")),"2026-10-12")
a=make(preschedule_all=[pre("2026-10-12",ids=("rA","rB"),end="2026-10-13")],roster=[person(),person("B","rB")])
check("P26 multi_person",len(a.presch),4)
a=make(start="2026-10-26",end="2026-10-30",leave_oct=[{**lv,"开始时间":"2026-10-26 08:00:00","结束时间":"2026-10-30 17:00:00"}])
check("P27 full_week_leave",[len(a.scope),len(a.no_signal),[c["kind"] for c in a.evaluate("A")[2]]],[0,1,["leave"]*5])
a=make(roster=[{k:v for k,v in person().items() if k!="在職"}],preschedule_all=[pre("2026-10-12")])
check("P28 missing_active_field",len(a.scope),0)
a=make(roster=[person(active="false")],preschedule_all=[pre("2026-10-12")])
check("P29 truthy_string_active",len(a.scope),1)
a=make(roster=[person(group="行政")],preschedule_all=[pre("2026-10-12")])
check("P30 schedule_trade_overrides_group",len(a.scope),1)
a=make(preschedule_all=[pre("2026-10-12")],internal_cost=[{"工作日期":"2026-10-12","填報人":"A"}])
check("P31 cost_only_not_log",states(a,"2026-10-12")[1],"未填")
a=make(start="2026-10-26",end="2026-11-01",today="2026-10-23",preschedule_all=[pre("2026-10-26")])
check("P32 future_pre",states(a,"2026-10-26"),["排","待","work"])
g.run_cli=lambda args:(0,'{"has_more":true}',"")
try:
    g.pull_records("fixture","fixture",[],"fixture")
    raise AssertionError("expected truncation error")
except RuntimeError:
    check("P33 has_more_stops",True,True)
g.run_cli=lambda args:(0,"invalid manifest","")
check("P34 invalid_manifest_passes",g.pull_records("fixture","fixture",[],"fixture"),"data/fixture")
g.run_cli=blocked
print("PYTHON_PASS",passed)

PY
```

## 附錄 B：Node 記憶體案例

在本 worktree 執行以下命令；只在記憶體轉譯三個純函式模組，最後一行應為 `NODE_PASS 56`。

```bash
node - <<'JS'
const fs = require("node:fs"), Module = require("node:module");
const assert = require("node:assert/strict"), ts = require("typescript");
const blocked = () => { throw Error("side effect forbidden"); };
global.fetch = blocked;
for (const name of ["writeFileSync","writeFile","appendFileSync","appendFile","createWriteStream"]) fs[name] = blocked;
for (const name of ["exec","execSync","spawn","spawnSync","fork"]) require("node:child_process")[name] = blocked;
require("node:net").connect = require("node:net").createConnection = blocked;
function pure(path) {
  const filename = process.cwd()+"/"+path, m = new Module(filename, module);
  m.filename = filename; m.paths = module.paths;
  const code = ts.transpileModule(fs.readFileSync(filename,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  m._compile(code,filename); return m.exports; // memory only
}
const s=pure("lib/scheduleCheck.ts"), c=pure("lib/attendanceCore.ts"), w=pure("lib/week.ts");
let passed=0;
function check(label,actual,expected) {
  assert.deepStrictEqual(actual,expected,label); passed++;
  console.log(label,JSON.stringify(actual));
}
const t=d=>Date.parse(d+"T00:00:00+08:00"), DAY=86400000;
const table=(names,rows,extra={})=>({fields:names.map(name=>({id:name,name})),records:rows,...extra});
const row=(id,fields,links)=>({id,fields,links});
const roster=[{recordId:"rA",name:"A",group:"內業"}];
function daily(planned=[],logged=[],punched=[],members=[],leave=[],known) {
  return s.dailyStatus(roster,new Set(planned),new Set(logged),new Set(punched),new Set(members),new Map(leave),known)[0];
}
check("N01 roster_flags",s.parseRoster(table(["姓名","所屬組別","在職"],[row("r1",{姓名:"A",在職:true}),row("r2",{姓名:"B",在職:false}),row("r3",{姓名:"C"})])).map(x=>x.recordId),["r1"]);
check("N02 missing_active_field",s.parseRoster(table(["姓名"],[row("r1",{姓名:"A",在職:false}),row("r2",{姓名:"B"})])).length,2);
check("N03 empty_group",s.parseRoster(table(["姓名","在職"],[row("r1",{姓名:"A",在職:true})]))[0].group,"（未填組別）");
check("N04 no_signal",daily().missing,true);
check("N05 only_pre",daily(["rA"]).missing,true);
check("N06 only_cost",daily([],["rA"]).missing,true);
check("N07 only_punch",daily([],[],["rA"],["rA"]).missing,true);
check("N08 sales_no_exemption",s.dailyStatus([{...roster[0],group:"業務"}],new Set(["rA"]),new Set(),new Set(),new Set(),new Map())[0].missing,true);
for (const kind of ["leave","trip","out"]) check("N09 exemption_"+kind,daily([],[],[],["rA"],[["rA",kind]]).missing,false);
check("N10 unknown_sources",[daily([],[],[],[],[],{sched:false,cost:false}).plannedKnown,daily([],[],[],[],[],{sched:false,cost:false}).missing],[false,false]);
check("N11 positive_beats_unknown",[daily(["rA"],["rA"],[],[],[],{sched:false,cost:false}).loggedKnown,daily(["rA"],["rA"],[],[],[],{sched:false,cost:false}).missing],[true,false]);
check("N12 unknown_cost_known_plan_missing",daily([],[],[],[],[],{sched:true,cost:false}).missing,true);
check("N13 missing_punch",daily(["rA"],["rA"],[],["rA"]).missing,true);
const schedRows=(days,kind="出工",ids=["rA"])=>table(["開始日期","結束日期","人員","條類型"],days.map(([a,b=a],i)=>row("s"+i,{開始日期:t(a),結束日期:t(b),人員:ids,條類型:kind},{人員:ids})));
const weekStart=t("2026-10-26"),weekEnd=t("2026-11-02");
for (const [label,days] of [["monday",[["2026-10-26"]]],["weekend",[["2026-10-31"]]],["cross_week",[["2026-10-23","2026-10-27"]]]]) {
  const filled=s.scheduledPersonIds(schedRows(days),weekStart,weekEnd);
  check("N14 week_"+label,s.unfilledPlanning(roster,filled).length,0);
}
check("N15 daily_tuesday",s.scheduledPersonIds(schedRows([["2026-10-26"]]),t("2026-10-27"),t("2026-10-28")).size,0);
for (const [kind,expected] of [["休假",0],["請假",0],["未知",1],["",1]]) check("N16 kind_"+kind,s.scheduledPersonIds(schedRows([["2026-10-26"]],kind),weekStart,weekEnd).size,expected);
const mixed=schedRows([["2026-10-26"]]); mixed.records.push(...schedRows([["2026-10-26"]],"休假").records);
check("N17 mixed",s.scheduledPersonIds(mixed,weekStart,weekEnd).size,1);
check("N18 multi_person",s.scheduledPersonIds(schedRows([["2026-10-26"]],"出工",["rA","rB"]),weekStart,weekEnd).size,2);
const swapped=schedRows([["2026-10-26"]]);
swapped.fields[0]={id:"fldjWv1xST",name:"開始日期"}; swapped.fields[1]={id:"fldMXOggGP",name:"結束日期"};
swapped.records[0].fields.開始日期=t("2026-10-30");
check("N19 field_id_priority",s.scheduledPersonIds(swapped,t("2026-10-29"),t("2026-10-30")).size,1);
const cost=table(["工作日期","組長","實際出工人"],[row("c1",{工作日期:t("2026-10-12"),組長:["A"],實際出工人:["B","A"]},{組長:["rA"],實際出工人:["rB","rA"]}),row("c2",{工作日期:t("2026-10-12"),組長:["A"]},{組長:["rA"]})]);
const source={data:cost,dateNames:["工作日期"],personNames:["組長","實際出工人"]};
check("N20 cost_leader_crew", [...s.loggedPersonIds([source],s.taipeiDay(t("2026-10-12")))].sort(),["rA","rB"]);
check("N21 cost_no_work_order",daily(["rA"],[...s.loggedPersonIds([source],s.taipeiDay(t("2026-10-12")))]).missing,false);
check("N22 work_order_no_cost",s.loggedPersonIds([],s.taipeiDay(t("2026-10-12"))).size,0);
check("N23 across_sources_dedup",s.loggedPersonIds([source,source],s.taipeiDay(t("2026-10-12"))).size,2);
check("N24 serial_not_timestamp",s.loggedPersonIds([{...source,data:table(["工作日期","組長"],[row("x",{工作日期:46307.66667},{組長:["rA"]})])}],s.taipeiDay(t("2026-10-12"))).size,0);
check("N25 taipei_midnight",s.taipeiDay(Date.parse("2026-10-11T16:00:00Z")),s.taipeiDay(t("2026-10-12")));
const dates=c.weekDates(t("2026-10-14"));
function approval(kind,start,end,status) {
  return [{user_id:"uA",date:20261012,[kind]:[{approval_id:"a",start_time:start,end_time:end,interval:14400,unit:2,status}]}];
}
function daysFor(items){return c.approvalDaysByUser(items,dates).get("uA")??[]}
const half=daysFor(approval("leaves","2026-10-12 08:00:00","2026-10-12 12:00:00"));
check("N26 half_leave",half,[{date:"2026-10-12",kind:"leave"}]);
check("N27 half_exempts_whole",daily([],[],[],["rA"],[["rA",half[0].kind]]).missing,false);
check("N28 midnight",daysFor(approval("leaves","2026-10-12 08:00:00","2026-10-13 00:00:00")).map(x=>x.date),["2026-10-12"]);
for(const kind of ["trips","outs"]) check("N29 travel_"+kind,daysFor(approval(kind,"2026-10-12 09:00:00","2026-10-12 10:00:00"))[0].kind,kind==="trips"?"trip":"out");
for(const status of ["approved","pending","rejected"]) check("N30 status_not_filtered_"+status,daysFor(approval("leaves","2026-10-12 08:00:00","2026-10-12 12:00:00",status)).length,1);
check("N31 long_leave_if_returned",daysFor(approval("leaves","2026-08-01 08:00:00","2026-10-16 17:00:00")).length,5);
check("N32 full_week_planning",s.unfilledPlanning(roster,s.scheduledPersonIds(schedRows([["2026-10-26","2026-10-30"]],"休假"),weekStart,weekEnd)).length,1);
check("N33 one_side_punch",[...c.punchedDays([{user_id:"uA",day:20261012,records:[{check_in_result:"Normal",check_out_result:"Lack"}]}],dates).get("uA")],["2026-10-12"]);
check("N34 partial_table_is_known",daily([],[],[],[],[],{sched:({status:"ok",data:{complete:false}}).status==="ok",cost:true}).missing,true);
check("N35 attendance_failure_hides_punch",[daily(["rA"],["rA"]).isMember,daily(["rA"],["rA"]).missing],[false,false]);
check("N36 attendance_failure_loses_exemption",daily().missing,true);
check("N37 future_member_empty_punch",daily(["rA"],["rA"],[],["rA"]).missing,true);
check("N38 custom_wednesday",dates,["2026-10-12","2026-10-13","2026-10-14","2026-10-15","2026-10-16","2026-10-17","2026-10-18"]);
const custom=w.customRange("2026-10-14","2026-10-28",t("2026-10-20"));
check("N39 custom_next",w.msToDateStr(w.weekRange(custom.offset+1,t("2026-10-20")).start),"2026-10-19");
const cols={name:"姓名",group:"所屬組別",active:"在職",account:"Lark帳號"};
const rr=(id,active,account="oA")=>({id,fields:{姓名:"A",在職:active},people:account?{Lark帳號:[{id:account,name:"A"}]}:{}});
const rows=[rr("old",false),rr("new",true)];
check("N40 old_new_roster",[s.parseRoster(table(["姓名","在職"],rows)).map(p=>p.recordId),c.buildRoster(rows,cols).people[0].altRecordIds],[["new"],["old"]]);
check("N41 no_account",[s.parseRoster(table(["姓名","在職"],[rr("rA",true,null)])).length,c.buildRoster([rr("rA",true,null)],cols).people.length],[1,0]);
const duplicates=[rr("r1",true),rr("r2",true)];
check("N42 same_account_rows",[s.parseRoster(table(["姓名","在職"],duplicates)).length,c.buildRoster(duplicates,cols).people.length],[2,1]);
check("N43 old_id_schedule_misses",s.unfilledPlanning(s.parseRoster(table(["姓名","在職"],rows)),new Set(["old"])).length,1);
const namesakes=[rr("r1",true,"o1"),rr("r2",true,"o2")];
check("N44 same_name_distinct_ids",[s.parseRoster(table(["姓名","在職"],namesakes)).length,c.buildRoster(namesakes,cols).people.length],[2,2]);
check("N45 active_string",s.parseRoster(table(["姓名","在職"],[row("rA",{姓名:"A",在職:"false"})])).length,0);
check("N46 missing_required_schedule_fields",s.scheduledPersonIds(table(["人員"],[]),weekStart,weekEnd).size,0);
console.log("NODE_PASS",passed);

JS
```
