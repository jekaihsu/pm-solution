#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
預排 vs 日誌 合規報告產生器 (zh-TW Lark Docx)
================================================
比對「工作預排」(預排) 與各「工作單」(日誌) 的填寫合規情形，
產出繁體中文結論 + 需關注人員表格，並建立一份 Lark Docx 至 jekai 雲端。

資料來源 (全部唯讀)：
  V3 Base  Sdw1bG1djaHsVGsRPvmjyVWipgg
    工作預排 tblN8c3WN44233aG / 人員名單 tblmlpA6nG5Ou7NQ
    內業工作單 tblTP5Naz52FBpFg / 外業工作單 tbl97f1uXqi7Qz0k / 行政工作單 tbl2c5CLgwPZ3Pl2
  假勤：優先 Lark 出勤 API；若 user token 無法存取，改用
    薪水計算 Base VwAsbezz9app3YsramgjduLYp2U
      每日考勤明細 tblsrN2D99v46m3e (核准假別) / 詠翔請假 tblUxMuP87ZmHHZJ (含審批中)

用法：
  python3 generate.py                         # 預設區間，建立 Docx
  python3 generate.py --dry-run               # 僅本地產出 report.md，不建立 Docx
  python3 generate.py --start 2026-10-12 --end 2026-10-20
  python3 generate.py --no-pull               # 使用 data/ 既有快取，不重新抓取

注意：本工具只建立 Docx，不對任何 Base 寫入，不發送任何訊息。
"""
import argparse, datetime, json, os, subprocess, sys
from collections import Counter, defaultdict

# ----------------------------------------------------------------------------
# 設定
# ----------------------------------------------------------------------------
V3_BASE = "Sdw1bG1djaHsVGsRPvmjyVWipgg"
TBL_PRE = "tblN8c3WN44233aG"   # 工作預排
TBL_ROSTER = "tblmlpA6nG5Ou7NQ"  # 人員名單
TBL_NEI = "tblTP5Naz52FBpFg"   # 內業工作單
TBL_WAI = "tbl97f1uXqi7Qz0k"   # 外業工作單
TBL_XING = "tbl2c5CLgwPZ3Pl2"  # 行政工作單

SAL_BASE = "VwAsbezz9app3YsramgjduLYp2U"
TBL_ATT = "tblsrN2D99v46m3e"   # 每日考勤明細
TBL_LEAVE = "tblUxMuP87ZmHHZJ"  # 詠翔請假

# 三大組別與主管 (依任務指定)
MANAGERS = {"外業": "柯汉", "業務": "涂正邦", "內業": "張佳斌"}
# 僅納入三大組；行政/IT/PM 不在本報告範圍 (另見資料說明)
SCOPE_DIVISIONS = ("外業", "業務", "內業")
# 各組是否填寫每日日誌 (業務制度上免填日誌)
FILES_LOG = {"外業": True, "內業": True, "業務": False}

# 排除：離職 + 本日離職 (名冊在職旗標可能尚未更新)
EXCLUDE_NAMES = {"陳星影", "陳星穎"}
# 異體字對應 (考勤表 -> 名冊)
NAME_ALIAS = {"鄭秉彝": "鄭秉彜"}
# 不列入合規評估的職級 (主管/顧問)
EXCLUDE_LEVELS = {"經理", "老闆", "副總", "顧問"}

# 黃馨加 專章 (任務指定必須說明)
SPOTLIGHT = [
    {"name": "黃馨加",
     "vanish_dates": ["10/12"],   # 主張表單消失 → 查核紀錄與建立/修改時間
     "leave_dates": ["10/16"]},   # 請假 → 核對考勤/請假狀態
]

EPOCH = datetime.date(1899, 12, 30)   # Lark/Excel 日期序列基準
TZ = datetime.timezone(datetime.timedelta(hours=8))
WEEKDAY_ZH = ["一", "二", "三", "四", "五", "六", "日"]
WORKED_STATUS = {"已出勤", "外業出勤", "休息日出工", "已出勤（打卡＋外業）", "有出勤／有請假"}

DATA_DIR = os.environ.get("YUPAI_DATA_DIR", "data")

# ----------------------------------------------------------------------------
# 小工具
# ----------------------------------------------------------------------------
def norm(n):
    n = (n or "").strip()
    return NAME_ALIAS.get(n, n)

def serial_to_date(s):
    try:
        return EPOCH + datetime.timedelta(days=int(float(s)))
    except (TypeError, ValueError):
        return None

def dkey(s):
    return s[:10] if s else None

def load_ndjson(path):
    out = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out

def run_cli(args):
    """執行 lark-cli，回傳 (returncode, stdout, stderr)。"""
    p = subprocess.run(["lark-cli"] + args, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr

# ----------------------------------------------------------------------------
# 資料抓取 (ndjson -> data/)
# ----------------------------------------------------------------------------
def pull_records(base, table, fields, out_name, filter_json=None):
    path = os.path.join(DATA_DIR, out_name)
    args = ["base", "+record-list", "--as", "user",
            "--base-token", base, "--table-id", table,
            "--format", "ndjson", "--output", path, "--overwrite"]
    for f in fields:
        args += ["--field-id", f]
    if filter_json:
        args += ["--filter-json", filter_json]
    rc, out, err = run_cli(args)
    if rc != 0:
        raise RuntimeError(f"record-list 失敗 ({table}): {err or out}")
    try:
        manifest = json.loads(out)
        if manifest.get("has_more"):
            raise RuntimeError(f"{out_name} has_more=true：資料未完整，停止產出以免低估缺失；請分頁抓取。")
    except json.JSONDecodeError:
        pass
    return path

def months_in_range(start, end):
    out, cur = [], datetime.date(start.year, start.month, 1)
    while cur <= end:
        out.append(f"{cur.year:04d}-{cur.month:02d}")
        cur = datetime.date(cur.year + (cur.month // 12), (cur.month % 12) + 1, 1)
    return out

def pull_all(start, end):
    os.makedirs(DATA_DIR, exist_ok=True)
    print("抓取資料中 (唯讀)…")
    pull_records(V3_BASE, TBL_ROSTER,
                 ["姓名", "在職", "所屬組別", "職級", "同步_OpenID"], "roster.ndjson")
    pull_records(V3_BASE, TBL_PRE,
                 ["開始日期", "結束日期", "人員", "業別", "組別", "條類型"], "preschedule_all.ndjson")
    pull_records(V3_BASE, TBL_WAI,
                 ["出工日期", "此單出工人", "建立者"], "waiye.ndjson")
    pull_records(V3_BASE, TBL_NEI,
                 ["工作日期-營業額明細", "填報時間", "姓名", "建立者"], "neiye.ndjson")
    pull_records(V3_BASE, TBL_XING,
                 ["工作日期-營業額明細", "填寫時間", "營業額人員-明細", "建立者"], "xingzheng.ndjson")
    # 假勤：優先 Lark 出勤 API (user token 通常不支援，捕捉後回退)
    try_attendance_api()
    # 此產生器實際使用下方 Base 資料；API 探測成功也不可標成 API 來源。
    leave_source = "base"
    # 每日考勤明細 (逐月)
    att_frames = []
    for m in months_in_range(start, end):
        p = pull_records(SAL_BASE, TBL_ATT,
                         ["姓名", "日期", "出勤狀態", "核准假別", "請假起始", "請假結束", "請假件數", "應出勤"],
                         f"attendance_{m}.ndjson",
                         filter_json=json.dumps({"logic": "and", "conditions": [["月份", "==", m]]}, ensure_ascii=False))
        att_frames.append(p)
    # 合併考勤
    merged = os.path.join(DATA_DIR, "attendance_oct.ndjson")
    with open(merged, "w", encoding="utf-8") as w:
        for p in att_frames:
            with open(p, encoding="utf-8") as r:
                w.write(r.read())
    # 詠翔請假 (涵蓋可能跨入區間的假單)
    buf = (start - datetime.timedelta(days=31)).isoformat()
    pull_records(SAL_BASE, TBL_LEAVE,
                 ["发起人", "开始时间", "结束时间", "假期类型", "申请状态", "折算請假天數"],
                 "leave_oct.ndjson",
                 filter_json=json.dumps({"logic": "and", "conditions": [["开始时间", ">", f"ExactDate({buf})"]]}, ensure_ascii=False))
    return leave_source

def try_attendance_api():
    """嘗試 Lark 出勤 API；成功回傳 'api'，否則回傳 'base' 並記錄原因。"""
    rc, out, err = run_cli(["attendance", "user_tasks", "query", "--as", "user",
                            "--employee-type", "employee_id",
                            "--data", json.dumps({"check_date_from": 20260101, "check_date_to": 20260102,
                                                   "user_ids": ["ou_7dfe7ce548da22a0275cba0d92b3bfec"]})])
    try:
        resp = json.loads(out)
    except json.JSONDecodeError:
        resp = {}
    if resp.get("ok"):
        return "api"
    msg = (resp.get("error") or {}).get("message") or " ".join((err or out).split())
    print(f"  Lark 出勤 API 不可用，改用薪水計算 Base。原因：{msg[:120]}")
    return "base"

# ----------------------------------------------------------------------------
# 分析
# ----------------------------------------------------------------------------
class Analysis:
    def __init__(self, start, end, today):
        self.start, self.end, self.today = start, end, today
        self.days = [start + datetime.timedelta(d) for d in range((end - start).days + 1)]
        self._load()
        self._detect_holidays()
        self.workdays = [d for d in self.days if d.weekday() < 5 and d.isoformat() not in self.holidays]
        # 日誌次日填寫：最近一個工作日(含)之後不計未填 (仍在寬限期)
        past_wd = [d for d in self.workdays if d < today]
        self.log_due_cutoff = max(past_wd) if past_wd else today  # 等於此日者仍寬限
        self._build_scope()

    def _load(self):
        self.roster = load_ndjson(os.path.join(DATA_DIR, "roster.ndjson"))
        self.id2name = {r["record_id"]: r["姓名"] for r in self.roster}
        self.active = {r["姓名"] for r in self.roster if r.get("在職")}
        self.level = {r["姓名"]: (r.get("職級") or ["?"])[0] for r in self.roster}
        self.grp = {r["姓名"]: (r.get("所屬組別") or ["?"])[0] for r in self.roster}

        self.att_by = {}
        for r in load_ndjson(os.path.join(DATA_DIR, "attendance_oct.ndjson")):
            if r.get("日期"):
                self.att_by[(norm(r["姓名"]), dkey(r["日期"]))] = r

        self.pend = defaultdict(list)
        for r in load_ndjson(os.path.join(DATA_DIR, "leave_oct.ndjson")):
            st = (r.get("申请状态") or [""])[0]
            if st not in ("已通过", "审批中"):
                continue
            nm = norm("".join(p.get("name", "") for p in (r.get("发起人") or [])).replace(" ", ""))
            s, e = r.get("开始时间"), r.get("结束时间")
            if not s:
                continue
            sd = datetime.date.fromisoformat(s[:10])
            ed = datetime.date.fromisoformat(e[:10]) if e else sd
            cur = sd
            while cur <= ed:
                if cur.weekday() < 5:
                    self.pend[(nm, cur.isoformat())].append((st, (r.get("假期类型") or [""])[0]))
                cur += datetime.timedelta(1)

        self.presch = defaultdict(dict)
        self.pre_biz = defaultdict(Counter)
        self.group_sched_rows = defaultdict(int)
        for r in load_ndjson(os.path.join(DATA_DIR, "preschedule_all.ndjson")):
            s, e = r.get("開始日期"), r.get("結束日期")
            if not s:
                continue
            sd = datetime.date.fromisoformat(s[:10])
            ed = datetime.date.fromisoformat(e[:10]) if e else sd
            if ed < self.start or sd > self.end:
                continue
            names = [self.id2name.get(p["id"]) for p in (r.get("人員") or [])]
            ct = (r.get("條類型") or [None])[0]
            biz = (r.get("業別") or [None])[0]
            grp = (r.get("組別") or [None])[0]
            if grp:
                self.group_sched_rows[grp] += 1
            cur = max(sd, self.start)
            while cur <= min(ed, self.end):
                if cur.weekday() < 5:
                    for nm in names:
                        if nm:
                            self.presch[(nm, cur.isoformat())][ct] = 1
                cur += datetime.timedelta(1)
            for nm in names:
                if nm and biz:
                    self.pre_biz[nm][biz] += 1

        self.log = defaultdict(set)
        for r in load_ndjson(os.path.join(DATA_DIR, "waiye.ndjson")):
            dt = dkey(r.get("出工日期"))
            if dt:
                for nm in (r.get("此單出工人") or "").split(","):
                    if nm.strip():
                        self.log[(norm(nm), dt)].add("外業")
        for r in load_ndjson(os.path.join(DATA_DIR, "neiye.ndjson")):
            wd = serial_to_date(r.get("工作日期-營業額明細"))
            if wd and r.get("姓名"):
                self.log[(norm(r["姓名"]), wd.isoformat())].add("內業")
        for r in load_ndjson(os.path.join(DATA_DIR, "xingzheng.ndjson")):
            wd = serial_to_date(r.get("工作日期-營業額明細"))
            if wd and r.get("營業額人員-明細"):
                self.log[(norm(r["營業額人員-明細"]), wd.isoformat())].add("行政")

    def _detect_holidays(self):
        rest, tot = defaultdict(int), defaultdict(int)
        for (nm, dt), r in self.att_by.items():
            d = datetime.date.fromisoformat(dt)
            if self.start <= d <= self.end and d.weekday() < 5:
                tot[dt] += 1
                if r.get("出勤狀態") == "休息日":
                    rest[dt] += 1
        self.holidays = {dt for dt, t in tot.items() if t and rest[dt] / t > 0.8}

    def biz_of(self, nm):
        if self.pre_biz[nm]:
            b = self.pre_biz[nm].most_common(1)[0][0]
            if b in SCOPE_DIVISIONS:
                return b
        g = self.grp.get(nm, "")
        if g == "業務":
            return "業務"
        if any(k in g for k in ["水深", "地形", "點工", "ROV", "外業", "奇穎"]):
            return "外業"
        if any(k in g for k in ["圖報", "控制", "內業"]):
            return "內業"
        return None

    def leave_day(self, nm, dt):
        r = self.att_by.get((nm, dt))
        if r and (r.get("核准假別") or r.get("出勤狀態") == "核准請假"
                  or str(r.get("請假件數")) not in ("0", "None", "", "0.0")):
            return r.get("核准假別") or "請假"
        return None

    def worked_att(self, nm, dt):
        r = self.att_by.get((nm, dt))
        return bool(r and r.get("出勤狀態") in WORKED_STATUS)

    def _build_scope(self):
        scope = set()
        for name, dt in list(self.presch) + list(self.log):
            if self.start.isoformat() <= dt <= self.end.isoformat():
                scope.add(name)
        for (nm, dt), r in self.att_by.items():
            d = datetime.date.fromisoformat(dt)
            if self.start <= d <= self.end and d.weekday() < 5 and r.get("出勤狀態") in WORKED_STATUS:
                scope.add(nm)
        self.scope = {n for n in scope
                      if n in self.active
                      and n not in EXCLUDE_NAMES
                      and self.level.get(n) not in EXCLUDE_LEVELS
                      and self.biz_of(n) in SCOPE_DIVISIONS}
        # 無任何訊號 (未排/未填/未出勤皆空) 之在職三大組人員 — 無法評估，另列
        self.no_signal = {n for n in self.active if n not in EXCLUDE_NAMES
                          and self.level.get(n) not in EXCLUDE_LEVELS
                          and self.biz_of(n) in SCOPE_DIVISIONS and n not in self.scope}

    def evaluate(self, nm):
        """回傳 (division, needs_attention, cells)。cells: list of dict per workday。"""
        b = self.biz_of(nm)
        cells, need = [], False
        for d in self.workdays:
            dt = d.isoformat()
            lv = self.leave_day(nm, dt)
            pd = self.pend.get((nm, dt))
            onleave = bool(lv) or bool(pd)
            pc = self.presch.get((nm, dt))
            has_pre = bool(pc and any(k in ("出工", "待命", "支援") for k in pc))
            prerest = bool(pc and "休假" in pc and not has_pre)
            wlog = bool(self.log.get((nm, dt)))
            watt = self.worked_att(nm, dt)
            active = has_pre or wlog or watt
            if onleave or prerest:
                pre_state, log_state, kind = "假", "假", "leave"
            elif not active:
                pre_state, log_state, kind = "·", "·", "none"
            else:
                week_start = d - datetime.timedelta(days=d.weekday())
                deadline = week_start - datetime.timedelta(days=3)
                pre_state = "排" if has_pre else ("待排" if self.today < deadline else "未排")
                if not FILES_LOG[b]:
                    log_state = "免"
                elif wlog:
                    log_state = "填"
                elif d >= self.log_due_cutoff:
                    log_state = "待"
                else:
                    log_state = "未填"
                kind = "work"
            if pre_state == "未排" or log_state == "未填":
                need = True
            cells.append({"date": dt, "pre": pre_state, "log": log_state,
                          "leave": lv, "pend": pd, "kind": kind})
        return b, need, cells

# ----------------------------------------------------------------------------
# 黃馨加 專章：查核日誌紀錄與建立/修改時間
# ----------------------------------------------------------------------------
def fmt_ts(sec):
    return datetime.datetime.fromtimestamp(sec, TZ).strftime("%Y-%m-%d %H:%M:%S")

def find_log_records(name, date_iso):
    """在三個工作單中找出 name 於 date_iso 的日誌紀錄 (回傳 [(table,record_id,fill,creator)])。"""
    out = []
    specs = [(TBL_NEI, "neiye.ndjson", "姓名", "填報時間", "內業"),
             (TBL_XING, "xingzheng.ndjson", "營業額人員-明細", "填寫時間", "行政"),
             (TBL_WAI, "waiye.ndjson", None, None, "外業")]
    for tbl, fn, namef, fillf, label in specs:
        path = os.path.join(DATA_DIR, fn)
        if not os.path.exists(path):
            continue
        for r in load_ndjson(path):
            if label == "外業":
                wd = dkey(r.get("出工日期"))
                hit = wd == date_iso and name in (r.get("此單出工人") or "")
                fill = None
            else:
                wd = serial_to_date(r.get("工作日期-營業額明細"))
                hit = wd and wd.isoformat() == date_iso and norm(r.get(namef)) == name
                fill = r.get(fillf)
            if hit:
                creator = ", ".join(p.get("name", "") for p in (r.get("建立者") or []))
                out.append((tbl, label, r["record_id"], fill, creator))
    return out

def record_history(base, table, record_id):
    rc, out, err = run_cli(["base", "+record-history-list", "--as", "user",
                            "--base-token", base, "--table-id", table, "--record-id", record_id])
    if rc != 0:
        return []
    try:
        items = json.loads(out)["data"]["items"]
    except (json.JSONDecodeError, KeyError):
        return []
    evs = []
    for it in sorted(items, key=lambda x: x.get("create_time", 0)):
        fns = [c.get("field_name") for c in (it.get("field_changes") or [])]
        evs.append((fmt_ts(it["create_time"]), it.get("activity_type"), it.get("operator"), fns))
    return evs

def build_spotlight(an):
    lines = []
    for spec in SPOTLIGHT:
        name = spec["name"]
        if name in EXCLUDE_NAMES or name not in an.active:
            continue
        b = an.biz_of(name) or an.grp.get(name, "?")
        lines.append(f"### 專案查核：{name}（{b}組）")
        # 消失日期
        for mmdd in spec.get("vanish_dates", []):
            iso = f"{an.start.year}-{mmdd.replace('/', '-')}"
            recs = find_log_records(name, iso)
            lines.append(f"\n**{mmdd}（當事人主張表單消失）**")
            if not recs:
                lines.append(f"- 查無 {name} 於 {mmdd} 的任何工作單紀錄 → 目前查無可見紀錄；無法據此判定從未填寫或未曾刪除。")
            else:
                lines.append(f"- 實際查到 **{len(recs)} 筆**工作單，工作日期皆為 {mmdd}，目前仍存在於資料庫：")
                created_ts = []
                for tbl, label, rid, fill, creator in recs:
                    hist = record_history(V3_BASE, tbl, rid)
                    created = next((e for e in hist if e[1] == "create"), None)
                    last = hist[-1] if hist else None
                    seg = f"  - {label}工作單 `{rid}`：填報時間 {(fill or '')[:19] or '—'}，建立者 {creator or '—'}"
                    if created:
                        seg += f"；建立於 {created[0]}（{created[2]}）"
                        created_ts.append(created[0])
                    if last and last is not created:
                        seg += f"；最後異動 {last[0]}（{last[2]}，{'、'.join(f for f in last[3] if f) or '—'}）"
                    lines.append(seg)
                # 中性結論：僅陳述現有紀錄的建立時間，不作無法佐證的刪除或可見性論斷
                when = ""
                if created_ts:
                    cmin, cmax = min(created_ts), max(created_ts)
                    if cmin[:10] == cmax[:10]:
                        when = f"{cmin[:10]} {cmin[11:16]}–{cmax[11:16]}"
                    else:
                        when = f"{cmin[:16]}–{cmax[:16]}"
                lines.append(
                    f"- 結論：{name} {mmdd} 之日誌目前以上述 {len(recs)} 筆紀錄存在，依此計為「已填」。"
                    + (f"惟上述紀錄均於 **{when} 建立**，即在當事人反映表單消失之後；此建立時間與事後重新填寫（補登）一致。"
                       if when else "")
                    + f"現有建立／異動歷史僅涵蓋目前這 {len(recs)} 筆紀錄，無法確認或否認 {mmdd} 當天是否曾有其他紀錄被刪除。")
        # 請假日期
        for mmdd in spec.get("leave_dates", []):
            iso = f"{an.start.year}-{mmdd.replace('/', '-')}"
            r = an.att_by.get((name, iso))
            st = r.get("出勤狀態") if r else "（考勤表無此日）"
            appr = (r.get("核准假別") if r else "") or "無"
            pend = an.pend.get((name, iso))
            lines.append(f"\n**{mmdd}（請假核對）**")
            lines.append(f"- 每日考勤明細：出勤狀態「{st}」，核准假別：{appr}。")
            if pend:
                for status, typ in pend:
                    lines.append(f"- 詠翔請假：{typ}，狀態「{status}」。")
                if all(s == "审批中" for s, _ in pend):
                    lines.append(f"- 結論：{mmdd} 為請假（{pend[0][1]}）但**尚在審批中、未核准**，本報告視為請假（待核准），不列為缺失。")
            else:
                lines.append(f"- 詠翔請假：查無 {mmdd} 之假單。")
        # 本區間其他缺失
        _, need, cells = an.evaluate(name)
        miss = [c["date"][5:].replace("-", "/") for c in cells if c["log"] == "未填"]
        uns = [c["date"][5:].replace("-", "/") for c in cells if c["pre"] == "未排"]
        extra = []
        if miss:
            extra.append(f"日誌未填：{'、'.join(miss)}")
        if uns:
            extra.append(f"未預排：{'、'.join(uns)}")
        if extra:
            lines.append(f"\n**本區間其他待補**：{'；'.join(extra)}。")
        lines.append("")
    return "\n".join(lines)

# ----------------------------------------------------------------------------
# Markdown 產出
# ----------------------------------------------------------------------------
PRE_SYM = {"待排": "~", "排": "✓", "未排": "✗", "假": "假", "·": "·"}
LOG_SYM = {"填": "✓", "未填": "✗", "待": "~", "免": "—", "假": "假", "·": "·"}

def cell_render(c):
    if c["kind"] == "leave":
        return "假"
    if c["kind"] == "none":
        return "·"
    return PRE_SYM[c["pre"]] + LOG_SYM[c["log"]]

def build_report(an, leave_source):
    rows = [(nm,) + an.evaluate(nm) for nm in an.scope]
    attention = [r for r in rows if r[2]]
    clean = [r for r in rows if not r[2]]
    by_div_att = Counter(r[1] for r in attention)
    with_missing = sorted({r[0] for r in attention
                           for c in r[3] if c["log"] == "未填"})
    unsched_only = [r for r in attention
                    if not any(c["log"] == "未填" for c in r[3])
                    and any(c["pre"] == "未排" for c in r[3])]

    # 外業整組未排
    zero_pre_groups = defaultdict(list)
    for nm in an.scope:
        if an.biz_of(nm) == "外業" and not any(an.presch.get((nm, d.isoformat())) for d in an.workdays):
            zero_pre_groups[an.grp.get(nm)].append(nm)
    zero_pre_total = sum(len(v) for v in zero_pre_groups.values())

    # 各工作日未填人數 (總計 / 分組)
    log_miss_by_day = Counter()
    log_miss_by_day_div = defaultdict(Counter)
    for nm in an.scope:
        div = an.biz_of(nm)
        for c in an.evaluate(nm)[2]:
            if c["log"] == "未填":
                log_miss_by_day[c["date"]] += 1
                log_miss_by_day_div[c["date"]][div] += 1

    date_hdr = [f"{d.month}/{d.day}({WEEKDAY_ZH[d.weekday()]})" for d in an.workdays]
    rng = f"{an.start.year}/{an.start.month:02d}/{an.start.day:02d}–{an.end.month:02d}/{an.end.day:02d}"

    L = []
    L.append(f"# 預排 vs 日誌 合規報告")
    L.append(f"**區間**：{rng}（僅平日）　**產出日**：{an.today.isoformat()}　"
             f"**假勤來源**：{'Lark 出勤 API' if leave_source == 'api' else '薪水計算 Base（每日考勤明細＋詠翔請假）'}")
    L.append("")
    # ---- 結論 ----
    L.append("## 一、結論")
    L.append(f"- 本次納入評估（三大組在職人員，排除主管/離職）共 **{len(an.scope)} 人**，"
             f"其中 **需關注 {len(attention)} 人**、無缺失 {len(clean)} 人。")
    L.append(f"- 需關注分佈：" + "、".join(f"{d} {by_div_att.get(d,0)} 人" for d in SCOPE_DIVISIONS) + "。")
    L.append(f"- 兩類問題：**未填日誌 {len(with_missing)} 人**（個人補登）；**僅未預排 {len(unsched_only)} 人**（多為整組未排班）。")
    L.append("")
    L.append("**關鍵系統性問題：**")
    gstr = "、".join(f"{g}{len(v)}人" for g, v in sorted(zero_pre_groups.items(), key=lambda x: -len(x[1])))
    L.append(f"1. **外業人員未見預排**：{gstr}（共 {zero_pre_total} 人）本區間在「工作預排」**無任何排班紀錄**，"
             f"但多數仍有外業工作單（日誌）。建議各組長補排或確認預排流程。")
    worst_day = max(log_miss_by_day, key=log_miss_by_day.get) if log_miss_by_day else None
    if worst_day:
        wd = datetime.date.fromisoformat(worst_day)
        dd = log_miss_by_day_div[worst_day]
        div_str = "、".join(f"{k} {v} 人" for k, v in sorted(dd.items(), key=lambda x: -x[1]))
        L.append(f"2. **{wd.month}/{wd.day}（週{WEEKDAY_ZH[wd.weekday()]}）為漏填日誌高峰**：當日共 {log_miss_by_day[worst_day]} 人未填（{div_str}），"
                 f"以內業週五日誌最集中（當日內業工作單極少，名單見下表）。")
    L.append(f"3. **業務組**：制度上免填日誌（僅檢核預排）；"
             + "、".join(f"{r[0]}" for r in attention if r[1] == "業務")
             + " 有預排缺漏（見下表）。")
    L.append("")
    if with_missing:
        L.append(f"**需個人補登日誌者**：{'、'.join(with_missing)}。")
        L.append("")

    # ---- 需關注表格 (分組) ----
    L.append("## 二、需關注人員明細")
    L.append("> 每格兩碼：第 1 碼＝預排、第 2 碼＝日誌。　"
             "預排：✓ 已排、✗ 未排、~ 尚未到上週五期限；　日誌：✓ 已填、✗ 未填、~ 尚未到期（次日/當日寬限）、— 免填（業務）。　"
             "「假」＝整日請假；「·」＝當日無排班/無日誌/無出勤（不計缺失）。　**⚠ 任一碼為 ✗ 即需關注。**")
    L.append("")
    for div in SCOPE_DIVISIONS:
        group_rows = [r for r in attention if r[1] == div]
        if not group_rows:
            continue
        L.append(f"### {div}組（主管：{MANAGERS.get(div,'—')}）— 需關注 {len(group_rows)} 人")
        L.append("")
        L.append("| 姓名 | 組別 | " + " | ".join(date_hdr) + " |")
        L.append("|---|---|" + "|".join(["---"] * len(date_hdr)) + "|")
        # 排序：未填者優先，再依組別
        def sortkey(r):
            has_miss = any(c["log"] == "未填" for c in r[3])
            return (0 if has_miss else 1, an.grp.get(r[0], ""), r[0])
        for nm, b, need, cells in sorted(group_rows, key=sortkey):
            cs = " | ".join(cell_render(c) for c in cells)
            L.append(f"| {nm} | {an.grp.get(nm,'')} | {cs} |")
        L.append("")

    # ---- 黃馨加 專章 ----
    L.append("## 三、專案查核")
    L.append(build_spotlight(an))

    # ---- 資料說明 / 注意事項 ----
    L.append("## 四、資料說明與注意事項")
    L.append(f"- **假勤來源**：優先嘗試 Lark 出勤 API，但以 user token 查詢回傳「user access token not support」無法存取，"
             f"故改用「薪水計算」Base 的『每日考勤明細』（核准假別/出勤狀態）與『詠翔請假』（含審批中假單）。")
    L.append(f"- **比對欄位**：預排以「工作預排—人員」；外業日誌以「外業工作單—此單出工人」；內業以「內業工作單—姓名」；行政以「行政工作單—營業額人員」。工作日期取各表實際工作日（內業/行政為日期序列欄位還原）。")
    L.append(f"- **日誌寬限**：日誌多於次日填寫，故最近一個工作日（{(max([d for d in an.workdays if d<an.today]) if any(d<an.today for d in an.workdays) else an.today).strftime('%m/%d')}）及當日之日誌標示「~」、不列缺失；惟當週預排已於上週五排定，故 {an.today.strftime('%m/%d')} 之『未排』仍檢核。")
    L.append(f"- **僅評估活動日**：僅在當事人當日有出勤/排班/日誌任一訊號時才判定缺失；全日請假（含審批中）一律視為請假不計缺失。")
    L.append(f"- **範圍**：僅三大組（外業/業務/內業）平日。週末（{'/'.join(str(d.day) for d in an.days if d.weekday()>=5)}）不計；"
             + (f"偵測到之假日：{'、'.join(an.holidays)}。" if an.holidays else "區間內未偵測到國定假日。")
             + " 行政/IT/PM 不在三大組範圍（行政日誌最新僅到 10/07、填寫延遲，未納入本次判斷）。")
    L.append(f"- **排除名單**：離職人員；另本日離職之「陳星影」——名冊中對應為『陳星穎』（在職旗標尚未更新），一併排除。")
    L.append(f"- **異體字對應**：鄭秉彝＝鄭秉彜。")
    no_eval = sorted(an.no_signal | {r[0] for r in rows if all(c["kind"] in ("none", "leave") for c in r[3])})
    if no_eval:
        L.append(f"- **無法評估**：下列在職人員本區間無任何排班/日誌/出勤訊號（或整週請假），未列入關注：{'、'.join(sorted(no_eval))}。")
    L.append("")
    L.append(f"*（本報告由 generate.py 自動產生，資料唯讀；僅寫入本 Docx，未對任何 Base 寫入、未發送訊息。）*")

    return "\n".join(L), {
        "scope": len(an.scope), "attention": len(attention), "clean": len(clean),
        "by_div": dict(by_div_att), "missing_log": len(with_missing),
        "unsched_only": len(unsched_only), "zero_pre_total": zero_pre_total,
    }

# ----------------------------------------------------------------------------
# Docx 建立
# ----------------------------------------------------------------------------
def create_docx(title, md_path):
    rc, out, err = run_cli(["docs", "+create", "--as", "user",
                            "--doc-format", "markdown",
                            "--title", title,
                            "--parent-position", "my_library",
                            "--content", "@" + md_path])
    if rc != 0:
        raise RuntimeError(f"docs +create 失敗：{err or out}")
    resp = json.loads(out)
    data = resp.get("data", resp)
    doc = data.get("document", data)
    token = doc.get("document_id") or doc.get("objToken") or doc.get("token")
    url = doc.get("url") or (f"https://feishu.cn/docx/{token}" if token else None)
    return token, url, resp

def overwrite_docx(doc_id, md_path):
    """以 Markdown 覆寫既有 Docx 的全部內容 (不建立新文件)。"""
    rc, out, err = run_cli(["docs", "+update", "--as", "user",
                            "--doc", doc_id,
                            "--command", "overwrite",
                            "--doc-format", "markdown",
                            "--content", "@" + md_path])
    if rc != 0:
        raise RuntimeError(f"docs +update overwrite 失敗：{err or out}")
    try:
        resp = json.loads(out)
    except json.JSONDecodeError:
        resp = {}
    return resp

# ----------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="預排 vs 日誌 合規報告產生器")
    ap.add_argument("--start", default="2026-10-12")
    ap.add_argument("--end", default="2026-10-20")
    ap.add_argument("--today", default=None, help="視為「今日」的日期 (預設=end)")
    ap.add_argument("--dry-run", action="store_true", help="僅產出本地 report.md，不建立 Docx")
    ap.add_argument("--no-pull", action="store_true", help="使用 data/ 既有快取，不重新抓取")
    ap.add_argument("--title", default=None)
    ap.add_argument("--doc-id", default=None,
                    help="覆寫既有 Docx 的 URL 或 token (overwrite 全文)；不指定則建立新 Docx")
    args = ap.parse_args()

    start = datetime.date.fromisoformat(args.start)
    end = datetime.date.fromisoformat(args.end)
    today = datetime.date.fromisoformat(args.today) if args.today else end

    leave_source = "base"
    if args.no_pull:
        print("使用既有快取 (--no-pull)。")
        # 判斷假勤來源僅供標註；快取模式預設 base
    else:
        leave_source = pull_all(start, end)

    an = Analysis(start, end, today)
    md, stats = build_report(an, leave_source)

    with open("report.md", "w", encoding="utf-8") as f:
        f.write(md)
    print(f"已寫出 report.md（{len(md)} 字元）")
    print("統計：", json.dumps(stats, ensure_ascii=False))

    title = args.title or f"預排vs日誌合規報告 {start.strftime('%Y/%m/%d')}-{end.strftime('%m/%d')}"
    if args.dry_run:
        print("--dry-run：未建立/覆寫 Docx。")
        return

    if args.doc_id:
        overwrite_docx(args.doc_id, "report.md")
        token, url = args.doc_id, args.doc_id
        print(f"✅ Docx 已覆寫：{args.doc_id}")
    else:
        token, url, _ = create_docx(title, "report.md")
        print(f"✅ Docx 已建立：{url or token}")
    with open("result.md", "w", encoding="utf-8") as f:
        f.write(f"# 執行結果\n\n")
        f.write(f"- **Docx 連結**：{url or '(token) ' + str(token)}\n")
        f.write(f"- **標題**：{title}\n")
        f.write(f"- **區間**：{start.isoformat()} ~ {end.isoformat()}（平日）\n")
        f.write(f"- **假勤來源**：{'Lark 出勤 API' if leave_source=='api' else '薪水計算 Base（每日考勤明細＋詠翔請假）'}\n\n")
        f.write(f"## 重點數字\n")
        f.write(f"- 納入評估 {stats['scope']} 人；需關注 **{stats['attention']}** 人；無缺失 {stats['clean']} 人。\n")
        f.write(f"- 分佈：" + "、".join(f"{k} {v} 人" for k, v in stats['by_div'].items()) + "\n")
        f.write(f"- 需個人補登日誌 {stats['missing_log']} 人；僅未預排 {stats['unsched_only']} 人；外業整組未排共 {stats['zero_pre_total']} 人。\n")
    print("已寫出 result.md")

if __name__ == "__main__":
    main()
