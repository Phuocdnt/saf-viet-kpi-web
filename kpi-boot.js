/* Khởi động bản web: trang công khai KHÔNG chứa tiêu chí KPI.
   Tiêu chí (tên KPI, trọng số, hướng dẫn chấm) nằm trong file JSON riêng do Paul giữ trên OneDrive.
   Lần đầu mở trang, chọn đúng file tiêu chí; trình duyệt nhớ lại cho các lần sau. Không gửi gì ra mạng. */
(function(){
'use strict';
const root=document.documentElement,kind=root.dataset.kind,uiSrc=root.dataset.ui,KEY='safviet-kpi-criteria-v1-'+kind;
const NAME={paul:'Paul',thong:'Thông',thy:'Thy'},FILE={paul:'Paul',thong:'Thong',thy:'Thy'},K=window.KPI,H=window.KPIHelp;
const fail=m=>{throw new Error(m);};
const str=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max;

function check(p){
 if(!p||p.format!=='safviet-kpi-criteria'||p.schemaVersion!==1)fail('Đây không phải file tiêu chí KPI của Saf Viet.');
 if(p.for!==kind)fail('File này dành cho '+(NAME[p.for]||'người khác')+', không phải trang của '+NAME[kind]+'. Hãy chọn đúng file.');
 const want=kind==='paul'?['thong','thy']:[kind];
 if(!Array.isArray(p.definitions)||p.definitions.length!==want.length||!want.every((id,i)=>p.definitions[i]&&p.definitions[i].id===id))fail('File tiêu chí thiếu hoặc thừa nhân viên.');
 if(!p.rubrics||typeof p.rubrics!=='object')fail('File tiêu chí thiếu phần hướng dẫn chấm.');
 const ids=new Set();
 for(const d of p.definitions){
  if(!str(d.name,60)||!str(d.role,80)||!Array.isArray(d.criteria)||d.criteria.length<3||d.criteria.length>30)fail('Thông tin nhân viên trong file tiêu chí không hợp lệ.');
  let sum=0;const own=new Set();
  for(const c of d.criteria){
   if(!str(c.id,16)||own.has(c.id)||!['A','B','C'].includes(c.group)||!str(c.name,200)||!str(c.standard,1500)||!str(c.guide,3000)||typeof c.weight!=='number'||!Number.isFinite(c.weight)||c.weight<=0)fail('Có KPI trong file tiêu chí không hợp lệ.');
   own.add(c.id);ids.add(c.id);sum+=c.weight;
  }
  if(Math.abs(sum-100)>1e-9)fail('Tổng trọng số của '+d.name+' phải bằng 100, hiện là '+sum+'.');
 }
 for(const id of [...ids,'OPEN']){
  const r=p.rubrics[id];
  if(!r||!str(r.method,300)||!str(r.how,3000)||!str(r.example,3000)||!str(r.note,3000)||!Array.isArray(r.levels)||!r.levels.length||r.levels.length>10||!r.levels.every(l=>Array.isArray(l)&&l.length===2&&typeof l[0]==='number'&&str(l[1],2000)))fail('Thiếu hoặc sai hướng dẫn chấm của '+id+'.');
 }
}
function apply(p){
 K.definitions.length=0;for(const d of p.definitions)K.definitions.push(d);
 for(const k of Object.keys(H.rubrics))delete H.rubrics[k];
 for(const d of p.definitions)for(const c of d.criteria)H.rubrics[c.id]=p.rubrics[c.id];
 H.rubrics.OPEN=p.rubrics.OPEN;
}
function el(tag,attrs,text){const e=document.createElement(tag);Object.assign(e,attrs||{});if(text!==undefined)e.textContent=text;return e;}
const BLUE='#0A3B95';
function picker(onFile){
 const input=el('input',{type:'file',accept:'.json,application/json',className:'kpi-pack-input'});input.style.display='none';
 input.addEventListener('change',()=>{const f=input.files[0];input.value='';if(f)onFile(f);});
 document.body.appendChild(input);return input;
}
async function readPack(file){
 if(file.size>1024*1024)fail('File quá lớn (tối đa 1 MB).');
 let p;try{p=JSON.parse(await file.text());}catch(e){fail('File không đọc được dưới dạng JSON.');}
 check(p);return p;
}
function launch(p,stored){
 apply(p);
 const g=document.getElementById('kpiGate');if(g)g.remove();
 const bar=el('div');bar.style.cssText='position:fixed;right:10px;bottom:8px;z-index:50;font:12px/1.4 system-ui,sans-serif;background:#fff;border:1px solid #C4BDAF;border-radius:8px;padding:4px 10px;color:#555;opacity:.92';
 bar.className='no-print';
 bar.appendChild(el('span',{},'Tiêu chí: '+(p.label||'V1.1')+(stored?'':' · chưa nhớ trong trình duyệt')+' · '));
 const change=el('button',{type:'button'},'Đổi file');const clear=el('button',{type:'button'},'Xóa khỏi trình duyệt');
 for(const b of [change,clear])b.style.cssText='border:0;background:none;color:'+BLUE+';cursor:pointer;font:inherit;text-decoration:underline;padding:0 4px';
 const inp=picker(async f=>{try{const np=await readPack(f);try{localStorage.setItem(KEY,JSON.stringify(np));}catch(e){fail('Trình duyệt không cho lưu. Hãy bỏ chế độ riêng tư hoặc cho phép lưu dữ liệu trang.');}location.reload();}catch(e){alert(e.message);}});
 change.addEventListener('click',()=>inp.click());
 clear.addEventListener('click',()=>{if(confirm('Xóa bộ tiêu chí khỏi trình duyệt này? Bản nháp và dữ liệu KPI không bị xóa; lần sau cần chọn lại file tiêu chí.')){try{localStorage.removeItem(KEY);}catch(e){}location.reload();}});
 bar.append(change,clear);document.body.appendChild(bar);
 const s=el('script',{src:uiSrc});s.onerror=()=>alert('Không tải được phần giao diện. Kiểm tra kết nối rồi tải lại trang.');document.head.appendChild(s);
}
function gate(){
 const w=el('div',{id:'kpiGate'});
 w.style.cssText='position:fixed;inset:0;z-index:100;background:#F7EFE5;display:flex;align-items:center;justify-content:center;padding:20px;font-family:system-ui,sans-serif;color:#222';
 const box=el('div');box.style.cssText='background:#fff;border:1px solid #C4BDAF;border-top:6px solid '+BLUE+';border-radius:12px;max-width:560px;width:100%;padding:28px 30px;box-shadow:0 6px 24px rgba(0,0,0,.08)';
 const h=el('h1',{},'Saf Viet · KPI — trang của '+NAME[kind]);h.style.cssText='margin:0 0 10px;font-size:22px;color:'+BLUE;
 const p1=el('p',{},'Trang này chưa chứa tiêu chí KPI. Hãy chọn file tiêu chí của bạn (tên dạng Tieu_chi_'+FILE[kind]+'.json) trong thư mục KPI trên OneDrive.');
 const p2=el('p',{},'Chỉ cần chọn một lần. Trình duyệt sẽ nhớ cho các lần sau. File được đọc ngay trên máy bạn, không gửi đi đâu.');p2.style.cssText='color:#555;font-size:14px';
 const err=el('p');err.style.cssText='color:#b42318;font-weight:600;min-height:1.4em';err.setAttribute('role','alert');
 const btn=el('button',{type:'button'},'Chọn file tiêu chí');btn.style.cssText='background:'+BLUE+';color:#fff;border:0;border-radius:8px;padding:11px 20px;font:600 15px system-ui,sans-serif;cursor:pointer';
 const inp=picker(async f=>{err.textContent='';try{
  const p=await readPack(f);let stored=true;
  try{localStorage.setItem(KEY,JSON.stringify(p));}catch(e){stored=false;}
  launch(p,stored);
 }catch(e){err.textContent=e.message;}});
 btn.addEventListener('click',()=>inp.click());
 box.append(h,p1,p2,err,btn);w.appendChild(box);document.body.appendChild(w);
}
let pack=null;
try{const raw=localStorage.getItem(KEY);if(raw){pack=JSON.parse(raw);check(pack);}}catch(e){pack=null;}
if(pack)launch(pack,true);else gate();
})();
