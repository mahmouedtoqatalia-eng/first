
const $=s=>document.querySelector(s);let currentUser=null,currentPage='dashboard';
const PAGE_PERMISSION_GROUPS=[
 {title:'الرئيسية والبحث',pages:[['dashboard','لوحة التحكم'],['global-search','البحث الموحد']]},
 {title:'المخزن والخامات',pages:[['items','المخزن الرئيسي'],['damaged','الخامات التالفة'],['movements','الوارد والصرف']]},
 {title:'عهدة الفورمان',pages:[['foremen','عهدة الفورمان'],['foreman-documents','مستندات العهد'],['foreman-batch','الإدخال الجماعي للعهدة']]},
 {title:'منظومة العدادات',pages:[['meter-types','أنواع العدادات'],['meters','إدارة العدادات'],['meter-stock','مخزن العدادات'],['damaged-meters','العدادات التالفة'],['meter-replace','تغيير عداد'],['crn','بحث C.R.N'],['removed','العدادات المفكوكة'],['meter-history','حركة العدادات'],['meter-import','مراجعة استيراد العدادات'],['meter-receipts','مستند وارد العدادات'],['meter-receipt-register','سجل مستندات الوارد'],['meter-issues','مستند صرف العدادات'],['meter-installs','مستند تركيب العدادات']]},
 {title:'المستندات والأرشيف',pages:[['documents','سجل المستندات'],['archive','أرشيف الحركات'],['nov','أرشيف نوفمبر']]},
 {title:'التقارير والإدارة',pages:[['reports','تقارير الإدارة'],['advanced-reports','التقارير الإدارية المتقدمة'],['users','المستخدمون والصلاحيات'],['backup','النسخ الاحتياطي'],['quality','فحص سلامة البيانات'],['alerts','مركز التنبيهات'],['performance','الأداء والسرعة'],['audit','سجل العمليات والمراقبة'],['approvals','مراجعة واعتماد المستندات']]}
];
const ROLE_LABELS={'Super Admin':'مدير النظام الأعلى','Manager':'مدير','Storekeeper':'أمين المخزن','Meter Operator':'مسؤول العدادات','Viewer':'مستخدم عرض'};
function roleArabic(role){return ROLE_LABELS[role]||role||'—'}
function pageAllowed(page){return !currentUser||currentUser.role==='Super Admin'||(currentUser.permissions||[]).includes(page)}
function applyPagePermissions(){
 document.querySelectorAll('.nav-btn').forEach(b=>{b.style.display=pageAllowed(b.dataset.page)?'':'none'});
 document.querySelectorAll('.nav-group').forEach(g=>{let n=g.nextElementSibling,visible=false;while(n&&!n.classList.contains('nav-group')){if(n.classList.contains('nav-btn')&&n.style.display!=='none')visible=true;n=n.nextElementSibling}g.style.display=visible?'':'none'});
 const searchBtn=document.querySelector('.top-right button[onclick*="global-search"]');if(searchBtn)searchBtn.style.display=pageAllowed('global-search')?'':'none';
}
const mobileNavMedia=window.matchMedia('(max-width:900px)');
function updateSidebarButton(){
 const app=$('#app'),btn=$('#sidebarToggle');if(!btn)return;
 const open=mobileNavMedia.matches?app.classList.contains('mobile-nav-open'):!app.classList.contains('nav-collapsed');
 btn.textContent=mobileNavMedia.matches?(open?'✕ إغلاق القائمة':'☰ القائمة'):(open?'◀ إخفاء القائمة':'☰ إظهار القائمة');
 btn.title=open?'إغلاق القائمة الجانبية':'إظهار القائمة الجانبية';btn.setAttribute('aria-expanded',String(open));
}
function setMobileSidebar(open){
 const active=Boolean(open&&mobileNavMedia.matches);$('#app').classList.toggle('mobile-nav-open',active);document.body.classList.toggle('mobile-nav-lock',active);updateSidebarButton();
}
function toggleSidebar(){
 const app=$('#app');if(mobileNavMedia.matches){setMobileSidebar(!app.classList.contains('mobile-nav-open'));return;}
 const hidden=app.classList.toggle('nav-collapsed');updateSidebarButton();
 try{localStorage.setItem('eg_gas_sidebar_hidden',hidden?'1':'0')}catch(e){}
}
function restoreSidebarPreference(){
 let hidden=false;try{hidden=localStorage.getItem('eg_gas_sidebar_hidden')==='1'}catch(e){}
 $('#app').classList.toggle('nav-collapsed',hidden);setMobileSidebar(false);
}
if(mobileNavMedia.addEventListener)mobileNavMedia.addEventListener('change',()=>setMobileSidebar(false));else mobileNavMedia.addListener(()=>setMobileSidebar(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#app').classList.contains('mobile-nav-open')){setMobileSidebar(false);$('#sidebarToggle').focus()}});

async function api(path,opts={}){let r=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'حدث خطأ');return d}
function toast(t){let x=$('#toast');x.textContent=t;x.style.display='block';setTimeout(()=>x.style.display='none',2600)}
function fmt(v){return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2})}
function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function table(headers,rows){if(!rows.length)return '<div class="empty">لا توجد بيانات لعرضها</div>';return `<div class="table-wrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${x??'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`}
function pageHead(title,sub,action=''){return `<div class="page-head"><div><div class="eyebrow">EGYPT GAS / MANAGEMENT SYSTEM</div><h1>${title}</h1><p>${sub}</p></div><div style="display:flex;gap:8px;align-items:center"><button class="btn btn-dark" onclick="render(currentPage)">تحديث البيانات ↻</button>${action}</div></div>`}
async function showApp(user){currentUser=user;$('#login').style.display='none';$('#app').style.display='block';$('#userChip').textContent=user.username+' · '+roleArabic(user.role_ar||user.role);restoreSidebarPreference();applyPagePermissions();await render(pageAllowed('dashboard')?'dashboard':((user.permissions||[])[0]||'dashboard'))}
function movementDateLabel(value){
 const raw=String(value??'').trim();
 if(!raw)return '—';
 if(/^\d{4,6}(?:\.\d+)?$/.test(raw)){
  const n=Number(raw);if(n>20000&&n<80000){const d=new Date(Date.UTC(1899,11,30)+n*86400000);return d.toLocaleDateString('en-GB',{timeZone:'UTC'})}
 }
 const d=new Date(raw);return Number.isNaN(d.getTime())?raw.replace('T',' ').slice(0,16):d.toLocaleDateString('en-GB');
}
async function renderMaterialMovementDocuments(root){
 const rows=await api('/material-movement-documents');window.materialMovementDocuments=rows; const drafts=await api('/movements-drafts');window.mvDrafts=drafts;
 root.innerHTML=pageHead('الوارد والصرف','سجل المستندات — افتح رقم المستند لعرض جميع البنود المسجلة بداخله',
  `<button class="btn btn-gold" onclick="addMovement()">＋ تسجيل حركة</button>`)+
 `<section class="panel">
  <div class="toolbar" style="margin-bottom:14px">
   <input id="materialDocSearch" class="search" style="flex:1;min-width:220px" placeholder="ابحث برقم المستند أو الفورمان أو المستخدم..." oninput="filterMaterialMovementDocuments()">
   <select id="materialDocType" class="search" onchange="filterMaterialMovementDocuments()"><option value="">كل المستندات</option><option value="وارد">مستندات الوارد</option><option value="صرف">مستندات الصرف</option></select>
   <span class="badge">${rows.length} مستند</span>
  </div>
  <div id="mvDraftList"></div><div id="materialDocumentCards"></div>
 </section>`;
 filterMaterialMovementDocuments();
 $('#mvDraftList').innerHTML=drafts.length?`<div class="panel"><h3>مسودات قبل الاعتماد (${drafts.length})</h3>${drafts.map((x,i)=>`<div class="toolbar" style="padding:8px"><b>${esc(x.data.doc||'بدون رقم')} · ${esc(x.data.type||'')}</b><button class="btn btn-cyan" onclick="addMovement(window.mvDrafts[${i}])">معاينة / تعديل / إرسال</button><button class="btn btn-dark" onclick="deleteMvDraft(${x.id})">حذف</button></div>`).join('')}</div>`:'';
}
async function deleteMvDraft(id){if(!confirm('حذف المسودة فقط؟'))return;try{await api('/movements-drafts',{method:'POST',body:JSON.stringify({action:'delete',id})});await render(currentPage)}catch(e){toast(e.message)}}
function filterMaterialMovementDocuments(){
 const q=($('#materialDocSearch')?.value||'').trim().toLowerCase(),kind=$('#materialDocType')?.value||'';
 const rows=(window.materialMovementDocuments||[]).filter(x=>(!kind||x.type===kind)&&(!q||[x.doc_no,x.foreman,x.username,x.type].some(v=>String(v||'').toLowerCase().includes(q))));
 const host=$('#materialDocumentCards');if(!host)return;
 if(!rows.length){host.innerHTML='<div class="empty">لا توجد مستندات مطابقة للبحث.</div>';return}
 host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>رقم المستند</th><th>نوع المستند</th><th>الفورمان / الجهة</th><th>التاريخ</th><th>عدد البنود</th><th>إجمالي الكميات</th><th>المستخدم</th><th>المحتويات</th></tr></thead><tbody>
 ${rows.map(x=>`<tr>
  <td><button class="btn btn-cyan" onclick="showDocumentDetail('material-movement',${Number(x.id)})" style="font-weight:900;min-width:125px">${esc(x.doc_no)}</button></td>
  <td><span class="badge ${x.type==='وارد'?'':'gold'}">${esc(x.type)}</span></td>
  <td>${esc(x.foreman||'—')}</td><td>${esc(movementDateLabel(x.created_at))}</td>
  <td>${fmt(x.line_count)}</td><td>${fmt(x.total_qty)}</td><td>${esc(x.username||'—')}</td>
  <td><button class="btn btn-gold" onclick="showDocumentDetail('material-movement',${Number(x.id)})">عرض البنود ←</button></td>
 </tr>`).join('')}
 </tbody></table></div>`;
}
async function renderDocumentArchive(root){
 const rows=await api('/document-register');
 window.documentArchiveRows=rows;
 root.innerHTML=pageHead('أرشيف الحركات والمستندات','أرقام المستندات أولًا — افتح أي مستند لعرض بنوده وتفاصيله',
  `<button class="btn btn-cyan" onclick="exportDocumentArchive()">تصدير Excel</button><button class="btn btn-gold" onclick="printDocumentArchive()">معاينة / PDF</button>`)+
 `<section class="panel"><div class="toolbar"><input id="documentArchiveSearch" class="search" style="flex:1" placeholder="ابحث برقم المستند أو الفورمان أو نوع المستند..." oninput="filterDocumentArchive()">
 <select id="documentArchiveKind" class="search" onchange="filterDocumentArchive()"><option value="">كل أنواع المستندات</option>${[...new Set(rows.map(x=>x.kind_label))].sort().map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>
 <span class="badge">${rows.length} مستند</span></div><div id="documentArchiveTable"></div></section>`;
 filterDocumentArchive();
}
function filterDocumentArchive(){
 const q=($('#documentArchiveSearch')?.value||'').trim().toLowerCase(),kind=$('#documentArchiveKind')?.value||'';
 const rows=(window.documentArchiveRows||[]).filter(x=>(!kind||x.kind_label===kind)&&(!q||[x.doc_no,x.kind_label,x.owner,x.created_at,x.source].some(v=>String(v||'').toLowerCase().includes(q))));
 $('#documentArchiveTable').innerHTML=table(['رقم المستند','نوع المستند','الفورمان / الجهة','التاريخ','عدد البنود','حالة الاعتماد','فتح المحتويات'],rows.map(x=>[
  `<button class="btn btn-cyan" onclick="showDocumentDetail('${esc(x.kind)}',${Number(x.id)})">${esc(x.doc_no||'بدون رقم')}</button>`,
  esc(x.kind_label),esc(x.owner||'—'),esc(x.created_at||'—'),fmt(x.line_count),
  esc(({PENDING:'قيد المراجعة',APPROVED:'معتمد',REJECTED:'مرفوض'}[x.approval]||x.approval||'—')),
  `<button class="btn btn-gold" onclick="showDocumentDetail('${esc(x.kind)}',${Number(x.id)})">عرض المستند</button>`
 ]));
 if(!rows.length)$('#documentArchiveTable').innerHTML='<div class="empty">لا توجد مستندات مطابقة للبحث.</div>';
}
function exportDocumentArchive(){
 const rows=window.documentArchiveRows||[];
 downloadCsvFile('أرشيف_المستندات.csv',[['رقم المستند','النوع','الفورمان / الجهة','التاريخ','عدد البنود','الاعتماد'],...rows.map(x=>[x.doc_no,x.kind_label,x.owner,x.created_at,x.line_count,x.approval])]);
}
function printDocumentArchive(){
 const rows=window.documentArchiveRows||[];
 printReportWindow('أرشيف الحركات والمستندات',table(['رقم المستند','النوع','الفورمان / الجهة','التاريخ','عدد البنود','الاعتماد'],rows.map(x=>[esc(x.doc_no),esc(x.kind_label),esc(x.owner),esc(x.created_at),fmt(x.line_count),esc(x.approval)])));
}
async function renderNovemberArchive(root){
 const rows=await api('/nov');window.novArchiveRows=rows;window.novArchiveShowAll=false;
 const foremen=[...new Set(rows.map(x=>String(x.foreman||'غير محدد')))].sort((a,b)=>a.localeCompare(b,'ar'));
 root.innerHTML=pageHead('أرشيف نوفمبر','أرشيف العهدة الشهري — أقسام مستقلة لكل فورمان وأسبوع مع إمكانية فتح الكل',
  `<button class="btn btn-cyan" id="novExpandAll" onclick="toggleNovemberArchive()">إظهار كل المحتويات</button>
   <button class="btn btn-dark" onclick="exportNovemberArchive()">تصدير Excel</button>
   <button class="btn btn-gold" onclick="printNovemberArchive()">معاينة / PDF</button>`)+
 `<section class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px">
   <div class="kpi"><div class="label">إجمالي السجلات</div><div class="value">${fmt(rows.length)}</div></div>
   <div class="kpi"><div class="label">عدد الفورمانات</div><div class="value">${fmt(foremen.length)}</div></div>
   <div class="kpi"><div class="label">إجمالي المنصرف</div><div class="value">${fmt(rows.reduce((a,x)=>a+Number(x.issued||0),0))}</div></div>
 </section>
 <section class="panel">
  <div class="toolbar" style="gap:10px;margin-bottom:14px;flex-wrap:wrap">
   <input id="novArchiveSearch" class="search" style="flex:1;min-width:220px" placeholder="ابحث بالفورمان أو الكود أو اسم الخامة أو الأسبوع..." oninput="filterNovemberArchive()">
   <select id="novArchiveForeman" class="search" style="min-width:180px" onchange="filterNovemberArchive()"><option value="">كل الفورمانات</option>${foremen.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>
   <span class="badge">${fmt(rows.length)} سجل محفوظ</span>
  </div>
  <div id="novArchiveGroups"></div>
 </section>`;
 filterNovemberArchive();
}
function filterNovemberArchive(){
 const q=($('#novArchiveSearch')?.value||'').trim().toLowerCase();
 const selected=$('#novArchiveForeman')?.value||'';
 const all=(window.novArchiveRows||[]).filter(x=>(!selected||String(x.foreman||'غير محدد')===selected)&&[x.foreman,x.code,x.name,x.week].some(v=>String(v||'').toLowerCase().includes(q)));
 const byForeman=new Map();
 for(const row of all){const name=String(row.foreman||'غير محدد');if(!byForeman.has(name))byForeman.set(name,[]);byForeman.get(name).push(row)}
 const groups=[...byForeman.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar'));
 const host=$('#novArchiveGroups');if(!host)return;
 if(!groups.length){host.innerHTML='<div class="empty">لا توجد سجلات مطابقة لخيارات البحث.</div>';return}
 host.innerHTML=groups.map(([foreman,items])=>{
  const issued=items.reduce((a,x)=>a+Number(x.issued||0),0),installed=items.reduce((a,x)=>a+Number(x.installed||0),0);
  const weeks=new Map();
  items.forEach(x=>{const w=String(x.week||'بدون أسبوع');if(!weeks.has(w))weeks.set(w,[]);weeks.get(w).push(x)});
  const weekHtml=[...weeks.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ar')).map(([week,weekRows])=>`
   <details class="nov-week" ${window.novArchiveShowAll?'open':''} style="margin:8px 0 8px 14px;border:1px solid #254c66;border-radius:10px;background:#081e30">
    <summary style="cursor:pointer;padding:11px 14px;color:#f7bd4b;font-weight:800;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
     <span>${esc(week)}</span><span style="color:#c5d8e7;font-weight:600">${fmt(weekRows.length)} بند · منصرف ${fmt(weekRows.reduce((a,x)=>a+Number(x.issued||0),0))} · مركب ${fmt(weekRows.reduce((a,x)=>a+Number(x.installed||0),0))}</span>
    </summary>
    ${table(['كود الخامة','اسم الخامة','المنصرف','المركب'],weekRows.map(x=>[esc(x.code),esc(x.name),fmt(x.issued),fmt(x.installed)]))}
   </details>`).join('');
  return `<details class="nov-foreman" ${window.novArchiveShowAll?'open':''} style="margin:10px 0;border:1px solid #315c77;border-radius:13px;background:linear-gradient(135deg,#102c42,#0a2032);overflow:hidden">
   <summary style="cursor:pointer;padding:15px 16px;list-style-position:inside;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap">
    <span style="font-size:15px;font-weight:900;color:#fff">${esc(foreman)}</span>
    <span style="display:flex;gap:8px;flex-wrap:wrap"><span class="badge">${fmt(items.length)} بند</span><span class="badge gold">منصرف ${fmt(issued)}</span><span class="badge">مركب ${fmt(installed)}</span><span style="color:#f7bd4b;font-weight:900">فتح التفاصيل ▾</span></span>
   </summary>
   <div style="padding:0 12px 12px">${weekHtml}</div>
  </details>`;
 }).join('');
 const info=document.createElement('div');info.className='caption';info.style.marginTop='12px';info.textContent=`يتم عرض ${fmt(all.length)} سجل ضمن ${fmt(groups.length)} فورمان`;host.appendChild(info);
 const btn=$('#novExpandAll');if(btn)btn.textContent=window.novArchiveShowAll?'طيّ كل القوائم':'إظهار كل المحتويات';
}
function toggleNovemberArchive(){window.novArchiveShowAll=!window.novArchiveShowAll;filterNovemberArchive()}
function exportNovemberArchive(){
 const rows=window.novArchiveRows||[];
 downloadCsvFile('أرشيف_نوفمبر.csv',[['الفورمان','كود الخامة','الخامة','الأسبوع','المنصرف','المركب'],...rows.map(x=>[x.foreman,x.code,x.name,x.week,x.issued,x.installed])]);
}
function printNovemberArchive(){
 const rows=window.novArchiveRows||[];
 printReportWindow('أرشيف نوفمبر',table(['الفورمان','كود الخامة','الخامة','الأسبوع','المنصرف','المركب'],rows.map(x=>[esc(x.foreman),esc(x.code),esc(x.name),esc(x.week),fmt(x.issued),fmt(x.installed)])));
}

async function renderRemovedMeters(root){
 const rows=await api('/removed-meters');window.removedMeterRows=rows;
 const damaged=rows.filter(x=>String(x.condition||'').includes('تالف')).length;
 const pending=rows.filter(x=>String(x.state||'').includes('فحص')||String(x.state||'').includes('مراجعة')).length;
 root.innerHTML=pageHead('العدادات المفكوكة','متابعة العدادات التي تم فكها، وحالة الفحص والإصلاح، وطلبات الإرجاع للمخزن',
  `<button class="btn btn-cyan" onclick="render('removed')">↻ تحديث</button>`)+
 `<section class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:14px">
  <div class="kpi"><div class="label">إجمالي العدادات المفكوكة</div><div class="value">${fmt(rows.length)}</div></div>
  <div class="kpi"><div class="label">تالف / يحتاج معالجة</div><div class="value">${fmt(damaged)}</div></div>
  <div class="kpi"><div class="label">بانتظار الفحص</div><div class="value">${fmt(pending)}</div></div>
 </section>
 <section class="panel">
  <div class="toolbar" style="gap:10px;flex-wrap:wrap;margin-bottom:14px">
   <input id="removedMeterSearch" class="search" style="flex:1;min-width:220px" placeholder="ابحث بالسيريال أو النوع أو الفورمان أو C.R.N..." oninput="filterRemovedMeters()">
   <select id="removedMeterState" class="search" onchange="filterRemovedMeters()"><option value="">كل الحالات</option><option>بانتظار الفحص</option><option>تحت الفحص</option><option>تالف نهائيًا</option><option>قيد الصيانة</option><option>تم الإصلاح - بانتظار اعتماد الإرجاع</option></select>
   <span class="badge">${fmt(rows.length)} عداد</span>
  </div>
  <div id="removedMeterTable"></div>
 </section>`;
 filterRemovedMeters();
}
function filterRemovedMeters(){
 const q=($('#removedMeterSearch')?.value||'').trim().toLowerCase(),state=$('#removedMeterState')?.value||'';
 const rows=(window.removedMeterRows||[]).filter(x=>(!state||String(x.state||'بانتظار الفحص')===state)&&(!q||[x.serial,x.meter_type,x.foreman,x.crn,x.condition,x.state,x.reason].some(v=>String(v||'').toLowerCase().includes(q))));
 const host=$('#removedMeterTable');if(!host)return;
 if(!rows.length){host.innerHTML='<div class="empty" style="padding:30px"><b>لا توجد عدادات مفكوكة مسجلة حاليًا</b><p style="margin-top:8px">ستظهر هنا العدادات بعد تسجيل عملية فكها من العداد المركب. لا يتم إنشاء سجلات وهمية أو تغيير حالة أي عداد تلقائيًا.</p></div>';return}
 host.innerHTML=table(['السيريال','نوع العداد','الفورمان السابق','C.R.N','التصنيف','حالة المتابعة','سبب الفك','آخر تحديث','الإجراءات'],rows.map(x=>[
  `<button class="btn btn-cyan" onclick="openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,
  esc(x.meter_type),esc(x.foreman||'—'),esc(x.crn||'—'),esc(x.condition||'غير مصنف'),
  `<span class="badge ${String(x.state||'').includes('تالف')?'red':'gold'}">${esc(x.state||'بانتظار الفحص')}</span>`,
  esc(x.reason||'—'),esc(x.updated_at||x.removed_at||'—'),
  `<button class="btn btn-dark" onclick="updateRemovedMeter('${esc(x.serial)}')">تحديث الحالة</button> <button class="btn btn-cyan" onclick="requestMeterReturn('${esc(x.serial)}')">طلب إرجاع</button>`
 ]));
}

async function render(page){if(!pageAllowed(page)){toast('ليس لديك صلاحية لفتح هذه الصفحة');return}currentPage=page;document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===page));let root=$('#main');root.innerHTML='<div class="empty">جارٍ تحميل البيانات...</div>';try{
 if(page==='dashboard'){let d=await api('/dashboard');let st=d.meter_states||{};let states=[['بالمخزن',Number(st.STOCK||0),'#d8ad55'],['بعهدة الفورمان',Number(st.CUSTODY||0),'#82b8dc'],['مركب',Number(st.INSTALLED||0),'#5fbd98'],['مفكوك',Number(st.REMOVED||0),'#d97979']];let stateMax=Math.max(1,...states.map(x=>x[1]));let items=(d.top_items||[]).slice(0,6),itemMax=Math.max(1,...items.map(x=>Number(x.legacy_balance||0)));root.innerHTML=pageHead('لوحة التحكم الرئيسية','نظرة تشغيلية متوازنة على المخزون والعُهد وحركة العدادات',`<span class="badge gold">منطقة العبور</span>`)+
 `<section class="hero"><div><div class="eyebrow">EGYPT GAS · OPERATIONS OVERVIEW</div><h2>منظومة إدارة الخامات والعدادات</h2><p>شركة غاز مصر — منطقة العبور</p><div style="margin-top:14px;color:#e5c987;font-size:12px;font-weight:800">إدارة مركزية للمخزون والمستندات وحركة العدادات</div></div><img class="hero-logo" src="/assets/logo.png" alt="EGYPT GAS"></section>
 <section class="kpis">${[['إجمالي رصيد المخزن',fmt(d.stock_balance),'▣'],['الأصناف النشطة',fmt(d.items_count),'▤'],['الفورمانات',fmt(d.foremen_count),'♟'],['الحركات المسجلة',fmt(d.movement_count),'⇄']].map((x,i)=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="symbol">${x[2]}</div></div>`).join('')}</section>
 <div class="dashboard-grid"><section class="dashboard-panel"><h3>حالة العدادات <small>الأرصدة الحالية</small></h3><div class="status-list">${states.map(x=>`<div class="status-row"><span>${x[0]}</span><div class="status-track"><div class="status-fill" style="width:${Math.max(0,Math.min(100,x[1]/stateMax*100))}%;background:linear-gradient(90deg,${x[2]},#f3d99b)"></div></div><b class="status-value">${fmt(x[1])}</b></div>`).join('')}</div><div style="border-top:1px solid #344e68;margin-top:17px;padding-top:13px;color:#aebdca;font-size:11px">الحالة معروضة من بيانات العدادات المسجلة في قاعدة البيانات.</div></section>
 <section class="dashboard-panel"><h3>أعلى أرصدة الخامات <small>حسب الرصيد الحالي</small></h3>${items.length?`<div class="stock-bars">${items.map(x=>`<div class="stock-bar-row"><span class="stock-bar-name" title="${esc(x.name)}">${esc(x.name)}</span><div class="stock-bar-track"><div class="stock-bar-fill" style="width:${Math.max(0,Math.min(100,Number(x.legacy_balance||0)/itemMax*100))}%"></div></div><b class="stock-bar-val">${fmt(x.legacy_balance)}</b></div>`).join('')}</div>`:'<div class="empty">لا توجد بيانات أرصدة لعرضها</div>'}</section>
 <section class="dashboard-panel"><h3>إجراءات سريعة <small>الوصول المباشر</small></h3><div class="quick-actions"><button class="quick-action" onclick="render('items')"><b>▣</b>المخزن الرئيسي</button><button class="quick-action" onclick="render('movements')"><b>⇄</b>الوارد والصرف</button><button class="quick-action" onclick="render('foremen')"><b>♟</b>عهدة الفورمان</button><button class="quick-action" onclick="render('meter-stock')"><b>◉</b>مخزن العدادات</button><button class="quick-action" onclick="render('documents')"><b>▤</b>سجل المستندات</button><button class="quick-action" onclick="render('reports')"><b>▥</b>تقارير الإدارة</button></div></section>
 <section class="dashboard-panel"><h3>ملخص التشغيل <small>مؤشرات أساسية</small></h3><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${[['عدد الأصناف',fmt(d.items_count)],['عدد الفورمانات',fmt(d.foremen_count)],['عدد الحركات',fmt(d.movement_count)],['رصيد المخزن',fmt(d.stock_balance)]].map(x=>`<div style="padding:13px;border:1px solid #344e68;border-radius:12px;background:#0a1b2e"><div style="font-size:11px;color:#aebdca">${x[0]}</div><b style="display:block;font-size:20px;color:#f0d28e;margin-top:4px">${x[1]}</b></div>`).join('')}</div></section></div>
 <section class="dashboard-panel recent-wrap"><h3>آخر الحركات المسجلة <small>تحديث مباشر من قاعدة البيانات</small></h3>${table(['التاريخ والوقت','الفورمان','نوع الحركة','كود الخامة','الكمية'],(d.recent||[]).slice(0,8).map(x=>[String(x.created_at||'').replace('T',' ').slice(0,16),esc(x.foreman||'—'),esc(x.type||'—'),esc(x.code||'—'),fmt(x.qty)]))}</section>`;
 }else if(page==='global-search'){
 root.innerHTML=pageHead('البحث الموحد الشامل','بحث واحد في الخامات والعدادات والمستندات والفورمانات')+
 `<section class="panel"><div class="toolbar"><input id="globalSearchTerm" class="search" style="flex:1" placeholder="اكتب رقم سيريال أو C.R.N أو كود خامة أو اسم فورمان أو رقم مستند..."><select id="globalSearchKind" class="search"><option>الكل</option><option>العدادات</option><option>الخامات</option><option>المستندات</option><option>الفورمانات</option></select><button class="btn btn-gold" id="runGlobalSearch">بحث</button></div><div id="globalSearchSummary" class="eyebrow">اكتب كلمتين على الأقل لبدء البحث</div><div id="globalSearchResults"></div></section>`;
 $('#runGlobalSearch').onclick=runGlobalSearch;
 $('#globalSearchTerm').addEventListener('keydown',e=>{if(e.key==='Enter')runGlobalSearch()});
}
 else if(page==='items'){let q=$('#itemSearch')?.value||'';let rows=await api('/items?q='+encodeURIComponent(q));root.innerHTML=pageHead('إدارة الخامات والأصناف','بيانات الأصناف والأرصدة من قاعدة بياناتك الأصلية',`<button class="btn btn-gold" onclick="addItem()">＋ إضافة خامة</button>`)+`<div class="toolbar"><input class="search" id="itemSearch" placeholder="ابحث بالكود أو اسم الخامة..." value="${q}"><span class="spacer"></span><span class="badge">${fmt(rows.length)} صنف ظاهر</span></div>`+table(['الكود','اسم الخامة','أول المدة','الوارد الأصلي','الرصيد الحالي','الحالة','إجراء'],rows.map(x=>[esc(x.code),esc(x.name),fmt(x.opening),fmt(x.received),`<b style="color:var(--gold)">${fmt(x.legacy_balance)}</b>`,x.active?'<span class="badge">نشط</span>':'<span class="badge red">موقوف</span>',`<button class="btn btn-dark" onclick="editItem('${esc(x.code)}','${esc(x.name)}',${Number(x.opening||0)})">طلب تعديل</button> <button class="btn btn-danger" onclick="requestDeleteItem('${esc(x.code)}','${esc(x.name)}')">طلب حذف بموافقة المدير</button> <button class="btn btn-cyan" onclick="toggleItem('${esc(x.code)}')">${x.active?'إيقاف':'تفعيل'}</button>`]));$('#itemSearch').addEventListener('input',debounce(()=>render('items'),350));
 }else if(page==='foremen'){
 let rows=await api('/foremen');let chosen=window.selectedForeman||rows[0]?.name||'';
 let detail=chosen?await api('/foremen/'+encodeURIComponent(chosen)):null;
 root.innerHTML=`<div class="fw-selector"><div><div class="eyebrow">EGYPT GAS / منطقة العبور</div><strong>إدارة عهدة الفورمانات</strong></div><div class="fw-select-tools"><select class="search" id="foremanPicker" aria-label="اختيار الفورمان">${rows.map(x=>`<option value="${esc(x.name)}" ${x.name===chosen?'selected':''}>${esc(x.name)} — ${esc(x.performance_no||'—')}</option>`).join('')}</select><button class="btn btn-gold" onclick="addForeman()">${fwIcon('user')} إضافة فورمان</button><button class="btn btn-dark" id="fwEdit">${fwIcon('edit')} تعديل البيانات</button><button class="btn btn-danger" id="fwDelete">${fwIcon('trash')} حذف فورمان</button></div></div><section class="panel foreman-workspace" id="foremanDetails">${detail?foremanDetailHtml(detail):'<div class="empty">لا توجد عهدة</div>'}</section>`;
 $('#foremanPicker').onchange=e=>selectForeman(e.target.value);
 const person=rows.find(x=>x.name===chosen);$('#fwEdit').disabled=$('#fwDelete').disabled=!person;
 filterFwRows();if(person){$('#fwEdit').onclick=()=>editForeman(person.name,person.performance_no||'',person.mobile||'');$('#fwDelete').onclick=()=>deleteForeman(person.name);}
 }else if(page==='foreman-batch'){
 let people=await api('/foremen');let chosen=window.selectedForeman||people[0]?.name||'';
 root.innerHTML=pageHead('الإدخال الجماعي للعهدة – 120 صف','شاشة مستقلة لإدخال وترحيل حتى 120 بندًا برقم مستند واحد')+
 `<section class="panel"><div class="toolbar">
 <div class="field"><label>الفورمان</label><select id="batchPageForeman" class="search">${people.map(x=>`<option value="${esc(x.name)}" ${x.name===chosen?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div>
 <div class="field"><label>الشهر</label><input id="batchPageMonth" class="search" value="${monthNow()}" placeholder="YYYY-MM"></div>
 <div class="field"><label>الأسبوع</label><select id="batchPageWeek" class="search">${[1,2,3,4,5].map(x=>`<option value="${x}">الأسبوع ${x}</option>`).join('')}</select></div>
 <div class="field"><label>نوع الحركة</label><select id="batchPageKind" class="search">${['مركب','منصرف','سلف','مرتجع'].map(x=>`<option value="${x}" ${x==='مركب'?'selected':''}>${x}</option>`).join('')}</select></div>
 <div class="field"><label>رقم المستند</label><select id="batchPageDoc" class="search"><option value="">جارٍ تحميل الأرقام...</option></select><small id="batchPageDocCount"></small></div>
 </div>
 <div class="toolbar" style="margin:12px 0"><b>بنود الكشف</b><span class="badge">120 صف</span><span class="spacer"></span><button class="btn btn-dark" onclick="clearForemanBatchPage()">تفريغ الخانات</button></div>
 <div class="table-wrap" style="max-height:58vh;overflow:auto"><table><thead><tr><th>م</th><th>كود واسم الخامة</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody id="batchPageRows"></tbody></table></div>
 <div class="toolbar" style="margin-top:14px"><span id="batchPageCount" class="caption">عدد البنود المكتملة: 0</span><span class="spacer"></span><button class="btn btn-gold" onclick="submitForemanBatchPage()">ترحيل الكشف بالكامل</button></div>
 </section>`;
 await initForemanBatchPage();
 }else if(page==='foreman-documents'){
 let people=await api('/foremen');let selected=window.selectedForeman||people[0]?.name||'';
 root.innerHTML=pageHead('سجل مستندات العهد','كل أرقام مستندات الصرف والسلف والمرتجع والتسليم والجرد والعدادات لكل فورمان')+
 `<section class="panel"><div class="toolbar"><label>الفورمان</label><select id="custodyDocForeman" class="search">${people.map(x=>`<option value="${esc(x.name)}" ${x.name===selected?'selected':''}>${esc(x.name)}</option>`).join('')}</select><input id="custodyDocSearch" class="search" placeholder="بحث برقم المستند أو النوع أو الطرف الآخر"><button class="btn btn-gold" onclick="loadForemanDocuments()">عرض المستندات</button></div><div id="custodyDocResults"></div></section>`;
 if(selected)await loadForemanDocuments();
 }else if(page==='meters'){let q=$('#meterSearch')?.value||'';let rows=await api('/meters?q='+encodeURIComponent(q));root.innerHTML=pageHead('إدارة العدادات','السيريال والحالة والفورمان وC.R.N',`<button class="btn btn-gold" onclick="openMeterGlobalSearch()">بحث شامل في العدادات</button>`)+`<div class="toolbar"><input class="search" id="meterSearch" placeholder="ابحث بالسيريال أو C.R.N أو الفورمان..." value="${q}"><span class="spacer"></span><span class="badge">${rows.length} عداد ظاهر</span></div>`+table(['السيريال','نوع العداد','السعة','الحالة','الفورمان','C.R.N','كود العداد'],rows.map(x=>[`<button class="btn btn-cyan" onclick="openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,x.meter_type,x.capacity,`<span class="badge ${x.status==='INSTALLED'?'':'gold'}">${({STOCK:'بالمخزن',CUSTODY:'عهدة الفورمان',INSTALLED:'مركب',REMOVED:'مفكوك'}[x.status]||x.status)}</span>`,x.foreman,x.crn,x.meter_code]));$('#meterSearch').addEventListener('input',debounce(()=>render('meters'),350));
 }else if(page==='movements'){await renderMaterialMovementDocuments(root);
 }else if(page==='meter-types'){let rows=await api('/meter-types');root.innerHTML=pageHead('أنواع العدادات','دليل أنواع العدادات والسعات',`<button class="btn btn-gold" onclick="addMeterType()">＋ إضافة نوع</button>`)+table(['نوع العداد','السعة','كود العداد','الحالة','الإجراء'],rows.map(x=>[esc(x.name),esc(x.capacity),esc(x.meter_code||'—'),x.active?'<span class="badge">نشط</span>':'<span class="badge red">موقوف</span>',`<button class="btn btn-gold" onclick="showMeterTypeSerials('${esc(x.name)}')">أرقام العدادات</button> <button class="btn btn-dark" onclick="editMeterType('${esc(x.name)}','${esc(x.capacity)}','${esc(x.meter_code||'')}')">تعديل</button> <button class="btn btn-cyan" onclick="toggleMeterType('${esc(x.name)}')">${x.active?'إيقاف':'تفعيل'}</button>`]));
 }else if(page==='approvals'){let rows=await api('/approvals');root.innerHTML=pageHead('الاعتمادات والمراجعة','اعتماد المستندات وترحيلها مرة واحدة فقط')+table(['النوع','رقم المستند','الحالة','مقدم الطلب','تاريخ الطلب','المراجع','السبب','الإجراء'],rows.map(x=>[esc(x.kind_label),esc(x.doc_no),`<span class="badge ${x.status==='PENDING'?'gold':x.status==='APPROVED'?'':'red'}">${x.status==='PENDING'?'قيد المراجعة':x.status==='APPROVED'?'معتمد':'مرفوض'}</span>`,esc(x.requested_by),esc(x.requested_at),esc(x.reviewed_by||'—'),esc(x.reason),`<button class="btn btn-dark" onclick="showApprovalDetail('${x.doc_kind}',${x.doc_id})">تفاصيل</button> <button class="btn btn-cyan" onclick="showApprovalHistory('${x.doc_kind}',${x.doc_id})">سجل الاعتماد</button> ${x.status==='PENDING'?`<button class="btn btn-gold" onclick="reviewApproval('${x.doc_kind}',${x.doc_id},true)">اعتماد وترحيل</button> <button class="btn btn-danger" onclick="reviewApproval('${x.doc_kind}',${x.doc_id},false)">رفض</button>`:'—'}`]));
 }else if(page==='archive'){await renderDocumentArchive(root);
 }else if(page==='damaged'){let rows=await api('/damaged-materials');root.innerHTML=pageHead('خامات تالفة وغير صالحة للاستخدام','سجل مستقل لا يخصم من رصيد المخزن',`<button class="btn btn-gold" onclick="addDamagedMaterial()">＋ إضافة خامة تالفة</button>`)+table(['رقم','الكود','الخامة','الكمية','ملاحظات','التاريخ','المستخدم','إجراء'],rows.map(x=>[x.id,esc(x.code),esc(x.name),fmt(x.qty),esc(x.notes),esc(x.created_at),esc(x.username),`<button class="btn btn-dark" onclick="editDamagedMaterial(${x.id},'${esc(x.code)}',${Number(x.qty)},'${esc(x.notes||'')}')">تعديل</button> <button class="btn btn-danger" onclick="deleteDamagedMaterial(${x.id})">حذف</button>`]));}
 else if(page==='meter-stock'){let rows=await api('/meter-stock');root.innerHTML=pageHead('مخزن العدادات','العدادات الموجودة حاليًا بالمخزن')+table(['السيريال','النوع','السعة','الحالة','كود العداد','تاريخ الوارد'],rows.map(x=>[x.serial,x.meter_type,x.capacity,'بالمخزن',x.meter_code,x.received_at]));}
 else if(page==='damaged-meters'){let rows=await api('/damaged-meter-stock');root.innerHTML=pageHead('العدادات التالفة','عدادات واردة تم تسجيلها كتالف؛ معزولة عن رصيد الصرف')+table(['السيريال','النوع','السعة','الحالة','الكود','تاريخ الوارد','ملاحظات'],rows.map(x=>[esc(x.serial),esc(x.meter_type),esc(x.capacity),'تالف',esc(x.meter_code),esc(x.received_at),esc(x.notes||'')]));}
 else if(page==='meter-replace'){let rows=await api('/meter-replacements');root.innerHTML=pageHead('تغيير عداد','فك العداد المركب وربط البديل بنفس C.R.N',`<button class="btn btn-gold" onclick="createMeterReplacement()">＋ تسجيل تغيير عداد</button>`)+table(['رقم','العداد القديم','العداد الجديد','الفورمان','C.R.N','السبب','التاريخ','المستخدم'],rows.map(x=>[x.id,esc(x.old_serial),esc(x.new_serial),esc(x.foreman),esc(x.crn),esc(x.reason),esc(x.created_at),esc(x.username)]));}
 else if(page==='crn'){root.innerHTML=pageHead('بحث C.R.N وتاريخ العميل','ابحث برقم C.R.N لعرض العداد الحالي وكل العدادات السابقة')+`<section class="panel"><div class="toolbar"><input id="crnSearch" class="search" placeholder="اكتب رقم C.R.N أو السيريال"><button class="btn btn-gold" onclick="searchMeterCrnTimeline()">بحث</button><button class="btn btn-dark" onclick="$('#crnSearch').value='';$('#crnTimelineResults').innerHTML=''">مسح</button></div><div id="crnTimelineResults" class="empty">اكتب رقم C.R.N ثم اضغط بحث لعرض تاريخ الاتصال بالكامل.</div></section>`;$('#crnSearch').addEventListener('keydown',e=>{if(e.key==='Enter')searchMeterCrnTimeline()});}
 else if(page==='removed'){await renderRemovedMeters(root);}
 else if(page==='meter-history'){let rows=await api('/meter-history');root.innerHTML=pageHead('حركة العدادات','سجل أحداث وحركة العدادات')+table(['رقم','التاريخ','السيريال','العملية','الفورمان','C.R.N','المستخدم','ملاحظات'],rows.map(x=>[x.id,x.created_at,x.serial,x.action,x.foreman,x.crn,x.username,x.notes]));}
 else if(page==='meter-import'){
 root.innerHTML=pageHead('مراجعة واستيراد بيانات العدادات','اختر ملف Excel القديم لفحص السيريالات والعهدة والتركيبات والتعارضات دون تعديل قاعدة البيانات')+
 `<section class="panel"><div class="toolbar"><input type="file" id="meterImportFile" accept=".xlsx,.xlsm" class="search"><button class="btn btn-gold" id="runMeterAudit">فحص ملف Excel</button><button class="btn btn-dark" id="exportMeterAudit" disabled>تصدير تقرير الفحص Excel</button></div><div id="meterAuditStatus" class="empty">لم يتم اختيار ملف بعد. الفحص للقراءة فقط ولا ينقل أو يعدّل أي عداد.</div><div id="meterAuditResult"></div></section>`;
 $('#runMeterAudit').onclick=runMeterImportAudit;$('#exportMeterAudit').onclick=exportMeterImportAudit;
 }else if(page==='meter-receipts'||page==='meter-receipt-register'){let rows=await api('/receipt-docs');root.innerHTML=pageHead(page==='meter-receipts'?'مستند وارد عدادات':'سجل مستندات الوارد','تسجيل السيريالات الجديدة للمخزن وإرسالها للاعتماد',page==='meter-receipts'?`<button class="btn btn-gold" onclick="createMeterReceipt()">＋ إنشاء مستند وارد</button>`:'')+table(['رقم','المستند','نوع العداد','جهة / مخزن الوارد','التاريخ','المستخدم','عدد العدادات','الإجراء'],rows.map(x=>[x.id,esc(x.doc_no),esc(x.meter_type),esc(x.origin||'—'),esc(x.created_at),esc(x.username),fmt(x.line_count),`<button class="btn btn-dark" onclick="showDocumentDetail('meter-receipt',${x.id})">التفاصيل / طباعة</button>`]));}
 else if(page==='meter-issues'){let rows=await api('/issue-docs');root.innerHTML=pageHead('مستند صرف عدادات','صرف عدادات المخزن إلى عهدة الفورمان',`<button class="btn btn-cyan" onclick="openMeterIssueSearch()">بحث متقدم في مستندات الصرف</button> <button class="btn btn-gold" onclick="createMeterIssue()">＋ إنشاء طلب صرف</button>`)+`<div class="toolbar"><input id="issueSearch" class="search" placeholder="بحث بالسيريال أو كود العداد أو النوع أو الفورمان أو رقم المستند"><button class="btn btn-cyan" onclick="runMeterIssueSearch()">بحث</button></div><div id="issueSearchResults"></div>`+table(['رقم','المستند الداخلي','الفورمان','التاريخ','المستخدم','عدد العدادات','الإجراء'],rows.map(x=>[x.id,esc(x.doc_no),esc(x.foreman),esc(x.created_at),esc(x.username),fmt(x.line_count),`<button class="btn btn-dark" onclick="showDocumentDetail('meter-issue',${x.id})">التفاصيل / طباعة</button>`]));}
 else if(page==='meter-installs'){let rows=await api('/install-docs');root.innerHTML=pageHead('مستند تركيب عدادات','تسجيل تركيب عداد بعهدة الفورمان وإرساله للاعتماد',`<button class="btn btn-gold" onclick="createMeterInstall()">＋ تسجيل تركيب</button>`)+table(['رقم','المستند','الفورمان','C.R.N','التاريخ','المستخدم','عدد العدادات'],rows.map(x=>[x.id,esc(x.doc_no),esc(x.foreman),esc(x.crn),esc(x.created_at),esc(x.username),fmt(x.line_count),`<button class="btn btn-dark" onclick="showDocumentDetail('meter-install',${x.id})">التفاصيل / طباعة</button>`]));}
 else if(page==='documents'){let rows=await api('/document-register');window.documentRegisterRows=rows;root.innerHTML=pageHead('سجل المستندات الشامل','كل مستندات العدادات والخامات والعهدة وحركات المخزن في سجل موحد',`<button class="btn btn-gold" onclick="createMaterialReceipt()">＋ وارد خامات</button> <button class="btn btn-cyan" onclick="exportDocumentRegister()">تصدير السجل</button>`)+`<section class="panel"><div class="toolbar"><input id="docRegSearch" class="search" placeholder="بحث برقم المستند أو الفورمان أو النوع..."><select id="docRegKind" class="search"><option>الكل</option>${[...new Set(rows.map(x=>x.kind_label))].sort().map(x=>`<option>${esc(x)}</option>`).join('')}</select><span class="badge" id="docRegCount">${rows.length} مستند</span></div><div id="docRegTable"></div></section>`;renderDocumentRegisterRows();$('#docRegSearch').addEventListener('input',renderDocumentRegisterRows);$('#docRegKind').addEventListener('change',renderDocumentRegisterRows);}
 else if(page==='nov'){await renderNovemberArchive(root);}
 else if(page==='reports'||page==='advanced-reports'){renderReportCenter(page==='advanced-reports');}
 else if(page==='users'){
  let rows=await api('/users');
  root.innerHTML=pageHead('المستخدمون والصلاحيات','تحكم تفصيلي في حسابات المستخدمين والصفحات والعمليات المسموح بها',`<button class="btn btn-gold" onclick="addSystemUser()">＋ إضافة مستخدم</button>`)+
   `<section class="panel"><div class="panel-title"><h3>دليل المستخدمين</h3><span class="badge">${rows.length} حساب</span></div>
    <div class="table-wrap"><table><thead><tr><th>اسم المستخدم</th><th>رقم الأداء</th><th>الوظيفة</th><th>المستوى الوظيفي</th><th>نمط الصلاحيات</th><th>إدارة الحساب</th></tr></thead><tbody>
    ${rows.map(x=>`<tr><td><b>${esc(x.username)}</b></td><td>${esc(x.performance_number||'—')}</td><td>${esc(x.job_title||'—')}</td><td><span class="user-role">${esc(x.role_ar||roleArabic(x.role))}</span></td><td><span class="badge">${x.custom_permissions?'صلاحيات مخصصة':'صلاحيات الدور الافتراضية'}</span><small style="display:block;color:var(--muted);margin-top:4px">${(x.permissions||[]).length} صفحة مسموحة</small></td><td><div class="toolbar" style="gap:5px;flex-wrap:wrap"><button class="btn btn-gold" onclick="openUserPermissions('${esc(x.username)}',${JSON.stringify(x.permissions||[]).replaceAll('"','&quot;')},'${esc(x.role)}')">تخصيص الصلاحيات</button><button class="btn btn-dark" onclick="changeUserRole('${esc(x.username)}','${esc(x.role)}')">المسمى</button><button class="btn btn-cyan" onclick="editUserProfile('${esc(x.username)}','${esc(x.performance_number)}','${esc(x.job_title)}')">الملف</button><button class="btn btn-dark" onclick="resetUserPassword('${esc(x.username)}')">كلمة المرور</button><button class="btn btn-dark" onclick="renameSystemUser('${esc(x.username)}')">تغيير الاسم</button></div></td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="panel" style="margin-top:14px"><h3>مستويات المستخدمين</h3><div class="grid2">${Object.entries(ROLE_LABELS).map(([k,v])=>`<div class="perm-item"><b>${esc(v)}</b><span style="color:var(--muted)">— ${k==='Super Admin'?'تحكم كامل وإدارة المنظومة':k==='Manager'?'إدارة التشغيل والاعتمادات':k==='Storekeeper'?'المخزن والخامات والعهد':'صلاحيات تشغيل حسب الاختيارات'}</span></div>`).join('')}</div><p class="caption">يمكنك تخصيص الصفحات لكل حساب بشكل مستقل. يتم التحقق من الصلاحيات على الخادم أيضًا، ولا يعتمد الأمان على إخفاء الأزرار فقط.</p></section>`;
 }
 else if(page==='backup'){root.innerHTML=pageHead('النسخ الاحتياطي وحماية البيانات','تنزيل نسخة مستقلة وفحص سلامة قاعدة البيانات قبل الاحتفاظ بها')+`<section class="panel"><span class="badge">نسخ آمن عبر SQLite Backup API</span><p>يتم إنشاء نسخة متسقة من قاعدة البيانات. لا توجد استعادة تلقائية من هذه الصفحة لحماية بيانات التشغيل من الاستبدال الخطأ.</p><div class="toolbar"><button class="btn btn-gold" onclick="downloadBackup()">تنزيل نسخة احتياطية الآن</button><button class="btn btn-cyan" id="runBackupCheck">فحص سلامة قاعدة البيانات</button></div><div id="backupCheckResult" class="empty">اضغط فحص السلامة للتحقق من SQLite والعلاقات المرجعية وأعداد السجلات.</div></section>`;$('#runBackupCheck').onclick=async()=>{const el=$('#backupCheckResult');el.textContent='جارٍ فحص قاعدة البيانات...';try{const d=await api('/backup-check');el.innerHTML=`<div class="kpis"><div class="kpi"><div class="label">نتيجة الفحص</div><div class="value">${d.ok?'سليم':'يحتاج مراجعة'}</div></div><div class="kpi"><div class="label">أخطاء العلاقات</div><div class="value">${fmt(d.foreign_key_issues)}</div></div><div class="kpi"><div class="label">حجم القاعدة</div><div class="value">${fmt(d.database_bytes)} بايت</div></div></div><p>فحص SQLite: ${esc((d.integrity||[]).join('، '))} · وقت الفحص: ${esc(d.checked_at)}</p>`+table(['الجدول','عدد السجلات'],Object.entries(d.counts||{}).map(x=>[esc(x[0]),fmt(x[1])]));}catch(e){el.textContent=e.message}};}
 else if(page==='quality'){let rows=await api('/data-quality');root.innerHTML=pageHead('فحص سلامة البيانات','فحوصات قراءة فقط — اضغط على الفحص لعرض السجلات وتصديرها',`<button class="btn btn-dark" onclick="render('quality')">تحديث الفحوصات</button>`)+table(['الفحص','عدد الحالات','التفاصيل'],rows.map(x=>[esc(x.check),fmt(x.count),`<button class="btn btn-cyan" onclick="openDiagnosticDetail('${esc(x.key)}','${esc(x.check)}')">عرض التفاصيل</button>`]));}
 else if(page==='alerts'){let rows=await api('/alerts');let active=rows.filter(x=>Number(x.count)>0);let urgent=active.filter(x=>x.level==='عاجل').reduce((a,x)=>a+Number(x.count),0);let total=active.reduce((a,x)=>a+Number(x.count),0);root.innerHTML=pageHead('مركز التنبيهات الذكية','مراجعة للقراءة فقط — فتح التفاصيل لا يغير الأرصدة أو المستندات',`<button class="btn btn-dark" onclick="render('alerts')">تحديث التنبيهات</button>`)+`<section class="kpis"><div class="kpi"><div class="label">أنواع تنبيهات نشطة</div><div class="value">${active.length}</div></div><div class="kpi"><div class="label">سجلات تحتاج مراجعة</div><div class="value">${total}</div></div><div class="kpi"><div class="label">حالات عاجلة</div><div class="value">${urgent}</div></div></section>`+table(['المستوى','التنبيه','عدد السجلات','التفاصيل'],rows.map(x=>[`<span class="badge ${x.level==='عاجل'?'red':x.level==='تحذير'?'gold':''}">${esc(x.level)}</span>`,esc(x.alert),fmt(x.count),Number(x.count)?`<button class="btn btn-cyan" onclick="openDiagnosticDetail('${esc(x.key)}','${esc(x.alert)}')">فتح التفاصيل</button>`:'—']));if(!active.length)root.innerHTML+=`<div class="empty">لا توجد تنبيهات نشطة حاليًا وفق الفحوص المتاحة.</div>`;}
 else if(page==='performance'){let d=await api('/dashboard');root.innerHTML=pageHead('أداء وسرعة المنظومة','مؤشرات حجم البيانات الحالية')+table(['المؤشر','القيمة'],[['عدد الأصناف',fmt(d.items_count)],['عدد الفورمانات',fmt(d.foremen_count)],['عدد الحركات',fmt(d.movement_count)],['حالة API','متصل']] );}
 else if(page==='audit'){
 root.innerHTML=pageHead('سجل العمليات والمراقبة','سجل التدقيق مع البحث والتصفية حسب المستخدم والعملية والفترة',`<button class="btn btn-cyan" id="exportAudit">تصدير CSV</button>`)+
 `<section class="panel"><div class="toolbar"><input id="auditTerm" class="search" placeholder="بحث بالمستخدم أو العملية أو الجدول أو المفتاح"><select id="auditAction" class="search"><option value="">كل العمليات</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option><option>USER_CREATED</option><option>USER_ROLE_CHANGED</option></select><input id="auditFrom" class="search" type="date" title="من تاريخ"><input id="auditTo" class="search" type="date" title="إلى تاريخ"><button class="btn btn-gold" id="runAuditSearch">بحث</button></div><div class="eyebrow" id="auditSummary">جارٍ تحميل السجل...</div><div id="auditTable"></div></section>`;
 window.auditRows=[];
 window.loadAuditRows=async()=>{try{const q=$('#auditTerm').value||'',a=$('#auditAction').value||'',f=$('#auditFrom').value||'',t=$('#auditTo').value||'';const rows=await api('/audit?q='+encodeURIComponent(q)+'&action='+encodeURIComponent(a)+'&from='+encodeURIComponent(f)+'&to='+encodeURIComponent(t)+'&limit=10000');window.auditRows=rows;$('#auditSummary').textContent='عدد السجلات المعروضة: '+fmt(rows.length)+' · يتم عرض أحدث 10,000 سجل كحد أقصى';$('#auditTable').innerHTML=table(['رقم','التاريخ','المستخدم','العملية','الجدول','مفتاح السجل'],rows.map(x=>[x.id,esc(x.created_at),esc(x.actor),esc(x.action),esc(x.table_name),esc(x.record_key)]));}catch(e){$('#auditSummary').textContent=e.message;$('#auditTable').innerHTML=''}};
 $('#runAuditSearch').onclick=window.loadAuditRows;$('#auditTerm').addEventListener('keydown',e=>{if(e.key==='Enter')window.loadAuditRows()});$('#exportAudit').onclick=()=>downloadCsvFile('EGYPT_GAS_Audit_Log.csv',[['رقم','التاريخ','المستخدم','العملية','الجدول','مفتاح السجل'],...(window.auditRows||[]).map(x=>[x.id,x.created_at,x.actor,x.action,x.table_name,x.record_key])]);await window.loadAuditRows();
 }
 }catch(e){root.innerHTML=pageHead('تعذر تحميل الصفحة',e.message)+`<button class="btn btn-dark" onclick="render('${page}')">إعادة المحاولة</button>`}}




async function addForeman(){openModal('إضافة فورمان',[{name:'name',label:'اسم الفورمان'},{name:'performance_no',label:'رقم الأداء',required:false},{name:'mobile',label:'رقم الهاتف',required:false}],d=>api('/foreman-admin',{method:'POST',body:JSON.stringify({...d,action:'create'})}));}
async function editForeman(old_name,performance_no,mobile){openModal('تعديل بيانات الفورمان',[{name:'name',label:'اسم الفورمان',defaultValue:old_name},{name:'performance_no',label:'رقم الأداء',defaultValue:performance_no,required:false},{name:'mobile',label:'رقم الهاتف',defaultValue:mobile,required:false}],d=>api('/foreman-admin',{method:'POST',body:JSON.stringify({...d,old_name,action:'update'})}));}
async function deleteForeman(name){if(!confirm('تأكيد حذف الفورمان '+name+'؟ لن يسمح النظام بالحذف إذا كان مرتبطًا بأي سجلات أو عدادات.'))return;try{await api('/foreman-admin',{method:'POST',body:JSON.stringify({action:'delete',old_name:name})});toast('تم حذف الفورمان');await render('foremen')}catch(e){toast(e.message)}}
async function addDamagedMaterial(){let items=await api('/items');openModal('إضافة خامة تالفة',[{name:'code',label:'الخامة',options:items.map(x=>({value:x.code,label:x.code+' | '+x.name}))},{name:'qty',label:'الكمية التالفة',type:'number'},{name:'notes',label:'ملاحظات / سبب التلف',required:false}],d=>api('/damaged-material-admin',{method:'POST',body:JSON.stringify({...d,action:'create'})}));}
async function editDamagedMaterial(id,code,qty,notes){let items=await api('/items');openModal('تعديل سجل خامة تالفة',[{name:'code',label:'الخامة',defaultValue:code,options:items.map(x=>({value:x.code,label:x.code+' | '+x.name}))},{name:'qty',label:'الكمية التالفة',type:'number',defaultValue:qty},{name:'notes',label:'ملاحظات',defaultValue:notes,required:false}],d=>api('/damaged-material-admin',{method:'POST',body:JSON.stringify({...d,id,action:'update'})}));}
async function deleteDamagedMaterial(id){if(!confirm('حذف سجل الخامة التالفة المحدد؟'))return;try{await api('/damaged-material-admin',{method:'POST',body:JSON.stringify({id,action:'delete'})});toast('تم حذف السجل');await render('damaged')}catch(e){toast(e.message)}}

async function addMeterType(){openModal('إضافة نوع عداد',[{name:'name',label:'اسم نوع العداد'},{name:'capacity',label:'السعة'},{name:'meter_code',label:'كود العداد'}],d=>api('/meter-type-admin',{method:'POST',body:JSON.stringify({...d,action:'create'})}));}
async function editMeterType(old_name,capacity,meter_code=''){openModal('تعديل نوع عداد',[{name:'name',label:'اسم النوع',defaultValue:old_name},{name:'capacity',label:'السعة',defaultValue:capacity},{name:'meter_code',label:'كود العداد',defaultValue:meter_code}],d=>api('/meter-type-admin',{method:'POST',body:JSON.stringify({...d,old_name,action:'update'})}));}
async function toggleMeterType(name){try{await api('/meter-type-admin',{method:'POST',body:JSON.stringify({action:'toggle',name})});toast('تم تحديث حالة النوع');await render('meter-types')}catch(e){toast(e.message)}}
async function addSystemUser(){
 openModal('إضافة مستخدم جديد',[
  {name:'username',label:'اسم المستخدم'},
  {name:'password',label:'كلمة المرور (6 أحرف على الأقل)',type:'password'},
  {name:'role',label:'المسمى الوظيفي والصلاحية',options:Object.entries(ROLE_LABELS).map(([value,label])=>({value,label})),defaultValue:'Viewer'},
  {name:'performance_number',label:'رقم الأداء',required:false},
  {name:'job_title',label:'الوظيفة',required:false}
 ],d=>api('/user-admin',{method:'POST',body:JSON.stringify({...d,action:'create'})}));
}
async function changeUserRole(username,current){
 openModal('تعديل المسمى الوظيفي – '+username,[{name:'role',label:'المسمى الوظيفي',defaultValue:current,options:Object.entries(ROLE_LABELS).map(([value,label])=>({value,label}))}],d=>api('/user-admin',{method:'POST',body:JSON.stringify({...d,username,action:'role'})}));
}
function openUserPermissions(username,permissions,role){
 const selected=new Set(permissions||[]),locked=role==='Super Admin';
 $('#modalForm').classList.add('wide');
 $('#modalTitle').textContent='تخصيص صلاحيات المستخدم – '+username;
 $('#modalFields').innerHTML=`<div class="panel" style="margin-bottom:12px"><div class="toolbar"><b>حدد الصفحات التي يسمح لهذا المستخدم بفتحها</b><span class="spacer"></span><button class="btn btn-cyan" type="button" onclick="setAllUserPermissions(true)">تحديد الكل</button><button class="btn btn-dark" type="button" onclick="setAllUserPermissions(false)">إلغاء الكل</button></div><p class="caption">يمكنك منح صلاحيات مختلفة لكل مستخدم. منع الصفحة يمنع كذلك الوصول إلى عملياتها وبياناتها المحمية من الخادم.</p></div>
 <div class="perm-groups">${PAGE_PERMISSION_GROUPS.map((g,idx)=>`<section class="perm-group"><h4>${g.title}<button type="button" class="btn btn-dark" style="padding:4px 8px;font-size:11px" onclick="togglePermissionGroup(${idx},true)">تحديد المجموعة</button></h4><div class="perm-list">${g.pages.map(([key,label])=>`<label class="perm-item"><input class="perm-check" type="checkbox" data-perm="${key}" ${selected.has(key)?'checked':''} ${locked?'disabled':''}>${label}</label>`).join('')}</div></section>`).join('')}</div>
 ${locked?'<p class="caption">حساب مدير النظام الأعلى يحتفظ بكامل الصلاحيات لحماية إدارة المنظومة.</p>':''}`;
 document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-gold" type="submit" ${locked?'disabled':''}>حفظ الصلاحيات</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>`;
 $('#modalBack').style.display='flex';
 $('#modalForm').onsubmit=async e=>{
  e.preventDefault();if(locked)return;
  const chosen=[...document.querySelectorAll('.perm-check:checked')].map(x=>x.dataset.perm);
  try{
   await api('/user-admin',{method:'POST',body:JSON.stringify({action:'permissions',username,permissions:chosen})});
   if(currentUser?.username===username){currentUser=await api('/me');applyPagePermissions()}
   closeModal();toast('تم حفظ صلاحيات المستخدم وتفعيلها على الخادم');await render('users');
  }catch(err){toast(err.message)}
 };
}
function setAllUserPermissions(on){document.querySelectorAll('.perm-check:not(:disabled)').forEach(x=>x.checked=on)}
function togglePermissionGroup(idx,on){const g=PAGE_PERMISSION_GROUPS[idx];if(!g)return;g.pages.forEach(([key])=>{const el=document.querySelector(`.perm-check[data-perm="${key}"]`);if(el&&!el.disabled)el.checked=on})}
async function editUserProfile(username,performance_number,job_title){openModal('بيانات المستخدم '+username,[{name:'performance_number',label:'رقم الأداء',defaultValue:performance_number,required:false},{name:'job_title',label:'الوظيفة',defaultValue:job_title,required:false}],d=>api('/user-admin',{method:'POST',body:JSON.stringify({...d,username,action:'profile'})}));}
async function resetUserPassword(username){let password=prompt('اكتب كلمة المرور الجديدة (6 أحرف على الأقل):');if(password===null)return;try{await api('/user-admin',{method:'POST',body:JSON.stringify({action:'password',username,password})});toast('تم تحديث كلمة المرور')}catch(e){toast(e.message)}}
async function renameSystemUser(username){let new_username=prompt('اسم المستخدم الجديد:',username);if(!new_username||new_username===username)return;try{await api('/user-admin',{method:'POST',body:JSON.stringify({action:'rename',username,new_username})});toast('تم تغيير اسم المستخدم');await render('users')}catch(e){toast(e.message)}}
function downloadBackup(){window.location.href='/api/backup'}

function parseSerialLines(raw,defaultCode=''){return raw.split(/[\r\n]+/).map(x=>x.trim()).filter(Boolean).map(line=>{let a=line.split(/\t|,/);return {serial:(a[0]||'').trim(),meter_code:(a[1]||defaultCode).trim()}})}
async function createMeterReceipt(){
 $('#modalForm').classList.add('wide');
 try{
  const types=await api('/meter-types'),active=types.filter(x=>x.active);
  if(!active.length){toast('لا توجد أنواع عدادات نشطة');return}
  $('#modalTitle').textContent='مستند وارد عدادات – تسجيل جماعي احترافي';
  $('#modalFields').innerHTML=`<div class="kpis">
    <div class="kpi"><div class="label">نوع العداد</div><div class="value" id="receiptTypeSummary">${esc(active[0].name)}</div><small id="receiptTypeCodeSummary" style="color:var(--gold);display:block;margin-top:5px">كود: ${esc(active[0].meter_code||"غير محدد")}</small></div>
    <div class="kpi"><div class="label">حالة سليمة</div><div class="value" id="receiptGoodCount">0</div></div>
    <div class="kpi"><div class="label">تالف</div><div class="value" id="receiptDamagedCount">0</div></div>
    <div class="kpi"><div class="label">مرتجع للمخزن</div><div class="value" id="receiptReturnedCount">0</div></div>
   </div>
   <div class="grid2">
    <div class="field"><label>رقم مستند الوارد</label><input id="receiptDocNo" class="search" required placeholder="أدخل رقم المستند"></div>
    <div class="field"><label>نوع العداد</label><select id="receiptType" class="search" onchange="updateReceiptTypeSummary()">${active.map(x=>`<option value="${esc(x.name)}" data-meter-code="${esc(x.meter_code||'')}">${esc(x.name+' | '+(x.capacity||'')+(x.meter_code?' | كود: '+x.meter_code:''))}</option>`).join('')}</select></div>
    <div class="field"><label>جهة / مخزن الوارد</label><input id="receiptOrigin" class="search" placeholder="مثال: مخزن شبرا – مخزن المنطقة الثانية" required></div>
    <div class="field"><label>ملاحظات المستند</label><input id="receiptNotes" class="search" placeholder="اختياري"></div>
   </div>
   <section class="panel" style="margin-top:10px">
    <div class="panel-title"><h3>تجهيز عدد صفوف العدادات</h3><span class="badge">إدخال جماعي حتى 10,000 صف</span></div>
    <div class="toolbar" style="align-items:end;gap:10px;flex-wrap:wrap">
     <div class="field" style="min-width:170px;max-width:220px;margin:0"><label>عدد الصفوف المطلوب</label><input id="receiptRowsToCreate" class="search" type="number" min="1" max="10000" value="100"></div>
     <button class="btn btn-cyan" type="button" onclick="generateReceiptRows()">إنشاء العدد المحدد من الصفوف</button>
     <button class="btn btn-dark" type="button" onclick="addReceiptMeterRow()">＋ إضافة صف واحد</button>
     <span class="spacer"></span><span class="badge" id="receiptRowCount">0 صف</span>
    </div>
   </section>
   <div class="toolbar" style="margin-top:14px"><b>بنود مستند الوارد</b><span class="spacer"></span><input id="receiptRowsSearch" class="search" style="max-width:260px" placeholder="بحث داخل الصفوف..." oninput="filterReceiptRows()"></div>
   <div class="table-wrap receipt-lines-wrap"><table class="receipt-lines-table"><thead><tr><th>م</th><th>سيريال العداد</th><th>كود العداد</th><th>حالة العداد</th><th>إجراء</th></tr></thead><tbody id="receiptMeterRows"></tbody></table></div>
   <div class="caption">السليم والمرتجع للمخزن يدخلان رصيد المخزن المتاح بعد الاعتماد. العداد التالف يسجل بحالة مستقلة ولا يظهر ضمن العدادات الجاهزة للصرف.</div>`;
  window.receiptMeterRows=0;window.receiptAutoCode=active[0].meter_code||'';generateReceiptRows();
  document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-cyan" type="button" onclick="previewReceiptDocument()">معاينة المستند</button><button class="btn btn-gold" type="button" onclick="submitMeterReceipt()">حفظ وإرسال للاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>`;
  $('#modalBack').style.display='flex';
 }catch(e){toast(e.message)}
}
function receiptRowHtml(i,serial='',code='',condition='سليم'){
 return `<tr data-receipt-row="${i}"><td>${i}</td><td><input class="search" data-receipt-serial="${i}" value="${esc(serial)}" placeholder="سيريال العداد"></td><td><input class="search" data-receipt-code="${i}" value="${esc(code)}" placeholder="كود العداد"></td><td><select class="search" data-receipt-condition="${i}" onchange="updateReceiptSummary()"><option value="سليم" ${condition==='سليم'?'selected':''}>سليم – جاهز للمخزن</option><option value="تالف" ${condition==='تالف'?'selected':''}>تالف – عزل عن الصرف</option><option value="مرتجع للمخزن" ${condition==='مرتجع للمخزن'?'selected':''}>مرتجع للمخزن</option></select></td><td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove();updateReceiptSummary()">حذف</button></td></tr>`;
}
function generateReceiptRows(){
 const n=Number($('#receiptRowsToCreate')?.value||0);
 if(!Number.isInteger(n)||n<1||n>10000){toast('عدد الصفوف يجب أن يكون من 1 إلى 10,000');return}
 const body=$('#receiptMeterRows');if(!body)return;
 const existing=[...body.querySelectorAll('tr')].map(tr=>{const i=tr.dataset.receiptRow;return {serial:tr.querySelector(`[data-receipt-serial="${i}"]`)?.value||'',code:tr.querySelector(`[data-receipt-code="${i}"]`)?.value||'',condition:tr.querySelector(`[data-receipt-condition="${i}"]`)?.value||'سليم'}});
 const target=Math.max(n,existing.length);let html='';
 const defaultCode=$('#receiptType')?.selectedOptions[0]?.dataset.meterCode||'';for(let i=1;i<=target;i++){const x=existing[i-1]||{};html+=receiptRowHtml(i,x.serial||'',x.code||defaultCode,x.condition||'سليم')}
 body.innerHTML=html;window.receiptMeterRows=target;$('#receiptRowsToCreate').value=target;updateReceiptSummary();
}
function addReceiptMeterRow(serial='',code='',condition='سليم'){
 const body=$('#receiptMeterRows');if(!body)return;
 if(body.children.length>=10000){toast('وصلت للحد الأقصى 10,000 صف في المستند');return}
 const i=body.children.length+1;const defaultCode=$('#receiptType')?.selectedOptions[0]?.dataset.meterCode||'';body.insertAdjacentHTML('beforeend',receiptRowHtml(i,serial,code||defaultCode,condition));window.receiptMeterRows=i;$('#receiptRowsToCreate').value=i;updateReceiptSummary();
}
function updateReceiptTypeSummary(){
 const select=$('#receiptType'),x=$('#receiptTypeSummary');
 if(x)x.textContent=select.value;
 const previous=window.receiptAutoCode||'';
 const code=select.selectedOptions[0]?.dataset.meterCode||'';
 const codeSummary=$('#receiptTypeCodeSummary');if(codeSummary)codeSummary.textContent='كود: '+(code||'لم يتم تحديد كود لهذا النوع');
 document.querySelectorAll('#receiptMeterRows tr').forEach(tr=>{
  const i=tr.dataset.receiptRow,input=tr.querySelector(`[data-receipt-code="${i}"]`);
  if(input&&(!input.value.trim()||input.value===previous))input.value=code;
 });
 window.receiptAutoCode=code;
 updateReceiptSummary();
}
function updateReceiptSummary(){
 const rows=[...document.querySelectorAll('#receiptMeterRows tr')];let good=0,damaged=0,returned=0,filled=0;
 rows.forEach(tr=>{const i=tr.dataset.receiptRow,serial=tr.querySelector(`[data-receipt-serial="${i}"]`)?.value.trim(),code=tr.querySelector(`[data-receipt-code="${i}"]`)?.value.trim(),state=tr.querySelector(`[data-receipt-condition="${i}"]`)?.value;if(serial||code)filled++;if(state==='تالف')damaged++;else if(state==='مرتجع للمخزن')returned++;else good++});
 $('#receiptRowCount').textContent=rows.length.toLocaleString('en-US')+' صف · '+filled.toLocaleString('en-US')+' مكتمل جزئيًا';
 $('#receiptGoodCount').textContent=good.toLocaleString('en-US');$('#receiptDamagedCount').textContent=damaged.toLocaleString('en-US');$('#receiptReturnedCount').textContent=returned.toLocaleString('en-US');
}
function filterReceiptRows(){
 const q=($('#receiptRowsSearch')?.value||'').trim().toLowerCase();
 document.querySelectorAll('#receiptMeterRows tr').forEach(tr=>{tr.style.display=!q||tr.textContent.toLowerCase().includes(q)||[...tr.querySelectorAll('input')].some(x=>x.value.toLowerCase().includes(q))?'':'none'});
}
function collectReceiptEntries(){
 return [...document.querySelectorAll('#receiptMeterRows tr')].map(tr=>{const i=tr.dataset.receiptRow;return {serial:tr.querySelector(`[data-receipt-serial="${i}"]`).value.trim(),meter_code:tr.querySelector(`[data-receipt-code="${i}"]`).value.trim(),condition:tr.querySelector(`[data-receipt-condition="${i}"]`).value}}).filter(x=>x.serial||x.meter_code);
}
function previewReceiptDocument(){
 const entries=collectReceiptEntries();if(!entries.length){toast('أضف سيريالًا واحدًا على الأقل');return}
 const rows=entries.map((x,i)=>[i+1,esc(x.serial),esc(x.meter_code),esc(x.condition)]);
 printReportWindow('معاينة مستند وارد عدادات – '+($('#receiptDocNo').value||'بدون رقم'),'<p>رقم المستند: '+esc($('#receiptDocNo').value)+'</p><p>التاريخ: '+new Date().toLocaleDateString('ar-EG')+'</p><p>جهة الوارد: '+esc($('#receiptOrigin').value)+'</p><p>نوع العداد: '+esc($('#receiptType').value)+'</p>'+table(['م','السيريال','كود العداد','الحالة'],rows));
}
async function submitMeterReceipt(){
 try{
  const entries=collectReceiptEntries(),serials=entries.map(x=>x.serial);
  if(!$('#receiptDocNo').value.trim()||!$('#receiptOrigin').value.trim()||!entries.length||entries.some(x=>!x.serial||!x.meter_code))throw new Error('أكمل رقم المستند وجهة الوارد والسيريال والكود لكل صف مستخدم');
  if(new Set(serials).size!==serials.length)throw new Error('يوجد سيريال مكرر داخل المستند');
  if(!confirm('سيتم إرسال '+entries.length.toLocaleString('en-US')+' عدادًا للمراجعة والاعتماد. هل تريد المتابعة؟'))return;
  await api('/meter-receipts',{method:'POST',body:JSON.stringify({doc_no:$('#receiptDocNo').value.trim(),meter_type:$('#receiptType').value,notes:$('#receiptNotes').value,origin:$('#receiptOrigin').value.trim(),entries})});
  closeModal();toast('تم إنشاء مستند الوارد وإرساله للاعتماد');await render('meter-receipts');
 }catch(e){toast(e.message)}
}

async function createMeterIssue(){
 $('#modalForm').classList.add('wide');
 try{
  const [foremen,stock,types]=await Promise.all([api('/foremen'),api('/meter-stock'),api('/meter-types')]);
  if(!foremen.length){toast('لا يوجد فورمان مسجل');return}
  if(!stock.length){toast('لا توجد عدادات متاحة بالمخزن للصرف');return}
  const active=types.filter(x=>x.active);
  $('#modalTitle').textContent='مستند صرف عدادات – اختيار الفورمان والعدادات من المخزن';
  $('#modalFields').innerHTML=`<div class="grid2">
   <div class="field"><label>الفورمان المستلم</label><select id="issueForeman" class="search">${foremen.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></div>
   <div class="field"><label>عدد العدادات / عدد الصفوف</label><div class="toolbar"><input id="issueRowCountInput" class="search" type="number" min="1" max="200" value="1" style="max-width:140px"><button class="btn btn-cyan" type="button" onclick="generateIssueRows()">تكوين الصفوف</button></div></div>
   </div>
   <div class="field"><label>ملاحظات مستند الصرف</label><input id="issueNotes" class="search" placeholder="اختياري"></div>
   <div class="toolbar"><b>بنود الصرف</b><span class="spacer"></span><span class="badge" id="issueSelectedCount">0 عداد محدد</span></div>
   <div class="table-wrap"><table><thead><tr><th>م</th><th>اسم / نوع العداد</th><th>كود العداد</th><th>رقم العداد بالمخزن</th><th>إزالة</th></tr></thead><tbody id="issueRows"></tbody></table></div>
   <section class="panel" style="margin-top:14px"><div class="panel-title"><h3>أرقام العدادات المتاحة بالمخزن</h3><span class="badge">${stock.length} عداد متاح</span></div>
    <div class="toolbar"><input id="issueStockSearch" class="search" placeholder="ابحث بالسيريال أو النوع أو الكود..." oninput="filterIssueStock()"><select id="issueStockTypeFilter" class="search" onchange="filterIssueStock()"><option value="">كل الأنواع</option>${active.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></div>
    <div id="issueStockList">${renderIssueStockTable(stock)}</div>
   </section>`;
  window.issueStock=stock;window.issueTypes=active;window.issueRowCounter=0;
  generateIssueRows();
  document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-cyan" type="button" onclick="previewMeterIssue()">معاينة مستند الصرف</button><button class="btn btn-gold" type="button" onclick="submitMeterIssue()">حفظ وإرسال للاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>`;
  $('#modalBack').style.display='flex';
 }catch(e){toast(e.message)}
}
function renderIssueStockTable(rows){
 return rows.length?table(['السيريال / رقم المخزن','نوع العداد','السعة','كود العداد'],rows.map(x=>[
  `<b>${esc(x.serial)}</b>`,esc(x.meter_type),esc(x.capacity),`<b style="color:var(--gold)">${esc(x.meter_code||'—')}</b>`
 ])):'لا توجد أرقام مطابقة للبحث';
}
function filterIssueStock(){
 const q=($('#issueStockSearch')?.value||'').trim().toLowerCase(),typ=$('#issueStockTypeFilter')?.value||'';
 const rows=(window.issueStock||[]).filter(x=>(!typ||x.meter_type===typ)&&(!q||[x.serial,x.meter_type,x.capacity,x.meter_code].some(v=>String(v||'').toLowerCase().includes(q))));
 $('#issueStockList').innerHTML=renderIssueStockTable(rows);
}
function issueTypeCodes(type){
 return [...new Set((window.issueStock||[]).filter(x=>x.meter_type===type).map(x=>String(x.meter_code||'').trim()).filter(Boolean))].sort();
}
function issueTypeSerials(type,code){
 return (window.issueStock||[]).filter(x=>x.meter_type===type&&(!code||String(x.meter_code||'')===code));
}
function generateIssueRows(){
 const count=Number($('#issueRowCountInput')?.value||1);
 if(!Number.isInteger(count)||count<1||count>200){toast('عدد الصفوف يجب أن يكون من 1 إلى 200');return}
 const body=$('#issueRows');if(!body)return;
 window.issueRowCounter=0;body.innerHTML='';
 for(let i=0;i<count;i++)addIssueMeterRow();
 updateIssueSelectedCount();
}
function addIssueMeterRow(){
 const body=$('#issueRows');if(!body)return;const i=++window.issueRowCounter;
 const types=window.issueTypes||[];
 body.insertAdjacentHTML('beforeend',`<tr data-issue-row="${i}">
  <td>${i}</td>
  <td><select class="search" data-issue-type="${i}" onchange="issueTypeChanged(${i})"><option value="">اختر نوع العداد</option>${types.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></td>
  <td><select class="search" data-issue-code="${i}" onchange="issueCodeChanged(${i})"><option value="">يُحدد حسب النوع</option></select></td>
  <td><select class="search" data-issue-serial="${i}" onchange="issueSerialChanged(${i})"><option value="">اختر رقم من المخزن</option></select></td>
  <td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove();renumberIssueRows();updateIssueSelectedCount()">حذف</button></td>
 </tr>`);
}
function issueTypeChanged(i){
 const type=document.querySelector(`[data-issue-type="${i}"]`)?.value||'',codeEl=document.querySelector(`[data-issue-code="${i}"]`),serialEl=document.querySelector(`[data-issue-serial="${i}"]`);
 if(!codeEl||!serialEl)return;
 const codes=issueTypeCodes(type);
 codeEl.innerHTML=`<option value="">اختر كود العداد</option>${codes.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}`;
 if(codes.length===1)codeEl.value=codes[0];
 refreshIssueSerialOptions(i);updateIssueSelectedCount();
}
function issueCodeChanged(i){refreshIssueSerialOptions(i);updateIssueSelectedCount()}
function refreshIssueSerialOptions(i,selected=''){
 const type=document.querySelector(`[data-issue-type="${i}"]`)?.value||'',code=document.querySelector(`[data-issue-code="${i}"]`)?.value||'',serialEl=document.querySelector(`[data-issue-serial="${i}"]`);
 if(!serialEl)return;
 const used=collectIssueEntries().filter(x=>x.row!==i).map(x=>x.serial);
 const rows=issueTypeSerials(type,code).filter(x=>!used.includes(x.serial));
 serialEl.innerHTML=`<option value="">اختر رقم من المخزن (${rows.length} متاح)</option>${rows.map(x=>`<option value="${esc(x.serial)}" ${x.serial===selected?'selected':''}>${esc(x.serial+' | '+x.meter_code)}</option>`).join('')}`;
 if(selected)serialEl.value=selected;
}
function issueSerialChanged(i){
 const serial=document.querySelector(`[data-issue-serial="${i}"]`)?.value||'',m=(window.issueStock||[]).find(x=>x.serial===serial);
 if(m){
  const t=document.querySelector(`[data-issue-type="${i}"]`),c=document.querySelector(`[data-issue-code="${i}"]`);
  t.value=m.meter_type;issueTypeChanged(i);c.value=m.meter_code||'';refreshIssueSerialOptions(i,serial);
 }
 document.querySelectorAll('#issueRows tr').forEach(tr=>{const other=Number(tr.dataset.issueRow);if(other!==i){const el=tr.querySelector(`[data-issue-serial="${other}"]`);const keep=el?.value||'';refreshIssueSerialOptions(other,keep)}});
 updateIssueSelectedCount();
}
function collectIssueEntries(){
 return [...document.querySelectorAll('#issueRows tr')].map(tr=>{
  const i=Number(tr.dataset.issueRow),serial=tr.querySelector(`[data-issue-serial="${i}"]`)?.value||'';
  return {row:i,type:tr.querySelector(`[data-issue-type="${i}"]`)?.value||'',meter_code:tr.querySelector(`[data-issue-code="${i}"]`)?.value||'',serial};
 });
}
function renumberIssueRows(){
 document.querySelectorAll('#issueRows tr').forEach((tr,index)=>{
  const old=Number(tr.dataset.issueRow),next=index+1;tr.dataset.issueRow=next;tr.cells[0].textContent=next;
  ['type','code','serial'].forEach(k=>{const el=tr.querySelector(`[data-issue-${k}="${old}"]`);if(el)el.dataset['issue'+k[0].toUpperCase()+k.slice(1)]=next});
 });
 window.issueRowCounter=document.querySelectorAll('#issueRows tr').length;
 document.querySelectorAll('#issueRows tr').forEach(tr=>{const i=Number(tr.dataset.issueRow),el=tr.querySelector(`[data-issue-serial="${i}"]`);refreshIssueSerialOptions(i,el?.value||'')});
}
function updateIssueSelectedCount(){
 const rows=collectIssueEntries(),selected=rows.filter(x=>x.serial).length;
 if($('#issueSelectedCount'))$('#issueSelectedCount').textContent=selected+' من '+rows.length+' عداد محدد';
}
function previewMeterIssue(){
 const rows=collectIssueEntries().filter(x=>x.serial);
 if(!rows.length){toast('اختر رقم عداد واحدًا على الأقل من المخزن');return}
 printReportWindow('معاينة مستند صرف عدادات','<p>الفورمان المستلم: '+esc($('#issueForeman').value)+'</p><p>عدد العدادات: '+rows.length+'</p>'+table(['م','السيريال','نوع العداد','كود العداد'],rows.map((x,i)=>[i+1,esc(x.serial),esc(x.type),esc(x.meter_code)])));
}
async function submitMeterIssue(){
 try{
  const rows=collectIssueEntries(),entries=rows.filter(x=>x.serial);
  if(!$('#issueForeman').value)throw new Error('اختر الفورمان المستلم');
  if(entries.length!==rows.length)throw new Error('أكمل اختيار العداد في كل صف أو احذف الصف غير المستخدم');
  if(!entries.length)throw new Error('أضف عدادًا واحدًا على الأقل');
  if(new Set(entries.map(x=>x.serial)).size!==entries.length)throw new Error('لا يمكن اختيار نفس السيريال أكثر من مرة');
  if(entries.some(x=>!x.type||!x.meter_code))throw new Error('تأكد من اختيار نوع العداد وكوده');
  const result=await api('/meter-issues',{method:'POST',body:JSON.stringify({foreman:$('#issueForeman').value,notes:$('#issueNotes').value,serials:entries.map(x=>x.serial)})});
  closeModal();toast('تم إنشاء طلب صرف '+result.count+' عداد وإرساله للاعتماد');await render('meter-issues');
 }catch(e){toast(e.message)}
}

async function createMeterInstall(){
 $('#modalForm').classList.add('wide');
 try{
  const [foremen,meters]=await Promise.all([api('/foremen'),api('/meters')]),custody=meters.filter(x=>x.status==='CUSTODY');
  if(!custody.length){toast('لا توجد عدادات بعهدة الفورمان للتركيب');return}
  $('#modalTitle').textContent='مستند تركيب عدادات – متعدد الصفوف';
  $('#modalFields').innerHTML=`<div class="field"><label>رقم مستند التركيب</label><input id="installDocNo" class="search" required></div>
   <div class="field"><label>الفورمان</label><select id="installForeman" class="search">${foremen.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></div>
   <div class="field"><label>ملاحظات</label><input id="installNotes" class="search"></div>
   <div class="toolbar"><b>عدادات المستند</b><span class="spacer"></span><button class="btn btn-cyan" type="button" onclick="addInstallMeterRow()">＋ إضافة سيريال</button><span class="badge" id="installRowCount">1 صف</span></div>
   <div class="table-wrap"><table><thead><tr><th>م</th><th>السيريال</th><th>C.R.N لكل عداد</th><th>الحالة / الفورمان</th><th>حذف</th></tr></thead><tbody id="installMeterRows"></tbody></table></div>
   <div class="caption">كل سيريال له C.R.N مستقل. المستند متعدد العدادات ويخضع لاعتماد واحد، ولا تتغير حالة العدادات قبل الاعتماد.</div>`;
  window.installMeterRows=0;window.installCustody=custody;addInstallMeterRow();
  document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-cyan" type="button" onclick="previewInstallDocument()">معاينة المستند</button><button class="btn btn-gold" type="button" onclick="submitMeterInstall()">حفظ وإرسال للاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>`;
  $('#modalBack').style.display='flex';
 }catch(e){toast(e.message)}
}
function addInstallMeterRow(serial=''){
 const body=$('#installMeterRows');if(!body)return;const i=++window.installMeterRows;
 body.insertAdjacentHTML('beforeend',`<tr data-install-row="${i}"><td>${i}</td><td><select class="search" data-install-serial="${i}"><option value="">اختر السيريال</option>${(window.installCustody||[]).map(x=>`<option value="${esc(x.serial)}" ${x.serial===serial?'selected':''}>${esc(x.serial+' | '+x.meter_type+' | '+x.foreman)}</option>`).join('')}</select></td><td><input class="search" data-install-crn="${i}" placeholder="C.R.N"></td><td><span class="caption">بعهدة الفورمان المحدد</span></td><td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove();updateInstallRowCount()">حذف</button></td></tr>`);
 updateInstallRowCount();
}
function updateInstallRowCount(){$('#installRowCount').textContent=document.querySelectorAll('#installMeterRows tr').length+' صف'}
function collectInstallEntries(){
 return [...document.querySelectorAll('#installMeterRows tr')].map(tr=>{const i=tr.dataset.installRow;return {serial:tr.querySelector(`[data-install-serial="${i}"]`).value,crn:tr.querySelector(`[data-install-crn="${i}"]`).value.trim()}}).filter(x=>x.serial||x.crn);
}
function previewInstallDocument(){
 const entries=collectInstallEntries();if(!entries.length){toast('أضف عدادًا واحدًا على الأقل');return}
 printReportWindow('معاينة مستند تركيب عدادات – '+($('#installDocNo').value||'بدون رقم'),'<p>رقم المستند: '+esc($('#installDocNo').value)+'</p><p>التاريخ: '+new Date().toLocaleDateString('ar-EG')+'</p><p>الفورمان: '+esc($('#installForeman').value)+'</p>'+table(['م','السيريال','C.R.N'],entries.map((x,i)=>[i+1,esc(x.serial),esc(x.crn)])));
}
async function submitMeterInstall(){
 try{const entries=collectInstallEntries();if(!$('#installDocNo').value.trim()||!entries.length||entries.some(x=>!x.serial||!x.crn))throw new Error('أكمل رقم المستند والسيريال وC.R.N لكل صف');
  await api('/meter-installs',{method:'POST',body:JSON.stringify({doc_no:$('#installDocNo').value.trim(),foreman:$('#installForeman').value,notes:$('#installNotes').value,entries})});
  closeModal();toast('تم إنشاء مستند التركيب متعدد العدادات وإرساله للاعتماد');await render('meter-installs');
 }catch(e){toast(e.message)}
}

async function createMeterReplacement(){try{let [meters,foremen]=await Promise.all([api('/meters'),api('/foremen')]);let installed=meters.filter(x=>x.status==='INSTALLED'),custody=meters.filter(x=>x.status==='CUSTODY');openModal('تغيير عداد',[{name:'old_serial',label:'السيريال القديم المركب',options:installed.map(x=>({value:x.serial,label:x.serial+' | '+x.crn}))},{name:'new_serial',label:'السيريال البديل بعهدة الفورمان',options:custody.map(x=>({value:x.serial,label:x.serial+' | '+x.foreman}))},{name:'foreman',label:'الفورمان',options:foremen.map(x=>({value:x.name,label:x.name}))},{name:'crn',label:'رقم C.R.N'},{name:'reason',label:'سبب التغيير'},{name:'condition',label:'حالة العداد المفكوك',options:['تالف','صالح للفحص'].map(x=>({value:x,label:x}))}],d=>api('/meter-replacements',{method:'POST',body:JSON.stringify(d)}))}catch(e){toast(e.message)}}
async function updateRemovedMeter(serial){let state=prompt('اكتب الحالة الجديدة بالضبط:\nتحت الفحص\nتالف نهائيًا\nقيد الصيانة\nتم الإصلاح - بانتظار اعتماد الإرجاع');if(state===null)return;let notes=prompt('ملاحظات الفحص أو الإصلاح (اختياري):')||'',condition=state==='تالف نهائيًا'?'تالف':state.includes('تم الإصلاح')?'صالح للفحص':'';try{await api('/removed-meter-state',{method:'POST',body:JSON.stringify({serial,state,notes,condition})});toast('تم تحديث حالة العداد');await render('removed')}catch(e){toast(e.message)}}
async function requestMeterReturn(serial){let notes=prompt('ملاحظات طلب الإرجاع (اختياري):')||'';try{await api('/meter-return-request',{method:'POST',body:JSON.stringify({serial,notes})});toast('تم إرسال طلب الإرجاع للاعتماد');await render('removed')}catch(e){toast(e.message)}}
function reviewApproval(kind,id,approve){
 const title=approve?'اعتماد المستند':'رفض المستند';
 const state=approve?'accept':'reject';
 const icon=approve?'✓':'!';
 const promptText=approve?'هل أنت متأكد من اعتماد المستند وترحيل بياناته؟':'يرجى توضيح سبب الرفض حتى يتمكن مقدم الطلب من تصحيح المستند وإعادة إرساله.';
 $('#modalForm').classList.add('approval-modal');
 $('#modalTitle').textContent='';
 $('#modalFields').innerHTML=`
  <div class="approval-head">
   <button type="button" class="approval-close" onclick="closeModal()" aria-label="إغلاق">×</button>
   <div class="approval-brand">
    <div class="approval-mark">${icon}</div>
    <div><div class="approval-kicker">EGYPT GAS · DOCUMENT CONTROL</div><h3>${title}</h3></div>
   </div>
   <p class="approval-sub">مركز مراجعة واعتماد المستندات — منطقة العبور</p>
  </div>
  <div class="approval-content">
   <div class="approval-doc">
    <div><small>رقم / مرجع المستند</small><strong>${esc(String(id))}</strong></div>
    <span class="approval-state ${state}">${approve?'بانتظار الاعتماد':'إجراء رفض'}</span>
   </div>
   <p class="approval-prompt">${promptText}</p>
   ${approve?`<div class="approval-warning"><span>ⓘ</span><span>بعد الاعتماد سيتم ترحيل البيانات وتسجيل اسم المراجع وتوقيت الإجراء في سجل الاعتمادات.</span></div>`:
   `<p class="approval-hint">سبب الرفض إلزامي وسيظهر في سجل المستند لصاحب الطلب.</p><textarea class="approval-reason" name="reason" maxlength="1000" required placeholder="اكتب سبب الرفض بالتفصيل..."></textarea><div class="approval-warning"><span>ⓘ</span><span><b>تنبيه:</b> لن يتم ترحيل بيانات المستند عند رفضه.</span></div>`}
  </div>
  <div class="approval-actions">
   <button class="btn approval-primary ${state}" type="submit">${approve?'تأكيد الاعتماد والترحيل':'تأكيد رفض المستند'}</button>
   <button class="btn approval-cancel" type="button" onclick="closeModal()">رجوع</button>
  </div>`;
 $('#modalBack').style.display='flex';
 $('#modalForm').onsubmit=async e=>{
  e.preventDefault();
  const reason=approve?'':String(new FormData(e.target).get('reason')||'').trim();
  if(!approve&&!reason){toast('اكتب سبب الرفض أولاً');$('.approval-reason')?.focus();return}
  const submit=e.submitter; if(submit){submit.disabled=true;submit.textContent='جارٍ تنفيذ الإجراء...'}
  try{
   await api('/approval-review',{method:'POST',body:JSON.stringify({doc_kind:kind,doc_id:id,approve,reason})});
   closeModal();toast(approve?'تم الاعتماد والترحيل بنجاح':'تم رفض المستند وتسجيل السبب');await render('approvals');
  }catch(err){if(submit){submit.disabled=false;submit.textContent=approve?'تأكيد الاعتماد والترحيل':'تأكيد رفض المستند'}toast(err.message)}
 };
}



async function createMaterialReceipt(){
 try{
  const items=await api('/items'),active=items.filter(x=>x.active);
  if(!active.length){toast('لا توجد خامات نشطة');return}
  const options=active.map(x=>`<option value="${esc(x.code)}">${esc(x.code+' | '+x.name)}</option>`).join('');
  $('#modalTitle').textContent='إنشاء مستند وارد خامات – إدخال تفصيلي';
  $('#modalFields').innerHTML=`
   <div class="field"><label>رقم المستند *</label><input id="mrDocNo" required></div>
   <div class="field"><label>تاريخ المستند *</label><input id="mrDate" type="date" value="${new Date().toISOString().slice(0,10)}" required></div>
   <div class="field" style="grid-column:1/-1"><label>المورد / الجهة</label><input id="mrSupplier"></div>
   <div style="grid-column:1/-1"><div class="toolbar"><b>بنود الوارد</b><span class="spacer"></span><button class="btn btn-cyan" type="button" onclick="addMaterialReceiptLine()">＋ إضافة بند</button></div>
    <div class="table-wrap" style="max-height:45vh;overflow:auto"><table><thead><tr><th>م</th><th>كود واسم الصنف</th><th>الكمية</th><th>ملاحظات الصنف</th><th>حذف</th></tr></thead><tbody id="mrLines"></tbody></table></div>
    <div id="mrSummary" class="caption">عدد البنود: 0</div>
   </div>`;
  document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-gold" type="button" onclick="submitMaterialReceipt()">حفظ وإرسال للاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>';
  $('#modalBack').style.display='flex';
  window.materialReceiptOptions=options;window.materialReceiptLineCount=0;
  addMaterialReceiptLine();addMaterialReceiptLine();addMaterialReceiptLine();
 }catch(e){toast(e.message)}
}
function addMaterialReceiptLine(){
 const body=$('#mrLines');if(!body)return;
 const n=++window.materialReceiptLineCount;
 const tr=document.createElement('tr');tr.dataset.line=n;
 tr.innerHTML=`<td>${n}</td><td><select class="mrCode"><option value="">اختر الصنف</option>${window.materialReceiptOptions}</select></td><td><input class="mrQty" type="number" min="0" step="any" style="width:110px"></td><td><input class="mrNote" style="min-width:150px"></td><td><button class="btn btn-danger" type="button" onclick="this.closest('tr').remove();updateMaterialReceiptSummary()">حذف</button></td>`;
 body.appendChild(tr);
 tr.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',updateMaterialReceiptSummary));
 updateMaterialReceiptSummary();
}
function updateMaterialReceiptSummary(){
 const rows=[...document.querySelectorAll('#mrLines tr')].filter(r=>r.querySelector('.mrCode').value&&Number(r.querySelector('.mrQty').value)>0);
 const el=$('#mrSummary');if(el)el.textContent='عدد البنود المكتملة: '+rows.length+' | إجمالي الكميات: '+rows.reduce((a,r)=>a+Number(r.querySelector('.mrQty').value),0);
}
async function submitMaterialReceipt(){
 const doc_no=$('#mrDocNo').value.trim(),doc_date=$('#mrDate').value,supplier=$('#mrSupplier').value.trim();
 if(!doc_no||!doc_date){toast('رقم المستند وتاريخه مطلوبان');return}
 const lines=[],seen=new Set();
 for(const [i,r] of [...document.querySelectorAll('#mrLines tr')].entries()){
  const code=r.querySelector('.mrCode').value,qty=r.querySelector('.mrQty').value,note=r.querySelector('.mrNote').value.trim();
  if(!code&&!qty&&!note)continue;
  if(!code||!qty||Number(qty)<=0){toast('راجع كود الصنف والكمية في البند '+(i+1));return}
  if(seen.has(code)){toast('الصنف مكرر داخل المستند: '+code);return}
  seen.add(code);lines.push({code,qty:Number(qty),note});
 }
 if(!lines.length){toast('أدخل بندًا واحدًا على الأقل');return}
 if(!confirm('سيتم حفظ '+lines.length+' بندًا في مستند الوارد وإرساله للاعتماد. متابعة؟'))return;
 try{
  await api('/material-receipts',{method:'POST',body:JSON.stringify({doc_no,doc_date,supplier,lines})});
  closeModal();toast('تم حفظ مستند الوارد وإرساله للاعتماد');await render('documents');
 }catch(e){toast(e.message)}
}

async function foremanTransfer(name){
 $('#modalForm').classList.add('wide');
 try{
  const [detail,people]=await Promise.all([api('/foremen/'+encodeURIComponent(name)),api('/foremen')]);
  const recipients=people.filter(x=>x.name!==name);if(!recipients.length){toast('لا يوجد فورمان آخر لاستلام العهدة');return}
  const materials=detail.materials||[],meters=detail.meters||[];
  $('#modalTitle').textContent='تسليم عهدة احترافي – '+name;
  $('#modalFields').innerHTML=`<div class="kpis"><div class="kpi"><div class="label">الخامات المتاحة</div><div class="value">${materials.length}</div></div><div class="kpi"><div class="label">العدادات بالعهدة</div><div class="value">${meters.length}</div></div></div>
   <div class="field"><label>الفورمان المستلم</label><select id="transferRecipient" class="search">${recipients.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></div>
   <h3>الخامات المراد تسليمها</h3><div class="table-wrap"><table><thead><tr><th>اختيار</th><th>الكود</th><th>الخامة</th><th>الرصيد المتاح</th><th>الكمية</th></tr></thead><tbody id="transferMaterialRows">${materials.map((x,i)=>`<tr><td><input type="checkbox" data-transfer-material="${i}"></td><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${fmt(x.balance)}</td><td><input class="search" type="number" min="0" step="any" data-transfer-qty="${i}" value="0"></td></tr>`).join('')}</tbody></table></div>
   <h3>العدادات المراد تسليمها</h3><div class="table-wrap"><table><thead><tr><th>اختيار</th><th>السيريال</th><th>النوع</th><th>السعة</th><th>C.R.N</th></tr></thead><tbody>${meters.map((x,i)=>`<tr><td><input type="checkbox" data-transfer-meter="${i}"></td><td>${esc(x.serial)}</td><td>${esc(x.meter_type)}</td><td>${esc(x.capacity)}</td><td>${esc(x.crn||'—')}</td></tr>`).join('')}</tbody></table></div>
   <div class="field"><label>ملاحظات التسليم</label><textarea id="transferNotes" class="search" rows="2"></textarea></div>`;
  document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-gold" type="button" onclick="submitForemanTransfer('${esc(name)}')">إرسال طلب التسليم للاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>`;
  $('#modalBack').style.display='flex';window.transferDraft={materials,meters};
 }catch(e){toast(e.message)}
}
async function submitForemanTransfer(source){
 try{
  const d=window.transferDraft||{materials:[],meters:[]};
  const materials=d.materials.filter((x,i)=>document.querySelector(`[data-transfer-material="${i}"]`)?.checked).map((x,i)=>({code:x.code,qty:Number(document.querySelector(`[data-transfer-qty="${d.materials.indexOf(x)}"]`)?.value||0)}));
  if(materials.some(x=>!(x.qty>0)))throw new Error('أدخل كمية صحيحة لكل خامة محددة');
  const meter_serials=d.meters.filter((x,i)=>document.querySelector(`[data-transfer-meter="${i}"]`)?.checked).map(x=>x.serial);
  await api('/foreman-transfers',{method:'POST',body:JSON.stringify({from_foreman:source,to_foreman:$('#transferRecipient').value,notes:$('#transferNotes').value,materials,meter_serials})});
  closeModal();toast('تم إنشاء طلب التسليم وإرساله للاعتماد');await render('foremen');
 }catch(e){toast(e.message)}
}
async function foremanStocktake(name){
 $('#modalForm').classList.add('wide');
 try{
  const d=await api('/foremen/'+encodeURIComponent(name)),materials=d.materials||[],meters=d.meters||[];
  $('#modalTitle').textContent='جرد ومطابقة العهدة – '+name;
  $('#modalFields').innerHTML=`<div class="kpis"><div class="kpi"><div class="label">أصناف الخامات</div><div class="value">${materials.length}</div></div><div class="kpi"><div class="label">العدادات</div><div class="value">${meters.length}</div></div></div>
   <h3>مطابقة أرصدة الخامات</h3><div class="table-wrap"><table><thead><tr><th>الكود</th><th>الخامة</th><th>الرصيد الدفتري</th><th>الرصيد الفعلي</th><th>الفرق</th></tr></thead><tbody>${materials.map((x,i)=>`<tr><td>${esc(x.code)}</td><td>${esc(x.name)}</td><td>${fmt(x.balance)}</td><td><input class="search" type="number" min="0" step="any" value="${Number(x.balance)||0}" data-stocktake-material="${i}"></td><td id="stocktake-diff-${i}">0</td></tr>`).join('')}</tbody></table></div>
   <h3>مطابقة العدادات</h3><div class="table-wrap"><table><thead><tr><th>السيريال</th><th>النوع</th><th>الحالة الدفترية</th><th>تم العثور عليه فعليًا؟</th></tr></thead><tbody>${meters.map((x,i)=>`<tr><td>${esc(x.serial)}</td><td>${esc(x.meter_type)}</td><td>${esc(x.status)}</td><td><select class="search" data-stocktake-meter="${i}"><option value="1" selected>نعم – موجود</option><option value="0">لا – غير موجود</option></select></td></tr>`).join('')}</tbody></table></div>
   <div class="field"><label>ملاحظات الجرد</label><textarea id="stocktakeNotes" class="search" rows="2"></textarea></div>`;
  window.stocktakeDraft={materials,meters};
  document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-cyan" type="button" onclick="previewStocktake('${esc(name)}')">معاينة محضر الجرد</button><button class="btn btn-gold" type="button" onclick="submitStocktake('${esc(name)}')">إرسال للاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>`;
  $('#modalBack').style.display='flex';
  document.querySelectorAll('[data-stocktake-material]').forEach(el=>el.addEventListener('input',()=>{const i=el.dataset.stocktakeMaterial;const diff=Number(el.value)-Number(materials[i].balance);$('#stocktake-diff-'+i).textContent=fmt(diff)}));
 }catch(e){toast(e.message)}
}
function collectStocktake(){
 const d=window.stocktakeDraft||{materials:[],meters:[]};
 return {materials:d.materials.map((x,i)=>({code:x.code,actual_qty:Number(document.querySelector(`[data-stocktake-material="${i}"]`)?.value)})),
  meters:d.meters.map((x,i)=>({serial:x.serial,found:document.querySelector(`[data-stocktake-meter="${i}"]`)?.value==='1'})),notes:$('#stocktakeNotes')?.value||''};
}
function previewStocktake(name){
 const d=collectStocktake();
 const rows=d.materials.map((x,i)=>[esc(x.code),esc(window.stocktakeDraft.materials[i].name),fmt(window.stocktakeDraft.materials[i].balance),fmt(x.actual_qty),fmt(x.actual_qty-window.stocktakeDraft.materials[i].balance)]);
 const mr=d.meters.map(x=>[esc(x.serial),x.found?'موجود':'غير موجود']);
 printReportWindow('معاينة محضر جرد عهدة – '+name,'<p>الفورمان: '+esc(name)+'</p><h3>مطابقة الخامات</h3>'+table(['الكود','الخامة','دفتري','فعلي','الفرق'],rows)+'<h3>مطابقة العدادات</h3>'+table(['السيريال','نتيجة الجرد'],mr));
}
async function submitStocktake(name){
 try{const d=collectStocktake();if(d.materials.some(x=>!Number.isFinite(x.actual_qty)||x.actual_qty<0))throw new Error('تأكد من الكميات الفعلية');if(!confirm('إرسال محضر الجرد للاعتماد؟ لن تتغير العهدة قبل الاعتماد.'))return;
  await api('/foreman-stocktakes',{method:'POST',body:JSON.stringify({foreman:name,notes:d.notes,materials:d.materials,meters:d.meters})});
  closeModal();toast('تم إرسال محضر الجرد للاعتماد');await render('foremen');
 }catch(e){toast(e.message)}
}

async function openForemanMaterialArchive(foreman){
 try{
  const docs=await api('/material-movement-documents');
  const eligible=docs.filter(x=>String(x.foreman||'').trim()===String(foreman).trim()&&['صرف','مركب'].includes(String(x.type||'')));
  window.foremanMaterialArchive={foreman,docs:eligible};
  const rows=eligible.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||Number(b.id)-Number(a.id));
  $('#modalTitle').textContent='أرشيف كشوف الخامات المصروفة والمركبة — '+foreman;
  $('#modalFields').innerHTML=`
   <div class="panel" style="margin-bottom:12px;background:linear-gradient(135deg,#102f47,#091d2d)">
    <div class="panel-title"><div><h3 style="color:var(--gold);margin:0">${esc(foreman)}</h3><span>مستندات صرف وتركيب الخامات المرتبطة بهذا الفورمان فقط</span></div><span class="badge gold">${rows.length} كشف</span></div>
    <div class="caption">اختر مستند الصرف أو التركيب لعرض كشف الخامات الفعلي وطباعته أو حفظه PDF</div>
   </div>
   <div class="toolbar" style="margin-bottom:12px;gap:8px;flex-wrap:wrap">
    <input id="foremanSheetSearch" class="search" style="flex:1;min-width:180px" placeholder="بحث برقم المستند أو نوع الحركة..." oninput="filterForemanMaterialArchive()">
    <select id="foremanSheetType" class="search" style="min-width:150px" onchange="filterForemanMaterialArchive()">
     <option value="">كل الكشوف</option><option value="صرف">خامات منصرفة للفورمان</option><option value="مركب">خامات مركبة للفورمان</option>
    </select>
   </div>
   <div id="foremanMaterialArchiveRows">${foremanMaterialArchiveRowsHtml(rows)}</div>`;
  $('#modalForm').classList.add('wide');
  $('#modalForm .modal-actions').innerHTML='<button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>';
  $('#modalBack').style.display='flex';
 }catch(e){toast(e.message||'تعذر تحميل أرشيف كشوف الخامات')}
}
function foremanMaterialArchiveRowsHtml(rows){
 if(!rows.length)return '<div class="empty">لا توجد كشوف خامات مسجلة لهذا الفورمان حتى الآن.</div>';
 return `<div class="table-wrap"><table><thead><tr><th>رقم المستند</th><th>نوع الحركة</th><th>التاريخ</th><th>عدد الخامات</th><th>إجمالي الكميات</th><th>فتح الكشف</th></tr></thead><tbody>
 ${rows.map(x=>`<tr><td><b style="color:var(--gold)">${esc(x.doc_no||'بدون رقم')}</b></td><td><span class="badge ${x.type==='صرف'?'gold':''}">${esc(x.type)}</span></td><td>${esc(movementDateLabel(x.created_at))}</td><td>${fmt(x.item_count||x.line_count)}</td><td>${fmt(x.total_qty)}</td><td><button class="btn btn-cyan" onclick="openForemanMaterialSheet(${Number(x.id)})">عرض / طباعة</button></td></tr>`).join('')}
 </tbody></table></div>`;
}
function filterForemanMaterialArchive(){
 const state=window.foremanMaterialArchive;if(!state)return;
 const q=($('#foremanSheetSearch')?.value||'').trim().toLowerCase(),kind=$('#foremanSheetType')?.value||'';
 const rows=state.docs.filter(x=>(!kind||x.type===kind)&&(!q||[x.doc_no,x.type,x.created_at].some(v=>String(v||'').toLowerCase().includes(q))));
 const host=$('#foremanMaterialArchiveRows');if(host)host.innerHTML=foremanMaterialArchiveRowsHtml(rows);
}
async function openForemanMaterialSheet(id){
 try{
  const d=await api('/document-detail?kind=material-movement&id='+encodeURIComponent(id));
  const head=d.head||{},lines=d.lines||[];
  if(!lines.length){toast('المستند لا يحتوي على بنود خامات');return}
  const archive=window.foremanMaterialArchive||{};
  const foreman=head.foreman||archive.foreman||'—';
  const title='كشف خامات '+(head.type||'')+' — '+(head.doc_no||'');
  const half=Math.ceil(lines.length/2),left=lines.slice(0,half),right=lines.slice(half);
  const tableHtml=(arr,start=0)=>`<table class="statement-table"><thead><tr><th>م</th><th>اسم الخامة</th><th>الكود</th><th>الكمية</th></tr></thead><tbody>${arr.map((x,i)=>`<tr><td>${start+i+1}</td><td>${esc(x.name||'—')}</td><td dir="ltr">${esc(x.code||'')}</td><td>${fmt(x.qty)}</td></tr>`).join('')}</tbody></table>`;
  const w=window.open('','_blank');if(!w){toast('اسمح بالنوافذ المنبثقة لعرض وطباعة الكشف');return}
  const logo=location.origin+'/logo.png';
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
  <style>
  *{box-sizing:border-box}body{font-family:Tahoma,Arial,sans-serif;color:#172b3b;margin:0;background:#fff}
  .sheet{padding:12mm;max-width:297mm;margin:auto}.brand{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #c99a35;padding-bottom:8px;margin-bottom:12px}
  .brand img{width:76px;height:76px;object-fit:contain}.brand-title{text-align:center;flex:1}.brand-title h1{font-size:20px;margin:0;color:#143b59}.brand-title p{font-size:11px;margin:5px 0;color:#536879}
  .doc-title{text-align:center;font-size:19px;color:#143b59;margin:12px 0;font-weight:900}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0 14px}.meta div{border:1px solid #b9c6cf;border-radius:6px;padding:8px;text-align:center;min-height:42px}.meta b{display:block;font-size:10px;color:#6b7881;margin-bottom:4px}.meta span{font-size:12px;font-weight:bold}
  .tables{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:start}.statement-table{width:100%;border-collapse:collapse;font-size:10px}.statement-table th{background:#153d59;color:#fff;padding:7px 4px;border:1px solid #153d59}.statement-table td{padding:6px 4px;border:1px solid #aab6bf;text-align:center}.statement-table tr:nth-child(even){background:#f0f4f7}.statement-table td:nth-child(2){text-align:right}
  .note{margin-top:12px;border:1px solid #c5cdd3;padding:8px;min-height:28px;font-size:10px}.signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px;text-align:center}.signatures div{border-top:1px solid #526575;padding-top:8px;font-size:11px;font-weight:bold}
  .footer{margin-top:18px;border-top:1px solid #c99a35;padding-top:6px;text-align:center;font-size:9px;color:#6b7881}
  .actions{position:sticky;top:0;display:flex;gap:8px;justify-content:center;padding:10px;background:#e9eff4;border-bottom:1px solid #cbd5dc}.actions button{border:0;border-radius:8px;padding:10px 18px;background:#d9a83c;font-weight:bold;cursor:pointer}.actions button.secondary{background:#153d59;color:white}
  @page{size:A4 landscape;margin:8mm}@media print{.actions{display:none}.sheet{padding:0;max-width:none}.statement-table{font-size:9px}.statement-table th,.statement-table td{padding:5px 3px}tr{break-inside:avoid}}
  </style></head><body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button><button class="secondary" onclick="window.close()">إغلاق المعاينة</button></div>
  <main class="sheet"><header class="brand"><img src="${logo}" alt="EGYPT GAS"><div class="brand-title"><h1>EGYPT GAS — غاز مصر</h1><p>منظومة إدارة الخامات والعدادات — منطقة العبور</p></div><div style="width:76px"></div></header>
  <div class="doc-title">كشف خامات ${esc(head.type||'')}</div>
  <section class="meta"><div><b>اسم الفورمان</b><span>${esc(foreman)}</span></div><div><b>رقم المستند</b><span>${esc(head.doc_no||'—')}</span></div><div><b>نوع المستند</b><span>${esc(head.type||'—')}</span></div><div><b>التاريخ</b><span>${esc(movementDateLabel(head.created_at))}</span></div></section>
  <div class="tables"><div>${tableHtml(left,0)}</div><div>${tableHtml(right,half)}</div></div>
  <div class="note"><b>ملاحظات:</b> ${esc(lines.map(x=>x.notes).filter(Boolean).join(' — ')||'')}</div>
  <section class="signatures"><div>أمين المخزن</div><div>الفورمان المستلم</div><div>المسؤول المختص</div></section>
  <div class="footer">EGYPT GAS | نموذج كشف خامات — رقم المستند ${esc(head.doc_no||'—')}</div></main></body></html>`);
  w.document.close();
 }catch(e){toast(e.message||'تعذر فتح كشف الخامات')}
}

function fwIcon(n){const paths={"user": "<circle cx=\"12\" cy=\"8\" r=\"4\"/><path d=\"M4 21v-2a8 8 0 0 1 16 0v2\"/>", "id": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M7 10h4m-4 4h4m4-4h2m-2 4h2\"/>", "phone": "<path d=\"M5 3h4l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v4c0 2-2 2-3 2A18 18 0 0 1 3 6c0-2 1-3 2-3z\"/>", "print": "<path d=\"M6 8V3h12v5M6 17H3V9h18v8h-3M6 14h12v7H6z\"/>", "download": "<path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\"/>", "edit": "<path d=\"m4 16 12-12 4 4-12 12H4zM14 6l4 4\"/>", "trash": "<path d=\"M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7\"/>", "move": "<path d=\"M12 4v16M4 12h16\"/>", "adjust": "<path d=\"M4 7h16M4 17h16\"/><circle cx=\"8\" cy=\"7\" r=\"3\"/><circle cx=\"16\" cy=\"17\" r=\"3\"/>", "transfer": "<path d=\"M3 8h18l-4-4M21 16H3l4 4\"/>", "check": "<rect x=\"4\" y=\"3\" width=\"16\" height=\"18\" rx=\"2\"/><path d=\"m8 12 3 3 5-6\"/>", "file": "<path d=\"M5 3h10l4 4v14H5zM14 3v5h5M8 12h8m-8 4h8\"/>", "archive": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"5\" rx=\"1\"/><path d=\"M5 8v13h14V8m-10 4h6\"/>", "calendar": "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M7 3v4m10-4v4M3 10h18\"/>", "grid": "<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M3 15h18M9 3v18M15 3v18\"/>"};return `<svg class="fw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[n]||paths.file}</svg>`;}
function foremanDetailHtml(d){
 const p=d.person||{};
 window.fwPrintData=d;
 const tabs=[
  ['عهدة الخامات',table(['الكود','الخامة','رصيد أول المدة','الرصيد الحالي','الإجراءات'],(d.materials||[]).map(x=>[esc(x.code),`<b>${esc(x.name)}</b>`,fmt(x.opening),`<b class="material-balance">${fmt(x.balance)}</b>`,`<div class="material-row-actions"><button class="btn btn-edit-material" title="تعديل الرصيد" onclick="editForemanMaterial('${esc(p.name)}','${esc(x.code)}','${Number(x.balance)||0}')">${fwIcon('edit')} تعديل</button><button class="btn btn-delete-material" title="إرجاع الرصيد إلى صفر" onclick="deleteForemanMaterial('${esc(p.name)}','${esc(x.code)}','${esc(x.name)}','${Number(x.balance)||0}')">${fwIcon('trash')} حذف</button></div>`]))],
  ['عهدة العدادات',table(['السيريال','النوع','السعة','كود العداد','C.R.N'],(d.meters||[]).map(x=>[esc(x.serial),esc(x.meter_type),esc(x.capacity),esc(x.meter_code),esc(x.crn)]))],
  ['كل الحركات',table(['التاريخ','الكود','نوع الحركة','الكمية','المستند','الأسبوع','المستخدم'],(d.recent||[]).map(x=>[esc(x.created_at),esc(x.code),esc(x.type),fmt(x.qty),esc(x.doc),esc(x.week),esc(x.username)]))],
  ['الحركات الأسبوعية',table(['الشهر','الأسبوع','الكود','النوع','الكمية','مرجع الشيت','ملاحظات'],(d.weekly||[]).map(x=>[esc(x.month),esc(x.week),esc(x.code),esc(x.kind),fmt(x.qty),esc(x.sheet_ref),esc(x.notes)]))],
  ['تسويات العهدة',table(['التاريخ','الكود','قبل','بعد','السبب','المستخدم'],(d.adjustments||[]).map(x=>[esc(x.created_at),esc(x.code),fmt(x.old_qty),fmt(x.new_qty),esc(x.reason),esc(x.username)]))]
 ];
 window.foremanTabMarkup=tabs.map(t=>t[1]);
 return `<div class="panel-title fw-profile"><div class="fw-identity"><div class="fw-avatar">${fwIcon('user')}</div><div><div class="eyebrow">ملف عهدة الفورمان / منطقة العبور</div><h3>${esc(p.name)}</h3><div class="fw-meta"><span>${fwIcon('id')} رقم الأداء: <b>${esc(p.performance_no||'—')}</b></span><span>${fwIcon('phone')} الهاتف: <b dir="ltr">${esc(p.mobile||'—')}</b></span></div></div></div><div class="fw-output"><button type="button" class="btn btn-gold" onclick="printFwCustody()">${fwIcon('print')} طباعة العهدة</button><button type="button" class="btn btn-dark" onclick="exportFwCustody()">${fwIcon('download')} تصدير Excel</button></div></div>
 <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0">
 <div class="kpi"><div class="label">خامات بالعهدة</div><div class="value">${(d.materials||[]).length}</div></div>
 <div class="kpi"><div class="label">عدادات بالعهدة</div><div class="value">${(d.meters||[]).length}</div></div>
 <div class="kpi"><div class="label">حركات تاريخية</div><div class="value">${fmt(d.legacy_movements)}</div></div></div>
 <div class="fw-section-label">إجراءات العهدة <small>إدارة الحركات والمستندات</small></div><div class="toolbar fw-operations"><button class="btn btn-gold" onclick="foremanMovement('${esc(p.name)}')">${fwIcon('move')}<span>تسجيل حركة عهدة</span></button>
 <button class="btn btn-cyan" onclick="foremanAdjust('${esc(p.name)}')">${fwIcon('adjust')}<span>تسوية رصيد خامة</span></button> <button class="btn btn-dark" onclick="foremanTransfer('${esc(p.name)}')">${fwIcon('transfer')}<span>تسليم عهدة لفورمان آخر</span></button> <button class="btn btn-dark" onclick="foremanStocktake('${esc(p.name)}')">${fwIcon('check')}<span>جرد ومطابقة العهدة</span></button> <button class="btn btn-cyan" onclick="openForemanLedger('${esc(p.name)}')">${fwIcon('file')}<span>كشف حساب شامل</span></button> <button class="btn btn-gold" onclick="openForemanMaterialArchive('${esc(p.name)}')">${fwIcon('archive')}<span>أرشيف كشوف الخامات</span></button> <button class="btn btn-gold" onclick="openForemanDocuments('${esc(p.name)}')">${fwIcon('file')}<span>مستندات العهد وأرقامها</span></button> <button class="btn btn-dark" onclick="openWeeklyMovements('${esc(p.name)}')">${fwIcon('calendar')}<span>حركة 5 أسابيع</span></button> <button class="btn btn-gold" onclick="openForemanBatchPage('${esc(p.name)}')">${fwIcon('grid')}<span>الإدخال الجماعي 120 صف</span></button></div>
 <div class="tabs" style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">${tabs.map((t,i)=>`<button class="btn ${i===0?'btn-gold':'btn-dark'}" onclick="showForemanTab(${i})">${t[0]}</button>`).join('')}</div>
 <div class="fw-filter"><button class="btn fw-add-material" onclick="addFwMaterial()">${fwIcon('move')} إضافة خامة للعهدة</button><input class="search" id="fwSearch" placeholder="بحث باسم الخامة أو الكود أو بيانات الحركة" oninput="filterFwRows()"><span id="fwCount"></span></div><div id="foremanTabContent" class="panel" style="padding:10px">${tabs[0][1]}</div>`;
}
function fwCustodyRows(d){return (d.materials||[]).map((x,i)=>[i+1,String(x.code||''),String(x.name||''),Number(x.opening||0),Number(x.balance||0)])}
function exportFwCustody(){const d=window.fwPrintData;if(!d)return;const p=d.person||{};return downloadCsvFile('عهدة_'+p.name,[['EGYPT GAS — كشف عهدة الخامات'],['منطقة العبور'],['اسم الفورمان',p.name],['رقم الأداء',p.performance_no||'—'],['تاريخ الكشف',new Date().toLocaleDateString('en-GB')],[],['م','الكود','الخامة','رصيد أول المدة','الرصيد الحالي'],...fwCustodyRows(d)])}
function printFwCustody(){const d=window.fwPrintData;if(!d)return;const p=d.person||{},rows=fwCustodyRows(d),w=window.open('','_blank');if(!w){toast('اسمح بفتح نافذة الطباعة');return}const logo=location.origin+'/assets/logo.png';w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>كشف عهدة ${esc(p.name)}</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{font:12px Tahoma,Arial;color:#172d40;margin:0;background:white}main{max-width:190mm;margin:auto;padding:8px}header{display:flex;align-items:center;gap:20px;border-bottom:3px solid #b68b39;padding-bottom:10px}header img{width:75px;height:75px;object-fit:contain}header div{flex:1;text-align:center}h1{font-size:20px;margin:0 0 6px}h2{text-align:center;font-size:18px;margin:14px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:12px;border:1px solid #b68b39;margin-bottom:12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #a9b7c2;padding:6px;text-align:center}th{background:#173d59;color:white}td:nth-child(3){text-align:right}tr:nth-child(even){background:#edf2f6}thead{display:table-header-group}tr,.sign{break-inside:avoid}.sign{display:flex;justify-content:space-around;margin-top:32px}.sign span{border-top:1px solid #64748b;padding:8px 20px}.actions{text-align:center;padding:12px}.actions button{padding:10px 24px;background:#173d59;color:white;border:0;border-radius:5px;cursor:pointer}@media print{.actions{display:none}main{padding:0}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><div class="actions"><button onclick="window.print()">طباعة / حفظ PDF</button></div><main><header><img src="${logo}" alt="EGYPT GAS"><div><h1>شركة غاز مصر — EGYPT GAS</h1>منظومة إدارة الخامات والعدادات | منطقة العبور</div></header><h2>كشف عهدة الخامات</h2><div class="meta"><strong>اسم الفورمان: ${esc(p.name)}</strong><span>رقم الأداء: ${esc(p.performance_no||'—')}</span><span>تاريخ الكشف: ${new Date().toLocaleDateString('en-GB')}</span><span>عدد الأصناف: ${rows.length}</span></div><table><thead><tr>${['م','الكود','الخامة','رصيد أول المدة','الرصيد الحالي'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="sign"><span>أمين المخزن</span><span>الفورمان</span><span>المسؤول المختص</span></div></main></body></html>`);w.document.close()}
function showForemanTab(i){
 const a=window.foremanTabMarkup||[];
 const el=document.querySelector('#foremanTabContent');if(el)el.innerHTML=a[i]||'';document.querySelectorAll('#foremanDetails .tabs button').forEach((b,n)=>{b.classList.toggle('btn-gold',n===i);b.classList.toggle('btn-dark',n!==i)});if($('#fwSearch'))$('#fwSearch').value='';filterFwRows();
}
function filterFwRows(){const q=($('#fwSearch')?.value||'').trim().toLowerCase();let count=0;document.querySelectorAll('#foremanTabContent tbody tr').forEach(r=>{const visible=r.textContent.toLowerCase().includes(q);r.hidden=!visible;if(visible)count++});if($('#fwCount'))$('#fwCount').textContent=count+' بند ظاهر';}
async function selectForeman(name){window.selectedForeman=name;await render('foremen');window.scrollTo(0,0)}
async function foremanMovement(name){
 try{let [items,people]=await Promise.all([api('/items'),api('/foremen')]);
 openModal('تسجيل حركة عهدة – '+name,[
 {name:'type',label:'نوع الحركة',options:['صرف','سلف','مرتجع','مركب'].map(x=>({value:x,label:x}))},
 {name:'code',label:'الخامة',options:items.filter(x=>x.active).map(x=>({value:x.code,label:x.code+' | '+x.name}))},
 {name:'qty',label:'الكمية',type:'number'},
 {name:'doc',label:'رقم المستند',required:false},
 {name:'week',label:'الأسبوع',required:false},
 {name:'notes',label:'ملاحظات',required:false}
 ],d=>api('/foreman-movement',{method:'POST',body:JSON.stringify({...d,foreman:name})}))
 }catch(e){toast(e.message)}
}
async function editForemanMaterial(name,code,balance){
 try{
  const items=await api('/items');const item=items.find(x=>String(x.code)===String(code));
  openModal('طلب تعديل رصيد عهدة '+name,[
   {name:'code',label:'كود الخامة',options:[{value:code,label:code+' | '+(item?.name||'الخامة')}],defaultValue:code},
   {name:'target',label:'الرصيد الجديد',type:'number',defaultValue:balance},
   {name:'reason',label:'سبب طلب التعديل',required:true}
  ],async d=>{
   const r=await api('/foreman-adjust',{method:'POST',body:JSON.stringify({...d,foreman:name})});
   window.selectedForeman=name;return r;
  });
 }catch(e){toast(e.message)}
}
async function deleteForemanMaterial(name,code,itemName,balance){
 if(!confirm('إرسال طلب تصفير/حذف الخامة '+itemName+' من عهدة '+name+' إلى المدير للموافقة؟ لن يتغير الرصيد الآن.'))return;
 const reason=prompt('اكتب سبب طلب الحذف أو التصفير:');if(!reason||!reason.trim())return;
 try{
  const r=await api('/foreman-adjust',{method:'POST',body:JSON.stringify({foreman:name,code,target:0,reason:reason.trim()})});
  toast(r.pending_approval?'تم إرسال طلب الحذف للمدير؛ الرصيد لم يتغير بعد':'الرصيد بالفعل صفر');
  window.selectedForeman=name;await render('foremen');
 }catch(e){toast(e.message)}
}
async function foremanAdjust(name){
 try{let items=await api('/items');
 openModal('طلب تسوية عهدة – '+name,[
 {name:'code',label:'الخامة',options:items.map(x=>({value:x.code,label:x.code+' | '+x.name}))},
 {name:'target',label:'الرصيد الجديد',type:'number'},
 {name:'reason',label:'سبب طلب التسوية',required:true}
 ],async d=>api('/foreman-adjust',{method:'POST',body:JSON.stringify({...d,foreman:name})}))
 }catch(e){toast(e.message)}
}



async function runGlobalSearch(){
 const q=($('#globalSearchInput')?.value||'').trim();if(!q){toast('اكتب كلمة أو رقم للبحث');return}
 try{
  const rows=await api('/global-search?q='+encodeURIComponent(q));
  const host=$('#globalSearchResults');if(!host)return;
  host.innerHTML=`<section class="panel" style="margin-bottom:12px"><div class="panel-title"><h3>نتائج البحث الموحد</h3><span>${rows.length} نتيجة</span></div>${rows.length?table(['القسم','الرقم / الكود','البيان','التفاصيل','الحالة'],rows.map(x=>[esc(x.section),esc(x.key),esc(x.name),esc(x.detail),esc(x.status)])):'<div class="empty">لا توجد نتائج مطابقة</div>'}</section>`;
 }catch(e){toast(e.message)}
}

async function runMeterIssueSearch(){
 const q=($('#issueSearch')?.value||'').trim();
 try{
  const rows=await api('/meter-issue-search?q='+encodeURIComponent(q));
  $('#issueSearchResults').innerHTML=`<section class="panel" style="margin-bottom:12px"><h3>نتائج البحث في مستندات الصرف (${rows.length})</h3>${table(['السيريال','كود العداد','النوع','الفورمان','تاريخ الصرف','رقم المستند','الإجراء'],rows.map(x=>[ `<button class="btn btn-cyan" onclick="openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,esc(x.meter_code),esc(x.meter_type),esc(x.foreman),esc(x.created_at),esc(x.doc_no),`<button class="btn btn-dark" onclick="showDocumentDetail('meter-issue',${x.doc_id})">تفاصيل المستند</button>`]))}</section>`;
 }catch(e){toast(e.message)}
}

async function downloadCsvFile(filename,rows){
 try{
  const stem=String(filename||'EGYPT_GAS_Report').replace(/\.csv$/i,'').replace(/\.xlsx$/i,'');
  const response=await fetch('/api/export-xlsx',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({filename:stem+'.xlsx',title:stem.replace(/_/g,' '),rows})});
  if(!response.ok){let msg='تعذر إنشاء ملف Excel';try{const j=await response.json();msg=j.error||msg}catch(_){}throw new Error(msg)}
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=stem+'.xlsx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  toast('تم تنزيل ملف Excel منسق وجاهز للطباعة');
 }catch(e){toast(e.message||'تعذر تصدير ملف Excel')}
}
function printReportWindow(title,sections){
 const w=window.open('','_blank');if(!w){toast('اسمح بالنوافذ المنبثقة للطباعة');return}
 w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Tahoma,Arial;padding:22px;color:#172b3c}h1,h2{text-align:center;color:#123d59}h3{margin:22px 0 8px}table{width:100%;border-collapse:collapse;margin:8px 0 20px;font-size:12px}td,th{border:1px solid #8995a0;padding:7px;text-align:center}th{background:#123d59;color:white}section{margin-bottom:22px}@page{size:A4 landscape;margin:10mm}
.brand-head{display:flex;align-items:center;gap:18px;border-bottom:3px solid #c99a35;padding:8px 0 14px;margin-bottom:16px}
.brand-head img{width:92px;height:76px;object-fit:contain}
.brand-title{flex:1;text-align:center}.brand-title h2{margin:0 0 5px;font-size:22px}.brand-title h3{margin:8px 0 0;color:#173a55}
.document-meta{display:grid;grid-template-columns:1fr 2fr 1fr;gap:10px;margin:14px 0 18px}
.document-meta>div{border:1.5px solid #c99a35;border-radius:7px;padding:10px;text-align:center;background:#f7f9fb}
.document-meta span{display:block;font-size:11px;color:#526273;margin-bottom:5px}
.document-meta strong{display:block;font-size:16px;color:#123d59}
.document-meta .foreman-name{background:#fff8e8;border:2px solid #c99a35}
.document-meta .foreman-name strong{font-size:21px;color:#102f48}
.signatures{display:flex;justify-content:space-between;gap:18px;margin-top:28px;font-weight:bold;font-size:12px}
</style><h1>EGYPT GAS</h1><h2>${esc(title)}</h2>${sections}<script>window.onload=()=>window.print()<\/script></html>`);
 w.document.close();
}
function exportWeeklyStatement(){
 const d=window.currentWeeklyPrint;if(!d)return;
 const rows=[['الفورمان',d.name],['الشهر',d.month],[],['رقم الحركة','الأسبوع','النوع','المستند','الكود','الخامة','الكمية','مرجع الشيت','ملاحظات']];
 (d.rows||[]).forEach(x=>rows.push([x.id,x.week,x.kind,x.doc,x.code,x.name,x.qty,x.sheet_ref,x.notes]));
 rows.push([],['سجل السلف'],['التاريخ','المستند','الكود','الخامة','الكمية','المصدر']);
 (d.loans||[]).forEach(x=>rows.push([x.created_at,x.doc,x.code,x.name,x.qty,x.source]));
 downloadCsvFile('كشف_اسبوعي_'+d.name+'_'+d.month+'.csv',rows);
}
function printWeeklyStatement(){
 const d=window.currentWeeklyPrint;if(!d)return;
 const totals=(d.totals||[]).map(x=>[esc(x.kind), 'الأسبوع '+esc(x.week),fmt(x.qty)]);
 const weekly=(d.rows||[]).map(x=>[esc(x.id),'الأسبوع '+esc(x.week),esc(x.kind),esc(x.doc),esc(x.code),esc(x.name),fmt(x.qty),esc(x.sheet_ref),esc(x.notes)]);
 const loans=(d.loans||[]).map(x=>[esc(x.created_at),esc(x.doc),esc(x.code),esc(x.name),fmt(x.qty),esc(x.source)]);
 printReportWindow('كشف الحركة الأسبوعية – '+d.name+' – '+d.month,
  '<section><h3>ملخص الإجماليات</h3>'+table(['النوع','الأسبوع','الإجمالي'],totals)+'</section><section><h3>الحركات الأسبوعية</h3>'+table(['رقم','الأسبوع','النوع','المستند','الكود','الخامة','الكمية','مرجع الشيت','ملاحظات'],weekly)+'</section><section><h3>السلف</h3>'+table(['التاريخ','المستند','الكود','الخامة','الكمية','المصدر'],loans)+'</section>');
}
function exportForemanLedger(){
 const d=window.currentForemanLedger?.data;if(!d)return;
 const p=d.person||[],rows=[['كشف حساب الفورمان',p.name],['رقم الأداء',p.performance_no],['الهاتف',p.mobile],[],['أرصدة الخامات'],['الكود','الخامة','رصيد افتتاحي','الرصيد الحالي']];
 (d.materials||[]).forEach(x=>rows.push([x.code,x.name,x.opening,x.balance]));
 rows.push([],['حركة الخامات'],['التاريخ','المستند','الأسبوع','الكود','الخامة','النوع','الكمية','ملاحظات','المستخدم']);
 (d.movements||[]).forEach(x=>rows.push([x.created_at,x.doc,x.week,x.code,x.name,x.type,x.qty,x.notes,x.username]));
 rows.push([],['العدادات'],['السيريال','النوع','السعة','الحالة','C.R.N','كود العداد']);
 (d.meters||[]).forEach(x=>rows.push([x.serial,x.meter_type,x.capacity,x.status,x.crn,x.meter_code]));
 rows.push([],['حركة العدادات'],['التاريخ','السيريال','العملية','C.R.N','ملاحظات','المستخدم']);
 (d.meter_events||[]).forEach(x=>rows.push([x.created_at,x.serial,x.action,x.crn,x.notes,x.username]));
 downloadCsvFile('كشف_حساب_'+(p.name||'فورمان')+'.csv',rows);
}
function printForemanLedger(){
 const d=window.currentForemanLedger?.data;if(!d)return;
 const p=d.person||{},m=d.meter_summary||{};
 const mats=(d.materials||[]).map(x=>[esc(x.code),esc(x.name),fmt(x.opening),fmt(x.balance)]);
 const moves=(d.movements||[]).map(x=>[esc(x.created_at),esc(x.doc),esc(x.week),esc(x.code),esc(x.name),esc(x.type),fmt(x.qty),esc(x.notes),esc(x.username)]);
 const meters=(d.meters||[]).map(x=>[esc(x.serial),esc(x.meter_type),esc(x.capacity),esc(x.status),esc(x.crn),esc(x.meter_code)]);
 const events=(d.meter_events||[]).map(x=>[esc(x.created_at),esc(x.serial),esc(x.action),esc(x.crn),esc(x.notes),esc(x.username)]);
 printReportWindow('كشف الحساب الشامل – '+(p.name||''),
  `<p>رقم الأداء: ${esc(p.performance_no||'—')} | الهاتف: ${esc(p.mobile||'—')}</p><p>عدادات بالعهدة: ${fmt(m.custody)} | مركبة: ${fmt(m.installed)} | مفكوكة: ${fmt(m.removed)}</p><h3>أرصدة الخامات</h3>${table(['الكود','الخامة','افتتاحي','حالي'],mats)}<h3>حركة الخامات</h3>${table(['التاريخ','المستند','الأسبوع','الكود','الخامة','النوع','الكمية','ملاحظات','المستخدم'],moves)}<h3>العدادات المرتبطة</h3>${table(['السيريال','النوع','السعة','الحالة','C.R.N','الكود'],meters)}<h3>حركة العدادات</h3>${table(['التاريخ','السيريال','العملية','C.R.N','ملاحظات','المستخدم'],events)}`);
}



let foremanBatchPageItems=[];
async function openForemanBatchPage(name){
 window.selectedForeman=name;
 await render('foreman-batch');
}
async function initForemanBatchPage(){
 try{
  const d=await api('/foreman-batch-options?kind='+encodeURIComponent($('#batchPageKind').value));
  foremanBatchPageItems=d.items||[];
  $('#batchPageDoc').innerHTML=(d.documents||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')||'<option value="">لا توجد أرقام مستندات متاحة</option>';
  $('#batchPageDocCount').textContent='الأرقام المتاحة: '+(d.documents||[]).length;
  renderForemanBatchRows();
  $('#batchPageKind').onchange=refreshForemanBatchDocs;
 }catch(e){toast(e.message)}
}
async function refreshForemanBatchDocs(){
 try{
  const d=await api('/foreman-batch-options?kind='+encodeURIComponent($('#batchPageKind').value));
  $('#batchPageDoc').innerHTML=(d.documents||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')||'<option value="">لا توجد أرقام مستندات متاحة</option>';
  $('#batchPageDocCount').textContent='الأرقام المتاحة: '+(d.documents||[]).length;
  foremanBatchPageItems=d.items||foremanBatchPageItems;
  renderForemanBatchRows();
 }catch(e){toast(e.message)}
}
function renderForemanBatchRows(){
 const opts=foremanBatchPageItems.map(x=>`<option value="${esc(x.code)}">${esc(x.code+' | '+x.name)}</option>`).join('');
 $('#batchPageRows').innerHTML=Array.from({length:120},(_,i)=>`<tr class="batch-page-row" data-row="${i+1}"><td>${i+1}</td><td><select class="batch-page-code"><option value="">اختر الخامة</option>${opts}</select></td><td><input class="batch-page-qty" type="number" min="0" step="any" style="width:100px"></td><td><input class="batch-page-notes" style="min-width:140px"></td></tr>`).join('');
 document.querySelectorAll('#batchPageRows input,#batchPageRows select').forEach(el=>el.addEventListener('input',updateForemanBatchCount));
 updateForemanBatchCount();
}
function updateForemanBatchCount(){
 let n=0;
 document.querySelectorAll('.batch-page-row').forEach(row=>{
  const code=row.querySelector('.batch-page-code').value,qty=row.querySelector('.batch-page-qty').value;
  if(code&&Number(qty)>0)n++;
 });
 const el=$('#batchPageCount');if(el)el.textContent='عدد البنود المكتملة: '+n+' / 120';
}
function clearForemanBatchPage(){
 if(!confirm('سيتم تفريغ جميع خانات الكشف. متابعة؟'))return;
 renderForemanBatchRows();
}
async function submitForemanBatchPage(){
 const foreman=$('#batchPageForeman').value,month=$('#batchPageMonth').value.trim(),week=Number($('#batchPageWeek').value),kind=$('#batchPageKind').value,doc_no=$('#batchPageDoc').value;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){toast('اكتب الشهر بالشكل YYYY-MM');return}
 if(!doc_no){toast('لا يوجد رقم مستند متاح لهذا النوع');return}
 const entries=[];
 for(const row of document.querySelectorAll('.batch-page-row')){
  const code=row.querySelector('.batch-page-code').value,qty=row.querySelector('.batch-page-qty').value,notes=row.querySelector('.batch-page-notes').value;
  if(!code&&!qty&&!notes)continue;
  if(!code||!qty||Number(qty)<=0){toast('راجع الخامة والكمية في الصف '+row.dataset.row);return}
  entries.push({code,qty:Number(qty),notes});
 }
 if(!entries.length){toast('أدخل بندًا واحدًا على الأقل');return}
 if(!confirm(`سيتم ترحيل ${entries.length} بندًا للفورمان ${foreman} برقم المستند ${doc_no}. هل تريد المتابعة؟`))return;
 try{
  await api('/foreman-batch',{method:'POST',body:JSON.stringify({foreman,month,week,kind,doc_no,entries})});
  toast('تم ترحيل الكشف بنجاح – '+doc_no);
  await refreshForemanBatchDocs();
  renderForemanBatchRows();
 }catch(e){toast(e.message)}
}

async function openForemanBatchEditor(name,month,week,kind){
 try{
  const [itemsResp,opts]=await Promise.all([api('/items'),api('/foreman-batch-options?kind='+encodeURIComponent(kind))]);
  const activeItems=(opts.items||itemsResp.filter(x=>x.active)).map(x=>({code:x.code,name:x.name}));
  const itemOptions=activeItems.map(x=>`<option value="${esc(x.code)}">${esc(x.code+' | '+x.name)}</option>`).join('');
  $('#modalTitle').textContent='كشف خامات جماعي – 120 صف | '+name;
  $('#modalFields').innerHTML=`
   <div class="field"><label>الفورمان</label><input value="${esc(name)}" disabled></div>
   <div class="field"><label>الشهر (YYYY-MM)</label><input id="batchMonth" value="${esc(month)}"></div>
   <div class="field"><label>الأسبوع</label><select id="batchWeek">${[1,2,3,4,5].map(x=>`<option value="${x}" ${x===Number(week)?'selected':''}>الأسبوع ${x}</option>`).join('')}</select></div>
   <div class="field"><label>نوع الحركة</label><select id="batchKind">${['مركب','منصرف','سلف','مرتجع'].map(x=>`<option ${x===kind?'selected':''}>${x}</option>`).join('')}</select></div>
   <div class="field" style="grid-column:1/-1"><label>رقم المستند – رقم واحد للكشف بالكامل ويُستخدم مرة واحدة</label><select id="batchDoc">${(opts.documents||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select><small id="batchDocHint">الأرقام المتاحة: ${(opts.documents||[]).length}</small></div>
   <div style="grid-column:1/-1"><div class="toolbar"><b>بنود الكشف (حتى 120 صفًا)</b><span class="spacer"></span></div>
   <div class="table-wrap" style="max-height:48vh;overflow:auto"><table><thead><tr><th>م</th><th>الخامة</th><th>الكمية</th><th>ملاحظات</th></tr></thead><tbody>${Array.from({length:120},(_,i)=>`<tr><td>${i+1}</td><td><select class="batchCode" data-row="${i+1}"><option value="">اختر خامة</option>${itemOptions}</select></td><td><input class="batchQty" data-row="${i+1}" type="number" min="0" step="any"></td><td><input class="batchNotes" data-row="${i+1}"></td></tr>`).join('')}</tbody></table></div></div>`;
  document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-gold" type="submit">ترحيل الكشف بالكامل</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>';
  $('#modalBack').style.display='flex';
  $('#batchKind').onchange=async()=>{
   try{
    const k=$('#batchKind').value,d=await api('/foreman-batch-options?kind='+encodeURIComponent(k));
    $('#batchDoc').innerHTML=(d.documents||[]).map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
    $('#batchDocHint').textContent='الأرقام المتاحة: '+(d.documents||[]).length;
   }catch(e){toast(e.message)}
  };
  $('#modalForm').onsubmit=async e=>{
   e.preventDefault();
   const m=$('#batchMonth').value.trim(),w=Number($('#batchWeek').value),k=$('#batchKind').value,doc=$('#batchDoc').value;
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)){toast('اكتب الشهر بالشكل YYYY-MM');return}
   const entries=[];
   for(let i=1;i<=120;i++){
    const code=document.querySelector(`.batchCode[data-row="${i}"]`).value;
    const qty=document.querySelector(`.batchQty[data-row="${i}"]`).value;
    
    const notes=document.querySelector(`.batchNotes[data-row="${i}"]`).value;
    if(!code&&!qty&&!notes)continue;
    if(!code||!qty||Number(qty)<=0){toast('راجع الخامة والكمية في الصف '+i);return}
    entries.push({code,qty:Number(qty),notes});
   }
   if(!entries.length){toast('أدخل بندًا واحدًا على الأقل');return}
   if(!doc){toast('لا يوجد رقم مستند متاح لهذا النوع. راجع قائمة أرقام المستندات المستوردة');return}
   if(!confirm(`سيتم ترحيل ${entries.length} بندًا للفورمان ${name} برقم المستند ${doc}. هل تريد المتابعة؟`))return;
   try{
    await api('/foreman-batch',{method:'POST',body:JSON.stringify({foreman:name,month:m,week:w,kind:k,doc_no:doc,entries})});
    closeModal();toast('تم ترحيل الكشف الجماعي بنجاح – '+doc);
    await openWeeklyMovements(name);
   }catch(err){toast(err.message)}
  };
 }catch(e){toast(e.message)}
}
function exportMeterProfile(){
 const d=window.currentMeterProfile;if(!d)return;
 const m=d.meter||{},rows=[['بطاقة العداد'],['البيان','القيمة'],
 ['السيريال',m.serial],['النوع',m.meter_type],['كود العداد',m.meter_code],['السعة',m.capacity],['الحالة',m.status],['الفورمان',m.foreman],['C.R.N',m.crn],['تاريخ الوارد',m.received_at],[],
 ['سجل الحركات'],['التاريخ','الحركة','الفورمان','C.R.N','المستخدم','ملاحظات']];
 (d.events||[]).forEach(x=>rows.push([x.created_at,x.action,x.foreman,x.crn,x.username,x.notes]));
 rows.push([],['مستندات الوارد'],['رقم المستند','التاريخ']);(d.receipts||[]).forEach(x=>rows.push([x.doc_no,x.created_at]));
 rows.push([],['مستندات الصرف'],['رقم المستند','التاريخ']);(d.issues||[]).forEach(x=>rows.push([x.doc_no,x.created_at]));
 rows.push([],['مستندات التركيب'],['رقم المستند','التاريخ','C.R.N','الفورمان']);(d.installs||[]).forEach(x=>rows.push([x.doc_no,x.created_at,x.crn,x.foreman]));
 rows.push([],['تغييرات العداد'],['رقم','القديم','الجديد','الفورمان','C.R.N','السبب','التاريخ']);(d.replacements||[]).forEach(x=>rows.push([x.id,x.old_serial,x.new_serial,x.foreman,x.crn,x.reason,x.created_at]));
 downloadCsvFile('بطاقة_عداد_'+(m.serial||'').replace(/[\\/:*?"<>|]/g,'_')+'.csv',rows);
}

async function openForemanDocuments(name){window.selectedForeman=name;await render('foreman-documents')}
async function loadForemanDocuments(){
 const name=$('#custodyDocForeman')?.value||'',q=$('#custodyDocSearch')?.value||'';
 if(!name){toast('اختر الفورمان');return}
 try{
  const rows=await api('/foreman-documents?foreman='+encodeURIComponent(name)+'&q='+encodeURIComponent(q));
  const labels={'movement':'تفاصيل الحركة','foreman-transfer':'تفاصيل التسليم','foreman-stocktake':'تفاصيل الجرد','meter-issue':'تفاصيل صرف العدادات','meter-install':'تفاصيل التركيب','meter-return':'تفاصيل الإرجاع'};
  $('#custodyDocResults').innerHTML=`<div class="panel-title"><h3>مستندات ${esc(name)}</h3><span class="badge">${rows.length} مستند</span></div>`+
   table(['نوع المستند','رقم المستند','التاريخ','الفورمان / الأطراف','عدد البنود','الحالة','الإجراء'],rows.map(x=>[esc(x.kind_label),`<b>${esc(x.doc_no)}</b>`,esc(x.created_at),esc(x.owner),fmt(x.line_count),esc(x.status),x.kind==='movement'?`<button class="btn btn-dark" onclick="openMovementDocument('${esc(x.doc_no)}','${esc(name)}')">عرض الحركة</button>`:`<button class="btn btn-dark" onclick="showDocumentDetail('${esc(x.kind)}',${x.doc_id})">التفاصيل</button>`]));
 }catch(e){toast(e.message)}
}
async function openMovementDocument(doc,name){
 try{
  const rows=await api('/foreman-document-lines?doc='+encodeURIComponent(doc)+'&foreman='+encodeURIComponent(name));
  if(!Array.isArray(rows)||!rows.length){toast('لا توجد بنود لهذا المستند');return}
  window.currentMovementDocument={doc,name,rows};
  const headers=['التاريخ','الكود','الخامة','النوع','الكمية','الأسبوع','الملاحظات','المستخدم'];
  const mapped=rows.map(x=>[esc(x.created_at),esc(x.code),esc(x.name),esc(x.type),fmt(x.qty),esc(x.week),esc(x.notes),esc(x.username)]);
  const total=rows.reduce((n,x)=>n+(Number(x.qty)||0),0);
  $('#modalTitle').textContent='تفاصيل مستند العهدة – '+doc;
  $('#modalFields').innerHTML=`
   <div class="panel" style="margin-bottom:10px;padding:12px">
    <div class="toolbar" style="gap:8px;flex-wrap:wrap">
     <span class="badge gold">رقم المستند: ${esc(doc)}</span>
     <span class="badge">الفورمان: ${esc(name)}</span>
     <span class="badge">${rows.length} بند</span>
     <span class="badge">إجمالي الكميات: ${fmt(total)}</span>
    </div>
   </div>
   <div class="table-wrap">${table(headers,mapped)}</div>`;
  $('#modalBack').style.display='flex';
  document.querySelector('#modalForm .modal-actions').innerHTML=`
   <button class="btn btn-gold" type="button" onclick="printMovementDocument()">معاينة / طباعة PDF</button>
   <button class="btn btn-cyan" type="button" onclick="exportMovementDocument()">تصدير إلى Excel</button>
   <button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>`;
 }catch(e){toast(e.message)}
}
function exportMovementDocument(){
 const d=window.currentMovementDocument;if(!d)return;
 const rows=[['EGYPT GAS — تفاصيل مستند العهدة'],['رقم المستند',d.doc],['الفورمان',d.name],[],['التاريخ','الكود','الخامة','النوع','الكمية','الأسبوع','الملاحظات','المستخدم'],
 ...d.rows.map(x=>[x.created_at,x.code,x.name,x.type,x.qty,x.week,x.notes,x.username])];
 downloadCsvFile('مستند_عهدة_'+String(d.doc).replace(/[^\w\-]/g,'_')+'.csv',rows);
 
}
function printMovementDocument(){
 const d=window.currentMovementDocument;if(!d)return;
 const rows=d.rows.map(x=>[esc(x.created_at),esc(x.code),esc(x.name),esc(x.type),fmt(x.qty),esc(x.week),esc(x.notes),esc(x.username)]);
 const content=`<div class="brand-head">
  <img src="data:image/png;base64,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" alt="شعار EGYPT GAS">
  <div class="brand-title"><h2>EGYPT GAS — غاز مصر</h2><div>منظومة إدارة الخامات والعدادات — منطقة العبور</div><h3>مستند عهدة فورمان</h3></div>
 </div>
 <div class="document-meta">
  <div><span>رقم المستند</span><strong>${esc(d.doc)}</strong></div>
  <div class="foreman-name"><span>اسم الفورمان المستلم</span><strong>${esc(d.name||'غير محدد')}</strong></div>
  <div><span>عدد البنود</span><strong>${d.rows.length}</strong></div>
 </div>
 ${table(['التاريخ','الكود','الخامة','النوع','الكمية','الأسبوع','الملاحظات','المستخدم'],rows)}
 <p class="signatures"><span>أمين المخزن: __________________</span><span>الفورمان: __________________</span><span>المسؤول المختص: __________________</span></p>`;
 printReportWindow('مستند عهدة '+d.doc,content);
}
async function openMeterGlobalSearch(){
 $('#modalTitle').textContent='البحث الشامل في العدادات';
 $('#modalFields').innerHTML=`<div class="field" style="grid-column:1/-1"><label>بحث بالسيريال أو C.R.N أو كود العداد أو النوع أو الفورمان أو الحالة</label><input id="meterGlobalQuery" class="search" placeholder="اكتب أي جزء من البيانات ثم ابحث"><div id="meterGlobalResults" class="empty">اكتب كلمة البحث لعرض النتائج.</div></div>`;
 document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>';
 $('#modalBack').style.display='flex';
 const run=async()=>{
  const q=$('#meterGlobalQuery').value.trim();
  if(!q){$('#meterGlobalResults').innerHTML='اكتب كلمة البحث لعرض النتائج.';return}
  try{
   const rows=await api('/meter-global-search?q='+encodeURIComponent(q));
   $('#meterGlobalResults').innerHTML=rows.length?table(['السيريال','كود العداد','النوع','السعة','الحالة','الفورمان','C.R.N','تاريخ الوارد','آخر حركة'],rows.map(x=>[
    `<button class="btn btn-cyan" onclick="closeModal();openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,esc(x.meter_code),esc(x.meter_type),esc(x.capacity),
    esc(({STOCK:'بالمخزن',CUSTODY:'عهدة الفورمان',INSTALLED:'مركب',REMOVED:'مفكوك'}[x.status]||x.status)),esc(x.foreman),esc(x.crn),esc(x.received_at),esc(x.last_event)
   ])):'لا توجد نتائج مطابقة';
  }catch(e){toast(e.message)}
 };
 $('#meterGlobalQuery').addEventListener('keydown',e=>{if(e.key==='Enter')run()});
 $('#meterGlobalQuery').addEventListener('input',debounce(run,300));
}
async function searchMeterCrnTimeline(){
 const q=$('#crnSearch')?.value.trim()||'';
 if(!q){toast('اكتب رقم C.R.N أو السيريال');return}
 try{
  const d=await api('/meter-crn-timeline?q='+encodeURIComponent(q));
  const statusLabel=x=>({STOCK:'بالمخزن',CUSTODY:'عهدة الفورمان',INSTALLED:'مركب',REMOVED:'مفكوك'}[x]||x);
  $('#crnTimelineResults').innerHTML=`<div class="panel-title"><h3>العدادات المرتبطة بالبحث</h3><span class="badge">${d.meters.length} عداد</span></div>`+
   (d.meters.length?table(['السيريال','النوع','السعة','الحالة الحالية','الفورمان','C.R.N','تاريخ الوارد'],d.meters.map(x=>[
    `<button class="btn btn-cyan" onclick="openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,esc(x.meter_type),esc(x.capacity),statusLabel(x.status),esc(x.foreman),esc(x.crn),esc(x.received_at)
   ])):'<div class="empty">لا توجد عدادات حالية مطابقة</div>')+
   `<div class="panel-title"><h3>السجل التاريخي للحركات والتغييرات</h3><span class="badge">${d.events.length} حركة</span></div>`+
   (d.events.length?table(['التاريخ','السيريال','العملية','الفورمان','C.R.N','المستخدم','ملاحظات'],d.events.map(x=>[esc(x.created_at),`<button class="btn btn-cyan" onclick="openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,esc(x.action),esc(x.foreman),esc(x.crn),esc(x.username),esc(x.notes)])):'<div class="empty">لا يوجد سجل حركات مسجل لهذا البحث</div>');
 }catch(e){toast(e.message)}
}




async function runGlobalSearch(){
 const term=$('#globalSearchTerm')?.value.trim()||'',kind=$('#globalSearchKind')?.value||'الكل';
 if(term.length<2){toast('اكتب حرفين أو رقمين على الأقل');return}
 $('#globalSearchSummary').textContent='جارٍ البحث في قاعدة البيانات...';
 $('#globalSearchResults').innerHTML='';
 try{
  const d=await api('/global-search?q='+encodeURIComponent(term)+'&kind='+encodeURIComponent(kind));
  $('#globalSearchSummary').textContent='عدد النتائج: '+fmt(d.count)+' · البحث للعرض فقط ولا يغير أي بيانات';
  $('#globalSearchResults').innerHTML=table(['القسم','الرقم / الكود','البيان','الحالة / التاريخ','فتح'],d.results.map(x=>[
   esc(x.section),esc(x.key),esc(x.description),esc(x.status),
   `<button class="btn btn-cyan" data-gs-target="${esc(x.target)}" data-gs-id="${esc(x.target_id)}">فتح</button>`
  ]));
  $('#globalSearchResults').querySelectorAll('[data-gs-target]').forEach(b=>b.addEventListener('click',()=>{
   const target=b.dataset.gsTarget,id=b.dataset.gsId;
   if(target==='meter')openMeterProfile(id);
   else if(target==='items')render('items');
   else if(target==='foremen')render('foremen');
   else if(target==='material-movement')showDocumentDetail('material-movement',Number(id));
   else if(target)showDocumentDetail(target,Number(id));
  }));
 }catch(e){$('#globalSearchSummary').textContent=e.message;toast(e.message)}
}

async function openDiagnosticDetail(key,title){
 try{
  const d=await api('/alert-detail?key='+encodeURIComponent(key));
  $('#modalTitle').textContent='تفاصيل: '+title;
  $('#modalFields').innerHTML=`<div class="toolbar"><input id="diagnosticSearch" class="search" placeholder="بحث داخل النتائج"><span class="badge">${d.rows.length} سجل</span></div><div id="diagnosticTable"></div>`;
  const renderRows=()=>{
   const q=($('#diagnosticSearch').value||'').trim().toLowerCase();
   const filtered=d.rows.filter(row=>Object.values(row).join(' ').toLowerCase().includes(q));
   $('#diagnosticTable').innerHTML=table(d.columns,filtered.map(row=>d.columns.map((_,i)=>esc(Object.values(row)[i]??''))));
   const count=document.querySelector('#modalFields .badge');if(count)count.textContent=filtered.length+' سجل';
  };
  document.querySelector('#modalForm .modal-actions').innerHTML=`<button class="btn btn-cyan" type="button" onclick="exportDiagnosticDetail()">تصدير CSV</button><button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>`;
  window.currentDiagnosticExport={title,columns:d.columns,rows:d.rows};
  $('#diagnosticSearch').addEventListener('input',renderRows);
  $('#modalBack').style.display='flex';renderRows();
 }catch(e){toast(e.message)}
}
function exportDiagnosticDetail(){
 const d=window.currentDiagnosticExport;if(!d)return;
 downloadCsvFile('EGYPT_GAS_'+d.title.replace(/[\\/:*?"<>|]/g,'_')+'.csv',[d.columns,...d.rows.map(row=>d.columns.map((_,i)=>Object.values(row)[i]??''))]);
 
}


function renderDocumentRegisterRows(){
 const rows=window.documentRegisterRows||[],q=($('#docRegSearch')?.value||'').trim().toLowerCase(),kind=$('#docRegKind')?.value||'الكل';
 const filtered=rows.filter(x=>(kind==='الكل'||x.kind_label===kind)&&(!q||[x.kind_label,x.doc_no,x.owner,x.created_at,x.source,x.approval].join(' ').toLowerCase().includes(q)));
 $('#docRegCount').textContent=filtered.length+' مستند';
 $('#docRegTable').innerHTML=table(['النوع','رقم المستند','الفورمان / الجهة','التاريخ','عدد البنود','المصدر','الاعتماد','التفاصيل'],filtered.map(x=>[
  esc(x.kind_label),esc(x.doc_no),esc(x.owner),esc(x.created_at),fmt(x.line_count),esc(x.source),
  esc(({APPROVED:'معتمد',REJECTED:'مرفوض',PENDING:'قيد الاعتماد'}[x.approval]||x.approval)),
  `<button class="btn btn-dark" onclick="showDocumentDetail('${esc(x.kind)}',${Number(x.id)})">التفاصيل / طباعة</button>`
 ]));
}
function exportDocumentRegister(){
 const rows=window.documentRegisterRows||[];
 downloadCsvFile('EGYPT_GAS_Document_Register.csv',[
  ['النوع','رقم المستند','الفورمان / الجهة','التاريخ','عدد البنود','المصدر','حالة الاعتماد'],
  ...rows.map(x=>[x.kind_label,x.doc_no,x.owner,x.created_at,x.line_count,x.source,({APPROVED:'معتمد',REJECTED:'مرفوض',PENDING:'قيد الاعتماد'}[x.approval]||x.approval)])
 ]);
}

async function showMeterTypeSerials(name){
 try{
  const rows=await api('/meter-type-serials?name='+encodeURIComponent(name));
  const counts={};rows.forEach(x=>counts[x.status_label]=(counts[x.status_label]||0)+1);
  $('#modalTitle').textContent='أرقام العدادات – '+name;
  $('#modalFields').innerHTML=`<div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi"><div class="label">إجمالي العدادات</div><div class="value">${rows.length}</div></div>${Object.entries(counts).map(([k,v])=>`<div class="kpi"><div class="label">${esc(k)}</div><div class="value">${v}</div></div>`).join('')}</div>`+
   table(['السيريال','كود العداد','السعة','الحالة الحالية','الفورمان','C.R.N','تاريخ الوارد'],rows.map(x=>[
    `<button class="btn btn-cyan" onclick="closeModal();openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,esc(x.meter_code),esc(x.capacity),esc(x.status_label),esc(x.foreman),esc(x.crn),esc(x.received_at)
   ]));
  document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>';
  $('#modalBack').style.display='flex';
 }catch(e){toast(e.message)}
}
async function openMeterIssueSearch(){
 $('#modalTitle').textContent='البحث في مستندات صرف العدادات';
 $('#modalFields').innerHTML=`<div class="field" style="grid-column:1/-1"><label>بحث بالسيريال أو كود العداد أو الفورمان أو رقم المستند</label><input id="issuePopupQuery" class="search" placeholder="اكتب كلمة البحث"><div id="issuePopupResults" class="empty">اكتب كلمة البحث لعرض النتائج.</div></div>`;
 document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>';
 $('#modalBack').style.display='flex';
 const run=async()=>{
  const q=$('#issuePopupQuery').value.trim();
  try{
   const rows=await api('/meter-issue-search?q='+encodeURIComponent(q));
   $('#issuePopupResults').innerHTML=table(['السيريال','كود العداد','النوع','الفورمان','تاريخ الصرف','رقم المستند','التفاصيل'],rows.map(x=>[
    `<button class="btn btn-cyan" onclick="closeModal();openMeterProfile('${esc(x.serial)}')">${esc(x.serial)}</button>`,esc(x.meter_code),esc(x.meter_type),esc(x.foreman),esc(x.created_at),esc(x.doc_no),
    `<button class="btn btn-dark" onclick="showDocumentDetail('meter-issue',${x.doc_id})">فتح المستند</button>`
   ]));
  }catch(e){toast(e.message)}
 };
 $('#issuePopupQuery').addEventListener('input',debounce(run,250));
 $('#issuePopupQuery').addEventListener('keydown',e=>{if(e.key==='Enter')run()});
 run();
}

async function openMeterProfile(serial){
 try{
  const d=await api('/meter-profile?serial='+encodeURIComponent(serial)),m=d.meter||{};
  const states={STOCK:'بالمخزن',CUSTODY:'بعهدة الفورمان',INSTALLED:'مركب',REMOVED:'مفكوك'};
  const tiles=[['السيريال',m.serial],['كود العداد',m.meter_code],['النوع',m.meter_type],['السعة',m.capacity],['الحالة',states[m.status]||m.status],['الفورمان',m.foreman],['C.R.N',m.crn],['تاريخ الوارد',m.received_at]];
  $('#modalTitle').textContent='بطاقة العداد الذكية – '+serial;
  $('#modalFields').innerHTML=`<section class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">${tiles.map(x=>`<div class="kpi"><div class="label">${esc(x[0])}</div><div class="value" style="font-size:14px">${esc(x[1]||'—')}</div></div>`).join('')}</section>
  <h3>سجل الحركات</h3>${table(['التاريخ','الحركة','الفورمان','C.R.N','المستخدم','ملاحظات'],(d.events||[]).map(x=>[esc(x.created_at),esc(x.action),esc(x.foreman),esc(x.crn),esc(x.username),esc(x.notes)]))}
  <h3>مستندات الوارد</h3>${table(['رقم المستند','التاريخ'],(d.receipts||[]).map(x=>[esc(x.doc_no),esc(x.created_at)]))}
  <h3>مستندات الصرف</h3>${table(['رقم المستند','التاريخ'],(d.issues||[]).map(x=>[esc(x.doc_no),esc(x.created_at)]))}
  <h3>مستندات التركيب</h3>${table(['رقم المستند','التاريخ','C.R.N','الفورمان'],(d.installs||[]).map(x=>[esc(x.doc_no),esc(x.created_at),esc(x.crn),esc(x.foreman)]))}
  <h3>عمليات تغيير العداد</h3>${table(['رقم','القديم','الجديد','الفورمان','C.R.N','السبب','التاريخ'],(d.replacements||[]).map(x=>[x.id,esc(x.old_serial),esc(x.new_serial),esc(x.foreman),esc(x.crn),esc(x.reason),esc(x.created_at)]))}
  <h3>حالة الفحص والإصلاح</h3>${table(['التصنيف','حالة المتابعة','آخر تحديث','بواسطة','ملاحظات'],[[esc(d.removed?.condition||'—'),esc(d.workflow?.state||'—'),esc(d.workflow?.updated_at||'—'),esc(d.workflow?.updated_by||'—'),esc(d.workflow?.notes||d.removed?.reason||'—')]])}
  <h3>طلبات الإرجاع واعتمادها</h3>${table(['رقم الطلب','التاريخ','الحالة','مقدم الطلب','المراجع','تاريخ المراجعة','السبب / الملاحظات'],(d.returns||[]).map(x=>[esc(x.doc_no),esc(x.created_at),esc(({PENDING:'قيد الاعتماد',APPROVED:'معتمد',REJECTED:'مرفوض'}[x.approval]||x.approval)),esc(x.username),esc(x.reviewed_by||'—'),esc(x.reviewed_at||'—'),esc(x.approval_reason||x.notes||'—')]))}
  <p class="caption">بطاقة للعرض والمراجعة فقط؛ لا تنفذ أي تغيير في حالة العداد أو أرصدته.</p>`;
  window.currentMeterProfile={meter:m,events:d.events||[],receipts:d.receipts||[],issues:d.issues||[],installs:d.installs||[],replacements:d.replacements||[],returns:d.returns||[],workflow:d.workflow||{},removed:d.removed||{}};
  $('#modalBack').style.display='flex';
  document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-cyan" type="button" onclick="exportMeterProfile()">تصدير بطاقة العداد Excel / CSV</button><button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>';
 }catch(e){toast(e.message)}
}

function monthNow(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
async function openWeeklyMovements(name){
 $('#modalForm').classList.add('wide');
 const month=monthNow();
 try{
  const d=await api('/foreman-weekly?foreman='+encodeURIComponent(name)+'&month='+encodeURIComponent(month));
  const rows=d.rows||[],totals=d.totals||[],loans=d.loans||[];
  const body=rows.map(x=>[x.id,'الأسبوع '+x.week,esc(x.kind),esc(x.doc),esc(x.code),esc(x.name),fmt(x.qty),esc(x.sheet_ref),esc(x.notes),
   `<button class="btn btn-dark" onclick="editWeeklyMovement('${esc(name)}',${x.id},'${esc(month)}')">تعديل</button> <button class="btn btn-danger" onclick="deleteWeeklyMovement('${esc(name)}',${x.id},'${esc(month)}')">حذف</button>`]);
  const totalText=totals.map(x=>`${esc(x.kind)} – الأسبوع ${x.week}: ${fmt(x.qty)}`).join(' | ')||'لا توجد حركات لهذا الشهر';
  const items=await api('/items');
  openModal('إدارة الحركة الأسبوعية – '+name,[
   {name:'month',label:'الشهر (YYYY-MM)',defaultValue:month},
   {name:'week',label:'الأسبوع',options:[1,2,3,4,5].map(x=>({value:String(x),label:'الأسبوع '+x})),defaultValue:'1'},
   {name:'kind',label:'نوع الحركة',options:['منصرف','مركب','سلف','مرتجع'].map(x=>({value:x,label:x})),defaultValue:'مركب'},
   {name:'code',label:'الخامة',options:items.map(x=>({value:x.code,label:x.code+' | '+x.name}))},
   {name:'qty',label:'الكمية',type:'number'},
   {name:'notes',label:'ملاحظات',required:false}
  ],async form=>{await api('/foreman-weekly',{method:'POST',body:JSON.stringify({...form,foreman:name,week:Number(form.week)})});toast('تم تسجيل الحركة الأسبوعية')});
  window.currentWeeklyPrint={name,month,rows,totals,loans};
  $('#modalFields').insertAdjacentHTML('beforeend',`<div class="field" style="grid-column:1/-1"><div class="toolbar"><button class="btn btn-cyan" type="button" onclick="exportWeeklyStatement()">تصدير Excel / CSV</button><button class="btn btn-dark" type="button" onclick="printWeeklyStatement()">طباعة / PDF</button><button class="btn btn-gold" type="button" onclick="openForemanBatchEditor('${esc(name)}','${esc(month)}',1,'مركب')">كشف 120 صف بالقوائم المنسدلة</button></div><label>ملخص الشهر</label><div>${totalText}</div></div><div class="field" style="grid-column:1/-1"><label>الحركات المسجلة</label>${table(['رقم','الأسبوع','النوع','المستند','الكود','الخامة','الكمية','مرجع الشيت','ملاحظات','إجراء'],body)}</div><div class="field" style="grid-column:1/-1"><label>سجل السلف في الشهر</label>${table(['التاريخ','المستند','الكود','الخامة','الكمية','المصدر'],loans.map(x=>[esc(x.created_at),esc(x.doc),esc(x.code),esc(x.name),fmt(x.qty),esc(x.source)]))}</div>`);
 }catch(e){toast(e.message)}
}
async function editWeeklyMovement(name,id,month){
 try{
  const d=await api('/foreman-weekly?foreman='+encodeURIComponent(name)+'&month='+encodeURIComponent(month));
  const x=(d.rows||[]).find(r=>Number(r.id)===Number(id));if(!x){toast('الحركة غير موجودة');return}
  const items=await api('/items');
  openModal('تعديل حركة أسبوعية رقم '+id,[
   {name:'month',label:'الشهر (YYYY-MM)',defaultValue:x.month},
   {name:'week',label:'الأسبوع',options:[1,2,3,4,5].map(v=>({value:String(v),label:'الأسبوع '+v})),defaultValue:String(x.week)},
   {name:'kind',label:'نوع الحركة',options:['منصرف','مركب','سلف','مرتجع'].map(v=>({value:v,label:v})),defaultValue:x.kind},
   {name:'code',label:'الخامة',options:items.map(v=>({value:v.code,label:v.code+' | '+v.name})),defaultValue:x.code},
   {name:'qty',label:'الكمية',type:'number',defaultValue:x.qty},
   {name:'notes',label:'ملاحظات',defaultValue:x.notes||'',required:false}
  ],async form=>{await api('/foreman-weekly',{method:'POST',body:JSON.stringify({...form,action:'update',id,foreman:name,week:Number(form.week)})});toast('تم تعديل الحركة')});
 }catch(e){toast(e.message)}
}
async function deleteWeeklyMovement(name,id,month){
 if(!confirm('سيتم حذف الحركة الأسبوعية وعكس أثرها على رصيد المخزن حسب نوع الحركة. هل تريد المتابعة؟'))return;
 try{
  const d=await api('/foreman-weekly?foreman='+encodeURIComponent(name)+'&month='+encodeURIComponent(month));
  const x=(d.rows||[]).find(r=>Number(r.id)===Number(id));if(!x)throw new Error('الحركة غير موجودة');
  await api('/foreman-weekly',{method:'POST',body:JSON.stringify({action:'delete',id,foreman:name,month:x.month,week:x.week,kind:x.kind,code:x.code,qty:x.qty})});
  toast('تم حذف الحركة وعكس أثرها');closeModal();await openWeeklyMovements(name)
 }catch(e){toast(e.message)}
}
async function openForemanLedger(name){
 try{
  const d=await api('/foreman-ledger?foreman='+encodeURIComponent(name));
  const p=d.person||{},m=d.meter_summary||{};
  const content=`<section class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="kpi"><div class="label">عدادات بالعهدة</div><div class="value">${fmt(m.custody)}</div></div><div class="kpi"><div class="label">عدادات مركبة</div><div class="value">${fmt(m.installed)}</div></div><div class="kpi"><div class="label">عدادات مفكوكة</div><div class="value">${fmt(m.removed)}</div></div></section>
  <h3>أرصدة الخامات</h3>${table(['الكود','الخامة','رصيد افتتاحي','الرصيد الحالي'],(d.materials||[]).map(x=>[esc(x.code),esc(x.name),fmt(x.opening),fmt(x.balance)]))}
  <h3>كشف حركة الخامات</h3>${table(['التاريخ','المستند','الأسبوع','الكود','الخامة','نوع الحركة','الكمية','ملاحظات','المستخدم'],(d.movements||[]).map(x=>[esc(x.created_at),esc(x.doc),esc(x.week),esc(x.code),esc(x.name),esc(x.type),fmt(x.qty),esc(x.notes),esc(x.username)]))}
  <h3>سجل العدادات المرتبطة بالفورمان</h3>${table(['السيريال','النوع','السعة','الحالة','C.R.N','كود العداد'],(d.meters||[]).map(x=>[esc(x.serial),esc(x.meter_type),esc(x.capacity),esc(x.status),esc(x.crn),esc(x.meter_code)]))}
  <h3>تاريخ حركة العدادات</h3>${table(['التاريخ','السيريال','العملية','C.R.N','ملاحظات','المستخدم'],(d.meter_events||[]).map(x=>[esc(x.created_at),esc(x.serial),esc(x.action),esc(x.crn),esc(x.notes),esc(x.username)]))}`;
  window.currentForemanLedger={data:d};
  openModal('كشف الحساب الشامل – '+p.name,[{name:'info',label:'رقم الأداء: '+(p.performance_no||'—')+' | الهاتف: '+(p.mobile||'—'),required:false}],async()=>{});
  $('#modalFields').innerHTML=`<div style="grid-column:1/-1"><div class="toolbar"><button class="btn btn-cyan" type="button" onclick="exportForemanLedger()">تصدير كشف الحساب Excel / CSV</button><button class="btn btn-dark" type="button" onclick="printForemanLedger()">طباعة كشف الحساب / PDF</button></div>${content}</div>`;
 }catch(e){toast(e.message)}
}

const BASIC_REPORTS=['الأصناف والأرصدة','الحركات','أرشيف نوفمبر','العدادات الحالية','حركة العدادات','الفورمانات','مستندات وارد العدادات','مستندات صرف العدادات'];
const ADVANCED_REPORTS=['أرصدة المخزن الحالية','مستندات وارد المخزن','حركة الخامات حسب الفترة','عهدة الفورمانات من العدادات','حالة العدادات','تركيبات العدادات حسب الفترة','حركة العدادات حسب الفترة','مستندات الوارد والصرف وحالة الاعتماد','أداء الفورمانات في تركيب العدادات','ملخص التالف والإصلاح والعدادات المرتجعة','سجل دورة حياة العداد والاستبدال والإرجاع','كشف عهدة وحركة كل فورمان','سجل محاضر جرد ومطابقة عهدة الفورمانات','سجل تسليم واستلام العهدة بين الفورمانات'];
let currentReport=null;
function reportCategory(name){
 const n=String(name||'');
 if(/مخزن|أصناف|أرصدة|خامات|حركة الخامات|تالف/.test(n))return 'المخزن والخامات';
 if(/عداد|تركيب|استبدال|إصلاح|دورة حياة/.test(n))return 'منظومة العدادات';
 if(/فورمان|عهدة|تسليم واستلام/.test(n))return 'عهدة الفورمانات';
 if(/مستند|اعتماد|أرشيف/.test(n))return 'المستندات والاعتمادات';
 return 'تقارير عامة ومؤشرات';
}
function reportDescription(name){
 const map={
 'الأصناف والأرصدة':'الأرصدة الافتتاحية والواردة والحالية لكل صنف',
 'الحركات':'سجل حركات الوارد والصرف المسجلة',
 'أرشيف نوفمبر':'ملخص أرشيف عهدة نوفمبر',
 'العدادات الحالية':'حالة العدادات حسب موقعها الحالي',
 'حركة العدادات':'سجل حركة العدادات',
 'الفورمانات':'دليل الفورمانات وبيانات العهدة',
 'مستندات وارد العدادات':'مستندات إدخال العدادات إلى المخزن',
 'مستندات صرف العدادات':'مستندات صرف العدادات للفورمانات'
 };
 return map[name]||'تقرير تفصيلي مستخرج مباشرة من قاعدة بيانات المنظومة';
}
function renderReportCenter(advanced){
 const opts=advanced?ADVANCED_REPORTS:BASIC_REPORTS;
 const categories=[...new Set(opts.map(reportCategory))];
 const grouped=categories.map(cat=>({cat,names:opts.filter(x=>reportCategory(x)===cat)}));
 $('#main').innerHTML=pageHead(advanced?'التقارير الإدارية المتقدمة':'تقارير الإدارة','مركز تقارير احترافي — اختر القسم ثم التقرير، واستعرض النتائج قبل الطباعة أو التصدير',
 `<button class="btn btn-dark" onclick="toggleReportDetails()">إظهار / إخفاء تفاصيل التقرير</button>`)+
 `<section class="panel report-center" style="padding:18px">
   <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
    <div style="flex:1;min-width:220px">
     <div class="eyebrow">مركز التقارير والتحليلات</div>
     <h2 style="margin:5px 0;color:var(--gold)">لوحة إعداد التقرير</h2>
     <div class="caption">حدد مجموعة التقارير من القائمة المنسدلة ثم اختر التقرير المطلوب</div>
    </div>
    <span class="badge gold">${opts.length} تقرير متاح</span>
   </div>
   <div class="grid2" style="margin-bottom:14px">
    <div class="field"><label>مجموعة التقارير</label><select id="reportGroup" class="search">${grouped.map(g=>`<option value="${esc(g.cat)}">${esc(g.cat)} (${g.names.length})</option>`).join('')}</select></div>
    <div class="field"><label>اسم التقرير</label><select id="reportPicker" class="search">${grouped.map(g=>`<optgroup label="${esc(g.cat)}">${g.names.map(x=>`<option>${esc(x)}</option>`).join('')}</optgroup>`).join('')}</select></div>
   </div>
   <div id="reportDescription" class="report-description" style="padding:13px 15px;border:1px solid #315b76;border-radius:12px;background:linear-gradient(120deg,#102d43,#0a1e30);color:#c9d9e5;margin-bottom:14px"></div>
   <div class="grid2" style="margin-bottom:14px">
    <div class="field"><label>من تاريخ</label><input class="search" id="reportFrom" type="date"></div>
    <div class="field"><label>إلى تاريخ</label><input class="search" id="reportTo" type="date"></div>
   </div>
   <div class="toolbar" style="gap:9px;flex-wrap:wrap">
    <input class="search" id="reportTerm" style="flex:1;min-width:210px" placeholder="بحث داخل نتائج التقرير...">
    <button class="btn btn-gold" id="runReport">عرض التقرير</button>
    <button class="btn btn-cyan" id="exportReport">تصدير Excel</button>
    <button class="btn btn-dark" id="printReport">معاينة / طباعة PDF</button>
   </div>
   <div id="reportSummary" class="report-summary" style="margin-top:16px;padding:14px;border-radius:12px;background:#081c2d;border:1px solid #244b65">اختر التقرير واضغط عرض التقرير</div>
   <details id="reportDetails" open style="margin-top:14px">
    <summary style="cursor:pointer;color:var(--gold);font-weight:800;padding:10px">تفاصيل ونتائج التقرير</summary>
    <div id="reportResult" style="margin-top:10px"></div>
   </details>
 </section>`;
 const group=$('#reportGroup'),picker=$('#reportPicker');
 function syncPicker(){
  const wanted=group.value;
  const valid=opts.filter(x=>reportCategory(x)===wanted);
  const current=picker.value;
  picker.innerHTML=valid.map(x=>`<option>${esc(x)}</option>`).join('');
  if(valid.includes(current))picker.value=current;
  $('#reportDescription').textContent=reportDescription(picker.value);
  loadReport();
 }
 group.onchange=syncPicker;
 picker.onchange=()=>{$('#reportDescription').textContent=reportDescription(picker.value);loadReport()};
 $('#runReport').onclick=()=>loadReport();
 $('#reportTerm').onkeydown=e=>{if(e.key==='Enter')loadReport()};
 $('#exportReport').onclick=()=>exportReport();
 $('#printReport').onclick=()=>printCurrentReport();
 $('#reportFrom').onchange=()=>loadReport();$('#reportTo').onchange=()=>loadReport();
 syncPicker();
}
function toggleReportDetails(){const d=$('#reportDetails');if(d)d.open=!d.open}
async function loadReport(){currentReport=null;const name=$('#reportPicker').value,from=$('#reportFrom')?.value||'',to=$('#reportTo')?.value||'',q=$('#reportTerm').value||'';try{const d=await api('/report?name='+encodeURIComponent(name)+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)+'&q='+encodeURIComponent(q));currentReport=d;$('#reportSummary').innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div><div class="eyebrow">نتيجة التقرير الحالي</div><strong style="font-size:17px;color:var(--gold)">${esc(name)}</strong><div class="caption">${esc(reportDescription(name))}</div></div><div class="kpi" style="min-width:130px;padding:10px 16px"><div class="label">عدد السجلات</div><div class="value">${fmt(d.count)}</div></div></div>`;$('#reportResult').innerHTML=table(d.headers,d.rows.map(r=>r.map(v=>typeof v==='number'?fmt(v):esc(v))));}catch(e){$('#reportSummary').textContent=e.message;$('#reportResult').innerHTML=''}}
async function exportReport(){const name=$('#reportPicker').value,from=$('#reportFrom')?.value||'',to=$('#reportTo')?.value||'',q=$('#reportTerm').value||'';await downloadFile('/api/report.xlsx?name='+encodeURIComponent(name)+'&from='+encodeURIComponent(from)+'&to='+encodeURIComponent(to)+'&q='+encodeURIComponent(q),name+'.xlsx')}
function printCurrentReport(){if(!currentReport){toast('اعرض التقرير أولاً');return}const d=currentReport,w=window.open('','_blank');if(!w){toast('اسمح بفتح النوافذ المنبثقة للطباعة');return}w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{font-family:Tahoma,Arial;padding:24px;color:#15283a}h1{text-align:center;color:#123d59}p{text-align:center;color:#667}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #9aabb8;padding:7px;text-align:center}th{background:#123d59;color:white}tr:nth-child(even){background:#eef3f7}@page{size:A4 landscape;margin:12mm}</style><h1>EGYPT GAS</h1><h2>${esc(d.title)}</h2><p>تاريخ الطباعة: ${new Date().toLocaleString('ar-EG')} | عدد السجلات: ${d.count}</p><table><thead><tr>${d.headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${d.rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></html>`);w.document.close()}
async function downloadFile(url,filename){try{const r=await fetch(url,{credentials:'same-origin'});if(!r.ok){let d=await r.json().catch(()=>({}));throw new Error(d.error||'تعذر تنزيل الملف')}const blob=await r.blob(),a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);toast('تم تجهيز الملف للتنزيل')}catch(e){toast(e.message)}}
let latestMeterAudit=null;
async function runMeterImportAudit(){const f=$('#meterImportFile').files[0];if(!f){toast('اختر ملف Excel أولاً');return}if(f.size>20*1024*1024){toast('الحد الأقصى لحجم الملف 20 ميجابايت');return}$('#meterAuditStatus').textContent='جارٍ فحص الملف…';$('#meterAuditResult').innerHTML='';$('#exportMeterAudit').disabled=true;try{const b64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(f)});const d=await api('/meter-import-audit',{method:'POST',body:JSON.stringify({filename:f.name,file_base64:b64})});latestMeterAudit=d;$('#meterAuditStatus').innerHTML=`<span class="badge">اكتمل الفحص</span> الملف: ${esc(d.source)} · ${fmt(d.checked_count)} سجل بالملف · ${fmt(d.database_count)} عداد بقاعدة EGYPT GAS. <b>لم يتم استيراد أو تعديل أي بيانات.</b>`;$('#meterAuditResult').innerHTML=table(['الفحص','العدد','التفاصيل'],d.summary.map(x=>[esc(x.issue),fmt(x.count),esc(x.details)]))+`<div class="toolbar"><span class="badge gold">سجلات مفصلة: ${d.stock.length} مخزن · ${d.custody.length} عهدة · ${d.installed.length} مركب</span><button class="btn btn-dark" onclick="showMeterAuditGroup('stock')">عرض سجل المخزن</button><button class="btn btn-dark" onclick="showMeterAuditGroup('custody')">عرض العهدة</button><button class="btn btn-dark" onclick="showMeterAuditGroup('installed')">عرض المركب</button></div><div id="meterAuditDetails"></div>`;$('#exportMeterAudit').disabled=false}catch(e){$('#meterAuditStatus').textContent=e.message;toast(e.message)}}
function showMeterAuditGroup(group){if(!latestMeterAudit)return;const rows=latestMeterAudit[group]||[];let headers,body;if(group==='stock'){headers=['السيريال','النوع','السعة','الحالة','المصدر'];body=rows.map(x=>[x.serial,x.type,x.capacity,x.status,x.location])}else if(group==='custody'){headers=['السيريال','النوع','السعة','الفورمان','C.R.N','الحالة','المصدر'];body=rows.map(x=>[x.serial,x.type,x.capacity,x.foreman,x.crn,x.status,x.location])}else{headers=['السيريال','النوع','السعة','الفورمان','C.R.N','التاريخ','المصدر'];body=rows.map(x=>[x.serial,x.type,x.capacity,x.foreman,x.crn,x.date,x.location])}$('#meterAuditDetails').innerHTML=table(headers,body.map(r=>r.map(esc)))}
async function exportMeterImportAudit(){if(!latestMeterAudit)return;try{const r=await fetch('/api/meter-import-audit.xlsx',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(latestMeterAudit)});if(!r.ok){let d=await r.json().catch(()=>({}));throw new Error(d.error||'تعذر تصدير التقرير')}const blob=await r.blob(),a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download='EGYPT_GAS_Meter_Import_Audit.xlsx';a.click();URL.revokeObjectURL(u);toast('تم تصدير تقرير الفحص')}catch(e){toast(e.message)}}
async function showApprovalHistory(kind,id){
 try{
  const d=await api('/approval-history?kind='+encodeURIComponent(kind)+'&id='+encodeURIComponent(id));
  const a=d.approval||{},events=d.history||[];
  const statusMap={APPROVED:['تمت الموافقة','approved'],REJECTED:['مرفوض','rejected'],PENDING:['بانتظار موافقة المدير','pending']};
  const actionMap={SUBMITTED:'تم تقديم الطلب',APPROVED:'تمت الموافقة',REJECTED:'تم الرفض',CANCELLED:'تم الإلغاء',UPDATED:'تم التحديث'};
  const [statusLabel,statusClass]=statusMap[String(a.status||'').toUpperCase()]||[a.status||'غير محدد','pending'];
  const dateLabel=v=>{if(!v)return '—';const dt=new Date(String(v).replace(' ','T'));return Number.isNaN(dt.getTime())?String(v):dt.toLocaleString('ar-EG',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true})};
  const operationLabel=({MATERIAL_EDIT:'تعديل خامة',STOCK_ITEM_DELETE:'حذف خامة من المخزن',STOCK_ITEM_TOGGLE:'تغيير حالة خامة',FOREMAN_CUSTODY_CHANGE:'تعديل عهدة فورمان',RECEIPT:'مستند وارد',ISSUE:'مستند صرف',INSTALL:'مستند تركيب'}[kind]||kind);
  $('#modalTitle').textContent='سجل الاعتماد والمراجعة';
  $('#modalForm').classList.add('wide','approval-modal');
  $('#modalFields').innerHTML=`
   <div class="approval-hero">
    <div class="approval-icon"><span>✓</span></div>
    <div class="approval-info">
     <div class="approval-operation">العملية <strong>${esc(operationLabel)}</strong><small>رقم المرجع: ${esc(kind)} #${esc(id)}</small></div>
     <div class="approval-meta">
      <div><span>مقدم الطلب</span><b>${esc(a.requested_by||'—')}</b></div>
      <div><span>تاريخ الطلب</span><b>${esc(dateLabel(a.requested_at))}</b></div>
      <div><span>المراجع</span><b>${esc(a.reviewed_by||'—')}</b></div>
      <div><span>تاريخ المراجعة</span><b>${esc(dateLabel(a.reviewed_at))}</b></div>
     </div>
     <div class="approval-status-row"><span>حالة الطلب</span><b class="approval-status ${statusClass}">${statusLabel}</b></div>
    </div>
   </div>
   ${a.reason?`<div class="approval-note"><span>السبب / ملاحظات المراجعة</span><p>${esc(a.reason)}</p></div>`:''}
   <div class="approval-history-heading"><div><b>التسلسل الزمني للإجراءات</b><small>سجل موثق لجميع خطوات الطلب</small></div><span>${events.length} إجراء</span></div>
   <div class="approval-table-wrap"><table class="approval-table"><thead><tr><th>الإجراء</th><th>المستخدم</th><th>التاريخ والوقت</th><th>السبب / الملاحظات</th></tr></thead><tbody>
   ${events.length?events.map(x=>{const act=String(x.action||'').toUpperCase();const cls=act==='APPROVED'?'approved':act==='REJECTED'?'rejected':'pending';return `<tr><td><span class="approval-action ${cls}">${esc(actionMap[act]||x.action||'—')}</span></td><td>${esc(x.actor||'—')}</td><td class="approval-date">${esc(dateLabel(x.created_at))}</td><td>${esc(x.reason||'—')}</td></tr>`}).join(''):'<tr><td colspan="4" class="approval-empty">لا توجد إجراءات مسجلة حتى الآن</td></tr>'}
   </tbody></table></div>`;
  $('#modalBack').style.display='flex';
  document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-gold" type="button" onclick="closeModal()">إغلاق السجل</button>';
 }catch(e){toast(e.message)}
}
async function showApprovalDetail(kind,id){
 if(kind==='FOREMAN_CUSTODY_CHANGE'||kind==='STOCK_ITEM_DELETE'||kind==='STOCK_ITEM_TOGGLE'){
  try{const rows=await api('/approvals');const r=rows.find(x=>x.doc_kind===kind&&Number(x.doc_id)===Number(id));if(!r){toast('طلب الاعتماد غير موجود');return}
   let old={},next={};try{old=JSON.parse(r.old_data||'{}')}catch(e){}try{next=JSON.parse(r.new_data||'{}')}catch(e){}
   const pairs=kind==='FOREMAN_CUSTODY_CHANGE'?[['الفورمان',old.foreman],['كود الخامة',old.code],['اسم الخامة',old.name],['الرصيد قبل الطلب',old.balance],['الرصيد المطلوب',next.balance],['نوع العملية',next.operation],['سبب الطلب',r.reason],['مقدم الطلب',r.requested_by],['تاريخ الطلب',r.requested_at]]:kind==='STOCK_ITEM_TOGGLE'?[['كود الخامة',old.code],['اسم الخامة',old.name],['الحالة الحالية',old.active?'نشطة':'موقوفة'],['الحالة المطلوبة',next.active?'نشطة':'موقوفة'],['الرصيد الحالي',old.balance],['سبب الطلب',r.reason],['مقدم الطلب',r.requested_by],['تاريخ الطلب',r.requested_at]]:[['كود الخامة',old.code],['اسم الخامة',old.name],['أول المدة',old.opening],['الوارد',old.received],['الرصيد الحالي',old.balance],['سبب الطلب',r.reason],['مقدم الطلب',r.requested_by],['تاريخ الطلب',r.requested_at]];
   $('#modalTitle').textContent='مراجعة تفاصيل طلب '+(kind==='FOREMAN_CUSTODY_CHANGE'?'عهدة فورمان':kind==='STOCK_ITEM_TOGGLE'?'تغيير حالة خامة':'حذف خامة من المخزن');
   $('#modalFields').innerHTML=`<div class="panel">${pairs.map(([k,v])=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:9px;border-bottom:1px solid #29465d"><b>${esc(k)}</b><span>${esc(v??'—')}</span></div>`).join('')}</div><div class="badge gold" style="margin-top:12px">${r.status==='PENDING'?'بانتظار موافقة المدير':r.status==='APPROVED'?'تمت الموافقة':'مرفوض'}</div>`;
   $('#modalForm .modal-actions').innerHTML=`<button class="btn btn-cyan" type="button" onclick="showApprovalHistory('${kind}',${id})">سجل الاعتماد</button><button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>`;$('#modalBack').style.display='flex';
  }catch(e){toast(e.message)}return;
 }
 const map={MOVEMENT_REQUEST:'movement-request',RECEIPT:'meter-receipt',ISSUE:'meter-issue',INSTALL:'meter-install',MATERIAL_RECEIPT:'material-receipt',FOREMAN_TRANSFER:'foreman-transfer',FOREMAN_STOCKTAKE:'foreman-stocktake',MATERIAL_EDIT:'material-edit',METER_RETURN:'meter-return'};const target=map[kind];if(!target){toast('لا توجد شاشة تفاصيل لهذا النوع');return}await showDocumentDetail(target,id)
}
async function showDocumentDetail(kind,id){try{const d=await api('/document-detail?kind='+encodeURIComponent(kind)+'&id='+id),head=d.head,lines=d.lines||[],labels=Object.keys(head),labelMap={kind:'نوع الحركة',week:'الأسبوع',doc_no:'رقم المستند',doc_date:'تاريخ المستند',supplier:'المورد',meter_type:'نوع العداد',origin:'جهة / مخزن الوارد',foreman:'الفورمان / الجهة',crn:'C.R.N',created_at:'تاريخ التسجيل',username:'المستخدم',notes:'ملاحظات',type:'نوع الحركة'},lineLabelMap={created_at:'التاريخ',doc:'رقم المستند',week:'الأسبوع',code:'كود الخامة',name:'اسم الخامة',type:'نوع الحركة',qty:'الكمية',notes:'ملاحظات',username:'المستخدم'};$('#modalTitle').textContent='تفاصيل المستند '+(head.doc_no||('#'+id));const movementSummary=kind==='material-movement'?`<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin:10px 0"><div class="kpi"><div class="label">عدد البنود</div><div class="value">${fmt(lines.length)}</div></div><div class="kpi"><div class="label">إجمالي الكميات</div><div class="value">${fmt(lines.reduce((a,x)=>a+Number(x.qty||0),0))}</div></div></div>`:'';const detailHeaders=Object.keys(lines[0]||{}).map(k=>lineLabelMap[k]||k);$('#modalFields').innerHTML=`<div class="panel" style="margin-bottom:12px">${labels.map(k=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:5px;border-bottom:1px solid #23445c"><b>${esc(labelMap[k]||k)}</b><span>${esc(k==='created_at'&&kind==='material-movement'?movementDateLabel(head[k]):(k==='type'?(head[k]==='وارد'?'وارد':head[k]==='صرف'?'صرف':head[k]):head[k]))}</span></div>`).join('')}</div>${movementSummary}${d.approval?`<p>حالة الاعتماد: <b>${esc(d.approval.status)}</b> · مقدم الطلب: ${esc(d.approval.requested_by)} · المراجع: ${esc(d.approval.reviewed_by||'—')}</p>`:''}${table(detailHeaders,lines.map(x=>Object.keys(lines[0]||{}).map(k=>esc(k==='created_at'&&kind==='material-movement'?movementDateLabel(x[k]):x[k]))))}`;$('#modalBack').style.display='flex';const approvalKinds={'meter-receipt':'RECEIPT','meter-issue':'ISSUE','meter-install':'INSTALL','material-receipt':'MATERIAL_RECEIPT','foreman-transfer':'FOREMAN_TRANSFER','foreman-stocktake':'FOREMAN_STOCKTAKE','meter-return':'METER_RETURN','material-edit':'MATERIAL_EDIT'};document.querySelector('#modalForm .modal-actions').innerHTML=`${d.approval?`<button class="btn btn-cyan" type="button" onclick="showApprovalHistory('${approvalKinds[kind]}',${id})">سجل الاعتماد</button>`:''}<button class="btn btn-cyan" type="button" onclick="exportCurrentDocument()">تصدير Excel</button><button class="btn btn-gold" type="button" onclick="printDocumentDetail()">معاينة / طباعة PDF</button><button class="btn btn-dark" type="button" onclick="closeModal()">إغلاق</button>`;window.currentDocumentPrint={head,lines,title:head.doc_no||('مستند '+id),kind}}catch(e){toast(e.message)}} 
 $('#modalForm').classList.add('wide');
function exportCurrentDocument(){const d=window.currentDocumentPrint;if(!d)return;const rows=[['رقم المستند',d.head.doc_no||d.title],['تاريخ المستند',d.head.doc_date||d.head.created_at||''],[],Object.keys(d.lines[0]||{})];(d.lines||[]).forEach(x=>rows.push(Object.values(x)));downloadCsvFile('مستند_'+(d.head.doc_no||'تفاصيل')+'.csv',rows);}
function printDocumentDetail(){const d=window.currentDocumentPrint;if(!d)return;const w=window.open('','_blank');if(!w){toast('اسمح بالنوافذ المنبثقة للمعاينة والطباعة');return}const now=new Date(),day=now.toLocaleDateString('ar-EG',{weekday:'long'}),date=now.toLocaleDateString('ar-EG');const head=d.head||{},meta=Object.entries(head).filter(([k,v])=>v!==null&&v!==''&&!['id'].includes(k)).map(([k,v])=>`<div class="meta"><b>${esc(({doc_no:'رقم المستند',created_at:'تاريخ التسجيل',doc_date:'تاريخ المستند',foreman:'الفورمان / الجهة',supplier:'الجهة / المورد',meter_type:'نوع العداد',crn:'C.R.N',username:'المستخدم',notes:'ملاحظات',type:'نوع الحركة'}[k]||k))}</b><span>${esc(v)}</span></div>`).join('');w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(d.title)}</title><style>body{font-family:Tahoma,Arial;padding:24px;color:#172b3c}header{text-align:center;border-bottom:3px solid #c99b3b;padding-bottom:14px;margin-bottom:18px}h1{color:#123d59;margin:0}h2{margin:8px 0;color:#a77b20}.date{color:#506274;font-size:13px}.metaGrid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin:14px 0}.meta{display:flex;justify-content:space-between;border-bottom:1px solid #d9e0e5;padding:7px;gap:12px}.meta b{color:#123d59}table{width:100%;border-collapse:collapse;margin-top:14px}td,th{border:1px solid #aeb9c2;padding:8px;text-align:center}th{background:#123d59;color:white}.footer{margin-top:24px;display:flex;justify-content:space-between;border-top:1px solid #cbd3da;padding-top:12px;font-size:12px}@page{size:A4;margin:12mm}
/* ===== PHASE 36 — COMPLETE CORPORATE REDESIGN ===== */
:root{
 --bg:#050d18;--panel:#0c1b2b;--panel2:#12283d;--line:#2b4359;
 --gold:#d9b66f;--gold2:#a77b35;--cyan:#4a9ec4;--text:#eef3f7;--muted:#a6b6c4
}
html,body{background:#050d18!important;color:var(--text)!important}
body{background:radial-gradient(ellipse at 48% -18%,#17334b 0,transparent 42%),linear-gradient(135deg,#050d18,#0a1725 58%,#050d18)!important;font-family:'Cairo',Tahoma,sans-serif!important}
button,input,select,textarea{font-family:'Cairo',Tahoma,sans-serif!important}
.login{
 min-height:100vh!important;grid-template-columns:1.06fr .94fr!important;
 background:linear-gradient(135deg,#050c16,#0a1b2c 55%,#061321)!important;
 position:relative;overflow:hidden
}
.login-art{
 background:
 radial-gradient(ellipse at 50% 38%,#173c5a 0,#0b2439 42%,#061321 78%)!important;
 border-left:1px solid #a9824555!important;position:relative
}
.login-art:before,.login-art:after{border-color:#d7b36c35!important;box-shadow:0 0 80px #d7b36c0c,inset 0 0 60px #0b5c8740!important}
.login-art:after{border-color:#318ab455!important}
.login-brand{
 width:min(760px,92%);padding:58px 42px!important;border:1px solid #b18a4b77!important;
 border-radius:30px!important;background:linear-gradient(145deg,#10283ddd,#061523ee)!important;
 box-shadow:0 28px 75px #0009,inset 0 1px #ffffff14!important;backdrop-filter:blur(14px)
}
.login-brand img{width:min(220px,34vw)!important;max-height:170px;object-fit:contain;filter:drop-shadow(0 8px 24px #0008)!important}
.login-brand h1{font-size:clamp(27px,3.1vw,43px)!important;line-height:1.4;color:#f4e5c5!important}
.login-brand p{font-size:18px!important;color:#e0c17d!important;font-weight:800}
.login-brand small{color:#aebdca!important}
.login-form-wrap{
 background:radial-gradient(ellipse at 45% 45%,#102b43 0,#081a2b 55%,#050e19 100%)!important;
 border:0!important;padding:36px!important;position:relative
}
.login-form-wrap:before{content:"";position:absolute;inset:8% 10%;border:1px solid #d4b16a2b;border-radius:28px;pointer-events:none}
#login .login-card{
 width:min(470px,100%)!important;padding:42px!important;border-radius:24px!important;
 background:linear-gradient(150deg,#152c40,#0a1a29 70%)!important;
 border:1px solid #b28a4c!important;box-shadow:0 24px 65px #0009,inset 0 1px #ffffff12!important;
 color:#f0f4f7!important;position:relative
}
#login .login-card .eyebrow{color:#e3c27b!important;letter-spacing:1.4px}
#login .login-card h2{font-size:29px!important;color:#f6e7c8!important}
#login .login-card .sub{color:#aebdca!important;margin-bottom:24px!important}
#login .login-card .field label{color:#c7d4df!important}
#login .login-card .field input{
 background:#061421!important;color:#f2f5f8!important;border:1px solid #496176!important;
 border-radius:12px!important;padding:15px 16px!important
}
#login .login-card .field input:focus{border-color:#d8b56d!important;box-shadow:0 0 0 3px #d8b56d20!important}
#login .login-card .btn{background:linear-gradient(110deg,#ecd18e,#c49a4e 60%,#936c2d)!important;color:#111d29!important;border-radius:12px!important;min-height:50px}
#login .login-card>div:last-child{border-color:#344b60!important;color:#9caebe!important}
.topbar{height:62px!important;background:linear-gradient(100deg,#040b14,#0b1d2d 62%,#071320)!important;border-bottom:1px solid #96713e!important}
.top-logo img{width:40px!important;height:40px!important;object-fit:contain}
.sidebar{width:224px!important;background:linear-gradient(180deg,#0b1b2b,#050d17)!important;border-left:1px solid #96713e66!important}
.side-brand img{width:82px!important;max-height:76px!important;object-fit:contain}
.main{padding:24px!important;max-width:none!important}
.page-head{margin-bottom:20px!important}
.page-head h1{font-size:27px!important;color:#f3e4c5!important}
.page-head p{font-size:13px!important;color:#9eb1c1!important}
.panel,.dashboard-panel,.kpi{background:linear-gradient(145deg,#13283b,#0a1827)!important;border:1px solid #2d465c!important;box-shadow:0 12px 32px #0004!important;border-radius:17px!important}
.panel-title h3,.panel h3{color:#ecd59f!important}
.btn{border-radius:10px!important;font-weight:800!important}
.btn-gold{background:linear-gradient(110deg,#ecd18d,#c39a50 60%,#906a2d)!important;color:#142130!important;box-shadow:0 6px 16px #b38a3b22!important}
.btn-cyan{background:linear-gradient(110deg,#287ca5,#155276)!important;color:#f4f8fb!important}
.btn-dark{background:linear-gradient(110deg,#18344b,#102235)!important;border:1px solid #3b566d!important;color:#e4edf3!important}
.btn-danger{background:linear-gradient(110deg,#8c3446,#622638)!important;color:#fff!important}
.search,.field input,.field select,.field textarea{background:#061522!important;color:#edf3f7!important;border:1px solid #3b5368!important}
.search::placeholder,.field input::placeholder,.field textarea::placeholder{color:#7f94a6!important}
.table-wrap{border:1px solid #30495f!important;border-radius:12px!important;overflow:auto!important}
table{font-size:13px!important}
th{background:linear-gradient(100deg,#18344c,#10263a)!important;color:#e5c47e!important}
td{border-color:#293e52!important;color:#dce5ec!important}
tbody tr:nth-child(odd){background:#0b1a29!important}
tbody tr:nth-child(even){background:#102337!important}
tbody tr:hover{background:#1b3a52!important}
.modal{background:linear-gradient(145deg,#152b40,#081725)!important;border:1px solid #b38b4b!important;color:#edf3f7!important}
.modal h3{color:#eed18d!important}
.modal .field input,.modal .field select,.modal .field textarea{background:#061522!important;color:#edf3f7!important}
.modal-actions{border-top:1px solid #344a5e!important;background:#091a29!important}
/* Foreman page rebuilt as a wide workbench */
.foreman-directory{padding:18px!important;margin-bottom:16px!important}
.foreman-directory-head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:15px}
.foreman-directory-head h3{font-size:20px;margin:2px 0;color:#f0d89f}
.foreman-directory-head small{color:#9fb1c1}
.foreman-directory-tools{display:flex;align-items:center;gap:10px;min-width:min(460px,55%)}
.foreman-directory-tools .search{max-width:340px}
.foreman-grid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:11px!important;max-height:230px;overflow:auto;padding:2px 4px 6px}
.foreman-card{
 display:flex!important;flex-direction:column;gap:9px;padding:11px!important;
 min-width:0;border:1px solid #304b62!important;border-radius:14px!important;
 background:linear-gradient(145deg,#152d43,#0b1b2a)!important;box-shadow:0 8px 22px #0003!important;
 transition:border-color .18s,transform .18s,background .18s
}
.foreman-card:hover{border-color:#b18a4c!important;transform:translateY(-2px)}
.foreman-card.selected{border-color:#d8b56c!important;background:linear-gradient(145deg,#233e55,#11283b)!important;box-shadow:inset 0 0 0 1px #d8b56c55,0 10px 25px #0004!important}
.foreman-pick{display:flex!important;align-items:center;gap:10px;width:100%;min-height:54px!important;text-align:right!important;padding:4px!important;background:transparent!important;border:0!important;color:#f1f4f6!important}
.foreman-avatar{width:42px;height:42px;display:grid;place-items:center;flex:0 0 42px;border-radius:12px;background:linear-gradient(145deg,#d9b66f,#936b2d);color:#142334;font-size:21px}
.foreman-ident{display:flex;flex-direction:column;min-width:0;flex:1}
.foreman-ident b{font-size:14px;color:#f1e3c5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.foreman-ident small{font-size:11px;color:#9fb2c2}
.foreman-arrow{font-size:24px;color:#d8b56c}
.foreman-card-stats{display:flex;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid #30485d;border-bottom:1px solid #30485d}
.foreman-card-stats span{font-size:11px;color:#9fb2c2;background:#0a1b2a;padding:4px 8px;border-radius:20px}
.foreman-card-stats b{color:#e5c47e}
.foreman-card-actions{display:flex;gap:7px}
.foreman-card-actions .btn{flex:1;padding:7px 8px!important;font-size:11px!important;min-height:32px}
.foreman-workspace{padding:20px!important;min-height:380px}
#foremanDetails .panel-title{padding-bottom:13px;border-bottom:1px solid #30485d}
#foremanDetails .panel-title h3{font-size:23px;color:#f0d89f}
#foremanDetails .kpis{gap:12px!important}
#foremanDetails .kpi{min-height:90px!important;padding:15px!important;background:linear-gradient(145deg,#19344c,#0d2031)!important}
#foremanDetails .kpi .value{font-size:25px!important;color:#f0d18b!important}
#foremanDetails .toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:13px!important;margin:15px 0!important;background:#091a29!important;border:1px solid #2e485e!important;border-radius:13px!important}
#foremanDetails .toolbar .btn{min-height:37px;font-size:12px!important}
#foremanDetails .tabs{padding:8px;background:#091a29;border:1px solid #2e485e;border-radius:13px}
#foremanDetails .tabs .btn{min-height:38px}
#foremanTabContent{padding:12px!important;background:#0a1928!important;border:1px solid #2d455a!important;border-radius:13px!important}
#foremanTabContent .table-wrap{max-height:54vh;overflow:auto}
#foremanTabContent table{min-width:740px}
.material-balance{color:#edca80;font-size:14px}
.material-row-actions{display:flex;gap:6px;justify-content:center;white-space:nowrap}
.btn-edit-material,.btn-delete-material{padding:6px 10px!important;font-size:11px!important;min-height:30px;border-radius:8px!important}
.btn-edit-material{background:linear-gradient(110deg,#245c7a,#173e58)!important;border:1px solid #4c88a8!important;color:#eaf5fb!important}
.btn-delete-material{background:linear-gradient(110deg,#873747,#5f2637)!important;border:1px solid #a34b5e!important;color:#fff!important}
#foremanTabContent td{vertical-align:middle}
@media(max-width:1200px){.foreman-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.main{padding:18px!important}}
@media(max-width:900px){.sidebar{width:205px!important}.foreman-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.foreman-directory-head{align-items:flex-start;flex-direction:column}.foreman-directory-tools{min-width:0;width:100%}.login{grid-template-columns:1fr!important}.login-art{min-height:42vh}.login-form-wrap{min-height:58vh}}
@media(max-width:620px){.foreman-grid{grid-template-columns:1fr!important;max-height:260px}.foreman-directory-tools{flex-wrap:wrap}.foreman-directory-tools .search{max-width:none}.main{padding:12px!important}.foreman-workspace{padding:12px!important}#foremanDetails .kpis{grid-template-columns:1fr!important}.login-brand{padding:32px 20px!important}.login-form-wrap{padding:18px!important}#login .login-card{padding:25px!important}}

</style><header><h1>EGYPT GAS</h1><h2>${esc(d.title)}</h2><div class="date">رقم المستند: ${esc(head.doc_no||d.title)} | اليوم: ${esc(day)} | التاريخ: ${esc(date)}</div></header><h3>بيانات المستند</h3><div class="metaGrid">${meta}</div><h3>محتويات المستند</h3>${table(Object.keys(d.lines[0]||{}),d.lines.map(x=>Object.values(x).map(v=>esc(v))))}<div class="footer"><span>منظومة الخامات والعدادات – منطقة العبور</span><span>صفحة المستند: ${esc(head.doc_no||'—')}</span></div><script>window.onload=()=>window.print()<\/script></html>`);w.document.close()}

function debounce(fn,wait){let t;return()=>{clearTimeout(t);t=setTimeout(fn,wait)}}
function openModal(title,fields,onSave){$('#modalForm').classList.remove('approval-modal');document.querySelector('#modalForm .modal-actions').innerHTML='<button class="btn btn-gold" type="submit">حفظ</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button>';$('#modalTitle').textContent=title;$('#modalFields').innerHTML=fields.map(f=>`<div class="field"><label>${f.label}</label>${f.options?`<select name="${f.name}" ${f.required===false?'':'required'}>${f.options.map(v=>`<option value="${v.value??v}" ${(v.value??v)===f.defaultValue?'selected':''}>${v.label??v}</option>`).join('')}</select>`:`<input name="${f.name}" value="${esc(f.defaultValue||'')}" ${f.type==='number'?'type="number" step="any" min="0"':(f.type==='password'?'type="password"':'')} ${f.required===false?'':'required'}>`}</div>`).join('');$('#modalBack').style.display='flex';$('#modalForm').onsubmit=async e=>{e.preventDefault();let obj=Object.fromEntries(new FormData(e.target).entries());try{const result=await onSave(obj);closeModal();toast(result?.pending_approval?'تم إرسال الطلب للمدير؛ لن يتم تنفيذ التغيير قبل الموافقة':'تم الحفظ بنجاح');await render(currentPage)}catch(err){toast(err.message)}}}
function closeModal(){$('#modalForm').onkeydown=null;$('#modalBack').style.display='none';$('#modalForm').classList.remove('wide','approval-modal','delete-request-modal');$('#modalForm').onsubmit=null;$('#modalForm').innerHTML='<h3 id="modalTitle"></h3><div id="modalFields"></div><div class="modal-actions"><button class="btn btn-gold" type="submit">حفظ</button><button class="btn btn-dark" type="button" onclick="closeModal()">إلغاء</button></div>'}
async function editItem(code,name,opening){openModal('طلب تعديل بيانات خامة',[{name:'new_code',label:'الكود الجديد',defaultValue:code},{name:'new_name',label:'اسم الخامة',defaultValue:name},{name:'new_opening',label:'كمية أول المدة',type:'number',defaultValue:opening},{name:'reason',label:'سبب التعديل'}],d=>api('/item-admin',{method:'POST',body:JSON.stringify({...d,code,action:'edit-request'})}));}
function requestDeleteItem(code,name){
 $('#modalForm').classList.remove('wide','approval-modal');
 $('#modalForm').classList.add('delete-request-modal');
 $('#modalTitle').textContent='';
 $('#modalFields').innerHTML=`
  <div class="delete-request-head">
   <div class="delete-request-brand">
    <div class="delete-request-icon">⌫</div>
    <div><div class="delete-request-kicker">EGYPT GAS · INVENTORY CONTROL</div><h3>طلب حذف خامة</h3></div>
   </div>
   <p>إرسال طلب رسمي إلى المدير للمراجعة والاعتماد</p>
  </div>
  <div class="delete-request-body">
   <div class="delete-request-item">
    <div><small>اسم الخامة</small><strong>${esc(String(name))}</strong></div>
    <div><small>كود الخامة</small><strong class="delete-request-code">${esc(String(code))}</strong></div>
   </div>
   <label class="delete-request-label" for="deleteRequestReason">سبب طلب الحذف <span style="color:#f0bd55">*</span></label>
   <p class="delete-request-help">اكتب سببًا واضحًا لطلب الحذف. سيظهر السبب للمدير ضمن تفاصيل طلب الاعتماد.</p>
   <textarea id="deleteRequestReason" class="delete-request-reason" maxlength="1000" required placeholder="مثال: تم تسجيل الخامة بالخطأ أو تم استبدال كود الصنف..."></textarea>
   <div class="delete-request-note"><span>ⓘ</span><span><b>ملاحظة مهمة:</b> لن يتم حذف الخامة أو تغيير رصيدها الآن. سيتم إرسال الطلب للمدير، ويظل الصنف موجودًا حتى صدور الموافقة.</span></div>
  </div>
  <div class="delete-request-actions">
   <button class="btn delete-request-submit" type="submit">إرسال طلب الحذف</button>
   <button class="btn delete-request-cancel" type="button" onclick="closeModal()">إلغاء</button>
  </div>`;
 $('#modalBack').style.display='flex';
 $('#modalForm').onsubmit=async e=>{
  e.preventDefault();
  const reason=String($('#deleteRequestReason')?.value||'').trim();
  if(!reason){toast('اكتب سبب طلب الحذف أولاً');$('#deleteRequestReason')?.focus();return}
  const submit=e.submitter;
  if(submit){submit.disabled=true;submit.textContent='جارٍ إرسال الطلب...'}
  try{
   await api('/item-admin',{method:'POST',body:JSON.stringify({action:'delete-request',code,reason})});
   closeModal();
   toast('تم إرسال طلب الحذف للمدير؛ الخامة ما زالت موجودة حتى الاعتماد');
   await render('items');
  }catch(err){
   if(submit){submit.disabled=false;submit.textContent='إرسال طلب الحذف'}
   toast(err.message);
  }
 };
}
async function toggleItem(code){const reason=prompt('سبب طلب تغيير حالة الخامة:');if(!reason||!reason.trim())return;try{await api('/item-admin',{method:'POST',body:JSON.stringify({action:'toggle',code,reason:reason.trim()})});toast('تم إرسال طلب تغيير الحالة للمدير؛ لم يتم التغيير بعد');await render('items')}catch(e){toast(e.message)}}
function addItem(){openModal('إضافة خامة جديدة',[{name:'code',label:'كود الخامة'},{name:'name',label:'اسم الخامة'}],d=>api('/items',{method:'POST',body:JSON.stringify(d)}))}
async function addMovement(draft=null){try{
 const [items,foremen]=await Promise.all([api('/items'),api('/foremen')]);
 closeModal();const form=$('#modalForm');form.classList.add('wide');$('#modalTitle').textContent='إنشاء مستند حركة خامات | EGYPT GAS';
 const active=items.filter(x=>x.active);const opts=active.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} | ${esc(x.name)}</option>`).join('');
 const now=new Date();const today=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
 $('#modalFields').innerHTML=`<style>#mvRows input,#mvRows select,#mvCount{background:#0b1c2b;color:#e8eff7;border:1px solid #39556c;border-radius:8px;padding:8px;min-height:36px;box-sizing:border-box;font:inherit}#mvRows select,#mvRows .mv-search{width:100%}#mvRows td{padding:7px 10px}#mvRows .mv-search{margin-bottom:5px}#mvRows .mv-qty{width:110px}#mvRows thead th{position:sticky;top:0}#mvRows input:focus,#mvRows select:focus{outline:1px solid #d6ad61}</style><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px"><div class="field"><label>رقم المستند</label><input name="doc" required></div><div class="field"><label>نوع الحركة</label><select name="type">${['وارد','صرف','مرتجع','مركب','سلف'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field" id="mvForeman"><label>الفورمان</label><select name="foreman"><option value="">اختر الفورمان</option>${foremen.map(x=>`<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('')}</select></div><div class="field" id="mvWeek"><label>الأسبوع</label><select name="week"><option value="">اختر الأسبوع</option>${['الأسبوع الأول','الأسبوع الثاني','الأسبوع الثالث','الأسبوع الرابع','الأسبوع الخامس'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="field" id="mvDate"><label>تاريخ المستند</label><div style="position:relative;display:flex;gap:8px;align-items:center"><input id="mvDateText" readonly dir="ltr" aria-label="تاريخ المستند يوم شهر سنة" style="flex:1;min-width:0;text-align:center;cursor:pointer" value="${today.split('-').reverse().join('/')}"><button type="button" id="mvCalendar" class="btn btn-gold" aria-label="اختيار تاريخ المستند" title="اختيار التاريخ">▦</button><input id="mvNativeDate" type="date" name="receipt_date" value="${today}" style="position:absolute;left:0;bottom:0;width:42px;height:42px;opacity:0;pointer-events:none" tabindex="-1"></div></div><div class="field" id="mvSource"><label>جهة الوارد</label><input name="receipt_source" placeholder="اسم المخزن أو الجهة"></div></div><div class="panel" style="margin:12px 0"><div class="toolbar" style="gap:8px;flex-wrap:wrap"><b>بنود المستند</b><button type="button" class="btn btn-gold" id="mvAdd">＋ إضافة بند</button><label for="mvCount">عدد الصفوف المطلوبة</label><input id="mvCount" type="number" min="1" max="120" value="5" style="width:85px"><button type="button" class="btn btn-dark" id="mvBulk">إضافة الصفوف</button><span id="mvTotals" class="badge gold"></span></div><div class="table-wrap" style="max-height:320px;overflow:auto"><table><thead style="position:sticky;top:0;z-index:1"><tr><th>م</th><th>البحث واختيار الخامة</th><th>الكمية</th><th>إجراء</th></tr></thead><tbody id="mvRows"></tbody></table></div></div><div class="field"><label>ملاحظات المستند</label><input name="notes"></div><div class="badge gold">لن يتم الترحيل إلا بعد اعتماد المدير</div>`;
 const nativeDate=$('#mvNativeDate'), dateText=$('#mvDateText');
 function refreshDate(){dateText.value=nativeDate.value.split('-').reverse().join('/')}
 function openDate(){try{nativeDate.showPicker()}catch(e){nativeDate.style.opacity='1';nativeDate.style.pointerEvents='auto';nativeDate.style.width='100%';nativeDate.focus()}}
 nativeDate.addEventListener('input',refreshDate);nativeDate.addEventListener('change',refreshDate);$('#mvCalendar').onclick=openDate;dateText.onclick=openDate;
 const body=$('#mvRows');function totals(){[...body.rows].forEach((r,i)=>r.cells[0].textContent=i+1);$('#mvTotals').textContent=body.rows.length+' صف | إجمالي '+fmt([...body.querySelectorAll('.mv-qty')].reduce((a,x)=>a+Number(x.value||0),0))}
 function add(){const r=body.insertRow();r.innerHTML=`<td></td><td><input class="mv-search" placeholder="ابحث باسم الخامة أو الكود" autocomplete="off"><select class="mv-code"><option value="">اختر الخامة</option>${opts}</select></td><td><input class="mv-qty" type="number" min="0.000001" step="any" placeholder="0"></td><td><button type="button" class="btn btn-dark">حذف</button></td>`;const search=r.querySelector('.mv-search'),sel=r.querySelector('.mv-code');search.oninput=()=>{const q=search.value.trim().toLowerCase(),old=sel.value;const matches=active.filter(x=>(String(x.code)+' '+String(x.name)).toLowerCase().includes(q)||x.code===old);sel.innerHTML='<option value="">اختر الخامة</option>'+matches.map(x=>`<option value="${esc(x.code)}">${esc(x.code)} | ${esc(x.name)}</option>`).join('');sel.value=old;if(q&&matches.length===1)sel.value=matches[0].code};search.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();sel.focus()}};r.querySelector('button').onclick=()=>{r.remove();totals()};r.querySelector('.mv-qty').oninput=totals;}
 function addMany(n){if(!Number.isInteger(n)||n<1||body.rows.length+n>120){toast('عدد الصفوف يجب أن يكون من 1 إلى 120 إجمالاً');return}for(let i=0;i<n;i++)add();totals()}
 $('#mvAdd').onclick=()=>addMany(1);$('#mvBulk').onclick=()=>addMany(Number($('#mvCount').value));addMany(1);
 const type=form.elements.type;function sync(){const incoming=type.value==='وارد';for(const [id,name,show] of [['mvForeman','foreman',!incoming],['mvWeek','week',!incoming],['mvDate','receipt_date',incoming],['mvSource','receipt_source',incoming]]){const el=form.elements[name];$('#'+id).style.display=show?'':'none';el.disabled=!show;el.required=show&&name!=='receipt_source';}}type.onchange=sync;sync();
 if(draft){const d=draft.data;for(const k of ['doc','type','foreman','week','receipt_date','receipt_source','notes'])if(d[k]!=null)form.elements[k].value=d[k];body.innerHTML='';for(const line of (d.lines||[])){add();const r=body.rows[body.rows.length-1];r.querySelector('.mv-code').value=line.code;r.querySelector('.mv-qty').value=line.qty}if(!body.rows.length)add();totals();sync();refreshDate()}
 form.querySelector('.modal-actions').innerHTML='<button type="button" id="mvSave" class="btn btn-cyan">حفظ كمسودة</button><button type="button" id="mvSend" class="btn btn-gold">مراجعة وإرسال للاعتماد</button><button type="button" class="btn btn-dark" onclick="closeModal()">إلغاء</button>';
 form.onsubmit=e=>e.preventDefault();form.onkeydown=e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT')e.preventDefault()};
 function collect(){const d=Object.fromEntries(new FormData(form));d.lines=[...body.rows].map(r=>({code:r.querySelector('.mv-code').value,qty:r.querySelector('.mv-qty').value})).filter(x=>x.code||x.qty);return d}
 async function saveDraft(){const d=collect();const result=await api('/movements-drafts',{method:'POST',body:JSON.stringify({action:'save',id:draft?.id,data:d})});draft={id:result.id,data:d};return d}
 $('#mvSave').onclick=async()=>{try{await saveDraft();closeModal();toast('تم حفظ المسودة دون إرسال للمدير');await render(currentPage)}catch(e){toast(e.message)}};
 $('#mvSend').onclick=async()=>{if(!form.reportValidity())return;const d=collect();if(!d.lines.length||d.lines.some(x=>!x.code||!Number.isFinite(Number(x.qty))||Number(x.qty)<=0)){toast('أكمل الخامة والكمية لكل بند مستخدم');return}const btn=$('#mvSend');btn.disabled=true;try{await saveDraft();const preview=document.createElement('div');preview.className='panel';preview.innerHTML=`<h3>مراجعة المستند ${esc(d.doc)}</h3><p>${esc(d.type)} · ${esc(d.foreman||d.receipt_source||'')} · ${esc(d.receipt_date||d.week||'')}</p><table><thead><tr><th>الخامة</th><th>الكمية</th></tr></thead><tbody>${d.lines.map(x=>`<tr><td>${esc(x.code)} | ${esc(active.find(a=>a.code===x.code)?.name||'')}</td><td>${esc(x.qty)}</td></tr>`).join('')}</tbody></table><div class="toolbar"><button type="button" class="btn btn-dark" id="mvBack">تعديل</button><button type="button" class="btn btn-dark" id="mvDelete">حذف المسودة</button><button type="button" class="btn btn-gold" id="mvConfirm">تأكيد الإرسال للمدير</button></div>`;const fields=$('#modalFields'),actions=form.querySelector('.modal-actions');fields.style.display='none';actions.style.display='none';form.append(preview);$('#mvBack').onclick=()=>{preview.remove();fields.style.display='';actions.style.display='';btn.disabled=false};$('#mvDelete').onclick=async()=>{if(!confirm('حذف المسودة؟'))return;try{await api('/movements-drafts',{method:'POST',body:JSON.stringify({action:'delete',id:draft.id})});closeModal();await render(currentPage)}catch(e){toast(e.message)}};$('#mvConfirm').onclick=async()=>{const b=$('#mvConfirm');b.disabled=true;try{d.draft_id=draft.id;d.lines=d.lines.map(x=>({code:x.code,qty:Number(x.qty)}));if(d.type==='وارد'){d.foreman='';d.week=d.receipt_date;if(d.receipt_source)d.notes=['جهة الوارد: '+d.receipt_source,d.notes].filter(Boolean).join(' | ')}await api('/movements',{method:'POST',body:JSON.stringify(d)});closeModal();toast('تم إرسال المستند للمدير');await render(currentPage)}catch(e){toast(e.message);b.disabled=false}}}catch(e){toast(e.message);btn.disabled=false}};
 $('#modalBack').style.display='flex';
}catch(e){toast(e.message)}}
async function logout(){setMobileSidebar(false);try{await api('/logout',{method:'POST',body:'{}'})}catch(e){}$('#app').style.display='none';$('#login').style.display='grid';$('#password').value='';}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();$('#loginError').textContent='';try{let u=await api('/login',{method:'POST',body:JSON.stringify({username:$('#username').value,password:$('#password').value})});await showApp(u)}catch(err){$('#loginError').textContent=err.message}});
document.querySelectorAll('.nav-btn').forEach(b=>b.addEventListener('click',()=>{setMobileSidebar(false);render(b.dataset.page)}));
function updateSystemDateTime(){
 const now=new Date();
 const dateEl=$('#topDate'),clockEl=$('#clock');
 if(dateEl)dateEl.innerHTML='<span class="date-icon">▦</span><span>'+now.toLocaleDateString('ar-EG',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})+'</span>';
 if(clockEl)clockEl.textContent=now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
}
updateSystemDateTime();setInterval(updateSystemDateTime,1000);
(async()=>{try{let me=await api('/me');await showApp(me)}catch(e){}})();

async function addFwMaterial(){
 const d=window.fwPrintData;if(!d?.person)return;
 const name=d.person.name;
 try{const items=(await api('/items')).filter(x=>x.active && !(d.materials||[]).some(m=>String(m.code)===String(x.code)&&Number(m.balance)>0));
 if(!items.length){toast('لا توجد خامات جديدة متاحة');return;}
 openModal('إضافة خامة إلى عهدة '+name,[{name:'code',label:'اختر الخامة من المخزن',options:items.map(x=>({value:esc(x.code),label:esc(x.code+' | '+x.name)}))},{name:'target',label:'الرصيد المطلوب إضافته',type:'number'},{name:'reason',label:'سبب الإضافة'}],async v=>{if(!Number.isFinite(Number(v.target))||Number(v.target)<=0)throw Error('أدخل كمية موجبة');return api('/foreman-adjust',{method:'POST',body:JSON.stringify({...v,foreman:name})})});
 const select=$('#modalFields select');const search=document.createElement('input');search.placeholder='بحث باسم الخامة أو الكود';search.type='search';select.before(search);const opts=Array.from(select.options).map(o=>o.cloneNode(true));search.oninput=()=>{select.replaceChildren(...opts.filter(o=>o.textContent.toLowerCase().includes(search.value.trim().toLowerCase())).map(o=>o.cloneNode(true)))};
 const note=document.createElement('p');note.textContent='طلب إضافة رصيد عهدة يخضع لاعتماد المدير، وليس حركة صرف من المخزن.';$('#modalFields').append(note);$('#modalForm button[type=submit]').textContent='إرسال للاعتماد';
 }catch(e){toast(e.message)}
}
