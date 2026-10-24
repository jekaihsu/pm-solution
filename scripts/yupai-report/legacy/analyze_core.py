import json,datetime
from collections import defaultdict,Counter
EPOCH=datetime.date(1899,12,30)
def s2d(s):
    try:return EPOCH+datetime.timedelta(days=int(float(s)))
    except:return None
dk=lambda s:s[:10] if s else None
load=lambda p:[json.loads(l) for l in open(p) if l.strip()]
START=datetime.date(2026,10,12);END=datetime.date(2026,10,20);TODAY=datetime.date(2026,10,20)
ALIAS={'鄭秉彝':'鄭秉彜'}
norm=lambda n:ALIAS.get((n or '').strip(),(n or '').strip())
EXCLUDE={'陳星影','陳星穎'}
roster=load('data/roster.ndjson')
id2name={r['record_id']:r['姓名'] for r in roster}
active={r['姓名'] for r in roster if r.get('在職')}
level={r['姓名']:(r.get('職級') or ['?'])[0] for r in roster}
grp={r['姓名']:(r.get('所屬組別') or ['?'])[0] for r in roster}
days=[START+datetime.timedelta(d) for d in range((END-START).days+1)]
workdays=[d for d in days if d.weekday()<5]
log_due=lambda d:d<datetime.date(2026,10,19)
att=load('data/attendance_oct.ndjson')
att_by={(norm(r['姓名']),dk(r['日期'])):r for r in att if r.get('日期')}
WORKED={'已出勤','外業出勤','休息日出工','已出勤（打卡＋外業）','有出勤／有請假'}
def leave_day(n,dt):
    r=att_by.get((n,dt))
    if r and (r.get('核准假別') or r.get('出勤狀態')=='核准請假' or str(r.get('請假件數')) not in('0','None','','0.0')):
        return r.get('核准假別') or '請假'
    return None
def worked_att(n,dt):
    r=att_by.get((n,dt));return bool(r and r.get('出勤狀態') in WORKED)
pend=defaultdict(list)
for r in load('data/leave_oct.ndjson'):
    st=(r.get('申请状态') or [''])[0]
    if st not in('已通过','审批中'):continue
    nm=norm(''.join(p.get('name','') for p in(r.get('发起人') or[])).replace(' ',''))
    s=r.get('开始时间');e=r.get('结束时间')
    if not s:continue
    sd=datetime.date.fromisoformat(s[:10]);ed=datetime.date.fromisoformat(e[:10]) if e else sd
    cur=sd
    while cur<=ed:
        if cur.weekday()<5:pend[(nm,cur.isoformat())].append((st,(r.get('假期类型') or[''])[0]))
        cur+=datetime.timedelta(1)
presch=defaultdict(dict);pre_biz=defaultdict(Counter)
for r in load('data/preschedule_all.ndjson'):
    s=r.get('開始日期');e=r.get('結束日期')
    if not s:continue
    sd=datetime.date.fromisoformat(s[:10]);ed=datetime.date.fromisoformat(e[:10]) if e else sd
    if ed<START or sd>END:continue
    names=[id2name.get(p['id']) for p in(r.get('人員') or[])]
    ct=(r.get('條類型') or[None])[0];biz=(r.get('業別') or[None])[0]
    cur=max(sd,START)
    while cur<=min(ed,END):
        if cur.weekday()<5:
            for nm in names:
                if nm:presch[(nm,cur.isoformat())][ct]=1
        cur+=datetime.timedelta(1)
    for nm in names:
        if nm and biz:pre_biz[nm][biz]+=1
log=defaultdict(set)
for r in load('data/waiye.ndjson'):
    dt=dk(r.get('出工日期'))
    if dt:
        for nm in(r.get('此單出工人') or '').split(','):
            if nm.strip():log[(norm(nm),dt)].add('外業')
for r in load('data/neiye.ndjson'):
    wd=s2d(r.get('工作日期-營業額明細'))
    if wd and r.get('姓名'):log[(norm(r['姓名']),wd.isoformat())].add('內業')
for r in load('data/xingzheng.ndjson'):
    wd=s2d(r.get('工作日期-營業額明細'))
    if wd and r.get('營業額人員-明細'):log[(norm(r['營業額人員-明細']),wd.isoformat())].add('行政')
def biz_of(nm):
    if pre_biz[nm]:
        b=pre_biz[nm].most_common(1)[0][0]
        if b in('外業','內業','業務'):return b
    g=grp.get(nm,'')
    if g=='業務':return '業務'
    if any(k in g for k in['水深','地形','點工','ROV','外業','奇穎']):return '外業'
    if any(k in g for k in['圖報','控制','內業']):return '內業'
    return None
FILES_LOG={'外業':True,'內業':True,'業務':False}
scope=set()
for (nm,dt) in list(presch)+list(log):scope.add(nm)
for (nm,dt),r in att_by.items():
    dd=datetime.date.fromisoformat(dt)
    if START<=dd<=END and dd.weekday()<5 and r.get('出勤狀態') in WORKED:scope.add(nm)
scope={n for n in scope if n in active and n not in EXCLUDE and level.get(n) not in{'經理','老闆','副總','顧問'} and biz_of(n) in('外業','內業','業務')}

def evaluate(nm):
    b=biz_of(nm);cells=[];need=False
    for d in workdays:
        dt=d.isoformat()
        lv=leave_day(nm,dt);pd=pend.get((nm,dt));onleave=bool(lv) or bool(pd)
        pc=presch.get((nm,dt));has_pre=bool(pc and any(k in('出工','待命','支援') for k in pc));prerest=bool(pc and '休假' in pc and not has_pre)
        wlog=bool(log.get((nm,dt)));watt=worked_att(nm,dt)
        active_day = has_pre or wlog or watt
        if onleave or prerest:
            ps='假';ls='假';st='假'
        elif not active_day:
            ps='·';ls='·';st='休'   # no activity -> not expected
        else:
            ps='排' if has_pre else '未排'
            if not FILES_LOG[b]: ls='免'
            elif wlog: ls='填'
            elif not log_due(d): ls='待'
            else: ls='未填'
            st='ok'
        cell_need=(ps=='未排') or (ls=='未填')
        if cell_need:need=True
        cells.append({'date':dt,'pre':ps,'log':ls,'leave':lv,'pend':pd})
    return b,need,cells

rows=[(nm,)+evaluate(nm) for nm in scope]
att_rows=[r for r in rows if r[2]]
print('scope:',len(scope),'| attention:',len(att_rows),'| clean:',len(scope)-len(att_rows))
print('attention by biz:',Counter(r[1] for r in att_rows))
unsched_only=[r for r in att_rows if not any(c['log']=='未填' for c in r[3]) and any(c['pre']=='未排' for c in r[3])]
with_missing=[r for r in att_rows if any(c['log']=='未填' for c in r[3])]
print('with 未填:',len(with_missing),'| 未排-only:',len(unsched_only))
print('\n--- detail ---')
sym={'排':'✓','未排':'✗','假':'休','·':'·','填':'✓','未填':'✗','待':'·','免':'—','休':'·'}
for b,nm,need,cells in sorted([(r[1],r[0],r[2],r[3]) for r in att_rows]):
    pre=''.join(sym[c['pre']] for c in cells);lg=''.join(sym[c['log']] for c in cells)
    print(f"[{b}] {nm:5s} 預{pre} 誌{lg}")
