/* Warranty Ease follow-ups: appliance-scoped private notes and action reminders.
   Consumer data: NOT the shared developer-feedback Notes library.
   Stored with each appliance inside the existing encrypted backup archive. */
(function(root){
'use strict';
const MAX_TITLE=160, MAX_DETAILS=4000;
function date(value){
 const text=String(value||'').trim();
 if(!text)return '';
 if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Error('Choose a valid reminder date');
 const dt=new Date(text+'T12:00:00Z');
 if(!Number.isFinite(dt.getTime())||dt.toISOString().slice(0,10)!==text)throw Error('Choose a valid reminder date');
 return text;
}
function stamp(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))?value:'';}
function normalise(item={}){
 const createdAt=stamp(item.createdAt)||new Date(0).toISOString();
 const status=['open','done','archived'].includes(item.status)?item.status:'open';
 return {
  id:String(item.id||''),title:String(item.title||item.text||'').trim().slice(0,MAX_TITLE),
  details:String(item.details||'').slice(0,MAX_DETAILS),dueDate:date(item.dueDate||''),
  status,createdAt,updatedAt:stamp(item.updatedAt)||createdAt,
  completedAt:status==='done'?(stamp(item.completedAt)||stamp(item.updatedAt)||createdAt):''
 };
}
function listOf(items){
 return (Array.isArray(items)?items:[]).filter(x=>x&&typeof x==='object'&&typeof x.id==='string'&&x.id).map(normalise);
}
function save(items,fields,{id='',now=new Date().toISOString(),makeId}={}){
 const existing=listOf(items),before=id?existing.find(x=>x.id===id):null;
 if(id&&!before)throw Error('This note was changed or removed on another device. Reopen the appliance.');
 const title=String(fields?.title===undefined?before?.title||'':fields.title).trim().slice(0,MAX_TITLE);
 if(!title)throw Error('Write a short note or action first.');
 const details=String(fields?.details===undefined?before?.details||'':fields.details).slice(0,MAX_DETAILS);
 const dueDate=date(fields?.dueDate===undefined?before?.dueDate||'':fields.dueDate);
 const status=['open','done','archived'].includes(fields?.status)?fields.status:(before?.status||'open');
 const key=id||(typeof makeId==='function'?makeId():root.crypto?.randomUUID?.()||('followup-'+Date.now()+'-'+Math.random().toString(36).slice(2)));
 const entry={id:key,title,details,dueDate,status,createdAt:before?.createdAt||now,updatedAt:now,
  completedAt:status==='done'?(before?.status==='done'?before.completedAt:now):''};
 if(!before)return [...existing,entry];
 return existing.map(x=>x.id===key?entry:x);
}
function setStatus(items,id,status,options={}){
 if(!['open','done','archived'].includes(status))throw Error('Invalid follow-up status');
 return save(items,{status},{...options,id});
}
function merge(remote,local){
 const result=new Map();
 for(const n of listOf(remote))result.set(n.id,n);
 for(const n of listOf(local)){
  const old=result.get(n.id);
  if(!old||n.updatedAt>=old.updatedAt)result.set(n.id,n);
 }
 return [...result.values()];
}
function dueState(item,asOf){
 const n=normalise(item);
 if(n.status!=='open')return n.status;
 if(!n.dueDate)return 'undated';
 if(n.dueDate<asOf)return 'overdue';
 if(n.dueDate===asOf)return 'today';
 return 'upcoming';
}
function agenda(records,{filter='open',today=new Date().toISOString().slice(0,10)}={}){
 const rows=[];
 for(const record of Array.isArray(records)?records:[]){
  for(const note of listOf(record?.followUps)){
   if(filter==='archived'?note.status!=='archived':filter==='done'?note.status!=='done':note.status!=='open')continue;
   rows.push({...note,recordId:record.id,applianceName:[record.brand,record.model||record.productName].filter(Boolean).join(' ')||record.productName||'Appliance',dueState:dueState(note,today)});
  }
 }
 const statusWeight=n=>n.status==='open'?0:1;
 rows.sort((a,b)=>statusWeight(a)-statusWeight(b)||
  (a.dueDate||'9999-12-31').localeCompare(b.dueDate||'9999-12-31')||
  b.updatedAt.localeCompare(a.updatedAt));
 return rows;
}
const api={date,normalise,listOf,save,setStatus,merge,dueState,agenda,MAX_TITLE,MAX_DETAILS};
root.WarrantyFollowUps=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
