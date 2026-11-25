import re
# -*- coding: utf-8 -*-
"""EGYPT GAS local web interface. Uses the existing SQLite database without schema replacement."""
import os, json, sqlite3, hashlib, secrets, threading, webbrowser, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from pathlib import Path
BASE=Path(__file__).resolve().parent
DB=Path(os.environ.get('DB_PATH','/app/data/egypt_gas.db')).resolve()
SECURE_COOKIE=os.environ.get('SECURE_COOKIE','1')=='1'
COOKIE_FLAGS='; HttpOnly; SameSite=Strict; Path=/'+('; Secure' if SECURE_COOKIE else '')
WRITE_LOCK=threading.RLock()
UI=BASE/'web_ui'
SESSIONS={}
PAGE_CATALOG = {
 'dashboard':'لوحة التحكم',
 'items':'المخزن الرئيسي',
 'damaged':'الخامات التالفة',
 'movements':'الوارد والصرف',
 'foremen':'عهدة الفورمان',
 'foreman-documents':'مستندات العهد',
 'foreman-batch':'الإدخال الجماعي للعهدة',
 'global-search':'البحث الموحد',
 'meter-types':'أنواع العدادات',
 'meters':'إدارة العدادات',
 'meter-stock':'مخزن العدادات',
 'damaged-meters':'العدادات التالفة',
 'meter-replace':'تغيير عداد',
 'crn':'بحث C.R.N',
 'removed':'العدادات المفكوكة',
 'meter-history':'حركة العدادات',
 'meter-import':'مراجعة استيراد العدادات',
 'meter-receipts':'مستند وارد العدادات',
 'meter-receipt-register':'سجل مستندات الوارد',
 'meter-issues':'مستند صرف العدادات',
 'meter-installs':'مستند تركيب العدادات',
 'documents':'سجل المستندات',
 'archive':'أرشيف الحركات',
 'nov':'أرشيف نوفمبر',
 'reports':'التقارير',
 'advanced-reports':'التقارير الإدارية المتقدمة',
 'users':'المستخدمون والصلاحيات',
 'backup':'النسخ الاحتياطي',
 'quality':'فحص سلامة البيانات',
 'alerts':'مركز التنبيهات',
 'performance':'الأداء والسرعة',
 'audit':'سجل العمليات والمراقبة',
 'approvals':'مراجعة واعتماد المستندات'
}
ROLE_AR={'Super Admin':'مدير النظام الأعلى','Manager':'مدير','Storekeeper':'أمين المخزن','Meter Operator':'مسؤول العدادات','Viewer':'مستخدم عرض'}
ROLE_DEFAULT_PAGES={
 'Super Admin':set(PAGE_CATALOG),
 'Manager':set(PAGE_CATALOG)-{'users','backup'},
 'Storekeeper':{'dashboard','items','damaged','movements','foremen','foreman-documents','foreman-batch','global-search','documents','archive','nov','reports','advanced-reports','quality','alerts'},
 'Meter Operator':{'dashboard','global-search','meter-types','meters','meter-stock','damaged-meters','meter-replace','crn','removed','meter-history','meter-import','meter-receipts','meter-receipt-register','meter-issues','meter-installs','documents','archive','reports','advanced-reports','alerts'},
 'Viewer':{'dashboard','global-search','meter-stock','foremen','foreman-documents','meter-history','documents','archive','nov','reports','advanced-reports'}
}
API_PAGE_ACCESS={
 '/dashboard':{'dashboard'}, '/items':{'items'}, '/item-admin':{'items'},
 '/material-movement-documents':{'movements','foremen'},
 '/movements-drafts':{'movements'},
 '/archive':{'nov'}, '/damaged-workflow':{'removed'}, '/material-receipts':{'documents','archive'},
 '/meter-crn-history':{'crn'}, '/meter-global-search':{'global-search'},
 '/meter-import-audit.xlsx':{'meter-import'}, '/report.xlsx':{'reports','advanced-reports'},
 '/damaged-materials':{'damaged'}, '/damaged-material-admin':{'damaged'},
 '/movements':{'movements'}, '/foremen':{'foremen','foreman-documents','foreman-batch','meter-issues','meter-installs','meter-replace'},
 '/foreman-admin':{'foremen'}, '/foreman-adjust':{'foremen'}, '/foreman-weekly':{'foremen'},
 '/foreman-movement':{'foremen'}, '/foreman-documents':{'foreman-documents'},
 '/foreman-document-lines':{'foreman-documents'}, '/foreman-ledger':{'foreman-documents','foremen'},
 '/foreman-batch':{'foreman-batch'}, '/foreman-batch-options':{'foreman-batch'},
 '/foreman-stocktakes':{'foremen','foreman-documents'}, '/foreman-transfers':{'foremen','foreman-documents'},
 '/global-search':{'global-search'},
 '/meter-types':{'meter-types','meters','meter-receipts','meter-issues','meter-installs','meter-replace','meter-import'}, '/meter-type-admin':{'meter-types'}, '/meter-type-serials':{'meter-types','meters'},
 '/meters':{'meters'}, '/meter-profile':{'meters','crn'}, '/meter-stock':{'meter-stock','meter-issues','meter-receipts'},
 '/damaged-meter-stock':{'damaged-meters'}, '/meter-replacements':{'meter-replace'},
 '/meter-crn-timeline':{'crn'}, '/removed-meters':{'removed'}, '/removed-meter-state':{'removed'},
 '/meter-return-request':{'removed'}, '/meter-history':{'meter-history'}, '/meter-import-audit':{'meter-import'},
 '/meter-receipts':{'meter-receipts'}, '/receipt-docs':{'meter-receipts','meter-receipt-register','documents','archive'},
 '/meter-issues':{'meter-issues'}, '/meter-issue-search':{'meter-issues'}, '/issue-docs':{'meter-issues','documents','archive'},
 '/meter-installs':{'meter-installs'}, '/install-docs':{'meter-installs','documents','archive'},
 '/document-detail':{'approvals','documents','archive','movements','meter-receipt-register','meter-issues','meter-installs','foreman-documents','foremen'},
 '/document-register':{'documents','archive','foreman-documents','meter-receipt-register'},
 '/nov':{'nov'}, '/report':{'reports','advanced-reports'},
 '/users':{'users'}, '/user-admin':{'users'}, '/backup':{'backup'}, '/backup-check':{'backup'},
 '/data-quality':{'quality'}, '/alerts':{'alerts'}, '/alert-detail':{'alerts'},
 '/performance':{'performance'}, '/audit':{'audit'}, '/approvals':{'approvals'},
 '/approval-review':{'approvals'}, '/approval-history':{'approvals'}
}
def permissions_for_user(c,username,role):
    if role=='Super Admin': return sorted(PAGE_CATALOG)
    rows=c.execute('SELECT page_key,allowed FROM user_permissions WHERE username=?',(username,)).fetchall()
    if rows: return sorted(r['page_key'] for r in rows if r['allowed'] and r['page_key'] in PAGE_CATALOG)
    return sorted(ROLE_DEFAULT_PAGES.get(role,ROLE_DEFAULT_PAGES['Viewer']))
def has_custom_user_permissions(username):
    try:
        with db() as c:return bool(c.execute('SELECT 1 FROM user_permissions WHERE username=? LIMIT 1',(username,)).fetchone())
    except sqlite3.Error:return False
def user_can_access_api(user,path):
    key=(path[4:] if path.startswith('/api/') else path).rstrip('/')
    pages=API_PAGE_ACCESS.get(key)
    if not pages or user.get('role')=='Super Admin': return True
    try:
        with db() as c: allowed=set(permissions_for_user(c,user['username'],user['role']))
        return bool(allowed.intersection(pages))
    except sqlite3.Error: return False
_SCHEMA_READY=False
_SCHEMA_LOCK=threading.Lock()
def db():
    global _SCHEMA_READY
    c=sqlite3.connect(str(DB), timeout=60)
    c.row_factory=sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA busy_timeout=60000')
    c.execute('PRAGMA synchronous=FULL')
    if not _SCHEMA_READY:
        with _SCHEMA_LOCK:
            if not _SCHEMA_READY:
                cols={r['name'] for r in c.execute('PRAGMA table_info(meter_receipt_docs)').fetchall()}
                if cols and 'origin' not in cols:
                    c.execute("ALTER TABLE meter_receipt_docs ADD COLUMN origin TEXT NOT NULL DEFAULT ''")
                for table, column, definition in [('meter_receipt_lines','condition',"TEXT NOT NULL DEFAULT 'سليم'"),('meters','meter_code',"TEXT NOT NULL DEFAULT ''"),('meters','notes',"TEXT NOT NULL DEFAULT ''")]:
                    columns={r['name'] for r in c.execute(f'PRAGMA table_info({table})')}
                    if columns and column not in columns:
                        c.execute(f'ALTER TABLE {table} ADD COLUMN {column} {definition}')
                c.execute('''CREATE TABLE IF NOT EXISTS user_permissions(
                    username TEXT NOT NULL,
                    page_key TEXT NOT NULL,
                    allowed INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT,
                    updated_by TEXT,
                    PRIMARY KEY(username,page_key),
                    FOREIGN KEY(username) REFERENCES users(username) ON UPDATE CASCADE ON DELETE CASCADE
                )''')
                c.execute('''CREATE TABLE IF NOT EXISTS material_change_requests(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target_type TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_key TEXT NOT NULL,
                    foreman TEXT NOT NULL DEFAULT '',
                    old_data TEXT NOT NULL,
                    new_data TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    requested_by TEXT NOT NULL,
                    requested_at TEXT NOT NULL
                )''')
                c.execute("CREATE TABLE IF NOT EXISTS movement_requests(id INTEGER PRIMARY KEY, doc_no TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, foreman TEXT, week TEXT, notes TEXT, username TEXT, created_at TEXT, lines TEXT NOT NULL)")
                c.commit()
                _SCHEMA_READY=True
    return c
def hashed(salt,pwd):
    return hashlib.pbkdf2_hmac('sha256',pwd.encode(),bytes.fromhex(salt),220000).hex()
def json_bytes(obj):
    return json.dumps(obj,ensure_ascii=False,default=str).encode('utf-8')
def clean_rows(rows):
    return [dict(r) for r in rows]
def custody_qty(c,foreman,code):
    q=c.execute("""SELECT COALESCE(SUM(CASE WHEN type IN ('صرف','سلف') THEN qty
        WHEN type IN ('مرتجع','مركب') THEN -qty ELSE 0 END),0)
        FROM movements WHERE foreman=? AND code=? AND source='NEW'""",(foreman,code)).fetchone()[0]
    opening=c.execute('SELECT qty FROM foreman_opening WHERE foreman=? AND code=?',(foreman,code)).fetchone()
    delta=c.execute('SELECT COALESCE(SUM(new_qty-old_qty),0) FROM custody_adjustments WHERE foreman=? AND code=?',(foreman,code)).fetchone()[0]
    return round(float(q or 0)+(float(opening[0]) if opening else 0)+float(delta or 0),4)
REPORTS={
'الأصناف والأرصدة':("SELECT code,name,opening,received,legacy_balance,active FROM items ORDER BY name",('الكود','الصنف','الافتتاحي','الوارد','الرصيد الحالي','نشط'),None),
'الحركات':("SELECT id,created_at,doc,foreman,week,code,type,qty,notes,username,source FROM movements ORDER BY id DESC",('م','التاريخ','المستند','الفورمان','الأسبوع','الكود','الحركة','الكمية','ملاحظات','المستخدم','المصدر'),None),
'أرشيف نوفمبر':("SELECT foreman,code,name,week,issued,installed FROM archive_nov ORDER BY foreman,name",('الفورمان','الكود','الخامة','الأسبوع','المنصرف','المركب'),None),
'العدادات الحالية':("SELECT serial,meter_type,capacity,status,foreman,crn,received_at,meter_code FROM meters ORDER BY serial",('السيريال','نوع العداد','السعة','الحالة','الفورمان','C.R.N','تاريخ الوارد','كود العداد'),None),
'حركة العدادات':("SELECT id,created_at,serial,action,foreman,crn,username,notes FROM meter_events ORDER BY id DESC",('م','التاريخ','السيريال','الحركة','الفورمان','C.R.N','المستخدم','ملاحظات'),None),
'الفورمانات':("SELECT name,performance_no,mobile FROM foremen ORDER BY name",('الفورمان','رقم الأداء','الموبايل'),None),
'مستندات وارد العدادات':("SELECT id,doc_no,meter_type,created_at,username,notes FROM meter_receipt_docs ORDER BY id DESC",('م','رقم المستند','نوع العداد','التاريخ','المستخدم','ملاحظات'),None),
'مستندات صرف العدادات':("SELECT id,doc_no,foreman,created_at,username,notes FROM meter_issue_docs ORDER BY id DESC",('م','رقم المستند','الفورمان','التاريخ','المستخدم','ملاحظات'),None),
}
ADVANCED_REPORTS=(
'أرصدة المخزن الحالية','مستندات وارد المخزن','حركة الخامات حسب الفترة','عهدة الفورمانات من العدادات','حالة العدادات','تركيبات العدادات حسب الفترة','حركة العدادات حسب الفترة','مستندات الوارد والصرف وحالة الاعتماد','أداء الفورمانات في تركيب العدادات','ملخص التالف والإصلاح والعدادات المرتجعة','سجل دورة حياة العداد والاستبدال والإرجاع','كشف عهدة وحركة كل فورمان','سجل محاضر جرد ومطابقة عهدة الفورمانات','سجل تسليم واستلام العهدة بين الفورمانات')
def advanced_report(c,name,lo='',hi='',term=''):
    args=[]
    if name=='أرصدة المخزن الحالية': sql="SELECT code,name,opening,received,legacy_balance FROM items ORDER BY name"; cols=('الكود','الصنف','الافتتاحي','الوارد المسجل','الرصيد الحالي')
    elif name=='مستندات وارد المخزن': sql="SELECT m.created_at,m.doc,m.week,m.code,COALESCE(i.name,''),m.qty,m.notes,m.username FROM movements m LEFT JOIN items i ON i.code=m.code WHERE m.type='وارد'"; cols=('تاريخ التسجيل','رقم المستند','تاريخ المستند','كود الصنف','اسم الصنف','الكمية','المورد / الملاحظات','المستخدم')
    elif name=='حركة الخامات حسب الفترة': sql='SELECT created_at,doc,foreman,code,type,qty,username FROM movements WHERE 1=1'; cols=('التاريخ','المستند','الفورمان','الكود','الحركة','الكمية','المستخدم')
    elif name=='عهدة الفورمانات من العدادات': sql="SELECT foreman,meter_type,COUNT(*) FROM meters WHERE status='CUSTODY' GROUP BY foreman,meter_type ORDER BY foreman,meter_type"; cols=('الفورمان','نوع العداد','العدد في العهدة')
    elif name=='حالة العدادات': sql='SELECT meter_type,status,COUNT(*) FROM meters GROUP BY meter_type,status ORDER BY meter_type,status'; cols=('نوع العداد','الحالة','العدد')
    elif name=='تركيبات العدادات حسب الفترة': sql="SELECT created_at,serial,foreman,crn,username FROM meter_events WHERE action IN ('INSTALL','INSTALLED','تركيب')"; cols=('التاريخ','السيريال','الفورمان','C.R.N','المستخدم')
    elif name=='حركة العدادات حسب الفترة': sql='SELECT created_at,serial,action,foreman,crn,username FROM meter_events WHERE 1=1'; cols=('التاريخ','السيريال','الحركة','الفورمان','C.R.N','المستخدم')
    elif name=='مستندات الوارد والصرف وحالة الاعتماد':
        sql="""SELECT a.requested_at,CASE a.doc_kind WHEN 'RECEIPT' THEN 'وارد' WHEN 'METER_RETURN' THEN 'إرجاع عداد' ELSE 'صرف' END,COALESCE(r.doc_no,i.doc_no,ret.doc_no),a.status,a.requested_by,COALESCE(a.reviewed_by,''),COALESCE(a.reason,'') FROM document_approvals a LEFT JOIN meter_receipt_docs r ON a.doc_kind='RECEIPT' AND r.id=a.doc_id LEFT JOIN meter_issue_docs i ON a.doc_kind='ISSUE' AND i.id=a.doc_id LEFT JOIN meter_return_docs ret ON a.doc_kind='METER_RETURN' AND ret.id=a.doc_id WHERE 1=1"""; cols=('التاريخ','النوع','رقم المستند','الحالة','المنشئ','المراجع','سبب الرفض')
    elif name=='ملخص التالف والإصلاح والعدادات المرتجعة':
        sql="""SELECT COALESCE(w.state,COALESCE(r.condition,'غير مصنف')),COUNT(*),SUM(CASE WHEN m.status='STOCK' THEN 1 ELSE 0 END),SUM(CASE WHEN m.status='REMOVED' THEN 1 ELSE 0 END) FROM meters m LEFT JOIN removed_meter_details r ON r.serial=m.serial LEFT JOIN damaged_meter_workflow w ON w.serial=m.serial WHERE m.status IN ('REMOVED','STOCK') AND (r.serial IS NOT NULL OR w.serial IS NOT NULL) GROUP BY COALESCE(w.state,COALESCE(r.condition,'غير مصنف')) ORDER BY COUNT(*) DESC"""; cols=('الحالة / المصير','إجمالي العدادات','عاد للمخزن','ما زال مفكوكًا')
    elif name=='سجل دورة حياة العداد والاستبدال والإرجاع':
        sql="""SELECT e.created_at,e.serial,COALESCE(m.meter_type,''),e.action,COALESCE(e.foreman,''),COALESCE(e.crn,''),COALESCE(e.username,''),COALESCE(e.notes,'') FROM meter_events e LEFT JOIN meters m ON m.serial=e.serial WHERE 1=1"""; cols=('التاريخ','السيريال','نوع العداد','نوع الحركة','الفورمان','C.R.N','المستخدم','التفاصيل')
    elif name=='سجل تسليم واستلام العهدة بين الفورمانات':
        sql="""SELECT d.created_at,d.doc_no,d.from_foreman,d.to_foreman,d.username,a.status,COALESCE(a.reviewed_by,''),COALESCE(a.reviewed_at,''),COALESCE(a.reason,d.notes,''),(SELECT COUNT(*) FROM foreman_transfer_materials x WHERE x.doc_id=d.id),(SELECT COALESCE(SUM(x.qty),0) FROM foreman_transfer_materials x WHERE x.doc_id=d.id),(SELECT COUNT(*) FROM foreman_transfer_meters x WHERE x.doc_id=d.id),(SELECT GROUP_CONCAT(x.code || ' × ' || x.qty, ' | ') FROM foreman_transfer_materials x WHERE x.doc_id=d.id),(SELECT GROUP_CONCAT(x.serial, ' | ') FROM foreman_transfer_meters x WHERE x.doc_id=d.id) FROM foreman_transfer_docs d LEFT JOIN document_approvals a ON a.doc_kind='FOREMAN_TRANSFER' AND a.doc_id=d.id WHERE 1=1"""; cols=('تاريخ الطلب','رقم المستند','الفورمان المسلّم','الفورمان المستلم','منشئ الطلب','حالة الاعتماد','المدير المعتمد','تاريخ المراجعة','ملاحظات','عدد أصناف الخامات','إجمالي الكميات','عدد العدادات','تفاصيل أكواد الخامات والكميات','سيريالات العدادات')
    elif name=='سجل محاضر جرد ومطابقة عهدة الفورمانات':
        sql="""SELECT d.created_at,d.doc_no,d.foreman,d.username,a.status,(SELECT COUNT(*) FROM foreman_stocktake_materials x WHERE x.doc_id=d.id),(SELECT COUNT(*) FROM foreman_stocktake_materials x WHERE x.doc_id=d.id AND ABS(x.actual_qty-x.book_qty)>0.000001),(SELECT COUNT(*) FROM foreman_stocktake_meters x WHERE x.doc_id=d.id),(SELECT COUNT(*) FROM foreman_stocktake_meters x WHERE x.doc_id=d.id AND x.found=0),COALESCE(a.reviewed_by,''),COALESCE(a.reason,d.notes,'') FROM foreman_stocktakes d LEFT JOIN document_approvals a ON a.doc_kind='FOREMAN_STOCKTAKE' AND a.doc_id=d.id WHERE 1=1"""; cols=('تاريخ الجرد','رقم المحضر','الفورمان','مقدم الجرد','حالة الاعتماد','عدد الخامات','خامات بها فرق','عدد العدادات','عدادات لم يتم العثور عليها','المراجع','ملاحظات')
    elif name=='كشف عهدة وحركة كل فورمان':
        sql="""SELECT f.name,COALESCE((SELECT SUM(mv.qty) FROM movements mv WHERE mv.foreman=f.name AND mv.type='صرف'),0),COALESCE((SELECT COUNT(*) FROM movements mv WHERE mv.foreman=f.name AND mv.type='صرف'),0),COALESCE((SELECT SUM(mv.qty) FROM movements mv WHERE mv.foreman=f.name AND mv.type='وارد'),0),COALESCE((SELECT COUNT(*) FROM meters mt WHERE mt.foreman=f.name AND mt.status='CUSTODY'),0),COALESCE((SELECT COUNT(*) FROM meters mt WHERE mt.foreman=f.name AND mt.status='INSTALLED'),0),COALESCE((SELECT COUNT(*) FROM meter_events ev WHERE ev.foreman=f.name AND ev.action IN ('INSTALL','INSTALLED','تركيب')),0),COALESCE((SELECT COUNT(*) FROM meter_events ev WHERE ev.foreman=f.name AND (ev.action LIKE '%REMOV%' OR ev.action LIKE '%RETURN%' OR ev.action LIKE '%تالف%' OR ev.action LIKE '%فك%')),0) FROM foremen f ORDER BY f.name"""; cols=('الفورمان','إجمالي كميات الخامات المصروفة','عدد حركات الصرف','كميات الوارد المسجلة باسمه','عدادات في عهدته حاليًا','عدادات مركبة حاليًا','عمليات تركيب مسجلة','عمليات فك/إرجاع مسجلة')
    elif name=='أداء الفورمانات في تركيب العدادات': sql="SELECT foreman,COUNT(*),COUNT(DISTINCT crn) FROM meters WHERE status='INSTALLED' GROUP BY foreman ORDER BY COUNT(*) DESC"; cols=('الفورمان','العدادات المركبة حاليًا','أرقام C.R.N المختلفة')
    else: raise ValueError('اسم التقرير غير معروف')
    dated=name in ('مستندات وارد المخزن','حركة الخامات حسب الفترة','تركيبات العدادات حسب الفترة','حركة العدادات حسب الفترة','مستندات الوارد والصرف وحالة الاعتماد','سجل دورة حياة العداد والاستبدال والإرجاع','سجل محاضر جرد ومطابقة عهدة الفورمانات','سجل تسليم واستلام العهدة بين الفورمانات')
    if dated:
        date_col='a.requested_at' if name=='مستندات الوارد والصرف وحالة الاعتماد' else ('e.created_at' if name=='سجل دورة حياة العداد والاستبدال والإرجاع' else ('d.created_at' if name in ('سجل محاضر جرد ومطابقة عهدة الفورمانات','سجل تسليم واستلام العهدة بين الفورمانات') else 'created_at'))
        if lo: sql+=f' AND substr({date_col},1,10)>=?'; args.append(lo)
        if hi: sql+=f' AND substr({date_col},1,10)<=?'; args.append(hi)
    if lo or hi:
        import datetime as _dt
        for v in (lo,hi):
            if v and _dt.datetime.strptime(v,'%Y-%m-%d').strftime('%Y-%m-%d')!=v: raise ValueError('التاريخ بصيغة YYYY-MM-DD')
        if lo and hi and lo>hi: raise ValueError('تاريخ البداية بعد النهاية')
    
    if name in ('سجل دورة حياة العداد والاستبدال والإرجاع','سجل تسليم واستلام العهدة بين الفورمانات','سجل محاضر جرد ومطابقة عهدة الفورمانات') and 'ORDER BY' not in sql: sql+=' ORDER BY 1 DESC'
    rows=c.execute(sql,tuple(args)).fetchall()
    if term:
        q=term.casefold(); rows=[r for r in rows if q in ' '.join(str(x if x is not None else '') for x in r).casefold()]
    return cols,rows

class Handler(BaseHTTPRequestHandler):
    server_version='EGYPTGAS-Web/1.0'
    def log_message(self,*a): pass
    def send(self,status,obj,headers=None,ctype='application/json; charset=utf-8'):
        data=obj if isinstance(obj,bytes) else json_bytes(obj)
        self.send_response(status); self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','same-origin')
        if headers:
            for k,v in headers.items(): self.send_header(k,v)
        self.end_headers(); self.wfile.write(data)
    def body(self):
        n=int(self.headers.get('Content-Length','0') or 0)
        if n>30_000_000: raise ValueError('حجم الملف أكبر من الحد المسموح (30 ميجابايت)')
        raw=self.rfile.read(n) if n else b'{}'
        return json.loads(raw.decode('utf-8'))
    def session(self):
        cookie=self.headers.get('Cookie','')
        sid=''
        for part in cookie.split(';'):
            if part.strip().startswith('egsid='): sid=part.strip()[6:]
        user=SESSIONS.get(sid)
        if user and time.time()-user['created']>43200:
            SESSIONS.pop(sid,None); user=None
        if user:
            with db() as c:
                row=c.execute('SELECT role FROM users WHERE username=?',(user['username'],)).fetchone()
            if not row: SESSIONS.pop(sid,None); user=None
            else: user=dict(user,role=row['role'])
        return user,sid
    def require(self):
        user,sid=self.session()
        if not user:
            self.send(401,{'error':'انتهت الجلسة، سجل الدخول مرة أخرى'})
            return None
        return user
    def do_GET(self):
        path=urlparse(self.path).path
        if path=='/' or path=='/index.html':
            try: data=(UI/'index.html').read_bytes()
            except OSError: return self.send(500,{'error':'ملفات الواجهة غير موجودة'})
            return self.send(200,data,ctype='text/html; charset=utf-8')
        if path.startswith('/assets/'):
            name=Path(path).name
            allowed={'logo.png','login-bg.png','main.js'}
            if name not in allowed: return self.send(404,{'error':'not found'})
            f=UI/name
            if not f.exists(): return self.send(404,{'error':'not found'})
            return self.send(200,f.read_bytes(),ctype='application/javascript; charset=utf-8' if name=='main.js' else 'image/png')
        if path=='/api/health': return self.send(200,{'status':'ok','app':'EGYPT GAS'})
        user=self.require()
        if not user:return
        if not user_can_access_api(user,'/api/movements' if path=='/api/movements-drafts' else path):
            return self.send(403,{'error':'ليس لديك صلاحية الوصول إلى هذه الصفحة أو بياناتها'})
        if path=='/api/movements-drafts':
            with db() as c:
                c.execute('CREATE TABLE IF NOT EXISTS movement_drafts(id INTEGER PRIMARY KEY, username TEXT NOT NULL, payload TEXT NOT NULL)')
                rows=c.execute('SELECT id,payload FROM movement_drafts WHERE username=? ORDER BY id DESC',(user['username'],)).fetchall()
                return self.send(200,[dict(id=r['id'],data=json.loads(r['payload'])) for r in rows])
        if path=='/api/audit' and user['role']!='Super Admin' and not has_custom_user_permissions(user['username']):
            return self.send(403,{'error':'سجل التدقيق متاح لمدير النظام الأعلى فقط'})
        if path=='/api/approvals' and user['role'] not in ('Super Admin','Manager') and not has_custom_user_permissions(user['username']):
            return self.send(403,{'error':'قائمة الاعتمادات متاحة للمدير أو مدير النظام'})
        if path=='/api/backup':
            if user['role']!='Super Admin' and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'النسخ الاحتياطي متاح فقط لمن مُنح صلاحية النسخ الاحتياطي'})
            try:
                import tempfile
                source=db()
                backup_path=None
                destination=None
                try:
                    fd,backup_path=tempfile.mkstemp(prefix='eg_gas_backup_',suffix='.db')
                    os.close(fd)
                    destination=sqlite3.connect(backup_path)
                    source.backup(destination)
                    destination.close()
                    destination=None
                    payload=Path(backup_path).read_bytes()
                finally:
                    if destination is not None:
                        destination.close()
                    source.close()
                    if backup_path and os.path.exists(backup_path):
                        os.remove(backup_path)
                stamp=__import__('datetime').datetime.now().strftime('%Y%m%d_%H%M%S')
                return self.send(200,payload,{'Content-Disposition':f'attachment; filename=EGYPT_GAS_Backup_{stamp}.db'},'application/octet-stream')
            except Exception as e:return self.send(500,{'error':'تعذر إنشاء النسخة الاحتياطية','detail':str(e)})
        if path in ('/api/report','/api/report.xlsx'):
            from urllib.parse import parse_qs, quote
            q=parse_qs(urlparse(self.path).query)
            name=q.get('name',[''])[0];lo=q.get('from',[''])[0];hi=q.get('to',[''])[0];term=q.get('q',[''])[0]
            try:
                with db() as c:
                    if name in REPORTS:
                        sql,headers,_=REPORTS[name]; rows=c.execute(sql).fetchall(); cols=headers
                    else: cols,rows=advanced_report(c,name,lo,hi,term)
                if path=='/api/report': return self.send(200,{'title':name,'headers':cols,'rows':[list(r) for r in rows],'count':len(rows)})
                from tempfile import NamedTemporaryFile
                from pro_export import write_excel
                with NamedTemporaryFile(suffix='.xlsx',delete=False) as f: tmp=f.name
                try:
                    write_excel(tmp,name,cols,rows); payload=Path(tmp).read_bytes()
                finally:
                    try: os.unlink(tmp)
                    except OSError: pass
                fname=quote(name.replace('/','-')+'.xlsx')
                return self.send(200,payload,{'Content-Disposition':"attachment; filename*=UTF-8''"+fname},'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            except Exception as e:return self.send(400,{'error':'تعذر تجهيز التقرير','detail':str(e)})
        if path=='/api/document-detail':
            from urllib.parse import parse_qs
            q=parse_qs(urlparse(self.path).query);kind=q.get('kind',[''])[0];docid=q.get('id',[''])[0]
            try:
                with db() as c:
                    if kind=='meter-receipt':
                        head=c.execute('SELECT * FROM meter_receipt_docs WHERE id=?',(docid,)).fetchone()
                        receipt_line_cols={r['name'] for r in c.execute('PRAGMA table_info(meter_receipt_lines)').fetchall()}
                        condition_expr="COALESCE(l.condition,'سليم')" if 'condition' in receipt_line_cols else "'سليم'"
                        lines=c.execute('SELECT l.serial,l.meter_code,'+condition_expr+' condition,m.status,m.foreman,m.crn FROM meter_receipt_lines l LEFT JOIN meters m ON m.serial=l.serial WHERE l.doc_id=?',(docid,)).fetchall()
                    elif kind=='meter-issue':
                        head=c.execute('SELECT * FROM meter_issue_docs WHERE id=?',(docid,)).fetchone()
                        lines=c.execute('SELECT l.serial,m.meter_type,m.capacity,m.status,m.crn FROM meter_issue_lines l LEFT JOIN meters m ON m.serial=l.serial WHERE l.doc_id=?',(docid,)).fetchall()
                    elif kind=='meter-install':
                        head=c.execute('SELECT * FROM meter_install_docs WHERE id=?',(docid,)).fetchone()
                        install_cols={r['name'] for r in c.execute('PRAGMA table_info(meter_install_lines)').fetchall()}
                        crn_expr='COALESCE(l.crn,d.crn)' if 'crn' in install_cols else 'd.crn'
                        lines=c.execute('SELECT l.serial,m.meter_type,m.capacity,m.status,m.meter_code,'+crn_expr+' crn FROM meter_install_lines l JOIN meter_install_docs d ON d.id=l.doc_id LEFT JOIN meters m ON m.serial=l.serial WHERE l.doc_id=?',(docid,)).fetchall()
                    elif kind=='material-receipt':
                        head=c.execute('SELECT * FROM material_receipt_docs WHERE id=?',(docid,)).fetchone()
                        lines=c.execute('SELECT code,name,qty,note FROM material_receipt_lines WHERE doc_id=?',(docid,)).fetchall()
                    elif kind=='foreman-transfer':
                        head=c.execute('SELECT * FROM foreman_transfer_docs WHERE id=?',(docid,)).fetchone()
                        materials=clean_rows(c.execute('SELECT code,qty FROM foreman_transfer_materials WHERE doc_id=?',(docid,)).fetchall())
                        meters=clean_rows(c.execute('SELECT serial FROM foreman_transfer_meters WHERE doc_id=?',(docid,)).fetchall())
                        lines=[{'نوع البند':'خامة','الكود':x['code'],'الكمية':x['qty']} for x in materials]+[{'نوع البند':'عداد','السيريال':x['serial']} for x in meters]
                    elif kind=='foreman-stocktake':
                        head=c.execute('SELECT * FROM foreman_stocktakes WHERE id=?',(docid,)).fetchone()
                        materials=clean_rows(c.execute('SELECT x.code,i.name,x.book_qty,x.actual_qty,(x.actual_qty-x.book_qty) difference FROM foreman_stocktake_materials x LEFT JOIN items i ON i.code=x.code WHERE x.doc_id=?',(docid,)).fetchall())
                        meters=clean_rows(c.execute('SELECT serial,book_status,found FROM foreman_stocktake_meters WHERE doc_id=?',(docid,)).fetchall())
                        lines=[{'نوع البند':'خامة',**x} for x in materials]+[{'نوع البند':'عداد',**x} for x in meters]
                    elif kind=='material-edit':
                        head=c.execute('SELECT * FROM material_edit_requests WHERE id=?',(docid,)).fetchone()
                        lines=[]
                    elif kind=='meter-return':
                        head=c.execute('SELECT * FROM meter_return_docs WHERE id=?',(docid,)).fetchone()
                        lines=c.execute('SELECT serial,meter_type,capacity,status,foreman,crn FROM meters WHERE serial=?',(head['serial'],)).fetchall() if head else []
                    elif kind=='movement-request':
                        req=c.execute('SELECT * FROM movement_requests WHERE id=?',(docid,)).fetchone()
                        head={k:req[k] for k in ('doc_no','kind','foreman','week','notes','username','created_at')} if req else None
                        lines=[dict(x, name=(c.execute('SELECT name FROM items WHERE code=?',(x['code'],)).fetchone() or {'name':''})['name']) for x in json.loads(req['lines'])] if req else []
                    elif kind=='material-movement':
                        seed=c.execute("SELECT doc,foreman,type FROM movements WHERE id=?",(docid,)).fetchone()
                        if seed:
                            group=c.execute("""SELECT MAX(created_at) created_at,MAX(username) username
                                FROM movements WHERE COALESCE(doc,'')=COALESCE(?,'')
                                AND COALESCE(foreman,'')=COALESCE(?,'') AND type=?""",
                                (seed['doc'],seed['foreman'],seed['type'])).fetchone()
                            head={'doc_no':seed['doc'] or 'بدون رقم','foreman':seed['foreman'],'type':seed['type'],
                                  'created_at':group['created_at'],'username':group['username']}
                            lines=c.execute("SELECT created_at,doc,week,code,(SELECT name FROM items WHERE items.code=movements.code) name,type,qty,notes,username FROM movements WHERE COALESCE(doc,'')=COALESCE(?,'') AND COALESCE(foreman,'')=COALESCE(?,'') AND type=? ORDER BY id",(seed['doc'],seed['foreman'],seed['type'])).fetchall()
                        else:head=None;lines=[]
                    else:return self.send(400,{'error':'نوع المستند غير معروف'})
                    if not head:return self.send(404,{'error':'المستند غير موجود'})
                    approval_kind={'movement-request':'MOVEMENT_REQUEST','meter-receipt':'RECEIPT','meter-issue':'ISSUE','meter-install':'INSTALL','material-receipt':'MATERIAL_RECEIPT','foreman-transfer':'FOREMAN_TRANSFER','foreman-stocktake':'FOREMAN_STOCKTAKE','material-edit':'MATERIAL_EDIT','meter-return':'METER_RETURN'}.get(kind)
                    approval=c.execute('SELECT status,requested_by,requested_at,reviewed_by,reviewed_at,reason FROM document_approvals WHERE doc_kind=? AND doc_id=?',(approval_kind,docid)).fetchone() if approval_kind else None
                    return self.send(200,{'head':dict(head),'lines':[dict(x) for x in lines],'approval':dict(approval) if approval else None})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر قراءة تفاصيل المستند','detail':str(e)})
        try:
            with db() as c:
                if path=='/api/me':
                    pages=permissions_for_user(c,user['username'],user['role'])
                    return self.send(200,{'username':user['username'],'role':user['role'],'role_ar':ROLE_AR.get(user['role'],user['role']),'permissions':pages})
                if path=='/api/foreman-batch-options':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);kind=q.get('kind',[''])[0].strip()
                    if kind not in ('منصرف','مركب','سلف','مرتجع'):return self.send(400,{'error':'نوع الحركة غير صحيح'})
                    docs=clean_rows(c.execute("""SELECT e.doc FROM excel_doc_numbers e
                        WHERE e.kind=? AND NOT EXISTS(SELECT 1 FROM used_document_numbers u WHERE u.doc=e.doc)
                        AND NOT EXISTS(SELECT 1 FROM movements m WHERE TRIM(m.doc)=e.doc)
                        ORDER BY e.doc LIMIT 500""",(kind,)).fetchall())
                    items=clean_rows(c.execute("SELECT code,name,legacy_balance FROM items WHERE active=1 ORDER BY code").fetchall())
                    return self.send(200,{'documents':[x['doc'] for x in docs],'items':items})
                if path=='/api/foreman-weekly':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);name=q.get('foreman',[''])[0];month=q.get('month',[''])[0]
                    if not name or not month:return self.send(400,{'error':'حدد الفورمان والشهر'})
                    rows=clean_rows(c.execute('''SELECT w.id,w.month,w.week,w.kind,w.code,COALESCE(i.name,'') name,w.qty,w.sheet_ref,w.notes,
                        COALESCE(m.doc,'') doc,w.created_at,w.username
                        FROM foreman_weekly w LEFT JOIN items i ON i.code=w.code LEFT JOIN movements m ON m.id=w.movement_id
                        WHERE w.foreman=? AND w.month=? ORDER BY w.week,w.id''',(name,month)).fetchall())
                    totals=clean_rows(c.execute('SELECT kind,week,SUM(qty) qty FROM foreman_weekly WHERE foreman=? AND month=? GROUP BY kind,week ORDER BY week,kind',(name,month)).fetchall())
                    loans=clean_rows(c.execute("SELECT m.id,m.created_at,m.doc,m.code,COALESCE(i.name,'') name,m.qty,m.source FROM movements m LEFT JOIN items i ON i.code=m.code WHERE m.foreman=? AND m.type='سلف' AND substr(m.created_at,1,7)=? ORDER BY m.created_at DESC",(name,month)).fetchall())
                    return self.send(200,{'rows':rows,'totals':totals,'loans':loans})
                if path=='/api/foreman-ledger':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);name=q.get('foreman',[''])[0]
                    if not name:return self.send(400,{'error':'حدد الفورمان'})
                    person=c.execute('SELECT name,performance_no,mobile FROM foremen WHERE name=?',(name,)).fetchone()
                    if not person:return self.send(404,{'error':'الفورمان غير موجود'})
                    materials=[]
                    for item in c.execute('SELECT code,name,opening,legacy_balance FROM items ORDER BY name').fetchall():
                        opening=c.execute('SELECT qty FROM foreman_opening WHERE foreman=? AND code=?',(name,item['code'])).fetchone()
                        balance=custody_qty(c,name,item['code'])
                        if abs(balance)>0.00001 or (opening and abs(float(opening['qty'] or 0))>0.00001):
                            materials.append({'code':item['code'],'name':item['name'],'opening':float(opening['qty']) if opening else 0,'balance':balance})
                    moves=clean_rows(c.execute("SELECT m.id,m.created_at,m.doc,m.week,m.code,COALESCE(i.name,'') name,m.type,m.qty,m.notes,m.username,m.source FROM movements m LEFT JOIN items i ON i.code=m.code WHERE m.foreman=? ORDER BY m.id DESC LIMIT 5000",(name,)).fetchall())
                    meter_rows=clean_rows(c.execute("SELECT serial,meter_type,capacity,COALESCE(meter_code,'') meter_code,status,COALESCE(crn,'') crn,COALESCE(foreman,'') foreman,COALESCE(received_at,'') received_at FROM meters WHERE foreman=? OR serial IN (SELECT serial FROM meter_events WHERE foreman=?) ORDER BY serial",(name,name)).fetchall())
                    events=clean_rows(c.execute("SELECT id,created_at,serial,action,COALESCE(crn,'') crn,COALESCE(username,'') username,COALESCE(notes,'') notes FROM meter_events WHERE foreman=? ORDER BY id DESC LIMIT 5000",(name,)).fetchall())
                    summary={'custody':sum(1 for x in meter_rows if x['status']=='CUSTODY'),'installed':sum(1 for x in meter_rows if x['status']=='INSTALLED'),'removed':sum(1 for x in meter_rows if x['status']=='REMOVED')}
                    return self.send(200,{'person':dict(person),'materials':materials,'movements':moves,'meters':meter_rows,'meter_events':events,'meter_summary':summary})
                if path=='/api/global-search':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query)
                    term=q.get('q',[''])[0].strip()
                    kind=q.get('kind',['الكل'])[0].strip()
                    if len(term)<2:return self.send(200,{'results':[],'count':0})
                    like='%'+term+'%';results=[]
                    def push(section,key,description,status='',target='',target_id=''):
                        results.append({'section':section,'key':str(key or ''),'description':str(description or ''),
                                         'status':str(status or ''),'target':target,'target_id':str(target_id or '')})
                    if kind in ('الكل','الخامات'):
                        for r in c.execute("SELECT code,name,legacy_balance,active FROM items WHERE code LIKE ? OR name LIKE ? ORDER BY name LIMIT 100",(like,like)).fetchall():
                            push('خامة',r['code'],r['name'],'نشط' if r['active'] else 'موقوف','items',r['code'])
                    if kind in ('الكل','العدادات'):
                        for r in c.execute("""SELECT serial,meter_type,capacity,status,COALESCE(foreman,'') foreman,COALESCE(crn,'') crn
                          FROM meters WHERE serial LIKE ? OR meter_code LIKE ? OR meter_type LIKE ? OR capacity LIKE ? OR foreman LIKE ? OR crn LIKE ?
                          ORDER BY serial LIMIT 150""",(like,like,like,like,like,like)).fetchall():
                            labels={'STOCK':'بالمخزن','CUSTODY':'عهدة فورمان','INSTALLED':'مركب','REMOVED':'مفكوك'}
                            push('عداد',r['serial'],r['meter_type']+' | '+r['capacity']+' | '+r['foreman']+' | C.R.N '+r['crn'],labels.get(r['status'],r['status']),'meter',r['serial'])
                    if kind in ('الكل','الفورمانات'):
                        for r in c.execute("SELECT name,COALESCE(performance_no,'') performance_no,COALESCE(mobile,'') mobile FROM foremen WHERE name LIKE ? OR performance_no LIKE ? OR mobile LIKE ? ORDER BY name LIMIT 100",(like,like,like)).fetchall():
                            push('فورمان',r['name'],'رقم الأداء: '+r['performance_no']+' | الهاتف: '+r['mobile'],'','foremen',r['name'])
                    if kind in ('الكل','المستندات'):
                        document_sources=[
                         ("SELECT id,doc_no,created_at,meter_type owner,'وارد عدادات' label FROM meter_receipt_docs WHERE doc_no LIKE ? OR meter_type LIKE ?",'meter-receipt'),
                         ("SELECT id,doc_no,created_at,foreman owner,'صرف عدادات' label FROM meter_issue_docs WHERE doc_no LIKE ? OR foreman LIKE ?",'meter-issue'),
                         ("SELECT id,doc_no,created_at,foreman owner,'تركيب عدادات' label FROM meter_install_docs WHERE doc_no LIKE ? OR foreman LIKE ? OR crn LIKE ?",'meter-install'),
                         ("SELECT id,doc_no,created_at,supplier owner,'وارد خامات' label FROM material_receipt_docs WHERE doc_no LIKE ? OR supplier LIKE ?",'material-receipt'),
                         ("SELECT id,doc_no,created_at,from_foreman||' ← '||to_foreman owner,'تسليم عهدة' label FROM foreman_transfer_docs WHERE doc_no LIKE ? OR from_foreman LIKE ? OR to_foreman LIKE ?",'foreman-transfer'),
                         ("SELECT id,doc_no,created_at,foreman owner,'جرد فورمان' label FROM foreman_stocktakes WHERE doc_no LIKE ? OR foreman LIKE ?",'foreman-stocktake'),
                         ("SELECT id,doc_no,created_at,serial owner,'إرجاع عداد' label FROM meter_return_docs WHERE doc_no LIKE ? OR serial LIKE ? OR crn LIKE ?",'meter-return')]
                        for sql,target in document_sources:
                            params=[like]*sql.count('?')
                            for r in c.execute(sql,params).fetchall():
                                push('مستند '+r['label'],r['doc_no'],r['owner'],r['created_at'],target,r['id'])
                        for r in c.execute("""SELECT MIN(id) id,TRIM(doc) doc_no,MAX(created_at) created_at,
                          COALESCE(foreman,'') owner,type FROM movements WHERE TRIM(COALESCE(doc,'')) LIKE ?
                          OR COALESCE(foreman,'') LIKE ? GROUP BY TRIM(doc),COALESCE(foreman,''),type ORDER BY MAX(id) DESC LIMIT 100""",(like,like)).fetchall():
                            push('حركة خامات '+r['type'],r['doc_no'],r['owner'],r['created_at'],'material-movement',r['id'])
                    return self.send(200,{'results':results[:500],'count':len(results)})
                if path=='/api/dashboard':
                    items=c.execute("SELECT COUNT(*) n,COALESCE(SUM(legacy_balance),0) bal FROM items WHERE active=1").fetchone()
                    foremen=c.execute("SELECT COUNT(*) FROM foremen").fetchone()[0]
                    movements=c.execute("SELECT COUNT(*) FROM movements").fetchone()[0]
                    meters=c.execute("SELECT status,COUNT(*) n FROM meters GROUP BY status").fetchall()
                    recent=clean_rows(c.execute("""SELECT created_at,COALESCE(foreman,'—') foreman,
                      COALESCE(type,'—') type,COALESCE(code,'—') code,COALESCE(qty,0) qty
                      FROM movements ORDER BY id DESC LIMIT 8""").fetchall())
                    top=clean_rows(c.execute("""SELECT name,legacy_balance FROM items WHERE active=1 AND legacy_balance>0
                      ORDER BY legacy_balance DESC LIMIT 6""").fetchall())
                    states={r['status']:r['n'] for r in meters}
                    return self.send(200,{'items_count':items['n'],'stock_balance':items['bal'],'foremen_count':foremen,
                      'movement_count':movements,'meter_states':states,'recent':recent,'top_items':top})
                if path=='/api/items':
                    q=urlparse(self.path).query
                    from urllib.parse import parse_qs
                    term=parse_qs(q).get('q',[''])[0].strip()
                    rows=c.execute("""SELECT code,name,opening,received,legacy_balance,active FROM items
                      WHERE (?='' OR code LIKE ? OR name LIKE ?) ORDER BY name LIMIT 1500""",(term,'%'+term+'%','%'+term+'%')).fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/foreman-document-lines':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);doc=q.get('doc',[''])[0].strip();name=q.get('foreman',[''])[0].strip()
                    if not doc or not name:return self.send(400,{'error':'رقم المستند والفورمان مطلوبان'})
                    rows=clean_rows(c.execute("""SELECT m.id,m.created_at,m.doc,m.foreman,m.week,m.code,COALESCE(i.name,'') name,m.type,m.qty,
                        COALESCE(m.notes,'') notes,COALESCE(m.username,'') username FROM movements m
                        LEFT JOIN items i ON i.code=m.code WHERE TRIM(m.doc)=? AND m.foreman=? ORDER BY m.id""",(doc,name)).fetchall())
                    return self.send(200,rows)
                if path=='/api/foreman-documents':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);name=q.get('foreman',[''])[0].strip();term=q.get('q',[''])[0].strip().lower()
                    if not name:return self.send(400,{'error':'حدد الفورمان لعرض مستندات العهدة'})
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(name,)).fetchone():return self.send(404,{'error':'الفورمان غير موجود'})
                    docs=[]
                    def push(kind,label,doc_no,doc_id,created,owner,count,approval_kind,source):
                        if term and term not in ' '.join(str(x or '') for x in (label,doc_no,owner,source)).lower():return
                        ap=c.execute('SELECT status FROM document_approvals WHERE doc_kind=? AND doc_id=?',(approval_kind,doc_id)).fetchone() if approval_kind else None
                        docs.append({'kind':kind,'kind_label':label,'doc_no':doc_no or '—','doc_id':doc_id,'created_at':created or '', 'owner':owner or name,'line_count':count,'status':ap['status'] if ap else 'مُرحّل/مسجل','source':source})
                    for r in c.execute("""SELECT MIN(id) id,TRIM(doc) doc,foreman,type,MIN(created_at) created_at,COUNT(*) line_count
                        FROM movements WHERE foreman=? AND doc IS NOT NULL AND TRIM(doc)<>'' GROUP BY TRIM(doc),foreman,type ORDER BY MIN(id) DESC""",(name,)).fetchall():
                        push('movement','حركة خامات - '+str(r['type']),r['doc'],r['id'],r['created_at'],r['foreman'],r['line_count'],None,'المخزن والخامات')
                    for r in c.execute("""SELECT d.id,d.doc_no,d.from_foreman,d.to_foreman,d.created_at,COUNT(DISTINCT m.id)+COUNT(DISTINCT t.serial) line_count
                        FROM foreman_transfer_docs d LEFT JOIN foreman_transfer_materials m ON m.doc_id=d.id LEFT JOIN foreman_transfer_meters t ON t.doc_id=d.id
                        WHERE d.from_foreman=? OR d.to_foreman=? GROUP BY d.id ORDER BY d.id DESC""",(name,name)).fetchall():
                        push('foreman-transfer','تسليم / استلام عهدة',r['doc_no'],r['id'],r['created_at'],r['from_foreman']+' ← '+r['to_foreman'],r['line_count'],'FOREMAN_TRANSFER','تسليم بين الفورمانات')
                    for r in c.execute("""SELECT d.id,d.doc_no,d.foreman,d.created_at,
                        (SELECT COUNT(*) FROM foreman_stocktake_materials x WHERE x.doc_id=d.id)+(SELECT COUNT(*) FROM foreman_stocktake_meters y WHERE y.doc_id=d.id) line_count
                        FROM foreman_stocktakes d WHERE d.foreman=? ORDER BY d.id DESC""",(name,)).fetchall():
                        push('foreman-stocktake','محضر جرد عهدة',r['doc_no'],r['id'],r['created_at'],r['foreman'],r['line_count'],'FOREMAN_STOCKTAKE','الجرد والمطابقة')
                    for r in c.execute("""SELECT d.id,d.doc_no,d.foreman,d.created_at,COUNT(l.serial) line_count FROM meter_issue_docs d
                        LEFT JOIN meter_issue_lines l ON l.doc_id=d.id WHERE d.foreman=? GROUP BY d.id ORDER BY d.id DESC""",(name,)).fetchall():
                        push('meter-issue','مستند صرف عدادات',r['doc_no'],r['id'],r['created_at'],r['foreman'],r['line_count'],'ISSUE','صرف عدادات إلى العهدة')
                    for r in c.execute("""SELECT d.id,d.doc_no,d.foreman,d.created_at,COUNT(l.serial) line_count FROM meter_install_docs d
                        LEFT JOIN meter_install_lines l ON l.doc_id=d.id WHERE d.foreman=? GROUP BY d.id ORDER BY d.id DESC""",(name,)).fetchall():
                        push('meter-install','مستند تركيب عدادات',r['doc_no'],r['id'],r['created_at'],r['foreman'],r['line_count'],'INSTALL','تركيب عدادات من العهدة')
                    for r in c.execute("""SELECT d.id,d.doc_no,d.serial,d.created_at FROM meter_return_docs d
                        LEFT JOIN meters m ON m.serial=d.serial WHERE m.foreman=? OR d.serial IN (SELECT serial FROM meter_events WHERE foreman=?) ORDER BY d.id DESC""",(name,name)).fetchall():
                        push('meter-return','طلب إرجاع عداد',r['doc_no'],r['id'],r['created_at'],name,1,'METER_RETURN','إرجاع العداد للمخزن')
                    docs.sort(key=lambda x:(x['created_at'],x['doc_id']),reverse=True)
                    return self.send(200,docs)
                if path=='/api/foremen':
                    people=c.execute("SELECT name,performance_no,mobile FROM foremen ORDER BY name").fetchall()
                    rows=[]
                    all_codes=[r['code'] for r in c.execute("SELECT code FROM items").fetchall()]
                    for person in people:
                        name=person['name']
                        materials=sum(1 for code in all_codes if abs(custody_qty(c,name,code))>0.00001)
                        meter_count=c.execute("SELECT COUNT(*) FROM meters WHERE foreman=? AND status='CUSTODY'",(name,)).fetchone()[0]
                        move_count=c.execute("SELECT COUNT(*) FROM movements WHERE foreman=? AND source='NEW'",(name,)).fetchone()[0]
                        rows.append({'name':name,'performance_no':person['performance_no'],'mobile':person['mobile'],
                                     'materials_count':materials,'meters_count':meter_count,'movements_count':move_count})
                    return self.send(200,rows)
                if path.startswith('/api/foremen/'):
                    from urllib.parse import unquote
                    name=unquote(path[len('/api/foremen/'):])
                    person=c.execute("SELECT name,performance_no,mobile FROM foremen WHERE name=?",(name,)).fetchone()
                    if not person:return self.send(404,{'error':'الفورمان غير موجود'})
                    materials=[]
                    for item in c.execute("SELECT code,name FROM items ORDER BY name").fetchall():
                        balance=custody_qty(c,name,item['code'])
                        if abs(balance)>0.00001:
                            opening=c.execute("SELECT qty FROM foreman_opening WHERE foreman=? AND code=?",(name,item['code'])).fetchone()
                            materials.append({'code':item['code'],'name':item['name'],'opening':opening['qty'] if opening else 0,'balance':balance})
                    meters=clean_rows(c.execute("SELECT serial,meter_type,capacity,COALESCE(meter_code,'') meter_code,status,COALESCE(crn,'') crn FROM meters WHERE (foreman=? OR serial IN (SELECT serial FROM meter_events WHERE foreman=?)) AND status IN ('CUSTODY','INSTALLED','REMOVED') ORDER BY serial",(name,name)).fetchall())
                    recent=clean_rows(c.execute("SELECT created_at,code,type,qty,COALESCE(doc,'') doc,COALESCE(week,'') week,COALESCE(username,'') username,COALESCE(notes,'') notes FROM movements WHERE foreman=? ORDER BY id DESC LIMIT 500",(name,)).fetchall())
                    weekly=clean_rows(c.execute("SELECT month,week,code,kind,qty,sheet_ref,notes,created_at,username FROM foreman_weekly WHERE foreman=? ORDER BY id DESC LIMIT 500",(name,)).fetchall())
                    adjustments=clean_rows(c.execute("SELECT created_at,code,old_qty,new_qty,reason,username FROM custody_adjustments WHERE foreman=? ORDER BY id DESC LIMIT 500",(name,)).fetchall())
                    legacy=c.execute("SELECT COUNT(*) FROM movements WHERE foreman=? AND source!='NEW'",(name,)).fetchone()[0]
                    return self.send(200,{'person':dict(person),'materials':materials,'meters':meters,'recent':recent,'weekly':weekly,
                        'adjustments':adjustments,'legacy_movements':legacy})
                if path=='/api/meter-profile':
                    from urllib.parse import parse_qs
                    serial=parse_qs(urlparse(self.path).query).get('serial',[''])[0].strip()
                    if not serial:return self.send(400,{'error':'السيريال مطلوب'})
                    with db() as c:
                        meter=c.execute("SELECT serial,COALESCE(meter_code,'') meter_code,COALESCE(meter_type,'') meter_type,COALESCE(capacity,'') capacity,status,COALESCE(foreman,'') foreman,COALESCE(crn,'') crn,COALESCE(received_at,'') received_at,COALESCE(notes,'') notes FROM meters WHERE serial=?",(serial,)).fetchone()
                        if not meter:return self.send(404,{'error':'السيريال غير موجود في سجل العدادات'})
                        events=clean_rows(c.execute("SELECT created_at,action,COALESCE(foreman,'') foreman,COALESCE(crn,'') crn,COALESCE(username,'') username,COALESCE(notes,'') notes FROM meter_events WHERE serial=? ORDER BY created_at,id",(serial,)).fetchall())
                        receipts=clean_rows(c.execute("SELECT d.doc_no,d.created_at FROM meter_receipt_lines l JOIN meter_receipt_docs d ON d.id=l.doc_id WHERE l.serial=? ORDER BY d.id",(serial,)).fetchall())
                        issues=clean_rows(c.execute("SELECT d.doc_no,d.created_at FROM meter_issue_lines l JOIN meter_issue_docs d ON d.id=l.doc_id WHERE l.serial=? ORDER BY d.id",(serial,)).fetchall())
                        installs=clean_rows(c.execute("SELECT d.doc_no,d.created_at,d.crn,d.foreman FROM meter_install_lines l JOIN meter_install_docs d ON d.id=l.doc_id WHERE l.serial=? ORDER BY d.id",(serial,)).fetchall())
                        replacements=clean_rows(c.execute("SELECT id,old_serial,new_serial,foreman,crn,reason,created_at FROM meter_replacements WHERE old_serial=? OR new_serial=? ORDER BY id",(serial,serial)).fetchall())
                        returns=clean_rows(c.execute("SELECT d.id,d.doc_no,d.serial,d.crn,d.notes,d.created_at,d.username,COALESCE(a.status,'—') approval,COALESCE(a.reviewed_by,'') reviewed_by,COALESCE(a.reviewed_at,'') reviewed_at,COALESCE(a.reason,'') approval_reason FROM meter_return_docs d LEFT JOIN document_approvals a ON a.doc_kind='METER_RETURN' AND a.doc_id=d.id WHERE d.serial=? ORDER BY d.id",(serial,)).fetchall())
                        workflow=c.execute("SELECT state,updated_at,updated_by,notes FROM damaged_meter_workflow WHERE serial=?",(serial,)).fetchone()
                        removed=c.execute("SELECT condition,reason,removed_at,username FROM removed_meter_details WHERE serial=?",(serial,)).fetchone()
                    return self.send(200,{'meter':dict(meter),'events':events,'receipts':receipts,'issues':issues,'installs':installs,'replacements':replacements,'returns':returns,'workflow':dict(workflow) if workflow else {},'removed':dict(removed) if removed else {}})
                if path=='/api/meters':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);term=q.get('q',[''])[0].strip()
                    rows=c.execute("""SELECT serial,meter_type,capacity,status,COALESCE(foreman,'') foreman,
                      COALESCE(crn,'') crn,COALESCE(meter_code,'') meter_code FROM meters
                      WHERE (?='' OR serial LIKE ? OR crn LIKE ? OR foreman LIKE ?) ORDER BY serial LIMIT 1500""",
                      (term,'%'+term+'%','%'+term+'%','%'+term+'%')).fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/meter-global-search':
                    from urllib.parse import parse_qs
                    term=parse_qs(urlparse(self.path).query).get('q',[''])[0].strip()
                    like='%'+term+'%'
                    rows=clean_rows(c.execute("""SELECT m.serial,m.meter_code,m.meter_type,m.capacity,m.status,
                      COALESCE(m.foreman,'') foreman,COALESCE(m.crn,'') crn,COALESCE(m.received_at,'') received_at,
                      COALESCE((SELECT MAX(e.created_at) FROM meter_events e WHERE e.serial=m.serial),'') last_event
                      FROM meters m WHERE ?='' OR m.serial LIKE ? OR COALESCE(m.meter_code,'') LIKE ?
                      OR m.meter_type LIKE ? OR COALESCE(m.foreman,'') LIKE ? OR COALESCE(m.crn,'') LIKE ?
                      OR m.status LIKE ? ORDER BY m.serial LIMIT 5000""",(term,like,like,like,like,like,like)).fetchall())
                    return self.send(200,rows)
                if path=='/api/meter-crn-timeline':
                    from urllib.parse import parse_qs
                    term=parse_qs(urlparse(self.path).query).get('q',[''])[0].strip()
                    if not term:return self.send(200,{'meters':[],'events':[]})
                    like='%'+term+'%'
                    serial_rows=c.execute("SELECT serial FROM meters WHERE crn LIKE ? OR serial LIKE ?",(like,like)).fetchall()
                    event_serials=c.execute("SELECT DISTINCT serial FROM meter_events WHERE crn LIKE ? OR serial LIKE ?",(like,like)).fetchall()
                    serials=list(dict.fromkeys([x['serial'] for x in serial_rows]+[x['serial'] for x in event_serials]))
                    if not serials:return self.send(200,{'meters':[],'events':[]})
                    marks=','.join('?' for _ in serials)
                    meters=clean_rows(c.execute(f"""SELECT serial,meter_type,capacity,status,COALESCE(foreman,'') foreman,
                      COALESCE(crn,'') crn,COALESCE(meter_code,'') meter_code,COALESCE(received_at,'') received_at
                      FROM meters WHERE serial IN ({marks}) ORDER BY serial""",serials).fetchall())
                    events=clean_rows(c.execute(f"""SELECT id,created_at,serial,action,COALESCE(foreman,'') foreman,
                      COALESCE(crn,'') crn,COALESCE(username,'') username,COALESCE(notes,'') notes
                      FROM meter_events WHERE serial IN ({marks}) OR crn LIKE ?
                      ORDER BY created_at DESC,id DESC LIMIT 5000""",serials+[like]).fetchall())
                    return self.send(200,{'meters':meters,'events':events})
                if path=='/api/movements':
                    rows=c.execute("""SELECT id,created_at,doc,foreman,week,code,type,qty,notes,username
                      FROM movements ORDER BY id DESC LIMIT 1000""").fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/material-movement-documents':
                    rows=c.execute("""SELECT MIN(id) id,TRIM(doc) doc_no,MAX(created_at) created_at,
                      COALESCE(foreman,'') foreman,type,COUNT(*) line_count,
                      COUNT(DISTINCT code) item_count,COALESCE(SUM(qty),0) total_qty,
                      MAX(username) username
                      FROM movements
                      WHERE doc IS NOT NULL AND TRIM(doc)<>''
                      GROUP BY TRIM(doc),COALESCE(foreman,''),type
                      ORDER BY MAX(id) DESC LIMIT 5000""").fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/meter-type-serials':
                    from urllib.parse import parse_qs
                    name=parse_qs(urlparse(self.path).query).get('name',[''])[0].strip()
                    if not name:return self.send(400,{'error':'نوع العداد مطلوب'})
                    rows=c.execute("""SELECT serial,COALESCE(meter_code,'') meter_code,COALESCE(capacity,'') capacity,
                      CASE status WHEN 'STOCK' THEN 'بالمخزن' WHEN 'CUSTODY' THEN 'بعهدة فورمان' WHEN 'INSTALLED' THEN 'مركب' WHEN 'REMOVED' THEN 'مفكوك' ELSE status END status_label,
                      COALESCE(foreman,'') foreman,COALESCE(crn,'') crn,COALESCE(received_at,'') received_at
                      FROM meters WHERE meter_type=? ORDER BY serial""",(name,)).fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/meter-types':
                    cols={r['name'] for r in c.execute("PRAGMA table_info(meter_types)").fetchall()}
                    if 'meter_code' not in cols:
                        c.execute("ALTER TABLE meter_types ADD COLUMN meter_code TEXT NOT NULL DEFAULT ''")
                    return self.send(200,clean_rows(c.execute("SELECT name,capacity,active,COALESCE(meter_code,'') meter_code FROM meter_types ORDER BY name").fetchall()))
                if path=='/api/damaged-materials':
                    return self.send(200,clean_rows(c.execute("SELECT id,code,name,qty,notes,created_at,username FROM damaged_materials ORDER BY id DESC LIMIT 1000").fetchall()))
                if path=='/api/meter-stock':
                    return self.send(200,clean_rows(c.execute("SELECT serial,meter_type,capacity,status,foreman,crn,meter_code,received_at FROM meters WHERE status='STOCK' ORDER BY serial").fetchall()))
                if path=='/api/damaged-meter-stock':
                    return self.send(200,clean_rows(c.execute("SELECT serial,meter_type,capacity,status,meter_code,received_at,notes FROM meters WHERE status='DAMAGED' ORDER BY received_at DESC,serial").fetchall()))
                if path=='/api/removed-meters':
                    return self.send(200,clean_rows(c.execute("""SELECT m.serial,m.meter_type,m.capacity,
                      COALESCE(m.foreman,'') foreman,COALESCE(m.crn,'') crn,
                      COALESCE(d.condition,'غير مصنف') condition,COALESCE(d.reason,'') reason,
                      COALESCE(w.state,'بانتظار الفحص') state,COALESCE(w.notes,'') notes,
                      COALESCE(d.removed_at,'') removed_at,COALESCE(w.updated_at,d.removed_at,'') updated_at,
                      COALESCE(w.updated_by,d.username,'') updated_by,COALESCE(d.username,'') username
                      FROM meters m LEFT JOIN removed_meter_details d ON d.serial=m.serial
                      LEFT JOIN damaged_meter_workflow w ON w.serial=m.serial
                      WHERE m.status='REMOVED' ORDER BY COALESCE(d.removed_at,m.received_at) DESC,m.serial""").fetchall()))
                if path=='/api/meter-history':
                    return self.send(200,clean_rows(c.execute("SELECT id,created_at,serial,action,foreman,crn,username,notes FROM meter_events ORDER BY id DESC LIMIT 2000").fetchall()))
                if path=='/api/meter-replacements':
                    return self.send(200,clean_rows(c.execute("SELECT id,old_serial,new_serial,foreman,crn,reason,created_at,username FROM meter_replacements ORDER BY id DESC LIMIT 1000").fetchall()))
                if path=='/api/receipt-docs':
                    return self.send(200,clean_rows(c.execute("SELECT d.id,d.doc_no,d.meter_type,d.created_at,d.username,COALESCE(d.origin,\'\') origin,COUNT(l.serial) line_count,SUM(CASE WHEN l.condition='تالف' THEN 1 ELSE 0 END) damaged_count,SUM(CASE WHEN l.condition='مرتجع للمخزن' THEN 1 ELSE 0 END) returned_count FROM meter_receipt_docs d LEFT JOIN meter_receipt_lines l ON l.doc_id=d.id GROUP BY d.id ORDER BY d.id DESC").fetchall()))
                if path=='/api/meter-issue-search':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query).get('q',[''])[0].strip()
                    like='%'+q+'%'
                    rows=clean_rows(c.execute("""SELECT l.serial,COALESCE(m.meter_code,'') meter_code,COALESCE(m.meter_type,'') meter_type,
                        d.foreman,d.created_at,d.doc_no,d.id doc_id FROM meter_issue_docs d
                        JOIN meter_issue_lines l ON l.doc_id=d.id LEFT JOIN meters m ON m.serial=l.serial
                        WHERE ?='' OR l.serial LIKE ? OR m.meter_code LIKE ? OR m.meter_type LIKE ? OR d.foreman LIKE ? OR d.doc_no LIKE ?
                        ORDER BY d.id DESC LIMIT 15000""",(q,like,like,like,like,like)).fetchall())
                    return self.send(200,rows)
                if path=='/api/issue-docs':
                    return self.send(200,clean_rows(c.execute("SELECT d.id,d.doc_no,d.foreman,d.created_at,d.username,COUNT(l.serial) line_count FROM meter_issue_docs d LEFT JOIN meter_issue_lines l ON l.doc_id=d.id GROUP BY d.id ORDER BY d.id DESC").fetchall()))
                if path=='/api/install-docs':
                    return self.send(200,clean_rows(c.execute("SELECT d.id,d.doc_no,d.foreman,d.crn,d.created_at,d.username,COUNT(l.serial) line_count FROM meter_install_docs d LEFT JOIN meter_install_lines l ON l.doc_id=d.id GROUP BY d.id ORDER BY d.id DESC").fetchall()))
                if path=='/api/document-register':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query)
                    term=q.get('q',[''])[0].strip().lower()
                    kind_filter=q.get('kind',['الكل'])[0]
                    docs=[]
                    approval_map={}
                    for a in c.execute("SELECT doc_kind,doc_id,status FROM document_approvals").fetchall():
                        approval_map[(a['doc_kind'],str(a['doc_id']))]=a['status']
                    def add_docs(sql,kind,label,owner_expr=None,lines_expr=None,approval_kind=None):
                        for r in c.execute(sql).fetchall():
                            x=dict(r);did=str(x.get('id',''));owner=x.get('owner','');no=x.get('doc_no','')
                            docs.append({'kind':kind,'kind_label':label,'id':did,'doc_no':no,'owner':owner,
                             'created_at':x.get('created_at',''),'line_count':x.get('line_count',0),
                             'source':x.get('source',''),'approval':approval_map.get((approval_kind,did),'—') if approval_kind else '—'})
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.meter_type owner,COUNT(l.serial) line_count,'وارد عدادات' source FROM meter_receipt_docs d LEFT JOIN meter_receipt_lines l ON l.doc_id=d.id GROUP BY d.id", 'meter-receipt','وارد عدادات',approval_kind='RECEIPT')
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.foreman owner,COUNT(l.serial) line_count,'صرف عدادات' source FROM meter_issue_docs d LEFT JOIN meter_issue_lines l ON l.doc_id=d.id GROUP BY d.id", 'meter-issue','صرف عدادات',approval_kind='ISSUE')
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.foreman owner,COUNT(l.serial) line_count,'تركيب عدادات' source FROM meter_install_docs d LEFT JOIN meter_install_lines l ON l.doc_id=d.id GROUP BY d.id", 'meter-install','تركيب عدادات',approval_kind='INSTALL')
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.supplier owner,COUNT(l.id) line_count,'وارد خامات' source FROM material_receipt_docs d LEFT JOIN material_receipt_lines l ON l.doc_id=d.id GROUP BY d.id", 'material-receipt','وارد خامات',approval_kind='MATERIAL_RECEIPT')
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.from_foreman||' ← '||d.to_foreman owner,(SELECT COUNT(*) FROM foreman_transfer_materials m WHERE m.doc_id=d.id)+(SELECT COUNT(*) FROM foreman_transfer_meters t WHERE t.doc_id=d.id) line_count,'تسليم واستلام عهدة' source FROM foreman_transfer_docs d", 'foreman-transfer','تسليم عهدة',approval_kind='FOREMAN_TRANSFER')
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.foreman owner,(SELECT COUNT(*) FROM foreman_stocktake_materials m WHERE m.doc_id=d.id)+(SELECT COUNT(*) FROM foreman_stocktake_meters t WHERE t.doc_id=d.id) line_count,'جرد عهدة' source FROM foreman_stocktakes d", 'foreman-stocktake','جرد فورمان',approval_kind='FOREMAN_STOCKTAKE')
                    add_docs("SELECT d.id,d.doc_no,d.created_at,d.serial owner,1 line_count,'إرجاع عداد' source FROM meter_return_docs d", 'meter-return','إرجاع عداد',approval_kind='METER_RETURN')
                    # Legacy material movements are grouped by document, foreman and movement type.
                    for r in c.execute("""SELECT MIN(id) id,COALESCE(NULLIF(doc,''),'بدون رقم') doc_no,MAX(created_at) created_at,
                       COALESCE(foreman,'') owner,COUNT(*) line_count,type source
                       FROM movements WHERE doc IS NOT NULL AND TRIM(doc)<>'' GROUP BY TRIM(doc),COALESCE(foreman,''),type""").fetchall():
                        x=dict(r);docs.append({'kind':'material-movement','kind_label':('منصرف خامات' if x['source']=='صرف' else x['source']),'id':str(x['id']),
                         'doc_no':x['doc_no'],'owner':x['owner'],'created_at':x['created_at'],
                         'line_count':x['line_count'],'source':'حركة خامات','approval':'—'})
                    docs.sort(key=lambda x:(x['created_at'] or ''),reverse=True)
                    if kind_filter!='الكل':docs=[x for x in docs if x['kind_label']==kind_filter]
                    if term:docs=[x for x in docs if term in ' '.join(str(v) for v in x.values()).lower()]
                    return self.send(200,docs[:3000])
                if path=='/api/material-receipts':
                    return self.send(200,clean_rows(c.execute("SELECT d.id,d.doc_no,d.doc_date,d.supplier,d.created_at,d.username,COUNT(l.id) line_count,COALESCE(SUM(l.qty),0) total_qty FROM material_receipt_docs d LEFT JOIN material_receipt_lines l ON l.doc_id=d.id GROUP BY d.id ORDER BY d.id DESC").fetchall()))
                if path=='/api/nov':
                    return self.send(200,clean_rows(c.execute("SELECT foreman,code,name,week,issued,installed FROM archive_nov ORDER BY foreman,name").fetchall()))
                if path=='/api/audit':
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query)
                    term=q.get('q',[''])[0].strip()
                    action=q.get('action',[''])[0].strip()
                    lo=q.get('from',[''])[0].strip();hi=q.get('to',[''])[0].strip()
                    try: limit=max(1,min(int(q.get('limit',['5000'])[0]),10000))
                    except ValueError: limit=5000
                    import datetime as _audit_dt
                    for v in (lo,hi):
                        if v and not re.fullmatch(r'\d{4}-\d{2}-\d{2}',v):return self.send(400,{'error':'صيغة التاريخ يجب أن تكون YYYY-MM-DD'})
                        if v:
                            try:_audit_dt.datetime.strptime(v,'%Y-%m-%d')
                            except ValueError:return self.send(400,{'error':'تاريخ غير صحيح'})
                    if lo and hi and lo>hi:return self.send(400,{'error':'تاريخ البداية بعد النهاية'})
                    like='%'+term+'%'
                    rows=c.execute("""SELECT id,created_at,actor,action,table_name,record_key FROM audit_log
                      WHERE (?='' OR actor LIKE ? OR action LIKE ? OR table_name LIKE ? OR record_key LIKE ?)
                      AND (?='' OR action=?) AND (?='' OR substr(created_at,1,10)>=?)
                      AND (?='' OR substr(created_at,1,10)<=?) ORDER BY id DESC LIMIT ?""",
                      (term,like,like,like,like,action,action,lo,lo,hi,hi,limit)).fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/backup-check':
                    if user['role']!='Super Admin' and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'فحص النسخ الاحتياطي متاح فقط لمن مُنح صلاحية النسخ الاحتياطي'})
                    try:
                        checks=c.execute('PRAGMA quick_check').fetchall()
                        fk=c.execute('PRAGMA foreign_key_check').fetchall()
                        table_names=['items','foremen','movements','meters','meter_events','document_approvals','audit_log']
                        counts={}
                        existing={r['name'] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
                        for table in table_names:
                            if table in existing:counts[table]=c.execute('SELECT COUNT(*) FROM "'+table+'"').fetchone()[0]
                        db_path=str(DB)
                        try:size=Path(db_path).stat().st_size
                        except OSError:size=0
                        ok=bool(checks) and all(str(r[0]).lower()=='ok' for r in checks) and not fk
                        return self.send(200,{'ok':ok,'integrity':[str(r[0]) for r in checks],'foreign_key_issues':len(fk),'counts':counts,'database_bytes':size,'checked_at':__import__('datetime').datetime.now().isoformat(timespec='seconds')})
                    except Exception as e:return self.send(500,{'error':'تعذر فحص سلامة قاعدة البيانات','detail':str(e)})
                if path=='/api/users':
                    if user['role']!='Super Admin' and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'هذه الصفحة متاحة فقط لمن مُنح صلاحية إدارة المستخدمين'})
                    cols={r['name'] for r in c.execute('PRAGMA table_info(users)').fetchall()}
                    if 'performance_number' not in cols:c.execute("ALTER TABLE users ADD COLUMN performance_number TEXT DEFAULT ''")
                    if 'job_title' not in cols:c.execute("ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''")
                    rows=clean_rows(c.execute("SELECT username,COALESCE(performance_number,'') performance_number,COALESCE(job_title,'') job_title,role FROM users ORDER BY username").fetchall())
                    for row in rows:
                        row['role_ar']=ROLE_AR.get(row['role'],row['role'])
                        row['permissions']=permissions_for_user(c,row['username'],row['role'])
                        row['custom_permissions']=bool(c.execute('SELECT 1 FROM user_permissions WHERE username=? LIMIT 1',(row['username'],)).fetchone())
                    return self.send(200,rows)
                if path=='/api/data-quality':
                    checks=[
                     ('items_missing_code','خامات بدون كود',"SELECT code,name,opening,received,legacy_balance FROM items WHERE COALESCE(TRIM(code),'')=''"),
                     ('meters_missing_serial','عدادات بدون سيريال',"SELECT serial,meter_type,status,foreman,crn FROM meters WHERE COALESCE(TRIM(serial),'')=''"),
                     ('custody_without_foreman','عدادات بعهدة بدون فورمان',"SELECT serial,meter_type,status,foreman FROM meters WHERE status='CUSTODY' AND TRIM(COALESCE(foreman,''))=''"),
                     ('nonpositive_movements','حركات بكميات غير موجبة',"SELECT id,created_at,doc,foreman,code,type,qty,username FROM movements WHERE qty<=0"),
                     ('negative_balances','أرصدة خامات سالبة',"SELECT code,name,opening,received,legacy_balance FROM items WHERE active=1 AND legacy_balance<0 ORDER BY legacy_balance"),
                     ('duplicate_installed_crn','أرقام C.R.N مكررة بين العدادات المركبة',"SELECT crn,COUNT(*) count,GROUP_CONCAT(serial,' / ') serials FROM meters WHERE TRIM(COALESCE(crn,''))<>'' AND status='INSTALLED' GROUP BY crn HAVING COUNT(*)>1"),
                     ('installed_without_crn','عدادات مركبة بلا C.R.N',"SELECT serial,meter_type,foreman FROM meters WHERE status='INSTALLED' AND TRIM(COALESCE(crn,''))=''"),
                    ]
                    out=[]
                    for key,label,sql in checks:
                        count=c.execute('SELECT COUNT(*) FROM ('+sql+')').fetchone()[0]
                        out.append({'key':key,'check':label,'count':count})
                    return self.send(200,out)
                if path=='/api/alerts':
                    definitions=[
                     ('negative_balances','أرصدة خامات سالبة','عاجل',"SELECT code,name,legacy_balance FROM items WHERE legacy_balance<0 ORDER BY legacy_balance",('الكود','الخامة','الرصيد')),
                     ('duplicate_installed_crn','أرقام C.R.N مكررة بين العدادات المركبة','عاجل',"SELECT crn,COUNT(*) count,GROUP_CONCAT(serial,' / ') serials FROM meters WHERE TRIM(COALESCE(crn,''))<>'' AND status='INSTALLED' GROUP BY crn HAVING COUNT(*)>1",('C.R.N','عدد العدادات','السيريالات')),
                     ('custody_without_foreman','عدادات عهدة بلا اسم فورمان','تحذير',"SELECT serial,meter_type,status FROM meters WHERE status='CUSTODY' AND TRIM(COALESCE(foreman,''))=''",('السيريال','النوع','الحالة')),
                     ('installed_without_crn','عدادات مركبة بلا C.R.N','تحذير',"SELECT serial,meter_type,foreman FROM meters WHERE status='INSTALLED' AND TRIM(COALESCE(crn,''))=''",('السيريال','النوع','الفورمان')),
                     ('empty_receipts','مستندات وارد بلا عدادات','تحذير',"SELECT d.doc_no,d.created_at,d.meter_type FROM meter_receipt_docs d LEFT JOIN meter_receipt_lines l ON l.doc_id=d.id GROUP BY d.id HAVING COUNT(l.serial)=0 ORDER BY d.id DESC",('المستند','التاريخ','النوع')),
                     ('empty_issues','مستندات صرف بلا عدادات','تحذير',"SELECT d.doc_no,d.created_at,d.foreman FROM meter_issue_docs d LEFT JOIN meter_issue_lines l ON l.doc_id=d.id GROUP BY d.id HAVING COUNT(l.serial)=0 ORDER BY d.id DESC",('المستند','التاريخ','الفورمان')),
                     ('pending_transfers','طلبات تسليم عهدة تنتظر اعتماد المدير','تحذير',"SELECT d.doc_no,d.from_foreman,d.to_foreman,d.created_at,d.username FROM foreman_transfer_docs d JOIN document_approvals a ON a.doc_kind='FOREMAN_TRANSFER' AND a.doc_id=d.id WHERE a.status='PENDING' ORDER BY d.id DESC",('رقم الطلب','المسلّم','المستلم','تاريخ الطلب','مقدم الطلب')),
                     ('pending_stocktakes','محاضر جرد فورمان تنتظر الاعتماد','تحذير',"SELECT d.doc_no,d.foreman,d.created_at,d.username FROM foreman_stocktakes d JOIN document_approvals a ON a.doc_kind='FOREMAN_STOCKTAKE' AND a.doc_id=d.id WHERE a.status='PENDING' ORDER BY d.id DESC",('رقم المحضر','الفورمان','تاريخ الجرد','مقدم الطلب')),
                     ('pending_meter_returns','طلبات إرجاع عداد تنتظر الاعتماد','تحذير',"SELECT d.doc_no,d.serial,d.crn,d.created_at,d.username FROM meter_return_docs d JOIN document_approvals a ON a.doc_kind='METER_RETURN' AND a.doc_id=d.id WHERE a.status='PENDING' ORDER BY d.id DESC",('رقم الطلب','السيريال','C.R.N','تاريخ الطلب','مقدم الطلب')),
                     ('overdue_approvals','طلبات اعتماد متأخرة أكثر من 24 ساعة','عاجل',"SELECT a.doc_kind,a.doc_id,a.requested_by,a.requested_at,a.reason FROM document_approvals a WHERE a.status='PENDING' AND datetime(a.requested_at)<=datetime('now','localtime','-24 hours') ORDER BY a.requested_at",('نوع الطلب','رقم داخلي','مقدم الطلب','تاريخ الطلب','السبب')),
                     ('damaged_materials','خامات تالفة مسجلة','معلومة',"SELECT created_at,code,name,qty,notes FROM damaged_materials ORDER BY id DESC",('التاريخ','الكود','الخامة','الكمية','ملاحظات')),
                    ]
                    summary=[]
                    for key,title,level,sql,columns in definitions:
                        count=c.execute('SELECT COUNT(*) FROM ('+sql+')').fetchone()[0]
                        summary.append({'key':key,'alert':title,'level':level,'count':count})
                    return self.send(200,summary)
                if path=='/api/alert-detail':
                    from urllib.parse import parse_qs
                    key=parse_qs(urlparse(self.path).query).get('key',[''])[0]
                    detail_map={
                     'negative_balances':("SELECT code,name,legacy_balance FROM items WHERE legacy_balance<0 ORDER BY legacy_balance",['الكود','الخامة','الرصيد']),
                     'duplicate_installed_crn':("SELECT crn,COUNT(*) count,GROUP_CONCAT(serial,' / ') serials FROM meters WHERE TRIM(COALESCE(crn,''))<>'' AND status='INSTALLED' GROUP BY crn HAVING COUNT(*)>1",['C.R.N','عدد العدادات','السيريالات']),
                     'custody_without_foreman':("SELECT serial,meter_type,status FROM meters WHERE status='CUSTODY' AND TRIM(COALESCE(foreman,''))=''",['السيريال','النوع','الحالة']),
                     'installed_without_crn':("SELECT serial,meter_type,foreman FROM meters WHERE status='INSTALLED' AND TRIM(COALESCE(crn,''))=''",['السيريال','النوع','الفورمان']),
                     'empty_receipts':("SELECT d.doc_no,d.created_at,d.meter_type FROM meter_receipt_docs d LEFT JOIN meter_receipt_lines l ON l.doc_id=d.id GROUP BY d.id HAVING COUNT(l.serial)=0 ORDER BY d.id DESC",['المستند','التاريخ','النوع']),
                     'empty_issues':("SELECT d.doc_no,d.created_at,d.foreman FROM meter_issue_docs d LEFT JOIN meter_issue_lines l ON l.doc_id=d.id GROUP BY d.id HAVING COUNT(l.serial)=0 ORDER BY d.id DESC",['المستند','التاريخ','الفورمان']),
                     'pending_transfers':("SELECT d.doc_no,d.from_foreman,d.to_foreman,d.created_at,d.username FROM foreman_transfer_docs d JOIN document_approvals a ON a.doc_kind='FOREMAN_TRANSFER' AND a.doc_id=d.id WHERE a.status='PENDING' ORDER BY d.id DESC",['رقم الطلب','المسلّم','المستلم','تاريخ الطلب','مقدم الطلب']),
                     'pending_stocktakes':("SELECT d.doc_no,d.foreman,d.created_at,d.username FROM foreman_stocktakes d JOIN document_approvals a ON a.doc_kind='FOREMAN_STOCKTAKE' AND a.doc_id=d.id WHERE a.status='PENDING' ORDER BY d.id DESC",['رقم المحضر','الفورمان','تاريخ الطلب','مقدم الطلب']),
                     'pending_meter_returns':("SELECT d.doc_no,d.serial,d.crn,d.created_at,d.username FROM meter_return_docs d JOIN document_approvals a ON a.doc_kind='METER_RETURN' AND a.doc_id=d.id WHERE a.status='PENDING' ORDER BY d.id DESC",['رقم الطلب','السيريال','C.R.N','تاريخ الطلب','مقدم الطلب']),
                     'overdue_approvals':("SELECT a.doc_kind,a.doc_id,a.requested_by,a.requested_at,a.reason FROM document_approvals a WHERE a.status='PENDING' AND datetime(a.requested_at)<=datetime('now','localtime','-24 hours') ORDER BY a.requested_at",['نوع الطلب','رقم داخلي','مقدم الطلب','تاريخ الطلب','السبب']),
                     'damaged_materials':("SELECT created_at,code,name,qty,notes FROM damaged_materials ORDER BY id DESC",['التاريخ','الكود','الخامة','الكمية','ملاحظات']),
                     'items_missing_code':("SELECT code,name,opening,received,legacy_balance FROM items WHERE COALESCE(TRIM(code),'')=''",['الكود','الخامة','الافتتاحي','الوارد','الرصيد']),
                     'meters_missing_serial':("SELECT serial,meter_type,status,foreman,crn FROM meters WHERE COALESCE(TRIM(serial),'')=''",['السيريال','النوع','الحالة','الفورمان','C.R.N']),
                     'nonpositive_movements':("SELECT id,created_at,doc,foreman,code,type,qty,username FROM movements WHERE qty<=0",['رقم','التاريخ','المستند','الفورمان','الكود','الحركة','الكمية','المستخدم']),
                    }
                    if key not in detail_map:return self.send(400,{'error':'نوع التنبيه غير معروف'})
                    sql,columns=detail_map[key]
                    rows=clean_rows(c.execute(sql).fetchall())
                    return self.send(200,{'columns':columns,'rows':rows})
                if path=='/api/approval-history':
                    if user['role'] not in ('Super Admin','Manager') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'سجل الاعتماد متاح للمدير أو مدير النظام'})
                    from urllib.parse import parse_qs
                    q=parse_qs(urlparse(self.path).query);kind=q.get('kind',[''])[0];doc_id=q.get('id',[''])[0]
                    if not kind or not doc_id:return self.send(400,{'error':'نوع المستند ورقمه مطلوبان'})
                    try:
                        with db() as c:
                            state=c.execute("SELECT doc_kind,doc_id,status,requested_by,requested_at,COALESCE(reviewed_by,'') reviewed_by,COALESCE(reviewed_at,'') reviewed_at,COALESCE(reason,'') reason FROM document_approvals WHERE doc_kind=? AND doc_id=?",(kind,doc_id)).fetchone()
                            if not state:return self.send(404,{'error':'لا يوجد سجل اعتماد لهذا المستند'})
                            events=clean_rows(c.execute("SELECT action,actor,created_at,COALESCE(reason,'') reason FROM document_approval_history WHERE doc_kind=? AND doc_id=? ORDER BY id",(kind,doc_id)).fetchall())
                            return self.send(200,{'approval':dict(state),'history':events})
                    except sqlite3.Error as e:return self.send(500,{'error':'تعذر قراءة سجل الاعتماد','detail':str(e)})
                if path=='/api/approvals':
                    c.execute("CREATE TABLE IF NOT EXISTS material_edit_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,old_code TEXT NOT NULL,new_code TEXT NOT NULL,old_name TEXT NOT NULL,new_name TEXT NOT NULL,old_opening REAL NOT NULL,new_opening REAL NOT NULL,reason TEXT NOT NULL)")
                    c.execute("CREATE TABLE IF NOT EXISTS material_change_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,target_type TEXT NOT NULL,action TEXT NOT NULL,target_key TEXT NOT NULL,foreman TEXT NOT NULL DEFAULT '',old_data TEXT NOT NULL,new_data TEXT NOT NULL,reason TEXT NOT NULL,requested_by TEXT NOT NULL,requested_at TEXT NOT NULL)")
                    rows=c.execute("""SELECT a.doc_kind,a.doc_id,a.status,a.requested_by,a.requested_at,
                      COALESCE(a.reviewed_by,'') reviewed_by,COALESCE(a.reviewed_at,'') reviewed_at,a.reason,
                      CASE WHEN a.doc_kind='FOREMAN_CUSTODY_CHANGE' THEN (SELECT target_key FROM material_change_requests WHERE id=a.doc_id)
                           WHEN a.doc_kind='STOCK_ITEM_DELETE' THEN (SELECT target_key FROM material_change_requests WHERE id=a.doc_id) ELSE '' END target_key,
                      CASE WHEN a.doc_kind IN ('FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE') THEN (SELECT old_data FROM material_change_requests WHERE id=a.doc_id) ELSE '' END old_data,
                      CASE WHEN a.doc_kind IN ('FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE') THEN (SELECT new_data FROM material_change_requests WHERE id=a.doc_id) ELSE '' END new_data,
                      CASE WHEN a.doc_kind IN ('FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE') THEN (SELECT foreman FROM material_change_requests WHERE id=a.doc_id) ELSE '' END foreman,
                      CASE a.doc_kind WHEN 'MOVEMENT_REQUEST' THEN (SELECT doc_no FROM movement_requests WHERE id=a.doc_id) WHEN 'RECEIPT' THEN (SELECT doc_no FROM meter_receipt_docs WHERE id=a.doc_id)
                       WHEN 'ISSUE' THEN (SELECT doc_no FROM meter_issue_docs WHERE id=a.doc_id)
                       WHEN 'INSTALL' THEN (SELECT doc_no FROM meter_install_docs WHERE id=a.doc_id)
                       WHEN 'METER_RETURN' THEN (SELECT doc_no FROM meter_return_docs WHERE id=a.doc_id)
                       WHEN 'MATERIAL_RECEIPT' THEN (SELECT doc_no FROM material_receipt_docs WHERE id=a.doc_id)
                       WHEN 'FOREMAN_TRANSFER' THEN (SELECT doc_no FROM foreman_transfer_docs WHERE id=a.doc_id)
                       WHEN 'FOREMAN_STOCKTAKE' THEN (SELECT doc_no FROM foreman_stocktakes WHERE id=a.doc_id)
                       WHEN 'MATERIAL_EDIT' THEN (SELECT old_code FROM material_edit_requests WHERE id=a.doc_id)
                       WHEN 'FOREMAN_CUSTODY_CHANGE' THEN (SELECT target_key FROM material_change_requests WHERE id=a.doc_id)
                       WHEN 'STOCK_ITEM_DELETE' THEN (SELECT target_key FROM material_change_requests WHERE id=a.doc_id)
                       WHEN 'STOCK_ITEM_TOGGLE' THEN (SELECT target_key FROM material_change_requests WHERE id=a.doc_id)
                       ELSE CAST(a.doc_id AS TEXT) END doc_no,
                      CASE a.doc_kind WHEN 'MOVEMENT_REQUEST' THEN 'حركة خامات متعددة البنود' WHEN 'RECEIPT' THEN 'وارد عدادات' WHEN 'ISSUE' THEN 'صرف عدادات'
                       WHEN 'INSTALL' THEN 'تركيب عداد' WHEN 'METER_RETURN' THEN 'إرجاع عداد'
                       WHEN 'MATERIAL_RECEIPT' THEN 'وارد خامات' WHEN 'FOREMAN_TRANSFER' THEN 'تسليم عهدة'
                       WHEN 'FOREMAN_STOCKTAKE' THEN 'جرد فورمان' WHEN 'MATERIAL_EDIT' THEN 'تعديل بيانات خامة' WHEN 'FOREMAN_CUSTODY_CHANGE' THEN 'تعديل / حذف من عهدة فورمان' WHEN 'STOCK_ITEM_DELETE' THEN 'حذف خامة من المخزن' WHEN 'STOCK_ITEM_TOGGLE' THEN 'تغيير حالة خامة بالمخزن' ELSE a.doc_kind END kind_label
                      FROM document_approvals a ORDER BY a.requested_at DESC LIMIT 1000""").fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/damaged-workflow':
                    rows=c.execute("""SELECT m.serial,m.meter_type,m.capacity,m.foreman,m.crn,
                      COALESCE(r.condition,'غير مصنف') condition,COALESCE(r.reason,'') reason,
                      COALESCE(w.state,'بانتظار الفحص') state,COALESCE(w.notes,'') notes,
                      COALESCE(w.updated_at,'') updated_at,COALESCE(w.updated_by,'') updated_by
                      FROM meters m LEFT JOIN removed_meter_details r ON r.serial=m.serial
                      LEFT JOIN damaged_meter_workflow w ON w.serial=m.serial WHERE m.status='REMOVED' ORDER BY m.serial""").fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/meter-crn-history':
                    from urllib.parse import parse_qs
                    term=parse_qs(urlparse(self.path).query).get('q',[''])[0].strip()
                    rows=c.execute("""SELECT m.serial,m.meter_type,m.capacity,m.status,COALESCE(m.foreman,'') foreman,
                      COALESCE(m.crn,'') crn,COALESCE(m.meter_code,'') meter_code,COALESCE(m.received_at,'') received_at
                      FROM meters m WHERE (?='' OR m.crn LIKE ? OR m.serial LIKE ?) ORDER BY m.crn,m.serial LIMIT 2000""",
                      (term,'%'+term+'%','%'+term+'%')).fetchall()
                    return self.send(200,clean_rows(rows))
                if path=='/api/archive':
                    rows=c.execute("SELECT foreman,code,name,week,issued,installed FROM archive_nov ORDER BY foreman,name LIMIT 1500").fetchall()
                    return self.send(200,clean_rows(rows))
        except sqlite3.Error as e:
            return self.send(500,{'error':'تعذر قراءة البيانات','detail':str(e)})
        return self.send(404,{'error':'المسار غير موجود'})
    def do_POST(self):
        with WRITE_LOCK:
            return self._do_POST()
    def _do_POST(self):
        path=urlparse(self.path).path
        try: data=self.body()
        except Exception as e: return self.send(400,{'error':str(e)})
        if path=='/api/login':
            username=str(data.get('username','')).strip(); password=str(data.get('password',''))
            if not username or not password:return self.send(400,{'error':'اكتب اسم المستخدم وكلمة المرور'})
            try:
                with db() as c:
                    row=c.execute("SELECT salt,hash,role FROM users WHERE username=?",(username,)).fetchone()
                    count=c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                    if not count:
                        return self.send(403,{'error':'Administrator must initialize accounts offline'})
                        if len(password)<6:return self.send(400,{'error':'كلمة المرور يجب ألا تقل عن 6 أحرف'})
                        salt=secrets.token_hex(16); digest=hashed(salt,password)
                        c.execute("INSERT INTO users(username,salt,hash,role) VALUES(?,?,?,'Super Admin')",(username,salt,digest))
                        role='Super Admin'
                    elif not row or hashed(row['salt'],password)!=row['hash']:
                        return self.send(403,{'error':'اسم المستخدم أو كلمة المرور غير صحيحة'})
                    else: role=row['role']
                sid=secrets.token_urlsafe(32);SESSIONS[sid]={'username':username,'role':role,'created':time.time()}
                with db() as c: pages=permissions_for_user(c,username,role)
                return self.send(200,{'username':username,'role':role,'role_ar':ROLE_AR.get(role,role),'permissions':pages},{'Set-Cookie':f'egsid={sid}'+COOKIE_FLAGS})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تسجيل الدخول','detail':str(e)})
        user=self.require()
        if not user:return
        if path=='/api/export-xlsx':
            try:
                from openpyxl import Workbook
                from openpyxl.styles import Font, PatternFill, Border, Side, Alignment
                from openpyxl.utils import get_column_letter
                from openpyxl.drawing.image import Image as XLImage
                from openpyxl.worksheet.table import Table, TableStyleInfo
                from io import BytesIO
                rows=data.get('rows') or []
                title=str(data.get('title') or 'تقرير منظومة غاز مصر')[:180]
                filename=str(data.get('filename') or 'EGYPT_GAS_Report.xlsx')
                filename=Path(filename).name
                filename=re.sub(r'[^A-Za-z0-9_.-]+','_',filename)
                if not filename.lower().endswith('.xlsx'): filename=Path(filename).stem+'.xlsx'
                if not isinstance(rows,list) or not rows or len(rows)>200000:
                    return self.send(400,{'error':'لا توجد بيانات صالحة للتصدير أو عدد الصفوف أكبر من الحد المسموح'})
                wb=Workbook()
                ws=wb.active
                ws.title='تقرير'
                ws.sheet_view.rightToLeft=True
                ws.sheet_view.showGridLines=False
                navy='102B43'; blue='17435F'; gold='D7A63B'; pale='EAF1F6'; white='FFFFFF'; ink='183247'
                thin=Side(style='thin',color='C8D3DC')
                normalized=[]
                for row in rows:
                    if not isinstance(row,(list,tuple)): row=[row]
                    normalized.append([None if v is None else (v if isinstance(v,(int,float,bool)) else str(v)) for v in row])
                max_cols=max(max((len(r) for r in normalized),default=1),1)
                # A formal report title and metadata block.
                first_nonempty=next((i for i,r in enumerate(normalized) if any(v not in (None,'') for v in r)),0)
                first=normalized[first_nonempty] if normalized else []
                if len([v for v in first if v not in (None,'')])==1:
                    ws.merge_cells(start_row=2,start_column=1,end_row=2,end_column=max_cols)
                    c=ws.cell(2,1,str(next(v for v in first if v not in (None,''))))
                    c.fill=PatternFill('solid',fgColor=navy);c.font=Font(name='Arial',size=16,bold=True,color=white)
                    c.alignment=Alignment(horizontal='center',vertical='center')
                    ws.row_dimensions[1].height=62
                    ws.row_dimensions[2].height=34
                    # reserve row 1 for the company logo; title and report content follow
                    for ri,row in enumerate(normalized[first_nonempty+1:],start=3):
                        for ci,val in enumerate(row,1):
                            cell=ws.cell(ri,ci,val)
                            cell.font=Font(name='Arial',size=10,color=ink)
                            cell.alignment=Alignment(horizontal='right',vertical='center')
                    data_start=3
                else:
                    ws.row_dimensions[1].height=62
                    for ri,row in enumerate(normalized,2):
                        for ci,val in enumerate(row,1): ws.cell(ri,ci,val)
                    data_start=2
                # Find the first plausible column-heading row (3+ text headings).
                header_row=None
                for ri in range(1,ws.max_row+1):
                    vals=[ws.cell(ri,ci).value for ci in range(1,max_cols+1)]
                    filled=[v for v in vals if v not in (None,'')]
                    if len(filled)>=3 and sum(isinstance(v,str) for v in filled)>=2:
                        header_row=ri;break
                if header_row is None: header_row=1
                for ci in range(1,max_cols+1):
                    cell=ws.cell(header_row,ci)
                    cell.fill=PatternFill('solid',fgColor=blue)
                    cell.font=Font(name='Arial',size=10,bold=True,color=gold)
                    cell.alignment=Alignment(horizontal='center',vertical='center',wrap_text=True)
                    cell.border=Border(top=Side(style='medium',color=gold),bottom=Side(style='medium',color=gold))
                ws.row_dimensions[header_row].height=30
                for ri in range(header_row+1,ws.max_row+1):
                    ws.row_dimensions[ri].height=23
                    for ci in range(1,max_cols+1):
                        cell=ws.cell(ri,ci)
                        cell.font=Font(name='Arial',size=10,color=ink)
                        cell.fill=PatternFill('solid',fgColor=white if (ri-header_row)%2 else pale)
                        cell.alignment=Alignment(horizontal='right',vertical='center',wrap_text=True)
                        cell.border=Border(bottom=thin)
                # Add brand identity to the top-right corner without obscuring report data.
                logo=UI/'logo.png'
                if logo.exists():
                    try:
                        image=XLImage(str(logo)); image.width=74; image.height=62
                        ws.add_image(image,'A1')
                    except Exception: pass
                for ci in range(1,max_cols+1):
                    values=[str(ws.cell(ri,ci).value or '') for ri in range(1,ws.max_row+1)]
                    width=min(max(max((len(v) for v in values),default=10)+3,12),38)
                    ws.column_dimensions[get_column_letter(ci)].width=width
                ws.freeze_panes=ws.cell(header_row+1,1).coordinate
                if ws.max_row>header_row:
                    ws.auto_filter.ref=f'A{header_row}:{get_column_letter(max_cols)}{ws.max_row}'
                ws.sheet_properties.pageSetUpPr.fitToPage=True
                ws.page_setup.orientation='landscape'
                ws.page_setup.paperSize=ws.PAPERSIZE_A4
                ws.page_setup.fitToWidth=1;ws.page_setup.fitToHeight=0
                ws.page_margins.left=0.25;ws.page_margins.right=0.25
                ws.page_margins.top=0.55;ws.page_margins.bottom=0.55
                ws.print_title_rows=f'{header_row}:{header_row}'
                ws.sheet_properties.outlinePr.summaryBelow=True
                ws.sheet_view.zoomScale=90
                bio=BytesIO();wb.save(bio)
                return self.send(200,bio.getvalue(),{'Content-Disposition':f'attachment; filename="{filename}"'},'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            except Exception as e:
                return self.send(500,{'error':'تعذر إنشاء ملف Excel منسق','detail':str(e)})
        if path=='/api/logout':
            _,sid=self.session();SESSIONS.pop(sid,None)
            return self.send(200,{'ok':True},{'Set-Cookie':'egsid=; Max-Age=0'+COOKIE_FLAGS})
        # Central authorization: UI visibility is not a security boundary.
        role=user['role']
        if not user_can_access_api(user,'/api/movements' if path=='/api/movements-drafts' else path):
            return self.send(403,{'error':'ليس لديك صلاحية تنفيذ هذا الإجراء أو الوصول إلى بياناته'})
        write_roles={
            '/api/foreman-adjust':('Super Admin','Manager','Storekeeper'),
            '/api/foreman-batch':('Super Admin','Manager','Storekeeper'),
            '/api/foreman-weekly':('Super Admin','Manager','Storekeeper'),
            '/api/foreman-movement':('Super Admin','Manager','Storekeeper'),
            '/api/foreman-admin':('Super Admin','Manager','Storekeeper'),
            '/api/damaged-material-admin':('Super Admin','Manager','Storekeeper'),
            '/api/item-admin':('Super Admin','Manager','Storekeeper'),
            '/api/items':('Super Admin','Manager','Storekeeper'),
            '/api/movements':('Super Admin','Manager','Storekeeper'),
            '/api/movements-drafts':('Super Admin','Manager','Storekeeper'),
            '/api/meter-type-admin':('Super Admin','Manager','Meter Operator'),
            '/api/meter-import-audit.xlsx':('Super Admin','Manager','Meter Operator'),
            '/api/material-receipts':('Super Admin','Manager','Storekeeper'),
            '/api/foreman-transfers':('Super Admin','Manager','Storekeeper'),
            '/api/foreman-stocktakes':('Super Admin','Manager','Storekeeper'),
            '/api/meter-receipts':('Super Admin','Manager','Meter Operator'),
            '/api/meter-issues':('Super Admin','Manager','Meter Operator'),
            '/api/meter-installs':('Super Admin','Manager','Meter Operator'),
            '/api/meter-replacements':('Super Admin','Manager','Meter Operator'),
            '/api/removed-meter-state':('Super Admin','Manager','Meter Operator'),
            '/api/meter-return-request':('Super Admin','Manager','Meter Operator'),
            '/api/damaged-workflow':('Super Admin','Manager','Storekeeper'),
        }
        allowed=write_roles.get(path)
        if allowed and role not in allowed and not has_custom_user_permissions(user['username']):
            return self.send(403,{'error':'هذه العملية غير متاحة لصلاحية المستخدم الحالية'})
        if path=='/api/meter-import-audit':
            import base64, io, collections
            if user['role'] not in ('Super Admin','Manager','Meter Operator') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'ليس لديك صلاحية فحص ملفات العدادات'})
            try:
                raw=base64.b64decode(str(data.get('file_base64','')),validate=True)
                if not raw or len(raw)>20*1024*1024:raise ValueError('حجم ملف Excel فارغ أو أكبر من 20 ميجابايت')
                from openpyxl import load_workbook
                book=load_workbook(io.BytesIO(raw),read_only=True,data_only=True,keep_vba=False)
                def clean(v):
                    if v is None:return ''
                    if isinstance(v,float) and v.is_integer():return str(int(v))
                    return str(v).strip()
                stock=[];custody=[];installed=[];history=[]
                if 'Stock Register' in book.sheetnames:
                    for row in book['Stock Register'].iter_rows(min_row=5,max_col=4,values_only=True):
                        typ,cap,serial,status=row[:4];serial=clean(serial)
                        if serial:stock.append({'serial':serial,'type':clean(typ),'capacity':clean(cap),'status':clean(status),'location':'Stock Register'})
                foreman_sheets=['Osama','Ahmed Mahmoued','Ahmed Saeid','Amr Saeid','Alaa Adly','Ahmed Eid','Tharwatt','Hamada Desoky','Mahmoued Salah','Tarek Abdulfatah','Tahwelat','Tawarq']
                for sn in foreman_sheets:
                    if sn not in book.sheetnames:continue
                    for row in book[sn].iter_rows(min_row=5,max_row=5004,min_col=1,max_col=6,values_only=True):
                        serial=clean(row[0])
                        if serial:custody.append({'serial':serial,'type':clean(row[1]),'capacity':clean(row[2]),'foreman':sn,'crn':clean(row[4]),'status':clean(row[5]),'location':sn})
                if 'Sheet METER' in book.sheetnames:
                    for row in book['Sheet METER'].iter_rows(min_row=5,max_row=60004,min_col=1,max_col=6,values_only=True):
                        serial=clean(row[0])
                        if serial:installed.append({'serial':serial,'type':clean(row[1]),'capacity':clean(row[2]),'foreman':clean(row[3]),'crn':clean(row[4]),'date':clean(row[5]),'location':'Sheet METER'})
                if 'Meter History' in book.sheetnames:
                    for row in book['Meter History'].iter_rows(min_row=2,max_col=8,values_only=True):
                        if clean(row[0]):history.append([clean(x) for x in row])
                book.close()
                sc=collections.Counter(x['serial'] for x in stock);cc=collections.Counter(x['serial'] for x in custody);ic=collections.Counter(x['serial'] for x in installed)
                dup_stock=[k for k,v in sc.items() if v>1];dup_custody=[k for k,v in cc.items() if v>1];dup_installed=[k for k,v in ic.items() if v>1]
                installed_no_crn=[x for x in installed if not x.get('crn')];orphan=[x for x in custody if x['serial'] not in sc]
                marked_missing=[x for x in stock if 'مسحوب' in x['status'] and x['serial'] not in cc];cross=[k for k in sc if k in cc]
                with db() as c: dbrows=c.execute('SELECT serial,meter_type,capacity,status,foreman,crn FROM meters').fetchall()
                dbmap={clean(r['serial']):r for r in dbrows};allrows=stock+custody+installed
                already=[x for x in allrows if x['serial'] in dbmap];conflicts=[]
                for x in allrows:
                    if x['serial'] in dbmap:
                        r=dbmap[x['serial']]
                        if x.get('type') and clean(r['meter_type']) and x['type']!=clean(r['meter_type']):conflicts.append({'serial':x['serial'],'issue':'نوع العداد مختلف'})
                        if x.get('foreman') and clean(r['foreman']) and x['foreman']!=clean(r['foreman']):conflicts.append({'serial':x['serial'],'issue':'اسم الفورمان مختلف'})
                summary=[
                 {'issue':'سيريالات سجل المخزن','count':len(stock),'details':'Stock Register'},
                 {'issue':'سيريالات عهدة الفورمانات','count':len(custody),'details':'صفحات الفورمانات'},
                 {'issue':'العدادات المركبة','count':len(installed),'details':'Sheet METER'},
                 {'issue':'سجلات التاريخ','count':len(history),'details':'Meter History'},
                 {'issue':'سيريالات مكررة بسجل المخزن','count':len(dup_stock),'details':'، '.join(dup_stock[:30]) or 'لا يوجد'},
                 {'issue':'سيريالات مكررة بالعهدة','count':len(dup_custody),'details':'، '.join(dup_custody[:30]) or 'لا يوجد'},
                 {'issue':'سيريالات مكررة في شيت المركب','count':len(dup_installed),'details':'، '.join(dup_installed[:30]) or 'لا يوجد'},
                 {'issue':'عدادات مركبة بدون C.R.N','count':len(installed_no_crn),'details':'، '.join(x['serial'] for x in installed_no_crn[:30]) or 'لا يوجد'},
                 {'issue':'سيريالات عهدة غير موجودة بسجل المخزن','count':len(orphan),'details':'، '.join(x['serial'] for x in orphan[:30]) or 'لا يوجد'},
                 {'issue':'مسحوب من المخزن وغير ظاهر بعهدة','count':len(marked_missing),'details':'، '.join(x['serial'] for x in marked_missing[:30]) or 'لا يوجد'},
                 {'issue':'تداخل بين المخزن والعهدة','count':len(cross),'details':'، '.join(cross[:30]) or 'لا يوجد'},
                 {'issue':'سيريالات موجودة بالفعل بقاعدة EGYPT GAS','count':len(already),'details':'تُراجع قبل أي استيراد لتجنب التكرار'},
                 {'issue':'اختلافات نوع العداد/الفورمان مع القاعدة الحالية','count':len(conflicts),'details':'؛ '.join(x['serial']+': '+x['issue'] for x in conflicts[:30]) or 'لا يوجد'}]
                audit={'source':str(data.get('filename','ملف Excel')),'stock':stock,'custody':custody,'installed':installed,'history':history,'summary':summary,'conflicts':conflicts,'database_count':len(dbrows),'checked_count':len(allrows)}
                return self.send(200,audit)
            except Exception as e:return self.send(400,{'error':'تعذر فحص ملف Excel','detail':str(e)})
        if path=='/api/meter-import-audit.xlsx':
            if user['role'] not in ('Super Admin','Manager','Meter Operator') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'ليس لديك صلاحية تصدير تقرير الفحص'})
            try:
                from openpyxl import Workbook
                from openpyxl.styles import Font,PatternFill,Alignment
                from io import BytesIO
                out=Workbook();ws=out.active;ws.title='ملخص الفحص';ws.sheet_view.rightToLeft=True
                ws.append(['EGYPT GAS | تقرير فحص استيراد العدادات']);ws.append(['الملف المصدر',str(data.get('source',''))]);ws.append([]);ws.append(['الفحص','العدد','التفاصيل'])
                for r in data.get('summary',[]):ws.append([r.get('issue'),r.get('count'),r.get('details')])
                for cell in ws[4]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='173B63')
                for col,width in {'A':45,'B':14,'C':95}.items():ws.column_dimensions[col].width=width
                for title,key,fields in [('سجل المخزن','stock',['serial','type','capacity','status','location']),('عهدة الفورمانات','custody',['serial','type','capacity','foreman','crn','status','location']),('العدادات المركبة','installed',['serial','type','capacity','foreman','crn','date','location'])]:
                    sh=out.create_sheet(title);sh.sheet_view.rightToLeft=True
                    labels={'serial':'السيريال','type':'النوع','capacity':'السعة','status':'الحالة','location':'المصدر','foreman':'الفورمان','crn':'C.R.N','date':'التاريخ'}
                    sh.append([labels[x] for x in fields])
                    for r in data.get(key,[]):sh.append([r.get(x,'') for x in fields])
                    for cell in sh[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='087F8C')
                    sh.freeze_panes='A2';sh.auto_filter.ref=sh.dimensions
                    for col in sh.columns:
                        sh.column_dimensions[col[0].column_letter].width=min(36,max(14,max((len(str(x.value or '')) for x in col[:300]),default=14)+2))
                buf=BytesIO();out.save(buf);fname='EGYPT_GAS_Meter_Import_Audit.xlsx'
                return self.send(200,buf.getvalue(),{'Content-Disposition':'attachment; filename='+fname},'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            except Exception as e:return self.send(400,{'error':'تعذر إنشاء تقرير الفحص','detail':str(e)})
        if path=='/api/foreman-adjust':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'حساب العرض لا يملك صلاحية طلب التسوية'})
            foreman=str(data.get('foreman','')).strip();code=str(data.get('code','')).strip()
            reason=str(data.get('reason','')).strip()
            try: target=float(data.get('target',-1))
            except: return self.send(400,{'error':'الرصيد المطلوب غير صحيح'})
            if not foreman or not code or target<0 or not reason:return self.send(400,{'error':'اختر الفورمان والخامة وأدخل الرصيد الجديد وسبب الطلب'})
            now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():raise ValueError('الفورمان غير موجود')
                    item=c.execute('SELECT name FROM items WHERE code=?',(code,)).fetchone()
                    if not item:raise ValueError('الخامة غير موجودة')
                    before=custody_qty(c,foreman,code)
                    if abs(before-target)<1e-8:return self.send(200,{'ok':True,'unchanged':True})
                    pending=c.execute("SELECT 1 FROM document_approvals a JOIN material_change_requests r ON r.id=a.doc_id WHERE a.doc_kind='FOREMAN_CUSTODY_CHANGE' AND a.status='PENDING' AND r.target_key=? AND r.foreman=? LIMIT 1",(code,foreman)).fetchone()
                    if pending:raise ValueError('يوجد طلب تعديل/حذف معلق لنفس الخامة في عهدة هذا الفورمان')
                    old={'foreman':foreman,'code':code,'name':item['name'],'balance':before}
                    new={'foreman':foreman,'code':code,'name':item['name'],'balance':target,'operation':('تصفير رصيد / حذف من العهدة' if target==0 else 'تعديل رصيد العهدة')}
                    cur=c.execute('INSERT INTO material_change_requests(target_type,action,target_key,foreman,old_data,new_data,reason,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?,?)',('FOREMAN_CUSTODY','DELETE' if target==0 else 'UPDATE',code,foreman,json.dumps(old,ensure_ascii=False),json.dumps(new,ensure_ascii=False),reason,user['username'],now))
                    rid=cur.lastrowid
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('FOREMAN_CUSTODY_CHANGE',?,'PENDING',?,?,?)",(rid,user['username'],now,reason))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('FOREMAN_CUSTODY_CHANGE',?,'SUBMITTED',?,?,?)",(rid,user['username'],now,reason))
                return self.send(201,{'ok':True,'pending_approval':True,'request_id':rid,'message':'تم إرسال طلبك للمدير؛ لم يتغير الرصيد حتى الموافقة'})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر إرسال طلب الاعتماد','detail':str(e)})
        if path=='/api/user-admin':
            if user['role']!='Super Admin' and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'إدارة المستخدمين متاحة فقط لمن مُنح صلاحيتها'})
            action=str(data.get('action','')).strip().lower()
            username=str(data.get('username','')).strip()
            allowed_roles=('Super Admin','Manager','Storekeeper','Meter Operator','Viewer')
            try:
                with db() as c:
                    cols={r['name'] for r in c.execute('PRAGMA table_info(users)').fetchall()}
                    if 'performance_number' not in cols:c.execute("ALTER TABLE users ADD COLUMN performance_number TEXT DEFAULT ''")
                    if 'job_title' not in cols:c.execute("ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''")
                    c.execute('BEGIN IMMEDIATE')
                    now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    if action=='create':
                        newuser=str(data.get('username','')).strip();password=str(data.get('password',''));role=str(data.get('role','Viewer'))
                        if not newuser or not password:return self.send(400,{'error':'اسم المستخدم وكلمة المرور مطلوبان'})
                        if len(password)<6:return self.send(400,{'error':'كلمة المرور يجب ألا تقل عن 6 أحرف'})
                        if role not in allowed_roles:return self.send(400,{'error':'المسمى الوظيفي المحدد غير صحيح'})
                        if role=='Super Admin' and user['role']!='Super Admin':return self.send(403,{'error':'إنشاء مدير نظام أعلى متاح لمدير النظام الأعلى فقط'})
                        salt=secrets.token_hex(16);digest=hashed(salt,password)
                        c.execute('INSERT INTO users(username,salt,hash,role,performance_number,job_title) VALUES(?,?,?,?,?,?)',(newuser,salt,digest,role,str(data.get('performance_number','')).strip(),str(data.get('job_title','')).strip()))
                        audit_action='USER_CREATED';record=newuser;old='';new=json.dumps({'role':role,'performance_number':data.get('performance_number',''),'job_title':data.get('job_title','')},ensure_ascii=False)
                    else:
                        row=c.execute('SELECT username,role FROM users WHERE username=?',(username,)).fetchone()
                        if not row:return self.send(404,{'error':'المستخدم غير موجود'})
                        if row['role']=='Super Admin' and user['role']!='Super Admin':return self.send(403,{'error':'لا يمكن تعديل حساب مدير النظام الأعلى'})
                        if action=='delete':
                            if user['role']!='Super Admin':return self.send(403,{'error':'الحذف متاح لمدير النظام الأعلى فقط'})
                            if username==user['username']:return self.send(400,{'error':'لا يمكن حذف حسابك الحالي'})
                            if row['role']=='Super Admin' and c.execute("SELECT COUNT(*) FROM users WHERE role='Super Admin'").fetchone()[0]<=1:return self.send(400,{'error':'لا يمكن حذف آخر مدير'})
                            c.execute('DELETE FROM user_permissions WHERE username=?',(username,))
                            c.execute('DELETE FROM users WHERE username=?',(username,))
                            audit_action='USER_DELETED';record=username;old=row['role'];new=''
                        elif action=='role':
                            role=str(data.get('role',''))
                            if role not in allowed_roles:return self.send(400,{'error':'المسمى الوظيفي المحدد غير صحيح'})
                            if role=='Super Admin' and user['role']!='Super Admin':return self.send(403,{'error':'ترقية مدير نظام أعلى متاحة لمدير النظام الأعلى فقط'})
                            if username==user['username'] and role!='Super Admin':return self.send(400,{'error':'لا يمكن تخفيض صلاحية الحساب المستخدم حاليًا'})
                            if row['role']=='Super Admin' and role!='Super Admin':
                                n=c.execute("SELECT COUNT(*) FROM users WHERE role='Super Admin'").fetchone()[0]
                                if n<=1:return self.send(400,{'error':'لا يمكن تخفيض صلاحية آخر مدير نظام أعلى'})
                            c.execute('UPDATE users SET role=? WHERE username=?',(role,username))
                            audit_action='USER_ROLE_CHANGED';record=username;old=row['role'];new=role
                        elif action=='permissions':
                            target=c.execute('SELECT role FROM users WHERE username=?',(username,)).fetchone()
                            if not target:return self.send(404,{'error':'المستخدم غير موجود'})
                            selected=data.get('permissions') or []
                            if not isinstance(selected,list):return self.send(400,{'error':'قائمة الصلاحيات غير صحيحة'})
                            invalid=[x for x in selected if x not in PAGE_CATALOG]
                            if invalid:return self.send(400,{'error':'توجد صلاحيات غير معروفة'})
                            if target['role']=='Super Admin' and len(selected)!=len(PAGE_CATALOG):
                                return self.send(400,{'error':'مدير النظام الأعلى يحتفظ بكامل الصلاحيات حفاظًا على إدارة المنظومة'})
                            for key in PAGE_CATALOG:
                                c.execute('''INSERT INTO user_permissions(username,page_key,allowed,updated_at,updated_by)
                                    VALUES(?,?,?,?,?) ON CONFLICT(username,page_key) DO UPDATE SET
                                    allowed=excluded.allowed,updated_at=excluded.updated_at,updated_by=excluded.updated_by''',
                                    (username,key,1 if key in selected else 0,now,user['username']))
                            audit_action='USER_PERMISSIONS_UPDATED';record=username;old='';new=json.dumps(sorted(selected),ensure_ascii=False)
                        elif action=='profile':
                            perf=str(data.get('performance_number','')).strip();job=str(data.get('job_title','')).strip()
                            c.execute('UPDATE users SET performance_number=?,job_title=? WHERE username=?',(perf,job,username))
                            audit_action='USER_PROFILE_UPDATED';record=username;old='';new=json.dumps({'performance_number':perf,'job_title':job},ensure_ascii=False)
                        elif action=='password':
                            password=str(data.get('password',''))
                            if len(password)<6:return self.send(400,{'error':'كلمة المرور يجب ألا تقل عن 6 أحرف'})
                            salt=secrets.token_hex(16);digest=hashed(salt,password)
                            c.execute('UPDATE users SET salt=?,hash=? WHERE username=?',(salt,digest,username))
                            audit_action='USER_PASSWORD_RESET';record=username;old='';new='password reset'
                        elif action=='rename':
                            newuser=str(data.get('new_username','')).strip()
                            if not newuser:return self.send(400,{'error':'اسم المستخدم الجديد مطلوب'})
                            if newuser==username:return self.send(200,{'ok':True,'unchanged':True})
                            c.execute('UPDATE users SET username=? WHERE username=?',(newuser,username))
                            audit_action='USERNAME_CHANGED';record=newuser;old=username;new=newuser
                            if username==user['username']:
                                _,sid=self.session()
                                if sid and sid in SESSIONS:SESSIONS[sid]['username']=newuser
                        else:return self.send(400,{'error':'أمر إدارة المستخدمين غير معروف'})
                    try:c.execute('INSERT INTO audit_log(created_at,actor,action,table_name,record_key,old_data,new_data) VALUES(?,?,?,?,?,?,?)',(now,user['username'],audit_action,'users',record,str(old),str(new)))
                    except sqlite3.Error:pass
                return self.send(200,{'ok':True,'action':action})
            except sqlite3.IntegrityError:return self.send(409,{'error':'اسم المستخدم موجود بالفعل'})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تنفيذ إدارة المستخدمين','detail':str(e)})
        if path=='/api/foreman-batch':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'ليس لديك صلاحية ترحيل كشف عهدة جماعي'})
            foreman=str(data.get('foreman','')).strip();month=str(data.get('month','')).strip()
            kind=str(data.get('kind','')).strip();chosen=str(data.get('doc_no','')).strip()
            try:
                dt=__import__('datetime').datetime.strptime(month,'%Y-%m')
                if dt.strftime('%Y-%m')!=month:raise ValueError('اكتب الشهر بالشكل YYYY-MM')
                week=int(data.get('week',0))
                if not foreman or not chosen or not 1<=week<=5:raise ValueError('حدد الفورمان ورقم المستند والأسبوع من 1 إلى 5')
                if kind not in ('منصرف','مركب','سلف','مرتجع'):raise ValueError('نوع الحركة غير صحيح')
                entries=data.get('entries') or []
                if not isinstance(entries,list) or not entries or len(entries)>120:raise ValueError('الكشف يجب أن يحتوي من 1 إلى 120 بندًا')
                normalized=[];totals={}
                for idx,row in enumerate(entries,1):
                    code=str(row.get('code','')).strip();qty=float(row.get('qty',0))
                    ref=str(row.get('sheet_ref','')).strip();notes=str(row.get('notes','')).strip()
                    if not code or not 0<qty<1e12:raise ValueError(f'راجع الخامة والكمية في الصف {idx}')
                    normalized.append((code,qty,ref,notes));totals[code]=totals.get(code,0)+qty
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():raise ValueError('الفورمان غير موجود')
                    for code,total in totals.items():
                        item=c.execute('SELECT legacy_balance FROM items WHERE code=? AND active=1',(code,)).fetchone()
                        if not item:raise ValueError(f'الخامة غير موجودة أو موقوفة: {code}')
                        if kind in ('منصرف','سلف') and total>float(item['legacy_balance'] or 0)+1e-8:
                            raise ValueError(f'رصيد المخزن لا يكفي للخامة {code}: المطلوب {total:g}')
                        if kind in ('مركب','مرتجع') and total>custody_qty(c,foreman,code)+1e-8:
                            raise ValueError(f'رصيد عهدة الفورمان لا يكفي للخامة {code}: المطلوب {total:g}')
                    if c.execute('SELECT 1 FROM used_document_numbers WHERE doc=?',(chosen,)).fetchone() or c.execute('SELECT 1 FROM movements WHERE TRIM(doc)=?',(chosen,)).fetchone():
                        raise ValueError('رقم المستند مستخدم بالفعل')
                    if not c.execute('SELECT 1 FROM excel_doc_numbers WHERE kind=? AND doc=?',(kind,chosen)).fetchone():
                        raise ValueError('رقم المستند غير موجود في قائمة الأرقام المتاحة لهذا النوع')
                    stamp=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    c.execute('INSERT INTO used_document_numbers(doc,kind,foreman,created_at,username) VALUES(?,?,?,?,?)',(chosen,kind,foreman,stamp,user['username']))
                    movement_type={'منصرف':'صرف','مركب':'مركب','سلف':'سلف','مرتجع':'مرتجع'}[kind]
                    for code,qty,ref,notes in normalized:
                        note=(('شيت '+ref+' | ') if kind=='مركب' and ref else '')+notes
                        cur=c.execute('INSERT INTO movements(created_at,doc,foreman,week,code,type,qty,notes,username,source) VALUES(?,?,?,?,?,?,?,?,?,?)',
                            (stamp,chosen,foreman,f'{month} - الأسبوع {week}',code,movement_type,qty,note,user['username'],'NEW'))
                        if kind in ('منصرف','سلف'):c.execute('UPDATE items SET legacy_balance=legacy_balance-? WHERE code=?',(qty,code))
                        elif kind=='مرتجع':c.execute('UPDATE items SET legacy_balance=legacy_balance+? WHERE code=?',(qty,code))
                        c.execute('INSERT INTO foreman_weekly(foreman,month,week,kind,code,qty,sheet_ref,notes,movement_id,created_at,username) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                            (foreman,month,week,kind,code,qty,ref,notes,cur.lastrowid,stamp,user['username']))
                return self.send(200,{'ok':True,'doc_no':chosen,'count':len(normalized)})
            except (ValueError,TypeError) as e:
                return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:
                return self.send(500,{'error':'تعذر ترحيل الكشف الجماعي','detail':str(e)})
        
        if path=='/api/foreman-weekly':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'ليس لديك صلاحية تعديل الحركة الأسبوعية'})
            action=str(data.get('action','create')).lower();foreman=str(data.get('foreman','')).strip()
            if not foreman:return self.send(400,{'error':'حدد الفورمان'})
            try:
                month=str(data.get('month','')).strip();dt=__import__('datetime').datetime.strptime(month,'%Y-%m')
                if dt.strftime('%Y-%m')!=month:raise ValueError('اكتب الشهر بالشكل YYYY-MM')
                week=int(data.get('week',0));kind=str(data.get('kind','')).strip();code=str(data.get('code','')).strip();qty=float(data.get('qty',0))
                if not 1<=week<=5 or kind not in ('منصرف','مركب','سلف','مرتجع') or not code or qty<=0:raise ValueError('راجع الأسبوع ونوع الحركة والخامة والكمية الموجبة')
                ref=str(data.get('sheet_ref','')).strip();notes=str(data.get('notes','')).strip();edit_id=int(data.get('id',0) or 0)
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():raise ValueError('الفورمان غير موجود')
                    if not c.execute('SELECT 1 FROM items WHERE code=?',(code,)).fetchone():raise ValueError('الخامة غير موجودة')
                    old=None
                    if action in ('update','delete'):
                        old=c.execute('SELECT id,month,week,kind,code,qty,sheet_ref,notes,movement_id FROM foreman_weekly WHERE id=? AND foreman=?',(edit_id,foreman)).fetchone()
                        if not old:raise ValueError('الحركة الأسبوعية غير موجودة')
                        if old['movement_id']:
                            m=c.execute("SELECT id,type,qty,code FROM movements WHERE id=? AND source='NEW'",(old['movement_id'],)).fetchone()
                            if m:
                                if m['type'] in ('صرف','سلف'):c.execute('UPDATE items SET legacy_balance=legacy_balance+? WHERE code=?',(m['qty'],m['code']))
                                elif m['type']=='مرتجع':c.execute('UPDATE items SET legacy_balance=legacy_balance-? WHERE code=?',(m['qty'],m['code']))
                                c.execute("DELETE FROM movements WHERE id=? AND source='NEW'",(old['movement_id'],))
                        if action=='delete':
                            c.execute('DELETE FROM foreman_weekly WHERE id=?',(edit_id,))
                            return self.send(200,{'ok':True,'deleted':True})
                    stock=c.execute('SELECT legacy_balance FROM items WHERE code=?',(code,)).fetchone()[0]
                    current_custody=custody_qty(c,foreman,code)
                    if kind in ('منصرف','سلف') and qty>float(stock or 0)+1e-8:raise ValueError('رصيد المخزن لا يكفي للصرف أو السلف')
                    if kind in ('مركب','مرتجع') and qty>current_custody+1e-8:raise ValueError('كمية المركب أو المرتجع أكبر من رصيد عهدة الفورمان')
                    stamp=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    movement_type={'منصرف':'صرف','مركب':'مركب','سلف':'سلف','مرتجع':'مرتجع'}[kind]
                    doc=''
                    if kind in ('منصرف','سلف','مرتجع'):
                        c.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('material_issue_sequence','0')")
                        c.execute("UPDATE meta SET value=CAST(value AS INTEGER)+1 WHERE key='material_issue_sequence'")
                        seq=int(c.execute("SELECT value FROM meta WHERE key='material_issue_sequence'").fetchone()[0])
                        doc='MAT-OUT-'+__import__('datetime').datetime.now().strftime('%Y%m')+'-'+str(seq).zfill(6)
                    cur=c.execute('INSERT INTO movements(created_at,doc,foreman,week,code,type,qty,notes,username,source) VALUES(?,?,?,?,?,?,?,?,?,?)',
                        (stamp,doc,foreman,f'{month} - الأسبوع {week}',code,movement_type,qty,('شيت '+ref+' | ' if kind=='مركب' and ref else '')+notes,user['username'],'NEW'))
                    if kind in ('منصرف','سلف'):c.execute('UPDATE items SET legacy_balance=legacy_balance-? WHERE code=?',(qty,code))
                    elif kind=='مرتجع':c.execute('UPDATE items SET legacy_balance=legacy_balance+? WHERE code=?',(qty,code))
                    if action=='update':
                        c.execute('UPDATE foreman_weekly SET month=?,week=?,kind=?,code=?,qty=?,sheet_ref=?,notes=?,movement_id=?,username=? WHERE id=?',
                            (month,week,kind,code,qty,ref,notes,cur.lastrowid,user['username'],edit_id))
                    else:
                        c.execute('INSERT INTO foreman_weekly(foreman,month,week,kind,code,qty,sheet_ref,notes,movement_id,created_at,username) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                            (foreman,month,week,kind,code,qty,ref,notes,cur.lastrowid,stamp,user['username']))
                return self.send(200,{'ok':True,'movement_id':cur.lastrowid})
            except ValueError as e:
                try:c.rollback()
                except Exception:pass
                return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:
                try:c.rollback()
                except Exception:pass
                return self.send(500,{'error':'تعذر حفظ الحركة الأسبوعية','detail':str(e)})
        if path=='/api/foreman-movement':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'حساب العرض لا يملك صلاحية تسجيل الحركة'})
            foreman=str(data.get('foreman','')).strip();code=str(data.get('code','')).strip()
            kind=str(data.get('type','')).strip();doc=str(data.get('doc','')).strip()
            week=str(data.get('week','')).strip();notes=str(data.get('notes','')).strip()
            try: qty=float(data.get('qty',0))
            except: return self.send(400,{'error':'الكمية غير صحيحة'})
            if not foreman or not code or qty<=0:return self.send(400,{'error':'اختر الفورمان والخامة وأدخل كمية موجبة'})
            if kind not in ('صرف','سلف','مرتجع','مركب'):return self.send(400,{'error':'نوع الحركة غير صحيح'})
            try:
                with db() as c:
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():return self.send(404,{'error':'الفورمان غير موجود'})
                    item=c.execute('SELECT legacy_balance FROM items WHERE code=? AND active=1',(code,)).fetchone()
                    if not item:return self.send(404,{'error':'الخامة غير موجودة أو موقوفة'})
                    balance=custody_qty(c,foreman,code)
                    if kind=='صرف' and qty>float(item['legacy_balance'] or 0)+1e-8:return self.send(400,{'error':'رصيد المخزن لا يكفي'})
                    if kind in ('مرتجع','مركب') and qty>balance+1e-8:return self.send(400,{'error':'رصيد عهدة الفورمان لا يكفي'})
                    c.execute("INSERT INTO movements(created_at,doc,foreman,week,code,type,qty,notes,username) VALUES(datetime('now','localtime'),?,?,?,?,?,?,?,?)",
                              (doc,foreman,week,code,kind,qty,notes,user['username']))
                    if kind in ('صرف','مرتجع'):
                        delta=-qty if kind=='صرف' else qty
                        c.execute('UPDATE items SET legacy_balance=legacy_balance+? WHERE code=?',(delta,code))
                return self.send(201,{'ok':True})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تسجيل حركة العهدة','detail':str(e)})
        if path.startswith('/api/') and path not in ('/api/logout',):
            role=user['role']
            store_paths=('/api/items','/api/item-admin','/api/movements','/api/foreman-adjust','/api/foreman-movement','/api/material-receipts','/api/foreman-transfers','/api/foreman-stocktakes','/api/foreman-admin','/api/damaged-material-admin')
            meter_paths=('/api/meter-type-admin','/api/meter-receipts','/api/meter-issues','/api/meter-installs','/api/meter-replacements','/api/removed-meter-state','/api/meter-return-request')
            if role=='Viewer':return self.send(403,{'error':'حساب العرض لا يملك صلاحية تنفيذ العمليات'})
            if role=='Storekeeper' and not path.startswith(store_paths):return self.send(403,{'error':'حساب أمين المخزن لا يملك صلاحية هذا القسم'})
            if role=='Meter Operator' and not path.startswith(meter_paths):return self.send(403,{'error':'حساب مسؤول العدادات لا يملك صلاحية هذا القسم'})
        if path=='/api/foreman-admin':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'لا تملك صلاحية إدارة الفورمانات'})
            action=str(data.get('action','')).strip();old=str(data.get('old_name','')).strip();name=str(data.get('name','')).strip();performance=str(data.get('performance_no','')).strip();mobile=str(data.get('mobile','')).strip()
            if mobile and (not mobile.isdigit() or len(mobile)>20):return self.send(400,{'error':'رقم الهاتف يجب أن يحتوي على أرقام فقط'})
            try:
                with db() as c:
                    if action=='create':
                        if not name:return self.send(400,{'error':'اسم الفورمان مطلوب'})
                        c.execute('INSERT INTO foremen(name,performance_no,mobile) VALUES(?,?,?)',(name,performance,mobile))
                    elif action=='update':
                        if not old or not name:return self.send(400,{'error':'اسم الفورمان مطلوب'})
                        if not c.execute('SELECT 1 FROM foremen WHERE name=?',(old,)).fetchone():return self.send(404,{'error':'الفورمان غير موجود'})
                        if old!=name:
                            c.execute('UPDATE foremen SET name=? WHERE name=?',(name,old))
                            for table in ('movements','meters','meter_events','archive_nov','foreman_opening','custody_adjustments','foreman_weekly','used_document_numbers','meter_issue_docs','meter_replacements','meter_install_docs'):
                                cols={r['name'] for r in c.execute('PRAGMA table_info("'+table+'")').fetchall()}
                                if 'foreman' in cols:c.execute('UPDATE "'+table+'" SET foreman=? WHERE foreman=?',(name,old))
                            c.execute('UPDATE foreman_transfer_docs SET from_foreman=? WHERE from_foreman=?',(name,old));c.execute('UPDATE foreman_transfer_docs SET to_foreman=? WHERE to_foreman=?',(name,old))
                            c.execute('UPDATE foreman_stocktakes SET foreman=? WHERE foreman=?',(name,old))
                        c.execute('UPDATE foremen SET performance_no=?,mobile=? WHERE name=?',(performance,mobile,name))
                    elif action=='delete':
                        target=old or name
                        if not target:return self.send(400,{'error':'حدد الفورمان'})
                        checks=[('movements','foreman'),('meters','foreman'),('meter_events','foreman'),('archive_nov','foreman'),('foreman_opening','foreman'),('custody_adjustments','foreman'),('foreman_weekly','foreman'),('used_document_numbers','foreman'),('meter_issue_docs','foreman'),('meter_install_docs','foreman'),('meter_replacements','foreman'),('foreman_stocktakes','foreman')]
                        for table,col in checks:
                            if c.execute('SELECT 1 FROM "'+table+'" WHERE "'+col+'"=? LIMIT 1',(target,)).fetchone():raise ValueError('الفورمان مرتبط بسجلات أو عدادات؛ لا يمكن حذفه حفاظًا على التاريخ')
                        if c.execute('SELECT 1 FROM foreman_transfer_docs WHERE from_foreman=? OR to_foreman=? LIMIT 1',(target,target)).fetchone():raise ValueError('الفورمان مرتبط بطلبات تسليم عهدة سابقة')
                        c.execute('DELETE FROM foremen WHERE name=?',(target,))
                    else:return self.send(400,{'error':'العملية غير مدعومة'})
                return self.send(200,{'ok':True})
            except sqlite3.IntegrityError:return self.send(409,{'error':'اسم الفورمان موجود بالفعل'})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر إدارة الفورمان','detail':str(e)})
        if path=='/api/damaged-material-admin':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'لا تملك صلاحية إدارة الخامات التالفة'})
            action=str(data.get('action','')).strip();code=str(data.get('code','')).strip();notes=str(data.get('notes','')).strip()
            try:qty=float(data.get('qty',0))
            except:qty=0
            try:
                with db() as c:
                    if action in ('create','update'):
                        item=c.execute('SELECT name FROM items WHERE code=?',(code,)).fetchone()
                        if not item or qty<=0:raise ValueError('اختر خامة صحيحة وأدخل كمية تالفة أكبر من صفر')
                        if action=='create':c.execute('INSERT INTO damaged_materials(code,name,qty,notes,created_at,username) VALUES(?,?,?,?,datetime(\'now\',\'localtime\'),?)',(code,item['name'],qty,notes,user['username']))
                        else:
                            rid=int(data.get('id',0) or 0)
                            cur=c.execute('UPDATE damaged_materials SET code=?,name=?,qty=?,notes=? WHERE id=?',(code,item['name'],qty,notes,rid))
                            if cur.rowcount==0:raise ValueError('سجل الخامة التالفة غير موجود')
                    elif action=='delete':
                        rid=int(data.get('id',0) or 0);cur=c.execute('DELETE FROM damaged_materials WHERE id=?',(rid,))
                        if cur.rowcount==0:raise ValueError('سجل الخامة التالفة غير موجود')
                    else:raise ValueError('العملية غير مدعومة')
                return self.send(200,{'ok':True})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ الخامة التالفة','detail':str(e)})
        if path=='/api/item-admin':
            if user['role'] not in ('Super Admin','Manager','Storekeeper') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'لا تملك صلاحية إدارة الخامات'})
            action=str(data.get('action','')).strip();code=str(data.get('code','')).strip();now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            try:
                with db() as c:
                    if action=='toggle':
                        row=c.execute('SELECT name,active,legacy_balance FROM items WHERE code=?',(code,)).fetchone()
                        if not row:raise ValueError('الخامة غير موجودة')
                        reason=str(data.get('reason','')).strip() or ('طلب '+('إيقاف' if row['active'] else 'تفعيل')+' خامة '+row['name'])
                        if c.execute("SELECT 1 FROM document_approvals a JOIN material_change_requests r ON r.id=a.doc_id WHERE a.doc_kind='STOCK_ITEM_TOGGLE' AND a.status='PENDING' AND r.target_key=?",(code,)).fetchone():raise ValueError('يوجد طلب تغيير حالة معلق لهذه الخامة')
                        old={'code':code,'name':row['name'],'active':row['active'],'balance':row['legacy_balance']};new={'code':code,'name':row['name'],'active':1-int(row['active'])}
                        cur=c.execute('INSERT INTO material_change_requests(target_type,action,target_key,foreman,old_data,new_data,reason,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?,?)',('STOCK_ITEM','TOGGLE',code,'',json.dumps(old,ensure_ascii=False),json.dumps(new,ensure_ascii=False),reason,user['username'],now))
                        rid=cur.lastrowid;c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('STOCK_ITEM_TOGGLE',?,'PENDING',?,?,?)",(rid,user['username'],now,reason))
                        c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('STOCK_ITEM_TOGGLE',?,'SUBMITTED',?,?,?)",(rid,user['username'],now,reason))
                    elif action=='edit-request':
                        c.execute('CREATE TABLE IF NOT EXISTS material_edit_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,old_code TEXT NOT NULL,new_code TEXT NOT NULL,old_name TEXT NOT NULL,new_name TEXT NOT NULL,old_opening REAL NOT NULL,new_opening REAL NOT NULL,reason TEXT NOT NULL)')
                        new_code=str(data.get('new_code','')).strip();new_name=str(data.get('new_name','')).strip();reason=str(data.get('reason','')).strip()
                        try:new_open=float(data.get('new_opening',-1))
                        except:new_open=-1
                        if not code or not new_code or not new_name or not reason or new_open<0:raise ValueError('أكمل الكود والاسم وأول المدة وسبب التعديل')
                        row=c.execute('SELECT name,opening FROM items WHERE code=?',(code,)).fetchone()
                        if not row:raise ValueError('الخامة غير موجودة')
                        if (code,new_name,new_open)==(new_code,row['name'],float(row['opening'])):raise ValueError('لا توجد تغييرات')
                        if c.execute("SELECT 1 FROM document_approvals a JOIN material_edit_requests r ON r.id=a.doc_id WHERE a.doc_kind='MATERIAL_EDIT' AND a.status='PENDING' AND r.old_code=?",(code,)).fetchone():raise ValueError('يوجد طلب تعديل معلق لهذه الخامة')
                        c.execute('CREATE TABLE IF NOT EXISTS material_edit_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,old_code TEXT NOT NULL,new_code TEXT NOT NULL,old_name TEXT NOT NULL,new_name TEXT NOT NULL,old_opening REAL NOT NULL,new_opening REAL NOT NULL,reason TEXT NOT NULL)')
                        cur=c.execute('INSERT INTO material_edit_requests(old_code,new_code,old_name,new_name,old_opening,new_opening,reason) VALUES(?,?,?,?,?,?,?)',(code,new_code,row['name'],new_name,row['opening'],new_open,reason))
                        now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                        c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('MATERIAL_EDIT',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,reason))
                        c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('MATERIAL_EDIT',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,reason))
                    elif action=='delete-request':
                        reason=str(data.get('reason','')).strip()
                        if not code or not reason:raise ValueError('سبب طلب الحذف مطلوب')
                        row=c.execute('SELECT name,opening,received,legacy_balance,active FROM items WHERE code=?',(code,)).fetchone()
                        if not row:raise ValueError('الخامة غير موجودة')
                        if c.execute("SELECT 1 FROM document_approvals a JOIN material_change_requests r ON r.id=a.doc_id WHERE a.doc_kind='STOCK_ITEM_DELETE' AND a.status='PENDING' AND r.target_key=?",(code,)).fetchone():raise ValueError('يوجد طلب حذف معلق لهذه الخامة')
                        old={'code':code,'name':row['name'],'opening':row['opening'],'received':row['received'],'balance':row['legacy_balance'],'active':row['active']}
                        cur=c.execute('INSERT INTO material_change_requests(target_type,action,target_key,foreman,old_data,new_data,reason,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?,?)',('STOCK_ITEM','DELETE',code,'',json.dumps(old,ensure_ascii=False),'{}',reason,user['username'],now))
                        rid=cur.lastrowid
                        c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('STOCK_ITEM_DELETE',?,'PENDING',?,?,?)",(rid,user['username'],now,reason))
                        c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('STOCK_ITEM_DELETE',?,'SUBMITTED',?,?,?)",(rid,user['username'],now,reason))
                    elif action=='delete':
                        raise ValueError('الحذف المباشر موقوف؛ أرسل طلب حذف ينتظر موافقة المدير')
                    else:raise ValueError('العملية غير مدعومة')
                return self.send(200,{'ok':True,'pending_approval':action in ('edit-request','delete-request','toggle'),'message':'تم إرسال الطلب للمدير؛ لن يتم تطبيق التغيير قبل الموافقة' if action in ('edit-request','delete-request','toggle') else 'تم الحفظ'})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تنفيذ العملية','detail':str(e)})
        if path=='/api/user-admin':
            if user['role']!='Super Admin':return self.send(403,{'error':'إدارة المستخدمين متاحة لمدير النظام الأعلى فقط'})
            action=str(data.get('action','')).strip();username=str(data.get('username','')).strip();now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            roles=('Super Admin','Manager','Storekeeper','Meter Operator','Viewer')
            try:
                with db() as c:
                    cols={r['name'] for r in c.execute('PRAGMA table_info(users)').fetchall()}
                    if 'performance_number' not in cols:c.execute("ALTER TABLE users ADD COLUMN performance_number TEXT DEFAULT ''")
                    if 'job_title' not in cols:c.execute("ALTER TABLE users ADD COLUMN job_title TEXT DEFAULT ''")
                    if action=='create':
                        pwd=str(data.get('password',''));role=str(data.get('role','Viewer'))
                        if not username or len(pwd)<6:return self.send(400,{'error':'اسم المستخدم مطلوب وكلمة المرور 6 أحرف على الأقل'})
                        if role not in roles:return self.send(400,{'error':'الصلاحية غير صحيحة'})
                        salt=secrets.token_hex(16);digest=hashed(salt,pwd)
                        c.execute('INSERT INTO users(username,salt,hash,role,performance_number,job_title) VALUES(?,?,?,?,?,?)',(username,salt,digest,role,str(data.get('performance_number','')).strip(),str(data.get('job_title','')).strip()))
                        return self.send(201,{'ok':True})
                    if not username or not c.execute('SELECT 1 FROM users WHERE username=?',(username,)).fetchone():return self.send(404,{'error':'المستخدم غير موجود'})
                    if action=='role':
                        role=str(data.get('role',''))
                        if role not in roles:return self.send(400,{'error':'الصلاحية غير صحيحة'})
                        current=c.execute('SELECT role FROM users WHERE username=?',(username,)).fetchone()['role']
                        if username==user['username'] and role!='Super Admin':return self.send(400,{'error':'لا يمكن تخفيض صلاحية حسابك أثناء تسجيل الدخول'})
                        if current=='Super Admin' and role!='Super Admin' and c.execute("SELECT COUNT(*) FROM users WHERE role='Super Admin'").fetchone()[0]<=1:return self.send(400,{'error':'لا يمكن تخفيض آخر مدير نظام أعلى'})
                        c.execute('UPDATE users SET role=? WHERE username=?',(role,username))
                    elif action=='rename':
                        new=str(data.get('new_username','')).strip()
                        if not new:return self.send(400,{'error':'اسم المستخدم الجديد مطلوب'})
                        c.execute('UPDATE users SET username=? WHERE username=?',(new,username))
                        if username==user['username']:user['username']=new
                        username=new
                    elif action=='profile':
                        c.execute('UPDATE users SET performance_number=?,job_title=? WHERE username=?',(str(data.get('performance_number','')).strip(),str(data.get('job_title','')).strip(),username))
                    elif action=='password':
                        pwd=str(data.get('password',''))
                        if len(pwd)<6:return self.send(400,{'error':'كلمة المرور يجب ألا تقل عن 6 أحرف'})
                        salt=secrets.token_hex(16);digest=hashed(salt,pwd);c.execute('UPDATE users SET salt=?,hash=? WHERE username=?',(salt,digest,username))
                    else:return self.send(400,{'error':'نوع العملية غير مدعوم'})
                    try:c.execute('INSERT INTO audit_log(created_at,actor,action,table_name,record_key,old_data,new_data) VALUES(?,?,?,?,?,?,?)',(now,user['username'],'USER_'+action.upper(),'users',username,'',json.dumps(data,ensure_ascii=False)))
                    except sqlite3.Error:pass
                return self.send(200,{'ok':True,'username':username})
            except sqlite3.IntegrityError:return self.send(409,{'error':'اسم المستخدم مستخدم بالفعل'})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تحديث المستخدم','detail':str(e)})
        if path=='/api/meter-type-admin':
            if user['role'] not in ('Super Admin','Manager','Meter Operator') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'لا تملك صلاحية إدارة أنواع العدادات'})
            action=str(data.get('action','')).strip();name=str(data.get('name','')).strip();capacity=str(data.get('capacity','')).strip()
            if action in ('create','update') and (not name or not capacity):return self.send(400,{'error':'اسم النوع والسعة مطلوبان'})
            try:
                with db() as c:
                    cols={r['name'] for r in c.execute("PRAGMA table_info(meter_types)").fetchall()}
                    if 'meter_code' not in cols:c.execute("ALTER TABLE meter_types ADD COLUMN meter_code TEXT NOT NULL DEFAULT ''")
                    meter_code=str(data.get('meter_code','')).strip()
                    if action=='create':c.execute('INSERT INTO meter_types(name,capacity,active,meter_code) VALUES(?,?,1,?)',(name,capacity,meter_code))
                    elif action=='update':
                        old=str(data.get('old_name','')).strip()
                        if not old:return self.send(400,{'error':'اسم النوع السابق مطلوب'})
                        if old!=name and (c.execute('SELECT 1 FROM meters WHERE meter_type=? LIMIT 1',(old,)).fetchone() or c.execute('SELECT 1 FROM meter_receipt_docs WHERE meter_type=? LIMIT 1',(old,)).fetchone()):return self.send(400,{'error':'النوع مرتبط بعدادات أو مستندات سابقة؛ عدّل السعة أو أوقف النوع وأضف نوعًا جديدًا'})
                        c.execute('UPDATE meter_types SET name=?,capacity=?,meter_code=? WHERE name=?',(name,capacity,meter_code,old))
                    elif action=='toggle':c.execute('UPDATE meter_types SET active=1-active WHERE name=?',(name,))
                    elif action=='delete':
                        if c.execute('SELECT 1 FROM meters WHERE meter_type=? LIMIT 1',(name,)).fetchone() or c.execute('SELECT 1 FROM meter_receipt_docs WHERE meter_type=? LIMIT 1',(name,)).fetchone():return self.send(400,{'error':'لا يمكن حذف نوع مرتبط بسجلات؛ استخدم إيقاف النوع'})
                        c.execute('DELETE FROM meter_types WHERE name=?',(name,))
                    else:return self.send(400,{'error':'العملية غير مدعومة'})
                return self.send(200,{'ok':True})
            except sqlite3.IntegrityError:return self.send(409,{'error':'اسم النوع موجود بالفعل'})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ نوع العداد','detail':str(e)})
        if path=='/api/material-receipts':
            doc=str(data.get('doc_no','')).strip();doc_date=str(data.get('doc_date','')).strip();supplier=str(data.get('supplier','')).strip();lines=data.get('lines') or []
            if not doc or not doc_date or not isinstance(lines,list) or not lines:return self.send(400,{'error':'رقم المستند والتاريخ وبند واحد على الأقل مطلوبة'})
            clean=[];seen=set()
            try:
                for line in lines:
                    code=str(line.get('code','')).strip();qty=float(line.get('qty',0));note=str(line.get('note','')).strip()
                    if not code or qty<=0:raise ValueError('كل بند يحتاج كود خامة وكمية موجبة')
                    if code in seen:raise ValueError('الصنف مكرر داخل المستند: '+code)
                    seen.add(code);clean.append((code,qty,note))
            except (ValueError,TypeError) as e:return self.send(400,{'error':str(e)})
            now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    old=c.execute("SELECT d.id,COALESCE(a.status,'') status FROM material_receipt_docs d LEFT JOIN document_approvals a ON a.doc_kind='MATERIAL_RECEIPT' AND a.doc_id=d.id WHERE TRIM(d.doc_no)=TRIM(?)",(doc,)).fetchone()
                    if old:raise ValueError('رقم المستند مستخدم بالفعل؛ راجع حالته في سجل المستندات')
                    for code,qty,note in clean:
                        item=c.execute('SELECT name,active FROM items WHERE code=?',(code,)).fetchone()
                        if not item or not item['active']:raise ValueError('الصنف غير موجود أو غير نشط: '+code)
                    cur=c.execute('INSERT INTO material_receipt_docs(doc_no,doc_date,supplier,created_at,username) VALUES(?,?,?,?,?)',(doc,doc_date,supplier,now,user['username']))
                    for code,qty,note in clean:
                        name=c.execute('SELECT name FROM items WHERE code=?',(code,)).fetchone()['name']
                        c.execute('INSERT INTO material_receipt_lines(doc_id,code,name,qty,note) VALUES(?,?,?,?,?)',(cur.lastrowid,code,name,qty,note))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('MATERIAL_RECEIPT',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,'وارد خامات بانتظار مراجعة واعتماد المدير'))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('MATERIAL_RECEIPT',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,'إرسال مستند وارد خامات للمراجعة'))
                return self.send(201,{'ok':True,'doc_id':cur.lastrowid,'line_count':len(clean)})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ مستند وارد الخامات','detail':str(e)})
        if path=='/api/foreman-transfers':
            source=str(data.get('from_foreman','')).strip();target=str(data.get('to_foreman','')).strip();notes=str(data.get('notes','')).strip()
            materials=data.get('materials') or [];serials=data.get('meter_serials') or []
            if not source or not target or source==target:return self.send(400,{'error':'حدد فورمانين مختلفين للتسليم والاستلام'})
            try:
                clean=[];seen=set()
                for x in materials:
                    code=str(x.get('code','')).strip();qty=float(x.get('qty',0))
                    if not code or qty<=0:raise ValueError('كميات التسليم يجب أن تكون موجبة')
                    if code in seen:raise ValueError('الخامة مكررة في طلب التسليم: '+code)
                    seen.add(code);clean.append((code,qty))
                serials=list(dict.fromkeys(str(x).strip() for x in serials if str(x).strip()))
                if not clean and not serials:raise ValueError('طلب التسليم فارغ')
                now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(source,)).fetchone() or not c.execute('SELECT 1 FROM foremen WHERE name=?',(target,)).fetchone():raise ValueError('اسم الفورمان غير موجود')
                    for code,qty in clean:
                        if custody_qty(c,source,code)+1e-8<qty:raise ValueError('الرصيد الحالي غير كافٍ للخامة '+code)
                    for serial in serials:
                        m=c.execute("SELECT status,foreman FROM meters WHERE serial=?",(serial,)).fetchone()
                        if not m or m['status']!='CUSTODY' or m['foreman']!=source:raise ValueError('العداد ليس بعهدة الفورمان المُسلِّم: '+serial)
                    no='TRF-'+now.replace(':','').replace('-','').replace('T','-')+'-'+str(__import__('time').time_ns())[-7:]
                    cur=c.execute('INSERT INTO foreman_transfer_docs(doc_no,from_foreman,to_foreman,created_at,username,notes) VALUES(?,?,?,?,?,?)',(no,source,target,now,user['username'],notes))
                    for code,qty in clean:c.execute('INSERT INTO foreman_transfer_materials(doc_id,code,qty) VALUES(?,?,?)',(cur.lastrowid,code,qty))
                    for serial in serials:c.execute('INSERT INTO foreman_transfer_meters(doc_id,serial) VALUES(?,?)',(cur.lastrowid,serial))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('FOREMAN_TRANSFER',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,'طلب تسليم عهدة من '+source+' إلى '+target))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('FOREMAN_TRANSFER',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,'طلب تسليم عهدة'))
                return self.send(201,{'ok':True,'doc_no':no})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر إنشاء طلب التسليم','detail':str(e)})
        if path=='/api/foreman-stocktakes':
            foreman=str(data.get('foreman','')).strip();notes=str(data.get('notes','')).strip();materials=data.get('materials') or [];meters=data.get('meters') or []
            if not foreman:return self.send(400,{'error':'حدد الفورمان'})
            try:
                now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():raise ValueError('الفورمان غير موجود')
                    clean_m=[];seen=set()
                    for x in materials:
                        code=str(x.get('code','')).strip();actual=float(x.get('actual_qty',-1))
                        if not code or actual<0:raise ValueError('الكمية الفعلية يجب أن تكون غير سالبة')
                        if code in seen:raise ValueError('الخامة مكررة في الجرد')
                        seen.add(code);book=custody_qty(c,foreman,code);clean_m.append((code,book,actual))
                    clean_t=[];seen_s=set()
                    for x in meters:
                        serial=str(x.get('serial','')).strip();found=1 if x.get('found') else 0
                        if not serial or serial in seen_s:raise ValueError('سيريال مكرر أو فارغ في الجرد')
                        seen_s.add(serial);m=c.execute('SELECT status,foreman FROM meters WHERE serial=?',(serial,)).fetchone()
                        if not m or m['foreman']!=foreman or m['status'] not in ('CUSTODY','INSTALLED','REMOVED'):raise ValueError('العداد ليس مرتبطًا بعهدة الفورمان: '+serial)
                        clean_t.append((serial,m['status'],found))
                    if not clean_m and not clean_t:raise ValueError('لا توجد بنود للجرد')
                    no='STK-'+now.replace(':','').replace('-','').replace('T','-')+'-'+str(__import__('time').time_ns())[-7:]
                    cur=c.execute('INSERT INTO foreman_stocktakes(doc_no,foreman,created_at,username,notes) VALUES(?,?,?,?,?)',(no,foreman,now,user['username'],notes))
                    for code,book,actual in clean_m:c.execute('INSERT INTO foreman_stocktake_materials(doc_id,code,book_qty,actual_qty) VALUES(?,?,?,?)',(cur.lastrowid,code,book,actual))
                    for serial,status,found in clean_t:c.execute('INSERT INTO foreman_stocktake_meters(doc_id,serial,book_status,found) VALUES(?,?,?,?)',(cur.lastrowid,serial,status,found))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('FOREMAN_STOCKTAKE',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,'طلب اعتماد جرد عهدة فورمان'))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('FOREMAN_STOCKTAKE',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,'إرسال جرد عهدة '+foreman))
                return self.send(201,{'ok':True,'doc_no':no})
            except (ValueError,TypeError) as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر إنشاء محضر الجرد','detail':str(e)})
        if path=='/api/meter-receipts':
            doc=str(data.get('doc_no','')).strip();typ=str(data.get('meter_type','')).strip();notes=str(data.get('notes','')).strip();origin=str(data.get('origin','')).strip()
            entries=data.get('entries') or [];seen=set();clean=[]
            if not doc or not typ or not isinstance(entries,list) or not entries:return self.send(400,{'error':'رقم المستند ونوع العداد والسيريالات مطلوبة'})
            for x in entries:
                serial=str(x.get('serial','')).strip();code=str(x.get('meter_code','')).strip();condition=str(x.get('condition','سليم')).strip()
                if not serial or not code:return self.send(400,{'error':'كل سيريال يجب أن يكون له كود عداد'})
                if condition not in ('سليم','تالف','مرتجع للمخزن'):return self.send(400,{'error':'حالة العداد غير صحيحة: '+serial})
                if serial in seen:return self.send(400,{'error':'سيريال مكرر داخل المستند: '+serial})
                seen.add(serial);clean.append((serial,code,condition))
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    receipt_cols={r['name'] for r in c.execute('PRAGMA table_info(meter_receipt_docs)').fetchall()}
                    if 'origin' not in receipt_cols:c.execute('ALTER TABLE meter_receipt_docs ADD COLUMN origin TEXT NOT NULL DEFAULT \'\'')
                    line_cols={r['name'] for r in c.execute('PRAGMA table_info(meter_receipt_lines)').fetchall()}
                    if 'condition' not in line_cols:c.execute("ALTER TABLE meter_receipt_lines ADD COLUMN condition TEXT NOT NULL DEFAULT 'سليم'")
                    if c.execute('SELECT 1 FROM meter_receipt_docs WHERE doc_no=?',(doc,)).fetchone():raise ValueError('رقم مستند الوارد مستخدم بالفعل')
                    if not c.execute('SELECT 1 FROM meter_types WHERE name=? AND active=1',(typ,)).fetchone():raise ValueError('نوع العداد غير نشط أو غير مسجل')
                    for serial,_,_ in clean:
                        if c.execute('SELECT 1 FROM meters WHERE serial=?',(serial,)).fetchone():raise ValueError('السيريال مسجل مسبقًا: '+serial)
                    now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    cur=c.execute('INSERT INTO meter_receipt_docs(doc_no,meter_type,created_at,username,notes,origin) VALUES(?,?,?,?,?,?)',(doc,typ,now,user['username'],notes,origin))
                    for serial,code,condition in clean:c.execute('INSERT INTO meter_receipt_lines(doc_id,serial,meter_code,condition) VALUES(?,?,?,?)',(cur.lastrowid,serial,code,condition))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at) VALUES('RECEIPT',?,'PENDING',?,?)",(cur.lastrowid,user['username'],now))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at) VALUES('RECEIPT',?,'SUBMITTED',?,?)",(cur.lastrowid,user['username'],now))
                return self.send(201,{'ok':True,'doc_id':cur.lastrowid,'count':len(clean)})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ مستند الوارد','detail':str(e)})
        if path=='/api/meter-issues':
            foreman=str(data.get('foreman','')).strip();notes=str(data.get('notes','')).strip();serials=data.get('serials') or []
            serials=[str(x).strip() for x in serials if str(x).strip()]
            if not foreman or not serials:return self.send(400,{'error':'اختر الفورمان وأدخل السيريالات'})
            if len(serials)!=len(set(serials)):return self.send(400,{'error':'قائمة الصرف تحتوي سيريال مكرر'})
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():raise ValueError('الفورمان غير مسجل')
                    for serial in serials:
                        m=c.execute('SELECT status FROM meters WHERE serial=?',(serial,)).fetchone()
                        if not m or m['status']!='STOCK':raise ValueError('السيريال غير متاح بالمخزن: '+serial)
                        if c.execute("SELECT 1 FROM meter_issue_lines l JOIN document_approvals a ON a.doc_kind='ISSUE' AND a.doc_id=l.doc_id WHERE l.serial=? AND a.status='PENDING'",(serial,)).fetchone():raise ValueError('السيريال موجود بطلب صرف قيد المراجعة: '+serial)
                    now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    no='AUTO-ISS-'+now.replace(':','').replace('-','').replace('T','-')+'-'+str(__import__('time').time_ns())[-8:]
                    cur=c.execute('INSERT INTO meter_issue_docs(doc_no,foreman,created_at,username,notes) VALUES(?,?,?,?,?)',(no,foreman,now,user['username'],notes))
                    for serial in serials:c.execute('INSERT INTO meter_issue_lines(doc_id,serial) VALUES(?,?)',(cur.lastrowid,serial))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at) VALUES('ISSUE',?,'PENDING',?,?)",(cur.lastrowid,user['username'],now))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at) VALUES('ISSUE',?,'SUBMITTED',?,?)",(cur.lastrowid,user['username'],now))
                return self.send(201,{'ok':True,'count':len(serials),'foreman':foreman})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ طلب الصرف','detail':str(e)})
        if path=='/api/meter-installs':
            doc=str(data.get('doc_no','')).strip();foreman=str(data.get('foreman','')).strip();notes=str(data.get('notes','')).strip()
            entries=data.get('entries') or []
            if not entries and data.get('serial'):
                entries=[{'serial':data.get('serial'),'crn':data.get('crn','')}]
            if not doc or not foreman or not isinstance(entries,list) or not entries:return self.send(400,{'error':'رقم المستند والفورمان وبنود التركيب مطلوبة'})
            clean=[];seen_s=set();seen_c=set()
            for x in entries:
                serial=str(x.get('serial','')).strip();crn=str(x.get('crn','')).strip()
                if not serial or not crn:return self.send(400,{'error':'كل صف يحتاج سيريال وC.R.N'})
                if serial in seen_s or crn in seen_c:return self.send(400,{'error':'يوجد سيريال أو C.R.N مكرر داخل المستند'})
                seen_s.add(serial);seen_c.add(crn);clean.append((serial,crn))
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if c.execute('SELECT 1 FROM meter_install_docs WHERE doc_no=?',(doc,)).fetchone():raise ValueError('رقم المستند مستخدم بالفعل')
                    for serial,crn in clean:
                        if c.execute('SELECT 1 FROM meters WHERE crn=?',(crn,)).fetchone():raise ValueError('C.R.N مسجل بالفعل: '+crn)
                        m=c.execute('SELECT status,foreman FROM meters WHERE serial=?',(serial,)).fetchone()
                        if not m or m['status']!='CUSTODY' or m['foreman']!=foreman:raise ValueError('العداد ليس في عهدة الفورمان المختار: '+serial)
                    now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    cur=c.execute('INSERT INTO meter_install_docs(doc_no,foreman,crn,created_at,username,notes) VALUES(?,?,?,?,?,?)',(doc,foreman,clean[0][1],now,user['username'],notes))
                    c.execute("PRAGMA table_info(meter_install_lines)")
                    cols={r['name'] for r in c.execute('PRAGMA table_info(meter_install_lines)').fetchall()}
                    if 'crn' not in cols:c.execute('ALTER TABLE meter_install_lines ADD COLUMN crn TEXT')
                    for serial,crn in clean:c.execute('INSERT INTO meter_install_lines(doc_id,serial,crn) VALUES(?,?,?)',(cur.lastrowid,serial,crn))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('INSTALL',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,'تركيب بانتظار المراجعة'))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('INSTALL',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,'إرسال مستند تركيب متعدد العدادات'))
                return self.send(201,{'ok':True,'doc_id':cur.lastrowid,'count':len(clean)})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ مستند التركيب','detail':str(e)})
        if path=='/api/meter-replacements':
            old=str(data.get('old_serial','')).strip();new=str(data.get('new_serial','')).strip();foreman=str(data.get('foreman','')).strip();crn=str(data.get('crn','')).strip();reason=str(data.get('reason','')).strip();condition=str(data.get('condition','')).strip()
            if not all((old,new,foreman,crn,reason,condition)) or old==new:return self.send(400,{'error':'أكمل بيانات التغيير بسيريالين مختلفين'})
            if condition not in ('تالف','صالح للفحص'):return self.send(400,{'error':'حالة العداد المفكوك غير صحيحة'})
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    o=c.execute('SELECT status,crn FROM meters WHERE serial=?',(old,)).fetchone();n=c.execute('SELECT status,foreman FROM meters WHERE serial=?',(new,)).fetchone()
                    if not o or o['status']!='INSTALLED':raise ValueError('العداد القديم يجب أن يكون مركبًا')
                    if not o['crn'] or o['crn'].strip()!=crn:raise ValueError('C.R.N لا يطابق المسجل على العداد القديم')
                    if not n or n['status']!='CUSTODY' or n['foreman']!=foreman:raise ValueError('العداد البديل يجب أن يكون بعهدة الفورمان المختار')
                    if c.execute('SELECT 1 FROM meters WHERE crn=? AND status="INSTALLED" AND serial<>?',(crn,old)).fetchone():raise ValueError('يوجد عداد آخر مركب على نفس C.R.N')
                    now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                    c.execute("UPDATE meters SET status='REMOVED',crn=? WHERE serial=?",(crn,old));c.execute("UPDATE meters SET status='INSTALLED',crn=? WHERE serial=?",(crn,new))
                    c.execute('INSERT INTO removed_meter_details(serial,condition,reason,removed_at,username) VALUES(?,?,?,?,?)',(old,condition,reason,now,user['username']))
                    c.execute('INSERT INTO meter_replacements(old_serial,new_serial,foreman,crn,reason,created_at,username) VALUES(?,?,?,?,?,?,?)',(old,new,foreman,crn,reason,now,user['username']))
                    for sn,action in ((old,'REPLACED_OUT'),(new,'REPLACED_IN')):c.execute('INSERT INTO meter_events(serial,action,foreman,crn,created_at,username,notes) VALUES(?,?,?,?,?,?,?)',(sn,action,foreman,crn,now,user['username'],'تغيير '+old+' ← '+new+' | '+reason))
                return self.send(201,{'ok':True})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تغيير العداد','detail':str(e)})
        if path=='/api/removed-meter-state':
            serial=str(data.get('serial','')).strip();state=str(data.get('state','')).strip();notes=str(data.get('notes','')).strip();condition=str(data.get('condition','')).strip();now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            allowed=('بانتظار الفحص','تحت الفحص','تالف نهائيًا','قيد الصيانة','تم الإصلاح - بانتظار اعتماد الإرجاع')
            if not serial or state not in allowed:return self.send(400,{'error':'بيانات حالة العداد غير صحيحة'})
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if not c.execute("SELECT 1 FROM meters WHERE serial=? AND status='REMOVED'",(serial,)).fetchone():raise ValueError('العداد ليس ضمن العدادات المفكوكة')
                    if condition and condition not in ('تالف','صالح للفحص'):raise ValueError('التصنيف غير صحيح')
                    if condition:c.execute("INSERT INTO removed_meter_details(serial,condition,reason,removed_at,username) VALUES(?,?,?,?,?) ON CONFLICT(serial) DO UPDATE SET condition=excluded.condition,reason=CASE WHEN excluded.reason<>'' THEN excluded.reason ELSE removed_meter_details.reason END,username=excluded.username",(serial,condition,notes,now,user['username']))
                    c.execute("INSERT INTO damaged_meter_workflow(serial,state,updated_at,updated_by,notes) VALUES(?,?,?,?,?) ON CONFLICT(serial) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,updated_by=excluded.updated_by,notes=excluded.notes",(serial,state,now,user['username'],notes))
                    c.execute('INSERT INTO meter_events(serial,action,created_at,username,notes) VALUES(?,?,?,?,?)',(serial,'DAMAGED_WORKFLOW',now,user['username'],state+' | '+notes))
                return self.send(200,{'ok':True})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تحديث حالة العداد','detail':str(e)})
        if path=='/api/meter-return-request':
            serial=str(data.get('serial','')).strip();notes=str(data.get('notes','')).strip();now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    m=c.execute("SELECT status,COALESCE(crn,'') crn FROM meters WHERE serial=?",(serial,)).fetchone()
                    w=c.execute('SELECT state FROM damaged_meter_workflow WHERE serial=?',(serial,)).fetchone()
                    if not m or m['status']!='REMOVED':raise ValueError('العداد ليس ضمن المفكوكة')
                    if not w or w['state'] not in ('تم الإصلاح - بانتظار اعتماد الإرجاع','تم الإصلاح وجاهز للعودة للمخزن'):raise ValueError('سجل أولًا أن العداد تم إصلاحه وجاهز للعودة')
                    if c.execute("SELECT 1 FROM meter_return_docs d JOIN document_approvals a ON a.doc_kind='METER_RETURN' AND a.doc_id=d.id WHERE d.serial=? AND a.status='PENDING'",(serial,)).fetchone():raise ValueError('يوجد طلب إرجاع معلق بالفعل')
                    no='M-RET-'+now.replace(':','').replace('-','').replace('T','-')+'-'+str(__import__('time').time_ns())[-7:]
                    cur=c.execute('INSERT INTO meter_return_docs(doc_no,serial,crn,notes,created_at,username) VALUES(?,?,?,?,?,?)',(no,serial,m['crn'],notes,now,user['username']))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('METER_RETURN',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,'طلب إرجاع عداد للمخزن بعد الإصلاح'))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('METER_RETURN',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,'إرسال طلب إرجاع بعد الإصلاح'))
                return self.send(201,{'ok':True,'doc_no':no})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر إرسال طلب الإرجاع','detail':str(e)})
        if path=='/api/approval-review':
            if user['role'] not in ('Super Admin','Manager') and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'اعتماد المستندات متاح للمدير أو مدير النظام'})
            kind=str(data.get('doc_kind','')).strip();doc_id=int(data.get('doc_id',0) or 0);approve=bool(data.get('approve'));reason=str(data.get('reason','')).strip()
            if kind not in ('MOVEMENT_REQUEST','RECEIPT','ISSUE','INSTALL','METER_RETURN','MATERIAL_RECEIPT','FOREMAN_TRANSFER','FOREMAN_STOCKTAKE','MATERIAL_EDIT','FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE'):return self.send(400,{'error':'نوع المستند غير مدعوم'})
            if kind in ('MATERIAL_EDIT','FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE') and user['role'] not in ('Super Admin','Manager'):return self.send(403,{'error':'اعتماد تعديل أو حذف المخزن والعهدة متاح للمدير أو مدير النظام الأعلى فقط'})
            if user['role']!='Super Admin' and not (user['role']=='Manager' and kind in ('MOVEMENT_REQUEST','MATERIAL_EDIT','FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE')) and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'اعتماد هذا المستند غير متاح لهذه الصلاحية'})
            if kind=='MOVEMENT_REQUEST' and user['role'] not in ('Manager','Super Admin'):return self.send(403,{'error':'الاعتماد للمدير فقط'})
            if not approve and not reason:return self.send(400,{'error':'اكتب سبب الرفض'})
            now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
            try:
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    state=c.execute('SELECT status,requested_by FROM document_approvals WHERE doc_kind=? AND doc_id=?',(kind,doc_id)).fetchone()
                    if not state or state['status']!='PENDING':raise ValueError('المستند ليس قيد المراجعة')
                    if approve and kind in ('MATERIAL_EDIT','FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE') and state['requested_by']==user['username']:raise ValueError('لا يجوز اعتماد طلب قدمته بنفسك؛ اطلب من مدير آخر أو مدير النظام الأعلى مراجعته')
                    if approve:
                        if kind=='MOVEMENT_REQUEST':
                            req=c.execute('SELECT * FROM movement_requests WHERE id=?',(doc_id,)).fetchone()
                            if not req:raise ValueError('المستند غير موجود')
                            if c.execute('SELECT 1 FROM movements WHERE TRIM(doc)=?',(req['doc_no'],)).fetchone():raise ValueError('رقم المستند مستخدم')
                            validate_movement_lines(c,req['kind'],req['foreman'],json.loads(req['lines']))
                            for line in json.loads(req['lines']):
                                code,qty=line['code'],line['qty']; k=req['kind']
                                c.execute('INSERT INTO movements(created_at,doc,foreman,week,code,type,qty,notes,username) VALUES(?,?,?,?,?,?,?,?,?)',(now,req['doc_no'],req['foreman'],req['week'],code,k,qty,req['notes'],req['username']))
                                if k in ('وارد','صرف','مرتجع'):
                                    c.execute('UPDATE items SET legacy_balance=legacy_balance+?,received=received+? WHERE code=?',(-qty if k=='صرف' else qty,qty if k=='وارد' else 0,code))
                        elif kind=='RECEIPT':
                            doc=c.execute('SELECT doc_no,meter_type,COALESCE(origin,\'\') origin FROM meter_receipt_docs WHERE id=?',(doc_id,)).fetchone()
                            if not doc:raise ValueError('مستند الوارد غير موجود')
                            line_cols={r['name'] for r in c.execute('PRAGMA table_info(meter_receipt_lines)').fetchall()}
                            if 'condition' not in line_cols:c.execute("ALTER TABLE meter_receipt_lines ADD COLUMN condition TEXT NOT NULL DEFAULT 'سليم'")
                            typ=c.execute('SELECT capacity FROM meter_types WHERE name=?',(doc['meter_type'],)).fetchone()
                            lines=c.execute('SELECT serial,meter_code,condition FROM meter_receipt_lines WHERE doc_id=?',(doc_id,)).fetchall()
                            if not typ or not lines:raise ValueError('نوع العداد أو بنود المستند غير متاحة')
                            for line in lines:
                                if c.execute('SELECT 1 FROM meters WHERE serial=?',(line['serial'],)).fetchone():raise ValueError('السيريال مسجل بالفعل: '+line['serial'])
                            for line in lines:
                                condition=line['condition'] if line['condition'] in ('سليم','تالف','مرتجع للمخزن') else 'سليم'
                                meter_status='DAMAGED' if condition=='تالف' else 'STOCK'
                                origin_note=(' من '+doc['origin']) if doc['origin'] else ''
                                status_note=('عداد تالف – معزول عن الصرف' if condition=='تالف' else ('عداد مرتجع للمخزن' if condition=='مرتجع للمخزن' else 'عداد وارد سليم'))
                                c.execute('INSERT INTO meters(serial,meter_type,capacity,status,received_at,notes,meter_code) VALUES(?,?,?,?,?,?,?)',(line['serial'],doc['meter_type'],typ['capacity'],meter_status,now,status_note+' – مستند '+doc['doc_no']+origin_note,line['meter_code']))
                                event_action='RECEIPT_DAMAGED' if condition=='تالف' else ('RECEIPT_RETURNED' if condition=='مرتجع للمخزن' else 'RECEIPT_DOC')
                                c.execute('INSERT INTO meter_events(serial,action,created_at,username,notes) VALUES(?,?,?,?,?)',(line['serial'],event_action,now,user['username'],status_note+' – اعتماد '+doc['doc_no']+origin_note))
                        elif kind=='ISSUE':
                            doc=c.execute('SELECT doc_no,foreman FROM meter_issue_docs WHERE id=?',(doc_id,)).fetchone();lines=c.execute('SELECT serial FROM meter_issue_lines WHERE doc_id=?',(doc_id,)).fetchall()
                            if not doc or not lines:raise ValueError('مستند الصرف فارغ أو غير موجود')
                            for line in lines:
                                m=c.execute('SELECT status FROM meters WHERE serial=?',(line['serial'],)).fetchone()
                                if not m or m['status']!='STOCK':raise ValueError('العداد لم يعد متاحًا بالمخزن: '+line['serial'])
                            for line in lines:
                                c.execute('UPDATE meters SET status="CUSTODY",foreman=? WHERE serial=?',(doc['foreman'],line['serial']))
                                c.execute('INSERT INTO meter_events(serial,action,foreman,created_at,username,notes) VALUES(?,?,?,?,?,?)',(line['serial'],'ISSUE_DOC',doc['foreman'],now,user['username'],'اعتماد صرف '+doc['doc_no']))
                        elif kind=='INSTALL':
                            doc=c.execute('SELECT doc_no,foreman,crn FROM meter_install_docs WHERE id=?',(doc_id,)).fetchone()
                            cols={r['name'] for r in c.execute('PRAGMA table_info(meter_install_lines)').fetchall()}
                            lines=c.execute('SELECT serial'+(',crn' if 'crn' in cols else '')+' FROM meter_install_lines WHERE doc_id=?',(doc_id,)).fetchall()
                            if not doc or not lines:raise ValueError('مستند التركيب لا يحتوي عدادات')
                            for line in lines:
                                serial=line['serial'];crn=(line['crn'] if 'crn' in cols else None) or doc['crn']
                                m=c.execute('SELECT status,foreman FROM meters WHERE serial=?',(serial,)).fetchone()
                                if not m or m['status']!='CUSTODY' or m['foreman']!=doc['foreman']:raise ValueError('العداد لم يعد بعهدة الفورمان المسجل: '+serial)
                                if c.execute('SELECT 1 FROM meters WHERE crn=? AND serial<>?',(crn,serial)).fetchone():raise ValueError('C.R.N مستخدم لعداد آخر: '+crn)
                                c.execute('UPDATE meters SET status="INSTALLED",crn=? WHERE serial=?',(crn,serial))
                                c.execute('INSERT INTO meter_events(serial,action,foreman,crn,created_at,username,notes) VALUES(?,?,?,?,?,?,?)',(serial,'INSTALL_DOC',doc['foreman'],crn,now,user['username'],'اعتماد مستند تركيب '+doc['doc_no']))
                        elif kind=='METER_RETURN':
                            doc=c.execute('SELECT doc_no,serial,crn,notes FROM meter_return_docs WHERE id=?',(doc_id,)).fetchone()
                            m=c.execute("SELECT status FROM meters WHERE serial=?",(doc['serial'],)).fetchone() if doc else None
                            w=c.execute('SELECT state FROM damaged_meter_workflow WHERE serial=?',(doc['serial'],)).fetchone() if doc else None
                            if not doc or not m or m['status']!='REMOVED' or not w or w['state'] not in ('تم الإصلاح - بانتظار اعتماد الإرجاع','تم الإصلاح وجاهز للعودة للمخزن'):raise ValueError('العداد ليس جاهزًا للإرجاع')
                            c.execute("UPDATE meters SET status='STOCK',foreman=NULL,crn=NULL WHERE serial=?",(doc['serial'],))
                            c.execute("UPDATE damaged_meter_workflow SET state='عاد للمخزن بعد اعتماد المدير',updated_at=?,updated_by=?,notes=? WHERE serial=?",(now,user['username'],doc['notes'],doc['serial']))
                            c.execute('INSERT INTO meter_events(serial,action,created_at,username,notes) VALUES(?,?,?,?,?)',(doc['serial'],'REPAIRED_RETURN_APPROVED',now,user['username'],'اعتماد إرجاع للمخزن '+doc['doc_no']+' | C.R.N السابق: '+doc['crn']))
                        elif kind=='FOREMAN_TRANSFER':
                            doc=c.execute('SELECT doc_no,from_foreman,to_foreman,notes FROM foreman_transfer_docs WHERE id=?',(doc_id,)).fetchone()
                            if not doc or doc['from_foreman']==doc['to_foreman']:raise ValueError('طلب التسليم غير صحيح')
                            for line in c.execute('SELECT code,qty FROM foreman_transfer_materials WHERE doc_id=?',(doc_id,)).fetchall():
                                source_qty=custody_qty(c,doc['from_foreman'],line['code']);target_qty=custody_qty(c,doc['to_foreman'],line['code'])
                                if source_qty+1e-8<line['qty']:raise ValueError('الرصيد الحالي غير كافٍ للخامة '+line['code'])
                                c.execute('INSERT INTO custody_adjustments(created_at,foreman,code,old_qty,new_qty,reason,username) VALUES(?,?,?,?,?,?,?)',(now,doc['from_foreman'],line['code'],source_qty,round(source_qty-line['qty'],4),'تسليم عهدة '+doc['doc_no']+' إلى '+doc['to_foreman'],user['username']))
                                c.execute('INSERT INTO custody_adjustments(created_at,foreman,code,old_qty,new_qty,reason,username) VALUES(?,?,?,?,?,?,?)',(now,doc['to_foreman'],line['code'],target_qty,round(target_qty+line['qty'],4),'استلام عهدة '+doc['doc_no']+' من '+doc['from_foreman'],user['username']))
                            for line in c.execute('SELECT serial FROM foreman_transfer_meters WHERE doc_id=?',(doc_id,)).fetchall():
                                m=c.execute("SELECT status,foreman FROM meters WHERE serial=?",(line['serial'],)).fetchone()
                                if not m or m['status']!='CUSTODY' or m['foreman']!=doc['from_foreman']:raise ValueError('العداد لم يعد بعهدة الفورمان المُسلِّم: '+line['serial'])
                                c.execute('UPDATE meters SET foreman=? WHERE serial=?',(doc['to_foreman'],line['serial']))
                                c.execute('INSERT INTO meter_events(serial,action,foreman,created_at,username,notes) VALUES(?,?,?,?,?,?)',(line['serial'],'FOREMAN_CUSTODY_TRANSFER',doc['to_foreman'],now,user['username'],'من '+doc['from_foreman']+' إلى '+doc['to_foreman']+' | '+doc['doc_no']))
                        elif kind=='FOREMAN_STOCKTAKE':
                            doc=c.execute('SELECT doc_no,foreman,notes FROM foreman_stocktakes WHERE id=?',(doc_id,)).fetchone()
                            if not doc:raise ValueError('محضر الجرد غير موجود')
                            for line in c.execute('SELECT code,book_qty,actual_qty FROM foreman_stocktake_materials WHERE doc_id=?',(doc_id,)).fetchall():
                                current=custody_qty(c,doc['foreman'],line['code'])
                                if abs(current-line['book_qty'])>1e-6:raise ValueError('تغير رصيد الخامة '+line['code']+' بعد الجرد؛ أعد الجرد')
                                if abs(line['actual_qty']-line['book_qty'])>1e-8:
                                    c.execute('INSERT INTO custody_adjustments(created_at,foreman,code,old_qty,new_qty,reason,username) VALUES(?,?,?,?,?,?,?)',(now,doc['foreman'],line['code'],line['book_qty'],line['actual_qty'],'تسوية جرد معتمد '+doc['doc_no']+' | '+doc['notes'],user['username']))
                            for line in c.execute('SELECT serial,book_status,found FROM foreman_stocktake_meters WHERE doc_id=?',(doc_id,)).fetchall():
                                if line['found']:
                                    m=c.execute('SELECT status,foreman FROM meters WHERE serial=?',(line['serial'],)).fetchone()
                                    if not m or m['foreman']!=doc['foreman'] or m['status']!=line['book_status']:raise ValueError('تغيرت حالة/عهدة العداد '+line['serial']+' بعد الجرد')
                                c.execute('INSERT INTO meter_events(serial,action,foreman,created_at,username,notes) VALUES(?,?,?,?,?,?)',(line['serial'],'FOREMAN_STOCKTAKE_APPROVED',doc['foreman'],now,user['username'],('تم العثور عليه' if line['found'] else 'لم يتم العثور عليه')+' | '+doc['doc_no']))
                        elif kind=='MATERIAL_EDIT':
                            req=c.execute('SELECT old_code,new_code,old_name,new_name,old_opening,new_opening,reason FROM material_edit_requests WHERE id=?',(doc_id,)).fetchone()
                            if not req:raise ValueError('طلب تعديل الخامة غير موجود')
                            old,new,old_name,new_name,old_open,new_open,why=req
                            item=c.execute('SELECT name,opening,legacy_balance FROM items WHERE code=?',(old,)).fetchone()
                            if not item or item['name']!=old_name or abs(float(item['opening'])-float(old_open))>1e-8:raise ValueError('تغيرت بيانات الخامة منذ تقديم الطلب')
                            if float(new_open)<0 or float(item['legacy_balance'])+float(new_open)-float(old_open)<-1e-8:raise ValueError('التعديل يؤدي إلى رصيد غير صالح')
                            if old!=new:
                                if c.execute('SELECT 1 FROM items WHERE code=?',(new,)).fetchone():raise ValueError('الكود الجديد مستخدم')
                                linked=('movements','archive_nov','foreman_opening','custody_adjustments','damaged_materials','foreman_weekly','material_receipt_lines','foreman_transfer_materials','foreman_stocktake_materials')
                                for table in linked:
                                    if c.execute('SELECT 1 FROM '+table+' WHERE code=? LIMIT 1',(new,)).fetchone():raise ValueError('الكود الجديد مرتبط بتاريخ سابق: '+table)
                                    c.execute('UPDATE '+table+' SET code=? WHERE code=?',(new,old))
                            c.execute('UPDATE items SET code=?,name=?,opening=?,legacy_balance=legacy_balance+? WHERE code=?',(new,new_name,new_open,float(new_open)-float(old_open),old))
                        elif kind in ('FOREMAN_CUSTODY_CHANGE','STOCK_ITEM_DELETE','STOCK_ITEM_TOGGLE'):
                            req=c.execute('SELECT target_type,action,target_key,foreman,old_data,new_data,reason,requested_by FROM material_change_requests WHERE id=?',(doc_id,)).fetchone()
                            if not req:raise ValueError('طلب التعديل أو الحذف غير موجود')
                            old=json.loads(req['old_data']);new=json.loads(req['new_data'])
                            if kind=='FOREMAN_CUSTODY_CHANGE':
                                current=custody_qty(c,req['foreman'],req['target_key'])
                                if abs(current-float(old.get('balance',0)))>1e-6:raise ValueError('تغير رصيد العهدة بعد تقديم الطلب؛ ألغِ الطلب وأعد تقديمه بالرصيد الحالي')
                                c.execute('INSERT INTO custody_adjustments(created_at,foreman,code,old_qty,new_qty,reason,username) VALUES(?,?,?,?,?,?,?)',(now,req['foreman'],req['target_key'],current,float(new.get('balance',0)),req['reason']+' | اعتماد طلب #'+str(doc_id),user['username']))
                            elif kind=='STOCK_ITEM_TOGGLE':
                                code=req['target_key'];item=c.execute('SELECT active,legacy_balance FROM items WHERE code=?',(code,)).fetchone()
                                if not item:raise ValueError('الخامة غير موجودة بالفعل')
                                if int(item['active'])!=int(old.get('active',item['active'])):raise ValueError('تغيرت حالة الخامة بعد تقديم الطلب')
                                if int(item['active'])==1 and abs(float(item['legacy_balance'] or 0))>1e-6:raise ValueError('لا يمكن إيقاف خامة لها رصيد؛ صفّر الرصيد بحركات موثقة أولًا')
                                c.execute('UPDATE items SET active=? WHERE code=?',(int(new.get('active',0)),code))
                            else:
                                code=req['target_key'];item=c.execute('SELECT opening,received,legacy_balance FROM items WHERE code=?',(code,)).fetchone()
                                if not item:raise ValueError('الخامة غير موجودة بالفعل')
                                checks=[('movements','code'),('archive_nov','code'),('foreman_opening','code'),('custody_adjustments','code'),('foreman_weekly','code'),('foreman_transfer_materials','code'),('foreman_stocktake_materials','code'),('material_receipt_lines','code'),('damaged_materials','code')]
                                if any(c.execute('SELECT 1 FROM '+t+' WHERE '+col+'=? LIMIT 1',(code,)).fetchone() for t,col in checks) or any(abs(float(v or 0))>1e-6 for v in item):raise ValueError('لا يمكن حذف الخامة لوجود رصيد أو حركات مرتبطة؛ استخدم إيقاف الخامة بدل الحذف')
                                c.execute('DELETE FROM items WHERE code=?',(code,))
                            try:c.execute('INSERT INTO audit_log(created_at,actor,action,table_name,record_key,old_data,new_data) VALUES(?,?,?,?,?,?,?)',(now,user['username'],('APPROVED_'+req['action']),req['target_type'],req['target_key'],req['old_data'],req['new_data']))
                            except sqlite3.Error:pass
                        elif kind=='MATERIAL_RECEIPT':
                            doc=c.execute('SELECT doc_no,doc_date,supplier FROM material_receipt_docs WHERE id=?',(doc_id,)).fetchone();lines=c.execute('SELECT code,name,qty,note FROM material_receipt_lines WHERE doc_id=?',(doc_id,)).fetchall()
                            if not doc or not lines:raise ValueError('مستند وارد الخامات فارغ')
                            for line in lines:
                                if not c.execute('SELECT 1 FROM items WHERE code=? AND active=1',(line['code'],)).fetchone():raise ValueError('الصنف غير نشط: '+line['code'])
                            for line in lines:
                                note=('المورد/الجهة: '+doc['supplier']+' | ' if doc['supplier'] else '')+line['note']
                                c.execute("INSERT INTO movements(created_at,doc,foreman,week,code,type,qty,notes,username) VALUES(?,?, '',?,?, 'وارد',?,?,?)",(now,doc['doc_no'],doc['doc_date'],line['code'],line['qty'],note,user['username']))
                                c.execute('UPDATE items SET legacy_balance=legacy_balance+?,received=received+? WHERE code=?',(line['qty'],line['qty'],line['code']))
                        else:
                            raise ValueError('مسار اعتماد هذا النوع سيتم استكماله في دفعة العمليات التالية')
                    c.execute('UPDATE document_approvals SET status=?,reviewed_by=?,reviewed_at=?,reason=? WHERE doc_kind=? AND doc_id=? AND status="PENDING"',('APPROVED' if approve else 'REJECTED',user['username'],now,reason,kind,doc_id))
                    c.execute('INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES(?,?,?,?,?,?)',(kind,doc_id,'APPROVED' if approve else 'REJECTED',user['username'],now,reason))
                return self.send(200,{'ok':True,'status':'APPROVED' if approve else 'REJECTED'})
            except ValueError as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر تنفيذ الاعتماد','detail':str(e)})
        if path=='/api/items':
            if user['role']=='Viewer' and not has_custom_user_permissions(user['username']):return self.send(403,{'error':'حساب العرض لا يملك صلاحية الإضافة'})
            code=str(data.get('code','')).strip();name=str(data.get('name','')).strip()
            if not code or not name:return self.send(400,{'error':'كود الصنف واسم الخامة مطلوبان'})
            try:
                with db() as c:
                    c.execute("INSERT INTO items(code,name,opening,received,legacy_balance,active) VALUES(?,?,0,0,0,1)",(code,name))
                return self.send(201,{'ok':True})
            except sqlite3.IntegrityError:return self.send(409,{'error':'كود الصنف موجود بالفعل'})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر إضافة الخامة','detail':str(e)})
        if path=='/api/movements-drafts':
            if role not in ('Super Admin','Manager','Storekeeper'):return self.send(403,{'error':'لا تملك صلاحية التسجيل'})
            try:
                with db() as c:
                    c.execute('CREATE TABLE IF NOT EXISTS movement_drafts(id INTEGER PRIMARY KEY, username TEXT NOT NULL, payload TEXT NOT NULL)')
                    action=data.get('action'); did=int(data.get('id') or 0)
                    if did and not c.execute('SELECT 1 FROM movement_drafts WHERE id=? AND username=?',(did,user['username'])).fetchone():raise ValueError('المسودة غير موجودة')
                    if action=='delete' and did:c.execute('DELETE FROM movement_drafts WHERE id=? AND username=?',(did,user['username']))
                    elif action=='save':
                        payload=json.dumps(data['data'],ensure_ascii=False)
                        if len(payload)>100000:raise ValueError('المسودة كبيرة جداً')
                        if did:c.execute('UPDATE movement_drafts SET payload=? WHERE id=? AND username=?',(payload,did,user['username']))
                        else:did=c.execute('INSERT INTO movement_drafts(username,payload) VALUES(?,?)',(user['username'],payload)).lastrowid
                    else:raise ValueError('إجراء غير صحيح')
                return self.send(200,{'id':did})
            except (ValueError,TypeError,KeyError,sqlite3.Error) as e:return self.send(400,{'error':str(e)})
        if path=='/api/movements':
            if user['role'] not in ('Super Admin','Manager','Storekeeper'):return self.send(403,{'error':'لا تملك صلاحية التسجيل'})
            doc=str(data.get('doc','')).strip(); kind=str(data.get('type','')).strip(); foreman=str(data.get('foreman','')).strip(); week=str(data.get('week','')).strip(); notes=str(data.get('notes','')).strip()
            if kind=='وارد':foreman=''
            try:
                raw=data.get('lines') or [data]
                if not doc or not isinstance(raw,list) or not 1<=len(raw)<=120:raise ValueError('رقم المستند مطلوب وعدد البنود من 1 إلى 120')
                lines=[{'code':str(x.get('code','')).strip(),'qty':float(x.get('qty',0))} for x in raw]
                now=__import__('datetime').datetime.now().isoformat(timespec='seconds')
                with db() as c:
                    c.execute('BEGIN IMMEDIATE')
                    if c.execute('SELECT 1 FROM movements WHERE TRIM(doc)=?',(doc,)).fetchone() or c.execute('SELECT 1 FROM movement_requests WHERE doc_no=?',(doc,)).fetchone() or c.execute('SELECT 1 FROM material_receipt_docs WHERE TRIM(doc_no)=?',(doc,)).fetchone():raise ValueError('رقم المستند مستخدم بالفعل')
                    if data.get('draft_id'):
                        if not c.execute('DELETE FROM movement_drafts WHERE id=? AND username=?',(int(data['draft_id']),user['username'])).rowcount:raise ValueError('المسودة غير موجودة')
                    validate_movement_lines(c,kind,foreman,lines)
                    cur=c.execute('INSERT INTO movement_requests(doc_no,kind,foreman,week,notes,username,created_at,lines) VALUES(?,?,?,?,?,?,?,?)',(doc,kind,foreman,week,notes,user['username'],now,json.dumps(lines,ensure_ascii=False)))
                    c.execute("INSERT INTO document_approvals(doc_kind,doc_id,status,requested_by,requested_at,reason) VALUES('MOVEMENT_REQUEST',?,'PENDING',?,?,?)",(cur.lastrowid,user['username'],now,'مستند حركة خامات'))
                    c.execute("INSERT INTO document_approval_history(doc_kind,doc_id,action,actor,created_at,reason) VALUES('MOVEMENT_REQUEST',?,'SUBMITTED',?,?,?)",(cur.lastrowid,user['username'],now,'إرسال للمراجعة'))
                return self.send(201,{'ok':True,'pending_approval':True})
            except (ValueError,TypeError,AttributeError) as e:return self.send(400,{'error':str(e)})
            except sqlite3.Error as e:return self.send(500,{'error':'تعذر حفظ المستند','detail':str(e)})
        return self.send(404,{'error':'المسار غير موجود'})
def validate_movement_lines(c,kind,foreman,lines):
    import math
    if kind not in ('وارد','صرف','مرتجع','مركب','سلف'):raise ValueError('نوع الحركة غير صحيح')
    if kind!='وارد' and not c.execute('SELECT 1 FROM foremen WHERE name=?',(foreman,)).fetchone():raise ValueError('اختر فورمان صحيح')
    seen=set()
    for line in lines:
        code,qty=line['code'],line['qty']
        if not math.isfinite(qty) or qty<=0 or code in seen:raise ValueError('كمية غير صحيحة أو خامة مكررة: '+code)
        seen.add(code)
        item=c.execute('SELECT legacy_balance FROM items WHERE code=? AND active=1',(code,)).fetchone()
        if not item:raise ValueError('خامة غير نشطة: '+code)
        if kind=='صرف' and qty>float(item['legacy_balance'] or 0):raise ValueError('رصيد المخزن لا يكفي: '+code)
        if kind in ('مرتجع','مركب'):
            opening=c.execute('SELECT COALESCE(SUM(qty),0) FROM foreman_opening WHERE foreman=? AND code=?',(foreman,code)).fetchone()[0]
            delta=c.execute('SELECT COALESCE(SUM(new_qty-old_qty),0) FROM custody_adjustments WHERE foreman=? AND code=?',(foreman,code)).fetchone()[0]
            net=c.execute("SELECT COALESCE(SUM(CASE WHEN type IN ('صرف','سلف') THEN qty WHEN type IN ('مرتجع','مركب') THEN -qty ELSE 0 END),0) FROM movements WHERE foreman=? AND code=? AND source='NEW'",(foreman,code)).fetchone()[0]
            if qty>opening+delta+net+1e-8:raise ValueError('رصيد العهدة لا يكفي: '+code)

class Server(ThreadingHTTPServer): allow_reuse_address=True
def main():
    if not DB.is_file(): raise SystemExit('Missing database: '+str(DB)+'; restore it into persistent storage before starting')
    with sqlite3.connect(str(DB),timeout=60) as c:
        if c.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise SystemExit('Database integrity check failed')
        c.execute('PRAGMA journal_mode=WAL')
    with db() as c:
        if not c.execute("SELECT 1 FROM users WHERE role='Super Admin'").fetchone(): raise SystemExit('No Super Admin account; initialize offline')
    srv=Server((os.environ.get('HOST','0.0.0.0'),int(os.environ.get('PORT','8080'))),Handler)
    print('EGYPT GAS listening on',srv.server_address,flush=True)
    try: srv.serve_forever()
    finally: srv.server_close()
if __name__=='__main__': main()
