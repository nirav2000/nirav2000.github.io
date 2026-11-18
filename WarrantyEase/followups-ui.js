/* Private consumer note UI. The shared Notes & Annotations module is for developer feedback,
   so warranty follow-ups use a small appliance-scoped adapter and the encrypted archive. */
(function(root){
'use strict';
const model=()=>root.WarrantyFollowUps;
function safe(v,u){return u.esc(v??'');}
function fdate(v,u){return u.fdate(v);}
function rows(records,filter,today){return model()?.agenda?.(records,{filter,today})||[];}
function dateDescription(n,u){
 const state=n.dueState||model()?.dueState(n,u.today)||'undated';
 return state==='overdue'?'Overdue · '+fdate(n.dueDate,u):
  state==='today'?'Due today':state==='upcoming'?'Due '+fdate(n.dueDate,u):
  state==='done'?'Completed':state==='archived'?'Archived':'No due date';
}
function item(note,u){
 const state=note.dueState||model()?.dueState(note,u.today)||'undated';
 const done=note.status==='done',archived=note.status==='archived';
 return `<article class="we-followup-item ${state==='overdue'?'we-followup-overdue':''}">
 <div class="we-followup-item-text">
 <div class="we-followup-meta"><span>${safe(note.applianceName||'Appliance',u)}</span><span class="we-followup-due ${state==='overdue'?'overdue':state==='today'?'today':''}">${safe(dateDescription(note,u),u)}</span></div>
 <strong class="${done?'we-followup-struck':''}">${safe(note.title,u)}</strong>
 ${note.details?`<p>${safe(note.details,u)}</p>`:''}</div>
 <div class="we-followup-actions">
 ${!archived?`<button class="btn btn-line btn-sm" data-action="followup-toggle" data-id="${safe(note.recordId,u)}" data-note-id="${safe(note.id,u)}" data-status="${done?'open':'done'}">${done?'Reopen':'Mark done'}</button>`:''}
 <button class="btn btn-ghost btn-sm" data-action="followup-edit" data-id="${safe(note.recordId,u)}" data-note-id="${safe(note.id,u)}">Edit</button>
 ${!archived?`<button class="btn btn-ghost btn-sm" data-action="followup-archive" data-id="${safe(note.recordId,u)}" data-note-id="${safe(note.id,u)}">Archive</button>`:''}</div></article>`;
}
function home(records,u){
 if(!records.length)return '';
 const list=rows(records,'open',u.today),overdue=list.filter(x=>x.dueState==='overdue').length;
 return `<section class="we-followup-home"><div class="we-followup-head"><div><h2>Notes &amp; follow-ups</h2><p>${list.length?overdue?overdue+' overdue · '+list.length+' outstanding':list.length+' outstanding':'Calls, questions and useful reminders'}</p></div><button class="btn btn-line btn-sm" data-action="notes">View all</button></div>
 ${list.length?`<div class="we-followup-list">${list.slice(0,3).map(n=>item(n,u)).join('')}</div>`:'<p class="we-followup-empty">Keep track of calls to manufacturers, warranty questions and anything that needs checking.</p>'}
 <button class="we-followup-new" data-action="followup-new">+ Add a follow-up</button></section>`;
}
function detail(record,u){
 const notes=model()?.listOf?.(record.followUps)||[];
 const name=[record.brand,record.model||record.productName].filter(Boolean).join(' ')||'Appliance';
 const relevant=(status)=>notes.filter(n=>n.status===status).map(n=>({...n,recordId:record.id,applianceName:name}));
 const open=relevant('open').sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')),done=relevant('done');
 return `<div class="detail-block we-followup-detail"><div class="we-followup-head"><div><h3>Notes &amp; follow-ups</h3><p>${open.length} outstanding · ${done.length} completed</p></div><button class="btn btn-line btn-sm" data-action="followup-new" data-id="${safe(record.id,u)}">+ Add note</button></div>
 ${open.length?`<div class="we-followup-list">${open.map(n=>item(n,u)).join('')}</div>`:'<p class="note-muted">No outstanding questions or calls.</p>'}
 ${done.length?`<details class="we-followup-history"><summary>Completed notes (${done.length})</summary><div class="we-followup-list">${done.map(n=>item(n,u)).join('')}</div></details>`:''}</div>`;
}
function page(records,u,filter='open'){
 const open=rows(records,'open',u.today),done=rows(records,'done',u.today),archived=rows(records,'archived',u.today);
 const list=rows(records,filter,u.today),overdue=open.filter(n=>n.dueState==='overdue').length;
 return `<section class="we-followup-page"><div class="we-followup-page-head"><div>
 <div class="eyebrow">Your appliance actions</div><h1>Notes &amp; follow-ups.</h1>
 <p>Keep questions, planned calls and their outcomes with the appliance they concern.</p>
 </div><button class="btn btn-dark" data-action="followup-new" ${records.length?'':'disabled'}>+ Add follow-up</button></div>
 <div class="we-followup-summary"><div><strong>${open.length}</strong><span>Outstanding</span></div><div><strong>${overdue}</strong><span>Overdue</span></div><div><strong>${done.length}</strong><span>Completed</span></div></div>
 <div class="we-followup-tabs" role="group" aria-label="Follow-up status">
 ${[['open','Outstanding',open.length],['done','Completed',done.length],['archived','Archived',archived.length]].map(([key,label,count])=>`<button data-action="followup-filter" data-filter="${key}" class="${key===filter?'active':''}" aria-pressed="${key===filter}">${label} (${count})</button>`).join('')}
 </div>
 ${list.length?`<div class="we-followup-list">${list.map(n=>item(n,u)).join('')}</div>`:
 `<div class="we-followup-empty-panel"><h3>${filter==='open'?'No outstanding follow-ups':'Nothing here yet'}</h3><p>${records.length?'Add a call, reminder or note to any appliance.':'Add an appliance first, then link follow-up notes to it.'}</p></div>`}
 <p class="note-muted">Due dates are highlighted here when you open the app. Push alerts and background notifications are not yet enabled.</p>
 </section>`;
}
function editor(records,selected,existing,u){
 const example=String(selected?.brand||'').toUpperCase()==='TCL'?'Call TCL about the Channel 4 app':'Call LG to confirm five-year warranty';
 return `<div class="modal-overlay"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="${existing?'Edit':'Add'} follow-up">
 <div class="modal-header"><div><span class="modal-label">Warranty notes</span><h2>${existing?'Edit':'Add'} follow-up</h2><p>Keep the question, planned call or outcome.</p></div><button class="close-btn" data-action="followup-cancel" aria-label="Close">${u.ico('close')}</button></div>
 <div class="modal-content"><div class="form-grid">
 <div class="field full"><label for="we-followup-appliance">Appliance</label><select class="input" id="we-followup-appliance" ${existing?'disabled':''}>${records.map(r=>`<option value="${safe(r.id,u)}" ${r.id===selected.id?'selected':''}>${safe([r.brand,r.model||r.productName].filter(Boolean).join(' ')||'Appliance',u)}</option>`).join('')}</select></div>
 <div class="field full"><label for="we-followup-title">What needs doing?</label><input class="input" id="we-followup-title" type="text" maxlength="160" required placeholder="${safe(example,u)}" value="${safe(existing?.title||'',u)}"></div>
 <div class="field full"><label for="we-followup-date">Follow-up date (optional)</label><input class="input" id="we-followup-date" type="date" value="${safe(existing?.dueDate||'',u)}"><p class="field-hint">Dates appear as due or overdue in the app. No push alerts are sent.</p></div>
 <div class="field full"><label for="we-followup-details">Conversation notes and outcome (optional)</label><textarea class="input textarea" id="we-followup-details" rows="5" maxlength="4000" placeholder="What did they say? Who did you speak to? Any case reference?">${safe(existing?.details||'',u)}</textarea></div>
 </div></div>
 <div class="modal-footer"><button class="btn btn-ghost" data-action="followup-cancel">Cancel</button><button class="btn btn-dark" data-action="followup-save">Save follow-up</button></div></section></div>`;
}
const api={home,detail,page,editor,item,rows};
root.WarrantyFollowUpsUI=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
