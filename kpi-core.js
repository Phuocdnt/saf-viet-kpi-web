(function(root){
'use strict';
const VERSION='3.1.1';
const definitions=[];
const clone=x=>JSON.parse(JSON.stringify(x));
const numeric=x=>typeof x==='number' && Number.isFinite(x);
function emptyEmployee(id){const d=definitions.find(e=>e.id===id);if(!d)throw Error('Nhân viên không hợp lệ.');return {id:d.id,name:d.name,role:d.role,policyVersion:'V1.1',criteria:clone(d.criteria),months:{}};}
function emptyData(){return {format:'safviet-kpi',schemaVersion:1,appVersion:VERSION,updatedAt:null,employees:definitions.map(d=>emptyEmployee(d.id))};}
function newMonth(employee,period){return {period,status:'draft',weightingMode:'share100',policyVersion:employee.policyVersion,criteria:clone(employee.criteria),rows:employee.criteria.map(k=>({id:k.id,percent:null,note:''})),open:{enabled:false,title:'',target:'',weight:10,assignedOn:'',due:'',percent:null,note:''},maximumBonus:null,reviewer:'',reviewNote:'',approvedAt:null,scoreSnapshot:null,updatedAt:null,revisions:[]};}
function score(month){
 const legacy=!month.weightingMode||month.weightingMode==='legacy-normalized';
 const baseTotal=month.criteria.reduce((sum,k)=>sum+k.weight,0),o=month.open;
 const weightsValid=baseTotal>0&&(!o.enabled||(numeric(o.weight)&&o.weight>0&&(legacy||o.weight<100)));
 const openShare=o.enabled&&weightsValid?(legacy?o.weight/(baseTotal+o.weight)*100:o.weight):0;
 const fixedShare=100-openShare;let earned=0,completed=0;const parts=[];
 for(const k of month.criteria){const r=month.rows.find(r=>r.id===k.id),p=r?.percent,weight=k.weight/baseTotal*fixedShare;const valid=numeric(p)&&p>=0&&p<=100;if(valid){completed++;earned+=weight*p/100;}parts.push({id:k.id,baseWeight:k.weight,weight,share:weight,percent:valid?p:null});}
 if(o.enabled){const valid=numeric(o.percent)&&o.percent>=0&&o.percent<=100;if(valid){completed++;earned+=openShare*o.percent/100;}parts.push({id:'OPEN',weight:openShare,share:openShare,percent:valid?o.percent:null});}
 const count=parts.length,complete=completed===count&&weightsValid,result=complete?Math.min(100,Math.max(0,earned)):null;
 return {total:100,earned,completed,count,complete,result,provisional:earned,weightsValid,legacy,openShare,fixedShare,parts:parts.map(p=>({...p,contribution:p.percent===null?null:p.weight*p.percent/100})),bonus:result!==null&&numeric(month.maximumBonus)?Math.round(month.maximumBonus*result/100):null};
}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function approvalErrors(m){const s=score(m),errors=[];if(!s.weightsValid)errors.push('Tỷ trọng KPI mở phải lớn hơn 0% và nhỏ hơn 100%.');if(!s.complete)errors.push('Cần nhập % hoàn thành cho tất cả KPI đang áp dụng.');if(!m.reviewer.trim())errors.push('Cần ghi người chấm / xác nhận.');if(m.open.enabled){if(!m.open.title.trim()||!m.open.target.trim())errors.push('KPI mở cần tên nhiệm vụ và chuẩn hoàn thành.');if(!validDate(m.open.assignedOn)||!validDate(m.open.due))errors.push('KPI mở cần ngày giao và hạn hoàn thành hợp lệ.');if(m.open.assignedOn>m.open.due)errors.push('Hạn KPI mở phải từ ngày giao trở đi.');}if(root.KPISelf)errors.push(...root.KPISelf.reviewErrors(m));return errors;}
function approve(m,now=new Date().toISOString()){const errors=approvalErrors(m);if(errors.length)throw Error(errors.join('\n'));m.status='approved';m.approvedAt=now;m.updatedAt=now;m.scoreSnapshot=score(m).result;return m;}
function reopen(m,reason,now=new Date().toISOString()){if(!reason.trim())throw Error('Cần lý do mở lại.');if(m.status!=='approved')throw Error('Tháng chưa chốt.');const previous=score(m),before=clone(m);delete before.revisions;m.revisions.push({at:now,reason:reason.trim(),before});if(previous.legacy&&m.open.enabled)m.open.weight=previous.openShare;m.weightingMode='share100';m.status='draft';m.approvedAt=null;m.scoreSnapshot=null;m.updatedAt=now;return m;}
function aggregate(employee,year,months){const records=months.map(n=>employee.months[`${year}-${String(n).padStart(2,'0')}`]).filter(Boolean);const approved=records.filter(m=>m.status==='approved');const total=approved.reduce((n,m)=>n+score(m).result,0);const bonusRecords=approved.filter(m=>numeric(m.maximumBonus));return {score:approved.length?total/approved.length:null,count:approved.length,expected:months.length,drafts:records.length-approved.length,bonus:bonusRecords.length?bonusRecords.reduce((n,m)=>n+score(m).bonus,0):null,bonusCount:bonusRecords.length};}
function assert(ok,msg){if(!ok)throw Error('JSON không hợp lệ: '+msg);}
function validateMonth(m,key){
 assert(m&&m.period===key&&/^\d{4}-(0[1-9]|1[0-2])$/.test(key),'mã tháng.');assert(['draft','approved'].includes(m.status),'trạng thái tháng.');assert(Array.isArray(m.criteria)&&m.criteria.length>0&&m.criteria.length<=50,'bộ tiêu chí.');
 assert(m.weightingMode===undefined||['share100','legacy-normalized'].includes(m.weightingMode),'cách phân bổ trọng số.');
 const ids=new Set();for(const k of m.criteria){assert(typeof k.id==='string'&&!ids.has(k.id),'mã KPI trùng.');ids.add(k.id);assert(typeof k.name==='string'&&typeof k.standard==='string'&&typeof k.guide==='string','mô tả KPI.');assert(numeric(k.weight)&&k.weight>0&&k.weight<=1000,'trọng số KPI.');}
 assert(Array.isArray(m.rows)&&m.rows.length===m.criteria.length,'số dòng KPI.');const rowIds=new Set();for(const r of m.rows){assert(ids.has(r.id)&&!rowIds.has(r.id),'mã dòng KPI.');rowIds.add(r.id);assert(r.percent===null||(numeric(r.percent)&&r.percent>=0&&r.percent<=100),'% hoàn thành.');assert(typeof r.note==='string'&&r.note.length<=10000,'ghi chú.');}
 const o=m.open;assert(o&&typeof o.enabled==='boolean'&&numeric(o.weight)&&o.weight>0&&o.weight<=1000,'KPI mở.');assert(o.percent===null||(numeric(o.percent)&&o.percent>=0&&o.percent<=100),'% KPI mở.');for(const k of ['title','target','assignedOn','due','note'])assert(typeof o[k]==='string'&&o[k].length<=10000,'nội dung KPI mở.');assert(m.maximumBonus===null||(numeric(m.maximumBonus)&&m.maximumBonus>=0&&m.maximumBonus<=1e12),'mức thưởng.');assert(typeof m.reviewer==='string'&&typeof m.reviewNote==='string','người xác nhận / ghi chú.');assert(Array.isArray(m.revisions)&&m.revisions.length<=200,'lịch sử sửa.');
 if(m.weightingMode==='share100')assert(o.weight<100,'tỷ trọng KPI mở phải nhỏ hơn 100%.');
 if(m.status==='approved'){assert(approvalErrors(m).length===0,'tháng đã chốt còn thiếu dữ liệu.');assert(numeric(m.scoreSnapshot)&&Math.abs(m.scoreSnapshot-score(m).result)<1e-7,'điểm lưu khác dữ liệu gốc.');assert(typeof m.approvedAt==='string'&&m.approvedAt.length>0,'ngày chốt.');}
}
function validateData(d){
 assert(d&&d.format==='safviet-kpi'&&d.schemaVersion===1,'định dạng / phiên bản.');assert(Array.isArray(d.employees)&&d.employees.length>0&&d.employees.length<=2,'danh sách nhân viên.');const ids=new Set();
 for(const e of d.employees){assert(definitions.some(x=>x.id===e.id)&&!ids.has(e.id),'mã nhân viên.');ids.add(e.id);assert(e.months&&typeof e.months==='object'&&!Array.isArray(e.months),'dữ liệu tháng.');assert(Object.keys(e.months).length<=1200,'quá nhiều tháng.');const expected=emptyEmployee(e.id);assert(JSON.stringify(e.criteria)===JSON.stringify(expected.criteria),'bộ KPI cố định khác V1.1.');assert(e.name===expected.name&&e.role===expected.role&&e.policyVersion==='V1.1','thông tin nhân viên.');for(const [key,m] of Object.entries(e.months)){validateMonth(m,key);if(root.KPISelf)root.KPISelf.validateStoredMonth(m,e.id);else assert(!m.assignment&&!m.selfAssessment&&!m.selfHistory,'cần công cụ hỗ trợ Tự đánh giá.');assert(m.policyVersion==='V1.1'&&JSON.stringify(m.criteria)===JSON.stringify(expected.criteria),'tiêu chí tháng khác bộ KPI cố định V1.1.');}}
 return d;
}
function exportData(state,employeeId){const data={format:'safviet-kpi',schemaVersion:1,appVersion:VERSION,updatedAt:new Date().toISOString(),employees:clone(employeeId?state.employees.filter(e=>e.id===employeeId):state.employees)};return validateData(data);}
function prepareData(data){validateData(data);for(const e of data.employees)for(const m of Object.values(e.months)){if(!m.weightingMode){if(m.status==='approved')m.weightingMode='legacy-normalized';else{if(m.open.weight>=100){const base=m.criteria.reduce((sum,k)=>sum+k.weight,0);m.open.weight=m.open.weight/(base+m.open.weight)*100;}m.weightingMode='share100';}}}return validateData(data);}
const api={VERSION,definitions,clone,emptyData,emptyEmployee,newMonth,score,aggregate,approve,reopen,approvalErrors,validateData,prepareData,exportData};
root.KPI=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

;(function(root){
'use strict';
const K=root.KPI,copy=K.clone;
const now=()=>new Date().toISOString();
const num=x=>typeof x==='number'&&Number.isFinite(x);
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function need(ok,message){if(!ok)throw Error(message);}
function text(value,label,max=10000){need(typeof value==='string'&&value.length<=max,label+' không hợp lệ.');}
function keys(o,allowed,label){need(o&&typeof o==='object'&&!Array.isArray(o),label+' không hợp lệ.');need(Object.keys(o).every(k=>allowed.includes(k)),label+' chứa trường dữ liệu không được phép.');}
function stamp(s){return typeof s==='string'&&s.length<50&&!Number.isNaN(Date.parse(s));}
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function uid(prefix){const random=root.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);return prefix+'-'+Date.now().toString(36)+'-'+random;}
function info(id){const employee=K.definitions.find(e=>e.id===id);need(employee,'Sai nhân viên.');return employee;}
function baseOpen(o){return {enabled:o.enabled,title:o.title,target:o.target,weight:o.weight,assignedOn:o.assignedOn,due:o.due};}
function config(employeeId,m){return {employeeId,period:m.period,policyVersion:m.policyVersion,weightingMode:'share100',criteria:copy(m.criteria),open:baseOpen(m.open),instructions:m.assignmentInstructions||''};}
function planKey(p){return JSON.stringify({employeeId:p.employeeId,period:p.period,policyVersion:p.policyVersion,weightingMode:p.weightingMode,criteria:p.criteria,open:baseOpen(p.open),instructions:p.instructions});}
function sameConfig(p,employeeId,m){return planKey(p)===JSON.stringify(config(employeeId,m));}
function validatePlan(p,expectedEmployee){
 keys(p,['format','schemaVersion','employeeId','employeeName','period','policyVersion','weightingMode','criteria','open','instructions','planId','revision','issuedAt'],'Phiếu giao KPI');
 need(p.format==='safviet-kpi-plan'&&p.schemaVersion===1,'Đây không phải phiếu giao KPI.');const e=info(p.employeeId);
 need(!expectedEmployee||p.employeeId===expectedEmployee,'Phiếu không thuộc người đang chọn.');need(p.employeeName===e.name,'Tên nhân viên không khớp.');
 need(/^\d{4}-(0[1-9]|1[0-2])$/.test(p.period),'Tháng không hợp lệ.');need(p.policyVersion==='V1.1'&&p.weightingMode==='share100','Phiên bản / cách chia trọng số không hỗ trợ.');
 need(JSON.stringify(p.criteria)===JSON.stringify(e.criteria),'Tiêu chí hoặc trọng số gốc đã bị thay đổi.');text(p.instructions,'Ghi chú giao KPI');text(p.planId,'Mã phiếu',180);need(p.planId.length>0&&Number.isInteger(p.revision)&&p.revision>0&&stamp(p.issuedAt),'Thiếu mã, phiên bản hoặc ngày giao phiếu.');
 keys(p.open,['enabled','title','target','weight','assignedOn','due'],'KPI mở');const o=p.open;need(typeof o.enabled==='boolean'&&num(o.weight)&&o.weight>0&&o.weight<100,'Tỷ trọng KPI mở phải lớn hơn 0 và nhỏ hơn 100%.');for(const f of ['title','target','assignedOn','due'])text(o[f],'KPI mở');
 if(o.enabled){need(o.title.trim()&&o.target.trim(),'KPI mở cần nhiệm vụ và chuẩn hoàn thành.');need(validDate(o.assignedOn)&&validDate(o.due)&&o.assignedOn<=o.due,'KPI mở cần ngày giao / hạn hợp lệ.');}
 return p;
}
function issuePlan(employee,m,at=now()){
 need(m.status!=='approved','Tháng đã chốt. Mở lại tháng trước khi giao hoặc sửa phiếu.');need(m.weightingMode==='share100','Cần dùng cách chia tổng trọng số 100%.');
 if(m.assignment&&sameConfig(m.assignment,employee.id,m))return copy(m.assignment);
 const p={format:'safviet-kpi-plan',schemaVersion:1,employeeName:employee.name,...config(employee.id,m),planId:uid('plan'),revision:(m.assignment?.revision||0)+1,issuedAt:at};validatePlan(p,employee.id);
 if(m.assignment){m.assignmentHistory=m.assignmentHistory||[];m.assignmentHistory.push(copy(m.assignment));}
 m.assignment=copy(p);return p;
}
function newAssessment(p){validatePlan(p);return {entries:p.criteria.map(k=>({id:k.id,percent:null,note:''})),open:p.open.enabled?{percent:null,note:''}:null,summary:'',obstacles:''};}
function validateAssessment(a,p,complete=false){
 keys(a,['entries','open','summary','obstacles'],'Bản tự đánh giá');need(Array.isArray(a.entries)&&a.entries.length===p.criteria.length,'Số KPI tự chấm không khớp.');const seen=new Set();
 for(const r of a.entries){keys(r,['id','percent','note'],'Dòng tự chấm');need(p.criteria.some(k=>k.id===r.id)&&!seen.has(r.id),'Mã KPI không đúng hoặc bị trùng.');seen.add(r.id);need(r.percent===null||(num(r.percent)&&r.percent>=0&&r.percent<=100),'% tự chấm phải từ 0 đến 100.');text(r.note,'Kết quả / căn cứ');if(complete)need(num(r.percent)&&r.note.trim(),'Cần chấm đủ và ghi kết quả / căn cứ cho '+r.id+'.');}
 if(p.open.enabled){keys(a.open,['percent','note'],'Tự chấm KPI mở');need(a.open.percent===null||(num(a.open.percent)&&a.open.percent>=0&&a.open.percent<=100),'% KPI mở không hợp lệ.');text(a.open.note,'Kết quả KPI mở');if(complete)need(num(a.open.percent)&&a.open.note.trim(),'Cần chấm và ghi căn cứ cho KPI mở.');}else need(a.open===null,'Phiếu không giao KPI mở.');
 text(a.summary,'Nhận xét');text(a.obstacles,'Khó khăn / hỗ trợ');return a;
}
function asMonth(p,a){validatePlan(p);validateAssessment(a,p);const m=K.newMonth(K.emptyEmployee(p.employeeId),p.period);m.criteria=copy(p.criteria);m.rows=copy(a.entries);m.open={...copy(p.open),percent:a.open?.percent??null,note:a.open?.note||''};return m;}
function selfScore(p,a){return K.score(asMonth(p,a));}
function createSubmission(p,a,at=now()){
 validatePlan(p);validateAssessment(a,p,true);
 return {format:'safviet-kpi-self',schemaVersion:1,employeeId:p.employeeId,employeeName:p.employeeName,period:p.period,planId:p.planId,planRevision:p.revision,planKey:planKey(p),submissionId:uid('self'),exportedAt:at,assessment:copy(a)};
}
function validateSubmission(s,p){
 keys(s,['format','schemaVersion','employeeId','employeeName','period','planId','planRevision','planKey','submissionId','exportedAt','assessment'],'Bài tự đánh giá');
 need(s.format==='safviet-kpi-self'&&s.schemaVersion===1,'Đây không phải bài tự đánh giá.');validatePlan(p,s.employeeId);
 need(s.employeeId===p.employeeId&&s.employeeName===p.employeeName&&s.period===p.period,'Sai người hoặc tháng của bài tự đánh giá.');need(s.planId===p.planId&&s.planRevision===p.revision&&s.planKey===planKey(p),'Bài tự đánh giá dùng phiếu KPI khác phiên bản.');text(s.submissionId,'Mã bài',180);need(s.submissionId.length>0&&stamp(s.exportedAt),'Thiếu mã bài hoặc ngày xuất.');validateAssessment(s.assessment,p,true);return s;
}
function receiveSubmission(employee,m,s,at=now()){
 need(m.status!=='approved','Tháng đã chốt. Mở lại tháng nếu cần nhận bài.');need(m.assignment,'Chưa có phiếu KPI đã giao cho tháng này.');validatePlan(m.assignment,employee.id);need(sameConfig(m.assignment,employee.id,m),'Mục tiêu hoặc KPI mở đã thay đổi. Xuất phiếu giao KPI mới trước khi nhận bài.');validateSubmission(s,m.assignment);
 need(s.employeeId===employee.id&&s.period===m.period,'Chọn đúng nhân viên và tháng trước khi nhận bài.');const prior=m.selfHistory||[];need(m.selfAssessment?.submissionId!==s.submissionId&&!prior.some(x=>x.submission.submissionId===s.submissionId),'Bài này đã được tiếp nhận; không nhập trùng.');
 if(m.selfAssessment){m.selfHistory=prior;m.selfHistory.push({submission:copy(m.selfAssessment),receivedAt:m.selfReceivedAt||at});}
 m.selfAssessment=copy(s);m.selfReceivedAt=at;return m;
}
function reviewErrors(m){
 if(!m.selfAssessment)return [];const result=[];const p=m.assignment,s=m.selfAssessment;
 if(!p||p.planId!==s.planId||p.revision!==s.planRevision||!sameConfig(p,s.employeeId,m))return ['Phiếu KPI đã thay đổi sau bài tự chấm. Nhận bài theo phiếu mới hoặc lưu lý do không dùng bài cũ.'];
 for(const r of m.rows){const sr=s.assessment.entries.find(x=>x.id===r.id);if(sr&&num(r.percent)&&r.percent!==sr.percent&&!r.note.trim())result.push('Cần ghi lý do Paul chấm khác tự đánh giá ở '+r.id+'.');}
 if(m.open.enabled&&num(m.open.percent)&&m.open.percent!==s.assessment.open?.percent&&!m.open.note.trim())result.push('Cần ghi lý do chấm khác tự đánh giá ở KPI mở.');return result;
}
function fillEmptyFromSelf(m){need(m.status!=='approved'&&m.selfAssessment,'Chưa có bài tự đánh giá để điền.');need(m.assignment&&sameConfig(m.assignment,m.selfAssessment.employeeId,m)&&m.assignment.planId===m.selfAssessment.planId,'Bài tự chấm không còn khớp phiếu hiện tại.');for(const r of m.rows){if(r.percent===null)r.percent=m.selfAssessment.assessment.entries.find(x=>x.id===r.id).percent;}if(m.open.enabled&&m.open.percent===null)m.open.percent=m.selfAssessment.assessment.open.percent;return m;}
function discardSelf(m,reason,at=now()){need(m.status!=='approved'&&m.selfAssessment,'Không có bài đang dùng hoặc tháng đã chốt.');need(typeof reason==='string'&&reason.trim(),'Cần ghi lý do không dùng bài.');m.selfHistory=m.selfHistory||[];m.selfHistory.push({submission:copy(m.selfAssessment),receivedAt:m.selfReceivedAt||at,removedAt:at,reason:reason.trim()});delete m.selfAssessment;delete m.selfReceivedAt;return m;}
function validateStoredMonth(m,id){
 need(m.assignmentInstructions===undefined||(typeof m.assignmentInstructions==='string'&&m.assignmentInstructions.length<=10000),'Ghi chú giao KPI không hợp lệ.');
 need(m.assignmentHistory===undefined||Array.isArray(m.assignmentHistory),'Lịch sử phiếu không hợp lệ.');need(m.selfHistory===undefined||Array.isArray(m.selfHistory),'Lịch sử tự chấm không hợp lệ.');
 const plans=[...(m.assignmentHistory||[]),...(m.assignment?[m.assignment]:[])];need(plans.length<=200,'Quá nhiều phiên bản phiếu.');for(const p of plans){validatePlan(p,id);need(p.period===m.period,'Phiếu lưu không đúng tháng.');}
 const planIds=new Set();for(const p of plans){need(!planIds.has(p.planId),'Mã phiếu bị trùng.');planIds.add(p.planId);}
 const check=s=>{const p=plans.find(p=>p.planId===s.planId&&p.revision===s.planRevision);need(p,'Không tìm thấy phiếu của bài tự đánh giá đã lưu.');validateSubmission(s,p);};
 const submissionIds=new Set();const unique=s=>{check(s);need(!submissionIds.has(s.submissionId),'Mã bài tự đánh giá bị trùng.');submissionIds.add(s.submissionId);};
 if(m.selfAssessment){unique(m.selfAssessment);need(stamp(m.selfReceivedAt),'Thiếu ngày nhận bài.');}need((m.selfHistory||[]).length<=200,'Quá nhiều bài tự đánh giá.');for(const h of m.selfHistory||[]){keys(h,['submission','receivedAt','removedAt','reason'],'Lịch sử tự chấm');unique(h.submission);need(stamp(h.receivedAt),'Ngày nhận bài không hợp lệ.');if(h.removedAt!==undefined){need(stamp(h.removedAt),'Ngày loại bài không hợp lệ.');text(h.reason,'Lý do không dùng bài');need(h.reason.trim(),'Thiếu lý do không dùng bài.');}}
 if(m.status==='approved')need(reviewErrors(m).length===0,'Kết quả đã chốt chưa giải thích chênh lệch hoặc phiếu không khớp.');
}
function makeDraft(p,a){validatePlan(p);validateAssessment(a,p);return {format:'safviet-kpi-self-draft',schemaVersion:1,employeeId:p.employeeId,savedAt:now(),plan:copy(p),assessment:copy(a)};}
function validateDraft(d,id){keys(d,['format','schemaVersion','employeeId','savedAt','plan','assessment'],'Bản nháp');need(d.format==='safviet-kpi-self-draft'&&d.schemaVersion===1&&d.employeeId===id&&stamp(d.savedAt),'Bản nháp không đúng người / định dạng.');validatePlan(d.plan,id);validateAssessment(d.assessment,d.plan);return d;}
function createResult(employee,m){
 need(m.status==='approved'&&m.assignment,'Cần chốt tháng có phiếu giao KPI trước khi xuất kết quả.');need(sameConfig(m.assignment,employee.id,m),'Phiếu không khớp kết quả.');need(reviewErrors(m).length===0,'Cần xử lý khác biệt trước khi xuất.');
 return {format:'safviet-kpi-result',schemaVersion:1,employeeId:employee.id,employeeName:employee.name,period:m.period,plan:copy(m.assignment),entries:m.rows.map(r=>({id:r.id,percent:r.percent,note:r.note,selfPercent:m.selfAssessment?.assessment.entries.find(s=>s.id===r.id)?.percent??null})),open:m.open.enabled?{percent:m.open.percent,note:m.open.note,selfPercent:m.selfAssessment?.assessment.open?.percent??null}:null,score:K.score(m).result,reviewer:m.reviewer,reviewNote:m.reviewNote,approvedAt:m.approvedAt};
}
function validateResult(r,id){
 keys(r,['format','schemaVersion','employeeId','employeeName','period','plan','entries','open','score','reviewer','reviewNote','approvedAt'],'Kết quả');need(r.format==='safviet-kpi-result'&&r.schemaVersion===1&&r.employeeId===id,'Kết quả không đúng người / định dạng.');validatePlan(r.plan,id);need(r.period===r.plan.period&&r.employeeName===r.plan.employeeName,'Kết quả không khớp phiếu.');
 need(Array.isArray(r.entries),'Thiếu điểm cuối.');for(const row of r.entries){keys(row,['id','percent','note','selfPercent'],'Điểm cuối');need(row.selfPercent===null||(num(row.selfPercent)&&row.selfPercent>=0&&row.selfPercent<=100),'Điểm tự chấm không hợp lệ.');}
 if(r.open){keys(r.open,['percent','note','selfPercent'],'Kết quả KPI mở');need(r.open.selfPercent===null||(num(r.open.selfPercent)&&r.open.selfPercent>=0&&r.open.selfPercent<=100),'Điểm tự chấm KPI mở không hợp lệ.');}
 const a={entries:r.entries.map(x=>({id:x.id,percent:x.percent,note:x.note})),open:r.open?{percent:r.open.percent,note:r.open.note}:null,summary:'',obstacles:''};validateAssessment(a,r.plan);need(selfScore(r.plan,a).complete&&num(r.score)&&Math.abs(selfScore(r.plan,a).result-r.score)<1e-7,'Điểm cuối không khớp dữ liệu.');text(r.reviewer,'Người xác nhận');text(r.reviewNote,'Nhận xét cuối');need(r.reviewer.trim()&&stamp(r.approvedAt),'Thiếu người / ngày chốt.');return r;
}
const api={planKey,config,sameConfig,validatePlan,issuePlan,newAssessment,validateAssessment,asMonth,selfScore,createSubmission,validateSubmission,receiveSubmission,reviewErrors,fillEmptyFromSelf,discardSelf,validateStoredMonth,makeDraft,validateDraft,createResult,validateResult};
root.KPISelf=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

;(function(root){
'use strict';
const scale=[
 [100,'Hoàn thành đầy đủ đầu ra đã cam kết, đạt chuẩn chất lượng và thời hạn áp dụng; có căn cứ xác nhận. Không bắt buộc vượt mục tiêu.'],
 [75,'Phần chính đã sử dụng được; còn thiếu phần phụ hoặc cần chỉnh sửa nhỏ. Nêu rõ phần chưa đạt và căn cứ cho mức chấm.'],
 [50,'Có đầu ra sử dụng được nhưng mới đáp ứng một phần quan trọng; phần còn lại cần bổ sung đáng kể.'],
 [25,'Mới đạt phần nhỏ có thể chấp nhận; phần lớn cam kết chưa hoàn thành hoặc còn cần hỗ trợ, sửa lại nhiều.'],
 [0,'Đã xác nhận không thực hiện, không có đầu ra được chấp nhận hoặc kết quả không sử dụng được theo chuẩn đã giao.']
];
const rules=[
 'Ô trống là chưa đủ căn cứ hoặc chưa chấm, không phải 0%. Chỉ ghi 0% khi có kết luận về kết quả thực tế.',
 'Tiêu chí định lượng dùng kết quả tính thực, ví dụ 80% hoặc 62,5%; không ép về các mức 0/25/50/75/100. Các mốc số trong ví dụ chỉ minh họa cách tính.',
 'Trước kỳ, thống nhất đầu ra, chuẩn 100%, mức không điểm nếu dùng nội suy, hạn và người xác nhận. Các số trong hướng dẫn không phải mục tiêu thật của Thông hoặc Thy.',
 'Nếu có nhiều đầu ra, chốt trọng số con theo mức quan trọng trước khi thực hiện. Không đếm số việc như thể mọi việc đều quan trọng bằng nhau.',
 'Đầu ra không đạt điều kiện chấp nhận bắt buộc không được xem là đã nghiệm thu. Chỉ dùng chấm từng phần khi có phần việc độc lập được xác nhận.',
 'Chỉ đánh giá phần trách nhiệm cá nhân kiểm soát được; xử lý trở ngại ngoài quyền kiểm soát theo căn cứ và kết luận của quản lý. Một kết quả chỉ được chấm một lần.',
 'Phần mô tả dưới đây cụ thể hóa khung V1.1 để trao đổi và áp dụng thống nhất. Không dùng mô tả mới để tự sửa hồi tố tháng đã chốt.'
];
const rubrics={};
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function renderScale(){return `<table class="rubric-table"><thead><tr><th>Mức</th><th>Điều kiện chấm định tính</th></tr></thead><tbody>${scale.map(([p,t])=>`<tr><td><b>${p}%</b></td><td>${esc(t)}</td></tr>`).join('')}</tbody></table>`;}
function render(id){const r=rubrics[id];if(!r)return '<p>Chưa có hướng dẫn cho mã KPI này.</p>';return `<div class="rubric-content"><p><b>${esc(r.method)}</b></p><p>${esc(r.how)}</p>${r.quantitative?'<p class="rubric-info">Các mức dưới đây là mốc hoặc tổ hợp minh họa. Tính giá trị thực theo công thức, không ép về nấc 25%.</p>':''}<table class="rubric-table"><thead><tr><th>Mức</th><th>Khi nào đạt</th></tr></thead><tbody>${r.levels.map(([p,t])=>`<tr><td><b>${p}%</b></td><td>${esc(t)}</td></tr>`).join('')}</tbody></table><p class="rubric-example"><b>Ví dụ:</b> ${esc(r.example)}</p><p class="rubric-info">${esc(r.note)}</p></div>`;}
const api={scale,rules,rubrics,render,renderScale};root.KPIHelp=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);

