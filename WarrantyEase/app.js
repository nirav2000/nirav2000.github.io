'use strict';

// Warranty Ease, private-first edition. Records and file blobs stay in IndexedDB.
// Photos stay on this device. English OCR runs in a separately bundled, same-origin Worker; no third-party API.
const DB_NAME = 'warranty-ease-v1';
const DB_STORE = 'appliances';
const ACCOUNTS_STORE = 'website-accounts';
const META_STORE = 'app-meta';
const DEVICE_BACKUPS_STORE = 'device-backups';
const VAULT_KDF_ITERATIONS = 310000;
let websiteAccounts = [];
let vaultMeta = null;
let vaultKey = null;
let vaultLockTimer = null;
let accountEditor = null;
let pendingImportEntries = null;
let pendingExportZip = null;
let lastBackupAt = null;
let db = null;
let appliances = [];
let searchTerm = '';
let currentView = 'home';
let editor = null;
let detailId = null;
let claim = null;
let followUpEditor = null;
let followUpFilter = 'open';
let modalKind = null;
let ocrQueue = [];
let ocrWorking = false;
let ocrMessage = '';
const urls = {main: [], modal: []};
const root = document.getElementById('main');
const modalRoot = document.getElementById('modal-root');
const toastRoot = document.getElementById('toast-root');
const templates = [
  {productName:'Washing machine', category:'Laundry', brand:'LG', model:'F4Y511WWLA1'},
  {productName:'Heat-pump tumble dryer', category:'Laundry', brand:'LG', model:'RHX1009NWK'},
  {productName:'65-inch television', category:'TV & entertainment', brand:'TCL', model:'65C8L-UK'}
];

const ICONS = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  settings:'<path d="M12 2.5v3m0 13v3M4.8 4.8l2.1 2.1m10.2 10.2 2.1 2.1M2.5 12h3m13 0h3M4.8 19.2l2.1-2.1M17.1 6.9l2.1-2.1"/><circle cx="12" cy="12" r="5"/>',
  search:'<circle cx="10.9" cy="10.9" r="7.2"/><path d="m16.2 16.2 5 5"/>',
  arrow:'<path d="M5 12h14m-7-7 7 7-7 7"/>',
  close:'<path d="m5 5 14 14M19 5 5 19"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  shield:'<path d="M12 2.5 20 6v6c0 5.2-3.5 8.4-8 10-4.5-1.6-8-4.8-8-10V6z"/><path d="m8.5 12 2.5 2.5 4.7-5"/>',
  box:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="3.5"/>',
  upload:'<path d="M12 16V3m-5 5 5-5 5 5M3 17v4h18v-4"/>',
  file:'<path d="M5 2.5h9l5 5V21H5zM14 2.5v5h5M8 12h8M8 16h8"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 16-5-5L5 21"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  mail:'<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 7 9 7 9-7"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  download:'<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  phone:'<path d="m7 3 3 4-2 3a16 16 0 0 0 6 6l3-2 4 3-2 4C11 23 1 13 3 5z"/>',
  link:'<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  sparkles:'<path d="m12 2 2 7 7 2-7 2-2 7-2-7-7-2 7-2zM20 17l1 3 3 1-3 1-1 3-1-3-3-1 3-1"/>',
  washing:'<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M4 8h16"/><circle cx="12" cy="15" r="5"/><path d="M7.5 5.3h1m3 0h1"/>',
  tv:'<rect x="2.5" y="4" width="19" height="14" rx="2"/><path d="M9 21h6m-3-3v3"/>',
  kitchen:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 10h16M8 6h1m4 0h1"/><circle cx="12" cy="15.5" r="3"/>',
  appliance:'<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M5 8h14M9 5h1"/><circle cx="12" cy="15" r="4"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
  checkcircle:'<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3.2 3.2 5.8-6"/>',
  alert:'<path d="M12 3 2 21h20L12 3zM12 9v5m0 4v.3"/>',
  share:'<path d="M12 3v13m-5-8 5-5 5 5M4 14v7h16v-7"/>',
  edit:'<path d="m4 16 11-11 4 4L8 20H4zM13.5 6.5l4 4"/>',
  external:'<path d="M13 5h6v6M19 5l-9 9M19 13v6H5V5h6"/>',
  paperclip:'<path d="m9 13 6-6a4 4 0 0 1 6 6l-9 9a6 6 0 0 1-9-9l9-9"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  key:'<circle cx="8" cy="15" r="5"/><path d="m12 11 9-9m-4 4 4 4m-7-1 4 4"/>'
};
function ico(name, extra='') {return `<span class="ico ${extra}" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[name]||ICONS.box}</svg></span>`;}
function hydrateIcons(scope=document) {scope.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=ico(el.dataset.icon);});}
function esc(value='') {return String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function uid() {return (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);}
function today() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function fdate(value) {if(!value)return 'Not added';const d=new Date(`${value}T12:00:00Z`);return Number.isNaN(d.getTime())?'Not added':new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(d);}
function addMonthsMinusDay(value,months) {
  if(!value||!Number.isFinite(+months)||+months<=0)return '';
  const parts=value.split('-').map(Number);if(parts.length!==3||parts.some(x=>!x))return '';
  const base=new Date(Date.UTC(parts[0],parts[1]-1+Number(months),1));
  const last=new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate();
  base.setUTCDate(Math.min(parts[2],last)-1);
  return base.toISOString().slice(0,10);
}
function computedExpiry(r) {return r.expiryDate||addMonthsMinusDay(r.warrantyStart||r.purchaseDate,r.durationMonths);}
function isExpired(r) {const expiry=computedExpiry(r);return expiry && expiry<today();}
function isCovered(r) {const expiry=computedExpiry(r);return !!(expiry && expiry>=today());}
function hasReceipt(r) {return !!(r.files||[]).find(f=>f.type==='receipt');}
function isReady(r) {return !!(r.model&&r.serial&&r.purchaseDate&&hasReceipt(r));}
function missingBits(r) {const missing=[];if(!r.serial)missing.push('serial');if(!r.purchaseDate)missing.push('purchase date');if(!hasReceipt(r))missing.push('receipt');return missing;}
function newRecord(initial={}) {const now=new Date().toISOString();return {id:uid(),productName:'',category:'',brand:'',model:'',productCode:'',serial:'',purchaseDate:'',retailer:'',orderNumber:'',price:'',warrantyStart:'',durationMonths:'',expiryDate:'',registrationDate:'',registrationMethod:'',registrationReference:'',warrantyProvider:'',warrantyNotes:'',supportEmail:'',supportPhone:'',supportUrl:'',sellerEmail:'',sellerPhone:'',sellerUrl:'',websiteAccountId:'',displayPhoto:'installed',productUrl:'',manualUrl:'',warrantyTermsUrl:'',softwareUpdatesUrl:'',files:[],createdAt:now,updatedAt:now,...initial};}
function fmtSize(size) {return size<1024*1024?`${Math.max(1,Math.round(size/1024))} KB`:`${(size/1024/1024).toFixed(1)} MB`;}
function fileLabel(type) {return {device:'Installed appliance photo',reference:'Product reference photo',label:'Model / serial label',receipt:'Purchase proof',warranty:'Warranty document',other:'Other evidence'}[type]||'Evidence';}
function cardIcon(category='') {if(/tv|entertainment|screen/i.test(category))return ico('tv','card-art');if(/laundry|wash|dryer/i.test(category))return ico('washing','card-art');if(/kitchen|oven|dishwash|fridge/i.test(category))return ico('kitchen','card-art');return ico('appliance','card-art');}
function preferredPicture(record){
 const pics=(record.files||[]).filter(f=>f.mime?.startsWith('image/')&&window.WarrantyMedia?.isBlob?.(f.blob));
 const choice=record.displayPhoto==='reference'?['reference','device']:['device','reference'];
 return choice.map(type=>pics.find(f=>f.type===type)).find(Boolean)||null;
}
function mediaBlob(file){return window.WarrantyMedia?.imageBlob?.(file)|| (file?.blob instanceof Blob&&file.blob.size?file.blob:null);}
function previewUrl(blob,scope) {if(!(blob instanceof Blob)||blob.size===0)return '';const url=URL.createObjectURL(blob);urls[scope].push(url);return url;}
function missingImageNotice(record){const all=(record.files||[]).filter(f=>f.type==='device'||f.type==='reference');return all.some(f=>f.mime?.startsWith('image/')&&!window.WarrantyMedia?.isBlob?.(f.blob));}

function clearUrls(scope) {urls[scope].forEach(x=>URL.revokeObjectURL(x));urls[scope]=[];}
function errorToast(text) {toast(text);}
let toastHandle=null;
function toast(msg) {toastRoot.innerHTML=`<div class="toast">${esc(msg)}</div>`;if(toastHandle)clearTimeout(toastHandle);toastHandle=setTimeout(()=>toastRoot.innerHTML='',3600);}
function safeHttp(value) {if(!value)return '';try{const u=new URL(/^https?:\/\//i.test(value)?value:`https://${value}`);return /^(https?):$/.test(u.protocol)?u.href:'';}catch{return '';}}
function safeEmail(value) {return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value||'')?value:'';}

function openDB() {return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,3);request.onupgradeneeded=()=>{const database=request.result;for(const store of [DB_STORE,ACCOUNTS_STORE,META_STORE,DEVICE_BACKUPS_STORE])if(!database.objectStoreNames.contains(store))database.createObjectStore(store,{keyPath:'id'});};request.onsuccess=()=>{const connection=request.result;connection.onversionchange=()=>{connection.close();if(db===connection)db=null;};connection.onclose=()=>{if(db===connection)db=null;};resolve(connection);};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Storage upgrade is blocked by another tab'));});}
let openingStorage=null;
async function ensureStorage(){if(!db){openingStorage ||= openDB().finally(()=>{openingStorage=null});db=await openingStorage;}return db;}
async function storeAction(storeName,mode,callback) {await ensureStorage();try{return await storageTransaction(storeName,mode,callback);}catch(e){if(e?.name!=='InvalidStateError')throw e;db=null;await ensureStorage();return storageTransaction(storeName,mode,callback);}}
function storageTransaction(storeName,mode,callback) {return new Promise((resolve,reject)=>{
 if(!db?.objectStoreNames?.contains(storeName)){
  // A missing IndexedDB object store is a schema problem, not a lost R2
  // archive or a wrong encryption passphrase. Never reset the database here.
  reject(new Error('This device is missing a required local storage section. Its existing records have not been cleared. Close other Warranty Ease tabs and reopen the app.'));return;
 }
 const tx=db.transaction(storeName,mode),store=tx.objectStore(storeName);
 let request;try{request=callback(store);}catch(e){reject(e);return;}
 tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);
 tx.onabort=()=>reject(tx.error||new Error('Local storage operation was interrupted'));
 });}
function dbAction(mode,callback){return storeAction(DB_STORE,mode,callback);}
// Read, merge, and write within ONE IndexedDB transaction to prevent OCR and
// thumbnail generation from overwriting each other's changes.
async function patchStoredFile(recordId,fileId,changes){
 const storedChanges={...changes};for(const [k,b] of [['blob','originalBytes'],['previewBlob','previewBytes']])if(changes[k] instanceof Blob){storedChanges[k==='blob'?'originalHash':'previewHash']=await saveEvidence(changes[k]);delete storedChanges[k];}
 return new Promise((resolve,reject)=>{
 const tx=db.transaction(DB_STORE,'readwrite'),store=tx.objectStore(DB_STORE),req=store.get(recordId);
 req.onsuccess=()=>{const row=req.result,attached=row?.files?.find(f=>f.id===fileId);
  if(attached){Object.assign(attached,storedChanges);if(storedChanges.originalHash){delete attached.blob;delete attached.originalBytes;}if(storedChanges.previewHash){delete attached.previewBlob;delete attached.previewBytes;}if(Object.keys(changes).some(k=>k!=='previewBlob'))row.updatedAt=new Date().toISOString();store.put(row);}
 };
 tx.oncomplete=()=>{if(Object.keys(changes).some(key=>key!=='previewBlob')||changes.previewBlob instanceof Blob)window.WarrantyCloud?.scheduleUpload?.();resolve(true)};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Attachment update could not finish'));
 });}
async function prepareDisplayImages(recordId,files){
 for(const f of files){
  if(!f.mime?.startsWith('image/')||!window.WarrantyMedia?.createPreview)continue;
  if(window.WarrantyMedia?.isBlob?.(f.previewBlob)){
   try{await f.previewBlob.arrayBuffer();continue;}catch(error){if(!['NotFoundError','NotReadableError'].includes(error?.name))throw error;}
  }
  try{
   const preview=await window.WarrantyMedia.createPreview(f.blob,{type:f.type});if(!preview)continue;
   await patchStoredFile(recordId,f.id,{previewBlob:preview});
   if(editor?.draft.id===recordId){const current=editor.draft.files.find(x=>x.id===f.id);if(current)current.previewBlob=preview;}
   await refresh();
   if(currentView==='home'&&!modalKind)renderGrid(); // Avoid re-rendering a form while someone is typing.
  }catch(e){console.warn('Original preserved, display preview unavailable:',e?.name||'unsupported-image');}
 }
}

// Persist evidence as inline ArrayBuffers, hydrate fresh Blobs only in memory.
// Store large evidence separately from IndexedDB metadata, keyed by content.
async function evidenceCache(){return caches.open('we-local-evidence-v1');}
function evidenceURL(hash){return new URL('./local-evidence/'+hash,location.href).href;}
async function saveEvidence(blob){
 const bytes=await blob.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
 const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const cache=await evidenceCache(),key=evidenceURL(hash);
 if(!await cache.match(key))await cache.put(key,new Response(bytes,{headers:{'Content-Type':blob.type||'application/octet-stream'}}));
 const saved=await cache.match(key);if(!saved)throw Error('EVIDENCE_CACHE_WRITE_FAILED');
 const check=await saved.arrayBuffer();if(check.byteLength!==bytes.byteLength)throw Error('EVIDENCE_CACHE_LENGTH_MISMATCH');
 return hash;
}
async function evidenceForStorage(row){
 const files=[];
 for(const f of row.files||[]){
  const out={...f};
  for(const [blobKey,bytesKey,hashKey] of [['blob','originalBytes','originalHash'],['previewBlob','previewBytes','previewHash']]){
   const blob=f[blobKey] instanceof Blob?f[blobKey]:f[bytesKey] instanceof ArrayBuffer?new Blob([f[bytesKey]]):null;
   if(blob?.size){let readable;try{readable=await blob.arrayBuffer();}catch(e){if(blobKey==='previewBlob'){delete out[blobKey];delete out[bytesKey];}continue;}
    out[hashKey]=await saveEvidence(new Blob([readable],{type:blob.type}));delete out[blobKey];delete out[bytesKey];
   }
  }
  files.push(out);
 }
 return {...row,files};
}
async function hydrateEvidence(row){
 const cache=await evidenceCache();
 return {...row,files:await Promise.all((row.files||[]).map(async f=>{
  const out={...f};
  for(const [blobKey,bytesKey,hashKey] of [['blob','originalBytes','originalHash'],['previewBlob','previewBytes','previewHash']]){
   if(f[hashKey]){const response=await cache.match(evidenceURL(f[hashKey]));if(response)out[blobKey]=new Blob([await response.arrayBuffer()],{type:blobKey==='blob'?f.mime||'application/octet-stream':'image/jpeg'});}
   if(!out[blobKey]&&f[bytesKey] instanceof ArrayBuffer)out[blobKey]=new Blob([f[bytesKey]],{type:blobKey==='blob'?f.mime||'application/octet-stream':'image/jpeg'});
   delete out[bytesKey];
  }
  return out;
 }))};
}
async function refresh() {appliances=await Promise.all((await dbAction('readonly',store=>store.getAll())).map(hydrateEvidence));appliances.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));websiteAccounts=await storeAction(ACCOUNTS_STORE,'readonly',store=>store.getAll());websiteAccounts.sort((a,b)=>String(a.brand).localeCompare(String(b.brand)));vaultMeta=await storeAction(META_STORE,'readonly',store=>store.get('vault'))||null;const last=await storeAction(META_STORE,'readonly',store=>store.get('lastBackup'));lastBackupAt=last?.at||null;}
async function putRecord(record) {record.updatedAt=new Date().toISOString();const stored=await evidenceForStorage(record);await dbAction('readwrite',store=>store.put(stored));await refresh();window.WarrantyCloud?.scheduleUpload?.();}
// A tombstone travels in encrypted backups, preventing an older device from reviving deleted entries.
async function deleteWithTombstone(storeName,id,kind){
 const deletedAt=new Date().toISOString();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction([storeName,META_STORE],'readwrite'),metadata=tx.objectStore(META_STORE);
  const request=metadata.get('syncTombstones');
  request.onsuccess=()=>{
   const items=Array.isArray(request.result?.items)?request.result.items:[];
   metadata.put({id:'syncTombstones',items:[...items.filter(x=>x.id!==id||x.kind!==kind),{id,kind,deletedAt}]});
   tx.objectStore(storeName).delete(id);
  };
  tx.oncomplete=()=>resolve();
  tx.onerror=()=>reject(tx.error||Error('Could not record the deletion'));
  tx.onabort=()=>reject(tx.error||Error('Deletion interrupted'));
 });
}
async function deleteRecord(id) {await deleteWithTombstone(DB_STORE,id,'appliance');await refresh();window.WarrantyCloud?.scheduleUpload?.();}
function getRecord(id) {return appliances.find(r=>r.id===id);}

function setNavState() {
 document.querySelectorAll('[data-action="home"], [data-action="notes"], [data-action="settings"], [data-action="logins"]').forEach(el=>el.classList.toggle('active',el.dataset.action===currentView));
}
function renderHome() {
 currentView='home';setNavState();clearUrls('main');
 const covered=appliances.filter(isCovered).length;
 root.innerHTML=`
 <section class="home-head">
  <div class="eyebrow">Your home, organised</div>
  <div class="home-title-row"><div><h1>Appliances<span class="title-dot">.</span></h1><p>Everything you need, when you need it.</p></div><button class="btn btn-dark home-add" data-action="new">${ico('camera')} Add appliance</button></div>
 </section>
 <div id="we-cloud-banner">${window.WarrantyCloud?.banner?.()||''}</div>
  <section class="home-utility"><div class="search-wrap home-search">${ico('search')}<input id="app-search" type="search" class="search-input" placeholder="Search appliances, models or serial numbers" aria-label="Search appliances" value="${esc(searchTerm)}"></div><div class="mini-count"><span class="count-big">${appliances.length}</span> saved <span class="count-sep">·</span> ${covered} with active cover dates</div></section>
 <section class="help-strip"><span class="help-icon">${ico('shield')}</span><div><strong>Need to make a warranty claim?</strong><p>Choose an appliance below to find your serial number, receipt and contact details.</p></div>${ico('arrow','help-arrow')}</section>
 ${window.WarrantyFollowUpsUI?.home?.(appliances,{today:today(),esc,ico,fdate})||''}
 <section class="list-section"><div class="section-head"><div><h2>My appliances</h2><p>${appliances.length?'Tap any appliance for details and documents.':'Start by saving a receipt or model number.'}</p></div></div><div id="appliance-list"></div></section>
 <p class="note-muted warranty-footnote">Coverage dates are estimates based on your entries. Always check the terms of your warranty.</p>`;
 if(searchTerm.trim())document.querySelector('.home-utility')?.classList.add('wallet-show-search');
 renderGrid();
}

function renderFollowUps(){
 currentView='notes';setNavState();clearUrls('main');
 root.innerHTML=window.WarrantyFollowUpsUI?.page?.(appliances,{today:today(),esc,ico,fdate},followUpFilter)||
   '<p>Notes are unavailable until the app update finishes installing. Reload to try again.</p>';
}
function openFollowUpEditor(recordId='',noteId=''){
 if(!appliances.length){toast('Add an appliance before creating a follow-up.');return;}
 if(!window.WarrantyFollowUps?.save||!window.WarrantyFollowUpsUI?.editor){toast('Notes are unavailable. Reload the app to update.');return;}
 const selected=getRecord(recordId)||appliances[0];
 const existing=noteId?window.WarrantyFollowUps.listOf(selected.followUps).find(n=>n.id===noteId):null;
 if(noteId&&!existing){toast('This note has changed. Reopen the appliance.');return;}
 const origin=modalKind==='detail'?'detail':currentView;
 followUpEditor={recordId:selected.id,noteId:noteId||'',origin};
 modalKind='followup';clearUrls('modal');
 modalRoot.innerHTML=window.WarrantyFollowUpsUI.editor(appliances,selected,existing,{today:today(),esc,ico,fdate});
 document.body.style.overflow='hidden';
 document.getElementById('we-followup-title')?.focus();
}
function updateRecordFollowUps(recordId,transform){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(DB_STORE,'readwrite'),store=tx.objectStore(DB_STORE),req=store.get(recordId);
  let failure=null;
  req.onsuccess=()=>{
   try{
    const record=req.result;
    if(!record)throw Error('Appliance is missing on this device.');
    record.followUps=transform(record.followUps||[]);
    record.updatedAt=new Date().toISOString();
    store.put(record);
   }catch(error){failure=error;try{tx.abort()}catch{}}
  };
  tx.oncomplete=()=>resolve(true);
  tx.onerror=()=>reject(failure||tx.error||Error('Follow-up could not be saved.'));
  tx.onabort=()=>reject(failure||tx.error||Error('Follow-up change was interrupted.'));
 });
}
async function saveFollowUp(){
 if(!followUpEditor)return;
 const recordId=document.getElementById('we-followup-appliance')?.value||followUpEditor.recordId;
 const fields={title:document.getElementById('we-followup-title')?.value||'',
  dueDate:document.getElementById('we-followup-date')?.value||'',
  details:document.getElementById('we-followup-details')?.value||''};
 if(!fields.title.trim()){toast('Write a note or action first.');document.getElementById('we-followup-title')?.focus();return;}
 const {origin,noteId}=followUpEditor;
 try{
  await updateRecordFollowUps(recordId,items=>window.WarrantyFollowUps.save(items,fields,{id:noteId,makeId:uid}));
  await refresh();window.WarrantyCloud?.scheduleUpload?.();
  closeModal(true);
  if(origin==='detail')showDetail(recordId);else if(origin==='notes')renderFollowUps();else renderHome();
  toast('Saved. Sync will run automatically when connected.');
 }catch(e){toast(e.message||'Could not save follow-up.');}
}
async function changeFollowUpStatus(recordId,noteId,status){
 if(!getRecord(recordId)||!noteId)return;
 if(status==='archived'&&!window.confirm('Archive this follow-up? It remains available under Archived.'))return;
 try{
  await updateRecordFollowUps(recordId,items=>window.WarrantyFollowUps.setStatus(items,noteId,status));
  await refresh();window.WarrantyCloud?.scheduleUpload?.();
  if(modalKind==='detail')showDetail(recordId);else if(currentView==='notes')renderFollowUps();else renderHome();
  toast(status==='done'?'Follow-up completed.':status==='open'?'Follow-up reopened.':'Follow-up archived.');
 }catch(e){toast(e.message||'Could not update this follow-up.');}
}

function quickStartMarkup() {return `<aside class="quick-start"><div class="quick-header"><h3>Get started with your recent purchases</h3><span>Models only: you can add the serials and receipts when ready.</span></div><div class="quick-list">${templates.map((t,i)=>`<div class="quick-item"><div><strong>${esc(t.brand)} ${esc(t.productName)}</strong><span>${esc(t.model)}</span></div><button data-action="quick-add" data-template="${i}" aria-label="Add ${esc(t.productName)}">+</button></div>`).join('')}</div></aside>`;}
// Trim blank catalogue margins only for the card. Original evidence stays intact.
document.addEventListener('load',event=>{
 const img=event.target;
 if(img.dataset?.cardPhoto!=='catalogue'||!img.naturalWidth)return;
 const canvas=document.createElement('canvas');
 const scale=Math.min(1,400/Math.max(img.naturalWidth,img.naturalHeight));
 const w=canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
 const h=canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
 const ctx=canvas.getContext('2d');
 if(!ctx)return;
 ctx.drawImage(img,0,0,w,h);
 const pixels=ctx.getImageData(0,0,w,h).data;
 let left=w,right=-1,top=h,bottom=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=4*(y*w+x);
  if(pixels[i+3]<20||Math.min(pixels[i],pixels[i+1],pixels[i+2])>=248)continue;
  left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
 }
 if(right-left<4||bottom-top<4)return;
 const pad=Math.ceil(Math.max(w,h)*0.025);
 left=Math.max(0,left-pad);top=Math.max(0,top-pad);
 right=Math.min(w-1,right+pad);bottom=Math.min(h-1,bottom+pad);
 if(right-left+1===w&&bottom-top+1===h)return;
 const cropped=ctx.getImageData(left,top,right-left+1,bottom-top+1);
 canvas.width=cropped.width;canvas.height=cropped.height;
 ctx.putImageData(cropped,0,0);canvas.setAttribute('aria-hidden','true');
 img.replaceWith(canvas);
},true);
function renderGrid() {
 const list=document.getElementById('appliance-list');if(!list)return;
 clearUrls('main');
 const filtered=appliances.filter(r=>[r.productName,r.brand,r.model,r.serial,r.retailer,r.category,...(r.files||[]).map(f=>f.ocrText||'')].join(' ').toLowerCase().includes(searchTerm.trim().toLowerCase()));
 if(!appliances.length){list.innerHTML=`<div class="empty-state compact-empty"><div class="empty-art">${ico('box')}</div><h3>No appliances yet</h3><p>Add an appliance to keep its receipt and warranty together.</p></div>`;return;}
 if(!filtered.length){list.innerHTML='<div class="no-results">No appliances match your search.</div>';return;}
 list.innerHTML=`<div class="appliance-grid">${filtered.map(r=>{
  const photo=preferredPicture(r),blob=mediaBlob(photo);
  const name=(r.productName||'').trim(), brand=(r.brand||'').trim(), model=(r.model||'').trim();
  const generic=/^(washing machine|washer|fridge|fridge freezer|dishwasher|dryer|heat[- ]pump tumble dryer|tumble dryer|oven|tv|television)$/i.test(name);
  const title=(generic&&brand?brand+' '+name:name)||brand||model||'Appliance';
  const subtitle=model&&!title.toLowerCase().includes(model.toLowerCase())?model:'';
  const exp=computedExpiry(r);
  const note=window.WarrantyFollowUps?.agenda([r],{today:today()})[0];
  const days=exp?(Date.parse(exp)-Date.parse(today()))/86400000:Infinity;
  const status=note?note.title:exp?((r.expiryDate?(days<0?'Ended':'Expires'):'Estimated end')+' · '+fdate(exp)):'Expiry unknown';
  const tone=note?'followup':days<0?'ended':days<=30?'soon':'normal';
  const image=blob?`<img loading="lazy" decoding="async" data-warranty-photo="true" data-card-photo="${photo.type==='reference'?'catalogue':'installed'}" alt="" data-warranty-file="${esc(photo.id)}" src="${previewUrl(blob,'main')}">`:cardIcon(name||r.category);
  return `<article class="appliance-card"><button class="appliance-open" data-action="view" data-id="${esc(r.id)}"><div class="card-image ${blob?'has-photo':'no-photo'}">${image}</div><div class="card-copy"><h3 class="card-title">${esc(title)}</h3>${subtitle?`<p class="we-card-model">${esc(subtitle)}</p>`:''}<p class="card-status" data-tone="${tone}">${esc(status)}</p></div></button></article>`;
 }).join('')}</div>`;
}
function renderSettings() {
  currentView='settings';setNavState();clearUrls('main');
  root.innerHTML=`<div class="settings-top"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Private, automatic and available offline</div><h1>Sync &amp; privacy.</h1><p>Your appliances, photos, receipts and notes stay on this device and automatically reconcile with your encrypted cloud copy.</p></div>${ico('lock','welcome-doodle')}</div>
  <div id="cloud-ui">${window.WarrantyCloud?.panel?.()||''}</div>
  <div class="settings-grid">
   <section class="settings-card"><div class="settings-icon">${ico('camera')}</div><h3>Available on this device</h3><p>Original pictures and documents are kept locally. The newest verified encrypted cloud copy is also saved on this device for automatic repair when needed.</p><p class="note-muted" id="storage-info">Checking device storage...</p><p class="we-storage-audit" id="we-storage-audit" role="status">Checking photos...</p></section>
   <section class="settings-card"><div class="settings-icon">${ico('key')}</div><h3>Website logins</h3><p>Website credentials remain encrypted separately from warranty documents.</p><button class="btn btn-line" data-action="logins">${ico('lock')} Manage website logins</button></section>
   <section class="settings-card"><div class="settings-icon">${ico('camera')}</div><h3>Photo text recognition</h3><p>Read model labels and receipts on this device. Your original image remains unaltered.</p><button class="btn btn-line btn-sm" data-action="ocr-offline-prepare">Prepare scanner for offline use</button><p class="note-muted" id="ocr-offline-status">The scanner works without internet once its assets are cached.</p></section>
   <section class="settings-card"><div class="settings-icon">${ico('shield')}</div><h3>How sync protects your records</h3><p>Changes are saved locally first and encrypted before they reach Cloudflare. Each device automatically checks for missing originals and reconciles records. Historical encrypted cloud copies are retained privately for recovery, without a backup manager or manual restore steps.</p><p class="note-muted">Sync runs while Warranty Ease is open and online. iOS may pause closed apps. Do not erase device storage while an issue is being repaired.</p></section>
   <section class="settings-card settings-full"><h3>Optional application diagnostics</h3><p class="note-muted">Shared App Monitor and Firebase activity counts exclude your warranty images, serial numbers and passwords.</p><label class="we-consent-control"><input type="checkbox" id="we-monitor-consent" ${window.WarrantyPlatform?.enabled?.()?'checked':''}> Enable anonymous app-operation diagnostics on this device</label></section>
  </div>`;
  updateStorageEstimate();
  const files=appliances.flatMap(r=>r.files||[]),audit=window.WarrantyMedia?.inspect?.(files);
  const note=document.getElementById('we-storage-audit');if(note&&audit)note.textContent=`${audit.originals} original files (${fmtSize(audit.bytes)}). ${audit.previews} display previews. ${audit.missing?audit.missing+' originals need automatic cloud repair.':'All recorded originals are present locally.'}`;
}
async function updateStorageEstimate() {
 const box=document.getElementById('storage-info');if(!box)return;
 if(!navigator.storage?.estimate){box.textContent='Storage estimate is not supported by this browser.';return;}
 try{const est=await navigator.storage.estimate();const persisted=await navigator.storage.persisted?.();box.textContent=`Using ${fmtSize(est.usage||0)} of approximately ${fmtSize(est.quota||0)}. ${persisted?'Persistent storage granted.':'Storage persistence not confirmed.'}`;}catch{box.textContent='Could not check storage use.';}
}
function formField(label,name,placeholder='',options={}) {
 const val=editor.draft[name]??'';
 const full=options.full?' full':'';const mobile=options.mobileFull?' mobile-full':'';
 const hint=options.hint?`<div class="field-hint">${esc(options.hint)}</div>`:'';
 let control;
 if(options.choices)control=`<select class="input" id="field-${name}" data-field="${name}"><option value="">Choose...</option>${options.choices.map(x=>`<option value="${esc(x)}" ${val===x?'selected':''}>${esc(x)}</option>`).join('')}</select>`;
 else if(options.textarea)control=`<textarea class="input textarea" id="field-${name}" data-field="${name}" placeholder="${esc(placeholder)}">${esc(val)}</textarea>`;
 else control=`<input class="input" id="field-${name}" data-field="${name}" type="${options.type||'text'}" ${options.type==='number'?'min="0" step="1"':''} placeholder="${esc(placeholder)}" value="${esc(val)}">`;
 return `<div class="field${full}${mobile}"><label for="field-${name}">${esc(label)}</label>${control}${hint}</div>`;
}
function uploadBox(type,title,desc,accept='image/*') {
 const camera=type==='reference'?'':`<label>${ico('camera')} Take photo<input hidden type="file" accept="image/*" capture="environment" data-file-type="${type}"></label>`;
 return `<div class="upload-box"><div><div style="color:#63719d">${ico(type==='receipt'||type==='warranty'?'file':'camera')}</div><div class="upload-title">${esc(title)}</div><p>${esc(desc)}</p></div><div class="upload-buttons">${camera}<label>${ico('upload')} Upload<input hidden type="file" accept="${accept}" data-file-type="${type}" multiple></label></div></div>`;
}

function officialPhotoContent(){
 const photo=window.WarrantyResources?.photoFor?.(editor?.draft);
 if(!photo)return '<p class="mini-help">Enter the exact brand and model to find a matching official manufacturer photograph.</p>';
 const already=editor.draft.files.some(f=>f.manufacturerPhotoId===photo.id);
 return `<div class="we-official-photo"><div><strong>Official product photo</strong><p>Model-matched picture from ${esc(photo.brand)} for identification, not proof of your installed appliance.</p></div><div class="we-official-actions"><button type="button" class="btn btn-line btn-sm" data-action="download-product-photo" ${already?'disabled':''}>${already?'Official picture saved':'Download manufacturer picture'}</button><a href="${esc(photo.sourcePage)}" target="_blank" rel="noopener noreferrer">View official product page</a></div><small>Saved separately from your installed photo. Requires your verified App Monitor passkey or Firebase cloud connection.</small></div>`;
}
function filesMarkup(types) {
 const files=editor.draft.files.filter(f=>types.includes(f.type));
 if(!files.length)return '';
 return `<div class="file-items">${files.map(f=>fileRow(f,true)).join('')}</div>`;
}
function fileRow(f,editable=false) {
 const isImage=f.mime?.startsWith('image/'),original=window.WarrantyMedia?.isBlob?.(f.blob);
 const preview=isImage?mediaBlob(f):null;
 const thumb=preview?`<img data-warranty-photo="true" data-warranty-file="${esc(f.id)}" src="${previewUrl(preview,'modal')}" alt="">`:ico(original?'file':'alert');
 return `<div class="file-row"><div class="file-thumb">${thumb}</div><div class="file-data"><strong title="${esc(f.name)}">${esc(f.name)}</strong><span>${esc(fileLabel(f.type))} &middot; ${original?fmtSize(f.blob.size):'Original unavailable'}${f.source==='manufacturer'?' &middot; Manufacturer reference':''}${f.ocrText?' &middot; Text scanned':''}</span>${!original?`<span class="we-photo-warning">Automatic cloud repair pending</span>`:''}</div><div class="file-actions"><button class="tiny-btn" data-action="file-view" data-file="${esc(f.id)}" aria-label="View file" ${original?'':'disabled'}>View</button>${editable&&original&&isImage?`<button class="tiny-btn scan-btn" data-action="file-scan" data-file="${esc(f.id)}">${f.ocrText?'Scan again':'Read text'}</button><button class="tiny-btn scan-btn" data-action="file-crop" data-file="${esc(f.id)}">Crop &amp; scan</button>`:''}${editable?`<button class="tiny-btn warn" data-action="file-remove" data-file="${esc(f.id)}" aria-label="Remove file">${ico('trash')}</button>`:''}</div></div>`;
}
function stepMarkup() {return `<div class="stepper">${['Appliance','Purchase','Warranty'].map((s,i)=>`<div class="step ${editor.step===i?'active':i<editor.step?'done':''}"><div class="step-num">${i<editor.step?ico('check'):i+1}</div><span>${s}</span></div>`).join('')}</div>`;}
function editorStepContent() {
 const step=editor.step;
 if(step===0)return `<div class="section-intro"><h3>What are we protecting?</h3><p>A photo of the label can help fill in the exact model and serial number.</p></div><div class="form-grid">
 ${formField('What should we call it?','productName','e.g. Washing machine')}
 ${formField('Category','category','',{choices:['Laundry','Kitchen','TV & entertainment','Heating','Computing','Cleaning','Other']})}
 ${formField('Brand','brand','e.g. LG')}
 ${formField('Model number','model','e.g. F4Y511WWLA1')}
 ${formField('Serial number','serial','Exactly as printed',{full:true,hint:'The serial is specific to your individual appliance. It is different from the model.'})}
  ${formField('Product code (optional)','productCode','e.g. RH98Y15PBNP.AGWAPUK',{full:true,hint:'Different from the model or serial; often shown on the manufacturer label.'})}</div>
 <div class="form-divider"></div><div class="upload-grid">${uploadBox('device','Installed appliance photo','Keep a photo of your actual installed appliance.')}${uploadBox('reference','Optional catalogue photo','Save a manufacturer product picture to your iPad and attach it here. This does not replace the real installed photo.')}${uploadBox('label','Model / serial label','Photograph the label. Text is read on this device; confirm any suggested model or serial number.')}</div>${filesMarkup(['device','reference','label'])}<div id="we-official-photo-action">${officialPhotoContent()}</div>${formField('Card picture preference','displayPhoto','',{choices:['installed','reference'],full:true,hint:'Installed photo is kept separately from a manufacturer product picture.'})}${ocrNote()}`;
 if(step===1)return `<div class="section-intro"><h3>Where and when did you buy it?</h3><p>Keep proof of purchase here so it is easy to find later.</p></div><div class="upload-grid" style="grid-template-columns:1fr">${uploadBox('receipt','Receipt or order confirmation','Receipt photos are read automatically; saved emails (.eml/.txt) can also suggest purchase details. PDFs are stored as evidence.','image/*,.pdf,.eml,.txt')}</div>${filesMarkup(['receipt'])}${ocrNote()}
 <div class="form-divider"></div><div class="form-grid">
 ${formField('Purchased from','retailer','e.g. AO, Marks Electrical')}
 ${formField('Purchase date','purchaseDate','',{type:'date'})}
 ${formField('Order / invoice number','orderNumber','e.g. AO123456')}
 ${formField('Price paid (optional)','price','e.g. 464.00')}</div><div class="tip-box">${ico('info')} The purchase date and receipt are often needed to start a warranty claim. Double-check any details read from a photo.</div>`;
 return `<div class="section-intro"><h3>How is it covered?</h3><p>Add whatever you know now. You can update it later.</p></div><div class="form-grid">
 ${formField('Warranty provider','warrantyProvider','e.g. LG / retailer / insurer')}
 ${formField('Warranty start date','warrantyStart','',{type:'date',hint:'Usually purchase or delivery date; check the terms.'})}
 ${formField('Duration in months','durationMonths','e.g. 60',{type:'number'})}
 ${formField('Expiry date (optional)','expiryDate','',{type:'date',hint:'Use the exact date specified by your warranty.'})}</div>
 ${calculatedHint()}
 <div class="subsection"><h4>Warranty website login</h4><p class="mini-help">Link a saved website account. For example, use the same LG login for your washer and dryer. Passwords stay encrypted and are never added to warranty claims.</p><div class="form-grid"><div class="field full"><label for="website-account-id">Saved website account</label><select class="input" data-field="websiteAccountId" id="website-account-id"><option value="">None linked</option>${websiteAccounts.map(a=>`<option value="${esc(a.id)}" ${editor.draft.websiteAccountId===a.id?'selected':''}>${esc(a.brand||'Warranty website')}</option>`).join('')}</select><div class="field-hint">Add or manage logins under Website logins from the home screen.</div></div></div></div>
 <div class="subsection"><h4>Warranty registration</h4><div class="form-grid">
 ${formField('Date registered','registrationDate','',{type:'date'})}
 ${formField('Registered how?','registrationMethod','',{choices:['Online form','Email','Phone','Retailer registered it','Post','Not required','Other']})}
 ${formField('Confirmation / policy reference','registrationReference','e.g. registration ID',{full:true})}</div></div>
 <div class="subsection"><h4>Manufacturer warranty contact</h4><div class="form-grid">
 ${formField('Support email','supportEmail','e.g. support@brand.com',{type:'email'})}
 ${formField('Phone','supportPhone','e.g. 0344...',{type:'tel'})}
 ${formField('Website / claim form','supportUrl','e.g. https://...',{full:true})}</div></div>
 <div class="subsection"><h4>Seller contact (optional)</h4><div class="form-grid">
 ${formField('Seller email','sellerEmail','e.g. customer.services@...',{type:'email'})}
 ${formField('Seller phone','sellerPhone','',{type:'tel'})}
 ${formField('Seller support page','sellerUrl','',{full:true})}</div></div>
  <div class="subsection"><h4>Keep official reference links</h4><p class="mini-help">Links help locate future updates and manufacturer files. Download PDFs separately and attach them below to preserve a dated copy for disputes.</p><div class="form-grid">${formField('Product and product pictures','productUrl','https://...', {full:true})}${formField('User manual / documentation','manualUrl','https://...', {full:true})}${formField('Warranty terms URL','warrantyTermsUrl','https://...', {full:true})}${formField('Software / product updates','softwareUpdatesUrl','https://...', {full:true})}</div></div>
  ${formField('Coverage and notes','warrantyNotes','What is included, any registration conditions, exclusions or useful contact notes.',{textarea:true,full:true})}
 <div class="form-divider"></div><div class="upload-grid" style="grid-template-columns:1fr">${uploadBox('warranty','Warranty certificate / registration proof','Attach the terms, certificate or confirmation email, if available. New images are scanned for useful label details.','image/*,.pdf,.eml,.txt')}</div>${filesMarkup(['warranty'])}${ocrNote()}
 <div class="tip-box">${ico('shield')} This app organises your evidence but does not verify a manufacturer's warranty terms or replace your statutory consumer rights.</div>`;
}
function calculatedHint() {const d=editor.draft;const computed=addMonthsMinusDay(d.warrantyStart||d.purchaseDate,d.durationMonths);return computed?`<div class="calculated" id="expiry-hint">Estimated end date from your entries: <strong>${fdate(computed)}</strong>. Check against the warranty document.</div>`:`<div class="calculated" id="expiry-hint" style="display:none"></div>`;}
function ocrNote() {
  const names={model:'Model number',serial:'Serial number',brand:'Brand',productCode:'Product code',retailer:'Seller',purchaseDate:'Purchase date',orderNumber:'Order number',price:'Price paid'};
  const candidates=Object.entries(editor?.suggestions||{}).filter(([key,value])=>Object.hasOwn(names,key)&&value && value!==editor?.draft[key]);
  const scanned=(editor?.draft.files||[]).filter(f=>f.ocrText&&((editor?.step===0&&['device','label'].includes(f.type))||(editor?.step===1&&f.type==='receipt')||(editor?.step===2&&['warranty','other'].includes(f.type))));
  const note=ocrMessage||'Add any appliance or receipt photo. The scanner will suggest relevant information, and you can correct it before adding it to the record.';
  return `<div class="ocr-message" id="ocr-message" aria-live="polite"><strong>${ocrWorking?'Reading photo on this device...':'Photo details (on device)'}</strong><span id="ocr-text">${esc(note)}</span>${candidates.length?`<div class="we-ocr-fields">${candidates.map(([key,val])=>`<label><span>${esc(names[key])}</span><input class="input" type="text" data-ocr-edit="${esc(key)}" value="${esc(val)}" maxlength="120" autocomplete="off"></label>`).join('')}</div><p class="ocr-note-small">Check each suggestion against the original image. You can correct it here before applying.</p><button class="btn btn-sm btn-dark" data-action="ocr-apply">Apply reviewed details</button>`:''}${scanned.length?`<details class="ocr-transcript"><summary>View scan evidence (${scanned.length} image${scanned.length===1?'':'s'})</summary>${scanned.map(f=>`<div><b>${esc(f.name)}</b>${(f.ocrKeyLines||[]).length?`<p class="we-ocr-relevant">${(f.ocrKeyLines||[]).map(esc).join(' • ')}</p>`:''}<details><summary>Raw OCR text (can include errors)</summary><pre>${esc(f.ocrText.slice(0,7000))}</pre></details></div>`).join('')}</details>`:''}<p class="ocr-note-small">A crop of just the printed label is often much clearer than a full photograph. The original image is preserved.</p></div>`;
}
function renderEditor(resetScroll=false) {
 if(!editor)return;
 modalKind='editor';clearUrls('modal');
 const prior=modalRoot.querySelector('.modal-content')?.scrollTop||0;
 const isNew=!getRecord(editor.draft.id);
 modalRoot.innerHTML=`<div class="modal-overlay"><section class="modal" role="dialog" aria-modal="true" aria-label="${isNew?'Add appliance':'Edit appliance'}">
 <div class="modal-header"><div><span class="modal-label">${isNew?'New appliance':'Edit record'} &middot; Step ${editor.step+1} of 3</span><h2>${isNew?'Add an appliance':'Update appliance details'}</h2><p>You can save and come back at any time.</p></div><button class="close-btn" data-action="close" aria-label="Close">${ico('close')}</button></div>
 <div class="modal-content">${stepMarkup()}${editorStepContent()}</div>
 <div class="modal-footer"><div class="footer-left">${editor.step>0?`<button class="btn btn-ghost" data-action="previous">&larr; Back</button>`:`<button class="btn btn-ghost" data-action="close">Cancel</button>`}</div><div class="footer-right"><button class="btn btn-line" data-action="save">Save ${editor.step===2?'':'draft'}</button>${editor.step<2?`<button class="btn btn-dark" data-action="next">Continue ${ico('arrow')}</button>`:''}</div></div></section></div>`;
 modalRoot.querySelector('.modal-content').scrollTop=resetScroll?0:prior;
 document.body.style.overflow='hidden';
}
function startNew(initial={}) {editor={draft:newRecord(initial),step:0,dirty:false,suggestions:{}};detailId=null;claim=null;ocrMessage='';renderEditor(true);}
function startEdit(id) {const r=getRecord(id);if(!r)return;const suggestions={};for(const f of (r.files||[])){for(const [key,value] of Object.entries(f.ocrSuggestions||{}))if(value&&!r[key])suggestions[key]=value;}editor={draft:{...r,files:[...(r.files||[])]},step:0,dirty:false,suggestions};detailId=null;claim=null;ocrMessage=Object.keys(suggestions).length?'Saved photo results are ready to review. Confirm them against the original image.':'';renderEditor(true);}
function syncDraftField(el) {
 if(!editor)return;
 const field=el.dataset.field;if(!field)return;
 editor.draft[field]=el.value;editor.dirty=true;
 if(field==='brand'||field==='model'){const panel=document.getElementById('we-official-photo-action');if(panel)panel.innerHTML=officialPhotoContent();}
 if(['purchaseDate','warrantyStart','durationMonths'].includes(field)){
  const hint=document.getElementById('expiry-hint');
  if(hint){const expiry=addMonthsMinusDay(editor.draft.warrantyStart||editor.draft.purchaseDate,editor.draft.durationMonths);hint.style.display=expiry?'':'none';hint.innerHTML=expiry?`Estimated end date from your entries: <strong>${fdate(expiry)}</strong>. Check against the warranty document.`:'';}
 }
}

function appendReferenceFile(recordId,file,starter){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(DB_STORE,'readwrite'),store=tx.objectStore(DB_STORE),req=store.get(recordId);
  req.onsuccess=()=>{
   const latest=req.result||{...starter,files:[...(starter.files||[])]};
   latest.files||=[];
   if(!latest.files.some(f=>f.id===file.id))latest.files.push(file);
   latest.updatedAt=new Date().toISOString();store.put(latest);
  };
  tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);
  tx.onabort=()=>reject(tx.error||Error('Could not retain the manufacturer picture.'));
 });
}
async function saveEditor() {
 if(!editor)return;
 if(!editor.draft.productName && !editor.draft.model && !editor.draft.brand){toast('Add a name, brand or model first.');editor.step=0;renderEditor(true);return;}
 try {
  // Preserve manually entered date. Computed date is shown in the UI and used in claim views.
  await putRecord(editor.draft);
  const id=editor.draft.id;editor=null;closeModal(true);renderHome();toast('Saved locally. Sync runs automatically.');
  showDetail(id);
 }catch(err){console.error(err);toast('Unable to save. Check browser storage space and try again.');}
}
function closeModal(force=false) {
 if(!force && editor?.dirty && !window.confirm('Discard changes that have not been saved?'))return;
 editor=null;detailId=null;claim=null;followUpEditor=null;accountEditor=null;pendingExportZip=null;pendingImportEntries=null;modalKind=null;clearUrls('modal');modalRoot.innerHTML='';document.body.style.overflow='';
}

function infoCell(label,value,copyable=false) {
 return `<div class="detail-field"><label>${esc(label)}</label><div class="value"><span class="${value?'':'empty-val'}">${esc(value||'Not added')}</span>${copyable&&value?`<button class="copy-mini" data-action="copy" data-value="${esc(value)}" aria-label="Copy ${esc(label)}">${ico('copy')}</button>`:''}</div></div>`;
}
function detailLinks(record,prefix) {
 const email=record[prefix==='support'?'supportEmail':'sellerEmail'];
 const phone=record[prefix==='support'?'supportPhone':'sellerPhone'];
 const website=safeHttp(record[prefix==='support'?'supportUrl':'sellerUrl']);
 if(!email&&!phone&&!website)return `<p class="note-muted">No contact details saved yet. You can add them in Edit.</p>`;
 return `<div class="link-row">${safeEmail(email)?`<a class="link-chip" href="mailto:${encodeURIComponent(email)}">${ico('mail')} ${esc(email)}</a>`:''}${phone?`<a class="link-chip" href="tel:${esc(phone.replace(/[^\d+]/g,''))}">${ico('phone')} ${esc(phone)}</a>`:''}${website?`<a class="link-chip" href="${esc(website)}" target="_blank" rel="noopener noreferrer">${ico('external')} Support website</a>`:''}</div>`;
}
function resourceLinksSection(record){
 const builtIn=window.WarrantyResources?.officialLinks?.(record)||[];
 const userLinks=[['product','Product page / pictures',record.productUrl],['manual','Manual / documentation',record.manualUrl],['warranty','Saved warranty policy URL',record.warrantyTermsUrl],['updates','Software and product updates',record.softwareUpdatesUrl]].filter(([, ,url])=>url).map(([kind,title,url])=>({kind,title,url,source:'saved by you'}));
 const unique=new Map();for(const link of [...userLinks,...builtIn]){const url=window.WarrantyResources?.allowedUrl?.(link.url)||safeHttp(link.url);if(url&&!unique.has(url))unique.set(url,{...link,url});}
 if(!unique.size)return '<p class="note-muted">No manufacturer links available for this model. Add product, terms or manual links in Edit.</p>';
 return `<div class="we-resource-links">${[...unique.values()].map(link=>`<a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer" class="we-resource-link">${ico('external')} <span><strong>${esc(link.title)}</strong><small>${link.source==='manufacturer'?'Manufacturer webpage — check current version':'Link saved by you'}</small></span></a>`).join('')}</div><p class="note-muted">External pages may change. Download the original PDF and attach it to this appliance for a durable claim record; opening a link does not preserve a copy.</p>`;
}
function showDetail(id) {
 const r=getRecord(id);if(!r)return;
 editor=null;claim=null;detailId=id;modalKind='detail';clearUrls('modal');
 const pic=preferredPicture(r),photo=mediaBlob(pic);
  const img=photo?`<img data-warranty-photo="true" data-warranty-file="${esc(pic.id)}" src="${previewUrl(photo,'modal')}" alt="${esc(r.productName)}">`:cardIcon(r.category);
 modalRoot.innerHTML=`<div class="modal-overlay"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Appliance details">
 <div class="modal-header"><div><span class="modal-label">${esc(r.category||'Home appliance')}</span><h2>${esc(r.productName||r.brand||r.model||'Appliance')}</h2><p>${esc([r.brand,r.model].filter(Boolean).join(' / ')||'Complete your details whenever you can')}</p></div><button class="close-btn" data-action="close" aria-label="Close">${ico('close')}</button></div>
 <div class="modal-content"><div class="details-cover">${img}<span class="status-bubble ${isExpired(r)?'expired':isReady(r)?'ready':''}">${isExpired(r)?'Warranty ended':isReady(r)?'Claim-ready':'Needs details'}</span></div>
 ${missingBits(r).length?`<div class="claim-intro"><strong>To make a future claim easier:</strong> Add ${esc(missingBits(r).join(', '))}.</div>`:''}
 <div class="detail-block"><h3>Device identification</h3><div class="detail-grid">${infoCell('Brand',r.brand)}${infoCell('Model number',r.model,true)}${infoCell('Serial number',r.serial,true)}${infoCell('Product code',r.productCode,true)}${infoCell('Category',r.category)}</div></div>
 <div class="detail-block"><h3>Purchase</h3><div class="detail-grid">${infoCell('Seller',r.retailer)}${infoCell('Purchase date',r.purchaseDate?fdate(r.purchaseDate):'')}${infoCell('Order / invoice',r.orderNumber,true)}${infoCell('Price',r.price?`GBP ${r.price}`:'')}</div></div>
 <div class="detail-block"><h3>Warranty & registration</h3><div class="detail-grid">${infoCell('Warranty provider',r.warrantyProvider||r.brand)}${infoCell('Cover end date',computedExpiry(r)?fdate(computedExpiry(r)):'')}${infoCell('Date registered',r.registrationDate?fdate(r.registrationDate):'')}${infoCell('Registered by',r.registrationMethod)}${infoCell('Registration reference',r.registrationReference,true)}${infoCell('Warranty start',r.warrantyStart?fdate(r.warrantyStart):'')}${infoCell('Warranty period entered',window.WarrantyMedia?.chooseWarrantyLabel?.(r.durationMonths)||'')}</div></div>
 ${r.warrantyNotes?`<div class="detail-block"><h3>Coverage notes</h3><p class="detail-notes">${esc(r.warrantyNotes)}</p></div>`:''}
 ${window.WarrantyFollowUpsUI?.detail?.(r,{today:today(),esc,ico,fdate})||''}
 ${r.websiteAccountId?`<div class="detail-block"><h3>Registration website login</h3><button class="link-chip" data-action="open-linked-account" data-id="${esc(r.websiteAccountId)}">${ico('key')} ${esc(websiteAccounts.find(a=>a.id===r.websiteAccountId)?.brand||'Website account')} &middot; Open protected login</button></div>`:''}
  <div class="detail-block"><h3>Manufacturer manuals, warranties &amp; updates</h3>${resourceLinksSection(r)}</div>
  <div class="detail-block"><h3>Manufacturer support</h3>${detailLinks(r,'support')}</div>
 <div class="detail-block"><h3>Seller support</h3>${detailLinks(r,'seller')}</div>
 <div class="detail-block"><h3>Original photos and evidence (${(r.files||[]).length})</h3>${(r.files||[]).length?`<div class="detail-files">${r.files.map(f=>fileRow(f)).join('')}</div>`:`<p class="note-muted">No receipt or photos uploaded yet.</p>`}</div>
 <button class="btn btn-ghost btn-sm" data-action="delete-record" data-id="${esc(r.id)}">${ico('trash')} Delete record</button>
 </div><div class="modal-footer"><div class="footer-left"><button class="btn btn-line" data-action="edit" data-id="${esc(r.id)}">${ico('edit')} Edit details</button></div><div class="footer-right"><button class="btn btn-dark" data-action="claim" data-id="${esc(r.id)}">${ico('mail')} Prepare claim</button></div></div>
 </section></div>`;
 document.body.style.overflow='hidden';
}

const CLAIM_FIELDS=[
 ['productName','Appliance','productName'],
 ['brand','Brand','brand'],
 ['model','Model number','model'],
 ['serial','Serial number','serial'],
 ['purchaseDate','Purchase date','purchaseDate'],
 ['retailer','Retailer','retailer'],
 ['orderNumber','Order / invoice number','orderNumber'],
 ['registrationDate','Registration date','registrationDate'],
 ['registrationMethod','Registration method','registrationMethod'],
 ['registrationReference','Registration reference','registrationReference'],
 ['expiryDate','Warranty expiry','expiryDate']
];
function startClaim(id) {
 const r=getRecord(id);if(!r)return;
 detailId=null;editor=null;modalKind='claim';
 claim={id,target:safeEmail(r.supportEmail)?'manufacturer':safeEmail(r.sellerEmail)?'seller':'manufacturer',fields:Object.fromEntries(CLAIM_FIELDS.map(([key,,prop])=>[key,!!(key==='expiryDate'?computedExpiry(r):r[prop])])),fileIds:new Set((r.files||[]).map(f=>f.id)),problem:''};
 renderClaim(true);
}
function selectedClaimRows(r) {
 return CLAIM_FIELDS.filter(([key])=>claim.fields[key]).map(([key,label,prop])=>[label,key==='expiryDate'?fdate(computedExpiry(r)):['purchaseDate','registrationDate'].includes(key)?fdate(r[prop]):r[prop]]);
}
function claimBody() {
 const r=getRecord(claim?.id);if(!r)return '';
 const target=claim.target==='seller'?'customer support team':'warranty support team';
 const rows=selectedClaimRows(r);
 return [`Hello ${target},`,'',`I would like assistance with a ${r.brand||''} ${r.productName||'appliance'} under its warranty / my consumer rights.`.replace(/\s+/g,' ').trim(),'',`Issue: ${claim.problem.trim()||'[Please describe the problem here]'}`,'','Appliance and purchase details:',...rows.map(([label,val])=>`${label}: ${val}`),'',`Supporting files available: ${(r.files||[]).filter(f=>claim.fileIds.has(f.id)).map(f=>f.name).join(', ')||'None selected'}`,'','Please let me know the next steps and any additional information required.','','Kind regards,'].join('\n');
}
function claimRecipient() {const r=getRecord(claim.id);return claim.target==='seller'?r.sellerEmail:r.supportEmail;}
function claimSubject() {const r=getRecord(claim.id);return `Warranty assistance - ${[r.brand,r.model||r.productName].filter(Boolean).join(' ')}`;}
function renderClaim(resetScroll=false) {
 if(!claim)return;const r=getRecord(claim.id);if(!r)return;
 clearUrls('modal');const prior=modalRoot.querySelector('.modal-content')?.scrollTop||0;
 const files=r.files||[];
 modalRoot.innerHTML=`<div class="modal-overlay"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Prepare a warranty claim">
 <div class="modal-header"><div><span class="modal-label">Support, without the scramble</span><h2>Prepare your warranty claim</h2><p>${esc([r.brand,r.model||r.productName].filter(Boolean).join(' / '))}</p></div><button class="close-btn" data-action="close" aria-label="Close">${ico('close')}</button></div>
 <div class="modal-content">
 <div class="claim-intro">Select the details and evidence to share. Nothing will be sent unless you choose to open an email or share the files yourself.</div>
 <div class="contact-label">Who do you want to contact?</div><div class="pill-tabs"><button class="pill-tab ${claim.target==='manufacturer'?'active':''}" data-action="claim-target" data-target="manufacturer">Manufacturer</button><button class="pill-tab ${claim.target==='seller'?'active':''}" data-action="claim-target" data-target="seller">Seller</button></div>
 <div class="form-grid" style="margin-bottom:19px">${`<div class="field full"><label>To (editable in your email app)</label><input class="input" id="claim-to" value="${esc(claimRecipient()||'')}" placeholder="Add support email or choose it in your email app"></div>`}</div>
 <div class="field full" style="margin-bottom:17px"><label>What's gone wrong?</label><textarea class="input textarea" id="claim-problem" placeholder="A few lines about the issue and when it started...">${esc(claim.problem)}</textarea></div>
 <div class="claim-selection"><h4>Select information to include</h4>${CLAIM_FIELDS.map(([key,label,prop])=>{
 const value=key==='expiryDate'?computedExpiry(r):r[prop];return `<label class="check-row"><input type="checkbox" data-claim-field="${key}" ${claim.fields[key]?'checked':''} ${!value?'disabled':''}><strong>${esc(label)}</strong><span class="check-extra">${esc(value?(['purchaseDate','registrationDate','expiryDate'].includes(key)?fdate(value):String(value).slice(0,34)):'Not saved')}</span></label>`;
 }).join('')}</div>
 <div class="claim-selection"><h4>Evidence files to include</h4>${files.length?files.map(f=>`<label class="check-row"><input type="checkbox" data-claim-file="${esc(f.id)}" ${claim.fileIds.has(f.id)?'checked':''}><strong>${esc(f.name)}</strong><span class="check-extra">${esc(fileLabel(f.type))}</span></label>`).join(''):`<div class="check-row">No files saved. Edit this appliance to add a receipt or photos.</div>`}</div>
 <div class="detail-block"><h3>Message preview</h3><div class="email-preview" id="email-preview">${esc(claimBody())}</div></div>
 <p class="mini-help">Email draft pre-fills the message and address, but browsers cannot attach files through a normal email link. Use <strong>Share evidence</strong> on a compatible device, or download an evidence ZIP and attach it manually.</p>
 </div><div class="modal-footer" style="align-items:flex-start;flex-direction:column"><div class="claim-footer-actions"><button class="btn btn-dark" data-action="claim-email">${ico('mail')} Open email draft</button><button class="btn btn-line" data-action="claim-share">${ico('share')} Share evidence</button></div><div class="claim-footer-actions"><button class="btn btn-ghost btn-sm" data-action="claim-copy">${ico('copy')} Copy details</button><button class="btn btn-ghost btn-sm" data-action="claim-download">${ico('download')} Download evidence ZIP</button><button class="btn btn-ghost btn-sm" data-action="claim-back">&larr; Appliance</button></div></div>
 </section></div>`;
 modalRoot.querySelector('.modal-content').scrollTop=resetScroll?0:prior;
 document.body.style.overflow='hidden';
}
function updateClaimPreview() {const p=document.getElementById('email-preview');if(p)p.textContent=claimBody();}
function selectedFiles() {const r=getRecord(claim.id);return (r.files||[]).filter(f=>claim.fileIds.has(f.id));}
async function emailClaim() {
 const to=document.getElementById('claim-to')?.value.trim()||'';
 const email=safeEmail(to);
 if(to&&!email){toast('Enter a valid email address or leave it empty.');return;}
 const subject=claimSubject(),body=claimBody();
 window.location.href=`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
 if(selectedFiles().length)toast('Email draft opened. Attach saved evidence using Share or ZIP.');
}
async function shareClaim() {
 const files=selectedFiles().map(f=>new File([f.blob],f.name,{type:f.mime||'application/octet-stream'}));
 const payload={title:claimSubject(),text:claimBody(),...(files.length?{files}:{})};
 if(!navigator.share){toast('Sharing is unavailable here. Download the evidence ZIP instead.');return;}
 try {
  if(files.length&&navigator.canShare&&!navigator.canShare({files})){
   toast('This device cannot share those attachments. Try Download evidence ZIP.');return;
  }
  await navigator.share(payload);
 }catch(err){if(err?.name!=='AbortError')toast('Could not open sharing. Try Download evidence ZIP.');}
}
async function copyText(value) {
 try {if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);toast('Copied to clipboard.');return;}}
 catch{}
 const area=document.createElement('textarea');area.value=value;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const worked=document.execCommand('copy');area.remove();toast(worked?'Copied to clipboard.':'Select and copy the details manually.');
}

async function handlePickedFiles(input) {
 const owner=editor;
 if(!owner)return;
 const recordId=owner.draft.id;
 const type=input.dataset.fileType;const files=Array.from(input.files||[]);input.value='';
 if(!files.length)return;
 const loaded=[];
 for(const file of files){
  if(file.size>60*1024*1024){toast(`${file.name} exceeds the 60 MB safety limit. Keep the original externally and import a smaller still-legible copy.`);continue;}
  const attach={id:uid(),name:file.name||`${type}-${Date.now()}.jpg`,type,mime:file.type||'application/octet-stream',size:file.size,blob:file,ocrText:'',addedAt:new Date().toISOString()};
  owner.draft.files.push(attach);loaded.push(attach);
 }
 if(!loaded.length)return;
 owner.draft.updatedAt=new Date().toISOString();
  await dbAction('readwrite',store=>store.put(owner.draft));
  await refresh();window.WarrantyCloud?.scheduleUpload?.();
  if(editor===owner){owner.dirty=true;renderEditor(false);toast(`${loaded.length} original file${loaded.length===1?'':'s'} saved on this device. Review extracted details, then save the appliance.`);}
  void prepareDisplayImages(recordId,loaded); // Derived previews never replace original evidence.
 if(type==='receipt'){
  for(const f of loaded.filter(f=>/\.(eml|txt)$/i.test(f.name)||/^(text\/plain|message\/rfc822)/i.test(f.mime))){
   try{
    const text=(await f.blob.text()).slice(0,20000);
    const hits=window.WarrantyOCRExtract?.parseReceipt?.(text)||parseReceipt(text);
    const analysis={ocrText:text,ocrSuggestions:hits,ocrAt:new Date().toISOString()};
    Object.assign(f,analysis);
    await patchStoredFile(recordId,f.id,analysis);
    await refresh();
    if(editor?.draft.id===recordId){
     const target=editor.draft.files.find(item=>item.id===f.id);
     if(!target)continue;
     Object.assign(target,analysis);
     const found=Object.entries(hits).filter(([key,value])=>value&&!editor.draft[key]);
     for(const [key,value] of found)editor.suggestions[key]=value;
     if(found.length){ocrMessage='Check the purchase details from your receipt, then tap Apply reviewed details.';renderEditor(false);}
    }
   }catch(error){console.warn('Text attachment could not be parsed',error);}
  }
 }
 if(loaded.some(f=>f.mime.startsWith('image/'))){
  const images=loaded.filter(f=>f.mime.startsWith('image/'));
  if(images.length){for(const f of images)enqueueOcr(recordId,f.id);if(editor===owner)updateOcr('Photo saved. Scanning text privately on this device...');runOcrQueue().catch(error=>console.warn('Photo scanning stopped',error));}
 }
}
function updateOcr(text) {
 ocrMessage=text;
 const box=document.getElementById('ocr-message');
 if(box){const strong=box.querySelector('strong');if(strong)strong.textContent=ocrWorking?'Reading photo on this device...':'On-device photo scanner';const msg=box.querySelector('#ocr-text');if(msg)msg.textContent=text;}
}
function enqueueOcr(editorId,fileId,croppedBlob=null){
 if(!ocrQueue.some(w=>w.editorId===editorId&&w.fileId===fileId))ocrQueue.push({editorId,fileId,croppedBlob});
}
async function runOcrQueue() {
 if(ocrWorking)return;
 ocrWorking=true;
 try{
  while(ocrQueue.length){
   const work=ocrQueue.shift();
   const live=editor?.draft.id===work.editorId?editor.draft:null;
   const saved=live?null:await dbAction('readonly',store=>store.get(work.editorId));
   const record=live||saved;
   const file=record?.files?.find(f=>f.id===work.fileId);
   if(!file)continue;
   updateOcr(`Preparing to read ${fileLabel(file.type).toLowerCase()}...`);
   try {
    if(!window.WarrantyOCR?.recognize)throw Error('The local image scanner is unavailable. Reload the app and try again.');
    const result=await window.WarrantyOCR.recognize(work.croppedBlob||file.blob,info=>{
     if(info.stage==='recognizing text'&&typeof info.progress==='number')updateOcr(`Reading ${fileLabel(file.type).toLowerCase()}... ${Math.round(info.progress*100)}%`);
     else if(info.stage)updateOcr(`Preparing offline scanner: ${String(info.stage).replace(/[^a-z0-9 -]/gi,'').slice(0,40)}...`);
    });
    const text=String(result?.data?.text||'').slice(0,20000);
    const summary=window.WarrantyOCRExtract?.extract?.(text,file.type);
    const hits=summary?.suggestions||(file.type==='receipt'?parseReceipt(text):parseLabel(text));
    file.ocrText=text;file.ocrSuggestions=hits;file.ocrKeyLines=summary?.keyLines||[];file.ocrAt=new Date().toISOString();
    const count=Object.entries(hits).filter(([,value])=>!!value).length;
    const freshEditor=editor?.draft.id===work.editorId?editor:null;
    if(freshEditor){
      const target=freshEditor.draft.files.find(f=>f.id===work.fileId);
      if(target&&target!==file){target.ocrText=text;target.ocrSuggestions=hits;target.ocrKeyLines=file.ocrKeyLines;target.ocrAt=file.ocrAt;}
      for(const [key,value] of Object.entries(hits))if(value&&value!==freshEditor.draft[key])freshEditor.suggestions[key]=value;
      freshEditor.dirty=true;
      // Persist OCR analysis and the unmodified photo immediately, even if the editor closes.
      freshEditor.draft.updatedAt=new Date().toISOString();
      await patchStoredFile(work.editorId,work.fileId,{ocrText:text,ocrSuggestions:hits,ocrKeyLines:file.ocrKeyLines,ocrAt:file.ocrAt});
      await refresh();window.WarrantyCloud?.scheduleUpload?.();
    } else {
      // Record may have been saved and editor closed while scanning. Keep its OCR text
      // and suggestions in the original stored file; NEVER auto-fill product fields.
      await patchStoredFile(work.editorId,work.fileId,{ocrText:text,ocrSuggestions:hits,ocrKeyLines:file.ocrKeyLines,ocrAt:file.ocrAt});
      await refresh();window.WarrantyCloud?.scheduleUpload?.();
    }
    const message=count?`Found ${count} possible detail${count===1?'':'s'}. Check the original image and tap Apply reviewed details.`:'Scan finished. No clear details detected. Try a sharper, closer photo or enter the details manually.';
    ocrMessage=message;
    if(freshEditor&&modalKind==='editor')renderEditor(false);
    else if(!freshEditor)toast('Photo scan complete. Reopen the appliance to review suggestions.');
    updateOcr(message);
   }catch(error){
    console.warn('Local image scan failed',error);
    updateOcr(`Could not read this image automatically: ${String(error?.message||'Try Scan again.').slice(0,100)}. The photo is still saved.`);
    if(editor?.draft.id===work.editorId&&modalKind==='editor')renderEditor(false);
   }
  }
 }finally{
  ocrWorking=false;
  const box=document.getElementById('ocr-message');if(box){const strong=box.querySelector('strong');if(strong)strong.textContent='On-device photo scanner';}
 }
}
function parseLabel(text) {
 const lines=text.toUpperCase().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const out={};
 const findValue=(pattern)=>{
  for(let i=0;i<lines.length;i++){
   const m=lines[i].match(pattern);
   if(m){const raw=(m[1]||lines[i+1]||'').trim().replace(/^[#:.-]+/,'').trim();
    const token=raw.match(/^[A-Z0-9][A-Z0-9._\/-]{3,34}/)?.[0];
    if(token && !/^(NUMBER|NO|MODEL|SERIAL|TYPE|NAME|NBR)$/.test(token))return token;
   }
  }return '';
 };
 out.serial=findValue(/(?:SERIAL\s*(?:NO\.?|NUMBER|NBR)?|S\s*[/\\]\s*N|S\.N\.|SERNR)\s*[:=#-]?\s*([A-Z0-9._\/-]{5,35})?/i);
 out.model=findValue(/(?:MODEL\s*(?:NO\.?|NUMBER|NBR)?|MOD\.?\s*(?:NO\.)?|M\s*[/\\]\s*N)\s*[:=#-]?\s*([A-Z0-9._\/-]{4,35})?/i);
 const brand=text.match(/\b(LG|TCL|BOSCH|SIEMENS|SAMSUNG|MIELE|BEKO|WHIRLPOOL|HOTPOINT|AEG|ELECTROLUX|SONY|PANASONIC|HISENSE|HOOVER|INDESIT|DYSON|HISENSE|HAIER)\b/i)?.[1];
 if(brand)out.brand=brand.toUpperCase();
 return out;
}
function dateFromReceipt(input) {
 const short=input.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/);
 if(short){const d=+short[1],m=+short[2],y=+short[3]+(+short[3]<100?2000:0);if(y>=2000&&y<=2100&&m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate())return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
 const named=input.match(/\b(\d{1,2})\s+(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+(20\d{2})\b/i);
 if(named){const idx=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(named[2].toUpperCase().slice(0,3));if(idx>=0)return `${named[3]}-${String(idx+1).padStart(2,'0')}-${String(+named[1]).padStart(2,'0')}`;}
 const iso=input.match(/\b(20\d{2})-(0[1-9]|1[012])-([012]\d|3[01])\b/);if(iso)return iso[0];
 return '';
}
function parseReceipt(text) {
 const lines=text.split(/\r?\n/).map(l=>l.trim());const out={};
 const retailers=['AO.COM','AO','MARKS ELECTRICAL','APPLIANCE CITY','CURRYS','JOHN LEWIS','ARGOS','COSTCO','RICHER SOUNDS','VERY','AMAZON','HARVEY NORMAN','PAUL DAVIES'];
 const found=retailers.find(x=>new RegExp(`\\b${x.replace('.','\\.')}\\b`,'i').test(text));if(found)out.retailer=found==='AO.COM'?'AO':found.replace(/\b\w/g,c=>c.toUpperCase()).replace(/\B\w/g,c=>c.toLowerCase());
 for(const line of lines){
  if(!out.orderNumber){const match=line.match(/(?:ORDER\s*(?:NO\.?|NUMBER|ID|REF(?:ERENCE)?|#)|INVOICE\s*(?:NO\.?|NUMBER|#)|REFERENCE(?:\s*(?:NO\.?|NUMBER))?|ORDER\s*[:#])\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,34})\b/i);if(match&&/\d/.test(match[1]))out.orderNumber=match[1];}
  if(!out.purchaseDate&&/(?:DATE|ORDERED|PURCHASED|INVOICE)/i.test(line))out.purchaseDate=dateFromReceipt(line);
  if(!out.price&&/(?:TOTAL|AMOUNT\s+PAID|AMOUNT\s+DUE)/i.test(line)){
   const m=line.match(/(?:\u00a3|GBP)\s*([\d,]+(?:\.\d{2})?)|\b([\d,]+\.\d{2})\s*$/i);
   if(m)out.price=(m[1]||m[2]).replace(/,/g,'');
  }
 }
 if(!out.purchaseDate)out.purchaseDate=dateFromReceipt(text);
 return out;
}

// Uncompressed ZIP builder: operates offline, without an external ZIP library.
const CRC_TABLE=(()=>{const t=[];for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;t[i]=c>>>0;}return t;})();
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
const encoder=new TextEncoder(),decoder=new TextDecoder();
async function buildZip(items) {
 const chunks=[],central=[];let offset=0;
 for(const item of items){
  const nameBytes=encoder.encode(item.name);
  const bytes=typeof item.data==='string'?encoder.encode(item.data):new Uint8Array(await item.data.arrayBuffer?.()||item.data);
  const crc=crc32(bytes),len=bytes.length;
  if(len>=0xffffffff||offset>=0xffffffff)throw new Error('ZIP is too large');
  const header=new Uint8Array(30+nameBytes.length),v=new DataView(header.buffer);
  v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0,true);v.setUint16(8,0,true);v.setUint32(14,crc,true);v.setUint32(18,len,true);v.setUint32(22,len,true);v.setUint16(26,nameBytes.length,true);header.set(nameBytes,30);
  chunks.push(header,bytes);
  const cd=new Uint8Array(46+nameBytes.length),c=new DataView(cd.buffer);
  c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0,true);c.setUint16(10,0,true);c.setUint32(16,crc,true);c.setUint32(20,len,true);c.setUint32(24,len,true);c.setUint16(28,nameBytes.length,true);c.setUint32(42,offset,true);cd.set(nameBytes,46);
  central.push(cd);offset+=header.length+len;
 }
 const centralSize=central.reduce((a,c)=>a+c.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
 e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
 return new Blob([...chunks,...central,end],{type:'application/zip'});
}
function readZip(blob) {
 return blob.arrayBuffer().then(buffer=>{
  const view=new DataView(buffer),bytes=new Uint8Array(buffer),entries=new Map();
  let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw new Error('Not a supported ZIP file');
  const num=view.getUint16(end+10,true);let pos=view.getUint32(end+16,true);
  for(let i=0;i<num;i++){
   if(view.getUint32(pos,true)!==0x02014b50)throw new Error('Invalid ZIP entry');
   const method=view.getUint16(pos+10,true);if(method!==0)throw new Error('Only Warranty Ease backups can be restored');
   const size=view.getUint32(pos+20,true),nlen=view.getUint16(pos+28,true),extra=view.getUint16(pos+30,true),comment=view.getUint16(pos+32,true),localPos=view.getUint32(pos+42,true);
   const name=decoder.decode(bytes.subarray(pos+46,pos+46+nlen));
   if(!name||name.startsWith('/')||name.includes('../'))throw new Error('Unexpected backup path');
   if(view.getUint32(localPos,true)!==0x04034b50)throw new Error('Invalid ZIP file header');
   const from=localPos+30+view.getUint16(localPos+26,true)+view.getUint16(localPos+28,true);
   if(from+size>bytes.length)throw Error('Invalid ZIP file bounds');entries.set(name,new Blob([bytes.slice(from,from+size)]));pos+=46+nlen+extra+comment;
  }
  return entries;
 });
}
function safeFileName(filename) {return String(filename).replace(/[^a-z0-9._-]/gi,'_').slice(0,110)||'document';}
function downloadBlob(blob,filename) {const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),20000);}
const RECOVERY_HTML="<!doctype html>\n<html lang=\"en-GB\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Warranty Ease | Offline emergency recovery</title><style>\n:root{font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#24324e;background:#f8f9fc}*{box-sizing:border-box}body{margin:0;padding:28px 15px}.box{max-width:600px;margin:30px auto;background:white;border:1px solid #dfe9dc;border-radius:22px;padding:28px;box-shadow:0 16px 45px #23472a12}.eyebrow{font-size:12px;font-weight:750;color:#4e8663;text-transform:uppercase;letter-spacing:.08em}h1{font-size:32px;margin:12px 0}p,li{line-height:1.6;color:#60766a;font-size:14px}label{font-weight:700;font-size:13px;display:block;margin:20px 0 8px}input{width:100%;border:1px solid #d4ded3;background:#fbfcf9;border-radius:11px;padding:13px;font-size:15px}button{background:#5364d7;color:white;border:0;border-radius:11px;padding:13px 18px;font-size:14px;font-weight:700;cursor:pointer;margin-top:20px}button:disabled{opacity:.5;cursor:wait}#status{min-height:23px;color:#5364d7;font-size:13px;margin-top:16px}.note{margin-top:23px;padding:15px;background:#eef0ff;border-radius:13px;font-size:12px;line-height:1.6;color:#65749a}\n</style></head><body><main class=\"box\"><span class=\"eyebrow\">No account, website or cloud needed</span><h1>Recover your warranty archive</h1><p>This small recovery page is included inside your Warranty Ease backup so you can recover your records and original photos even if the app website disappears.</p><label for=\"file\">1. Select <code>backup.encrypted</code> from the same archive</label><input type=\"file\" id=\"file\" accept=\".encrypted,application/octet-stream\"><label for=\"pass\">2. Enter your archive passphrase</label><input type=\"password\" id=\"pass\" autocomplete=\"off\" placeholder=\"The passphrase used for this backup\"><button id=\"recover\" type=\"button\">Decrypt &amp; download my records</button><div id=\"status\" role=\"status\"></div><div class=\"note\"><strong>What you will receive:</strong> a normal ZIP containing a readable index, all receipts and photos, warranty details and encrypted website-login vault entries. To read passwords, you will also need the separate vault passphrase. This page runs on your device and never uploads files.</div></main>\n<script>\n'use strict';\nconst MAGIC='WEASE02!';const ITERATIONS=310000;\nconst box=document.getElementById('status');\nfunction fail(message){box.textContent=message;}\ndocument.getElementById('recover').addEventListener('click',async()=>{\n const file=document.getElementById('file').files[0],pass=document.getElementById('pass').value;\n if(!file||!pass){fail('Select the encrypted file and enter the archive passphrase.');return;}\n const button=document.getElementById('recover');button.disabled=true;fail('Decrypting locally...');\n try{\n  if(!crypto?.subtle)throw new Error('Browser encryption is unavailable. Open this recovery page in a modern desktop browser.');\n  const data=new Uint8Array(await file.arrayBuffer());\n  if(data.length<64||new TextDecoder().decode(data.slice(0,8))!==MAGIC)throw new Error('Not a Warranty Ease encrypted backup file.');\n  const keyMaterial=await crypto.subtle.importKey('raw',new TextEncoder().encode(pass),'PBKDF2',false,['deriveKey']);\n  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:data.slice(8,24),iterations:ITERATIONS,hash:'SHA-256'},keyMaterial,{name:'AES-GCM',length:256},false,['decrypt']);\n  const content=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(24,36)},key,data.slice(36));\n  const blob=new Blob([content],{type:'application/zip'}),url=URL.createObjectURL(blob),a=document.createElement('a');\n  a.href=url;a.download='WarrantyEase-recovered-records.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);\n  fail('Recovered. Open the ZIP to view your records and original attachments.');\n }catch(e){fail(e.name==='OperationError'?'Incorrect passphrase or damaged archive.':e.message||'Could not decrypt this file.');}\n finally{button.disabled=false;document.getElementById('pass').value='';}\n});\n</script></body></html>\n";

// Portable encrypted archive: ZIP contains a standalone recovery page and encrypted
// records. It does not depend on the original hosting, server or library CDN.
const BACKUP_MAGIC='WEASE02!';
const ARCHIVE_HELP=`WARRANTY EASE - OFFLINE ARCHIVE\n\n1. Extract the files inside this ZIP.\n2. Open RECOVER.html in a modern browser.\n3. Choose backup.encrypted and enter your archive passphrase.\n4. Open the resulting ordinary ZIP: APPLIANCE-INDEX.txt lists your devices and the files folder contains the original evidence.\n5. Website passwords inside the restored records remain encrypted by your separate website vault passphrase.\n\nThe RECOVER.html file works without Warranty Ease's website or any cloud login.\nNo data is uploaded while decrypting.\nKeep this archive in at least two safe locations, including outside your phone.\nIf a browser blocks local file crypto, open RECOVER.html using a small local HTTP server or a modern desktop browser.\n\nBACKUP ENCRYPTION: PBKDF2-SHA256, 310000 iterations, 16-byte random salt, AES-256-GCM, 12-byte IV. Encrypted payload starts with 8 ASCII bytes WEASE02!, then salt, IV, ciphertext plus GCM authentication tag.\n`;
async function createRawBackupZip(){
 const deleted=await storeAction(META_STORE,'readonly',st=>st.get('syncTombstones'));
  const manifest={app:'Warranty Ease',version:3,exportedAt:new Date().toISOString(),records:[],websiteAccounts,websiteVault:vaultMeta,deletions:deleted?.items||[]};
 const items=[];
 let readable='WARRANTY EASE - APPLIANCE INDEX\nExported: '+manifest.exportedAt+'\n\n';
 for(const r of appliances){
  const clone={...r,files:[]};
  for(const f of r.files||[]){
    if(!(f.blob instanceof Blob)||!f.blob.size)throw Error('Missing original evidence file '+f.name+'. Automatic repair is required before syncing.');
    const path=`files/${r.id}/${f.id}_${safeFileName(f.name)}`;
    items.push({name:path,data:f.blob});
    const {blob,previewBlob,...meta}=f;
    if(previewBlob instanceof Blob&&previewBlob.size&&previewBlob.type==='image/jpeg'){
      const previewPath=`previews/${r.id}/${f.id}.jpg`;
      // A derived preview must never prevent the original evidence from syncing.
      try {
        const bytes=await previewBlob.arrayBuffer();
        items.push({name:previewPath,data:new Blob([bytes],{type:'image/jpeg'})});
        clone.files.push({...meta,path,previewPath});
      } catch(error) {
        if(!['NotFoundError','NotReadableError'].includes(error?.name))throw error;
        clone.files.push({...meta,path});
      }
    }else clone.files.push({...meta,path});
   }
  manifest.records.push(clone);
  readable+=`${r.productName||'Appliance'} (${r.brand||'-'})\nModel: ${r.model||'-'}\nSerial: ${r.serial||'-'}\nProduct code: ${r.productCode||'-'}\nPurchased: ${r.purchaseDate||'-'} from ${r.retailer||'-'}\nInvoice/order: ${r.orderNumber||'-'}\nWarranty end (check actual terms): ${computedExpiry(r)||'-'}\nRegistration: ${r.registrationDate||'-'} | ${r.registrationMethod||'-'} | ${r.registrationReference||'-'}\nManufacturer support: ${r.supportEmail||'-'} | ${r.supportPhone||'-'} | ${r.supportUrl||'-'}\nSeller support: ${r.sellerEmail||'-'} | ${r.sellerPhone||'-'} | ${r.sellerUrl||'-'}\nLinked login: ${websiteAccounts.find(a=>a.id===r.websiteAccountId)?.brand||'none'} (credentials held encrypted in backup JSON)\nFiles: ${(r.files||[]).map(f=>f.name).join(', ')||'-'}\n\n`;
 }
 readable+='Note: A warranty end date computed by the app is an estimate, not a guarantee of coverage.\n';
 items.unshift({name:'APPLIANCE-INDEX.txt',data:readable},{name:'warranty-ease-backup.json',data:JSON.stringify(manifest,null,2)});
 return buildZip(items);
}
async function encryptBackupBytes(bytes,passphrase){
  // Failure to encrypt must leave all existing data intact.
  try{
    const salt=randomBytes(16),iv=randomBytes(12),key=await deriveVaultKey(passphrase,salt);
    const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes));
    return new Blob([encoder.encode(BACKUP_MAGIC),salt,iv,encrypted],{type:'application/octet-stream'});
  }catch(error){
    if(error?.name!=='OperationError')throw error;
    const blocked=new Error('This device could not encrypt the latest changes. Your original files remain locally saved; nothing was overwritten in Cloudflare.');
    blocked.code='WE_DEVICE_ENCRYPT';throw blocked;
  }
}
async function decryptBackupBlob(blob,passphrase){
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(bytes.length<64||decoder.decode(bytes.slice(0,8))!==BACKUP_MAGIC)throw new Error('Invalid encrypted cloud copy. Your other files and cloud history remain intact.');
  try{
    const key=await deriveVaultKey(passphrase,bytes.slice(8,24));
    return new Blob([await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(24,36)},key,bytes.slice(36))],{type:'application/zip'});
  }catch(error){
    // OperationError covers an AES-GCM authentication failure, which may be
    // caused by a different passphrase or corrupted bytes. No silent reset.
    if(error?.name!=='OperationError')throw error;
    const locked=new Error('This encrypted cloud copy could not be unlocked. Check the original cloud passphrase; the copy might also be damaged. No local or cloud files were deleted.');
    locked.code='WE_ARCHIVE_UNLOCK';throw locked;
  }
}
async function backupAll(){
 try{
  toast('Gathering local records and photos...');
  pendingExportZip=await createRawBackupZip();
  modalKind='archive';
  modalRoot.innerHTML=`<div class="modal-overlay"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Download encrypted backup"><div class="modal-header"><div><span class="modal-label">Long-term offline safety</span><h2>Make a protected backup</h2><p>All ${appliances.length} appliance records, ${websiteAccounts.length} website logins and their saved attachments.</p></div><button class="close-btn" data-action="close" aria-label="Close">${ico('close')}</button></div><div class="modal-content"><div class="claim-intro">The download will contain your files plus a self-contained recovery page. You can unlock it years from now, without this website or a cloud service.</div><div class="form-grid"><div class="field full"><label>Backup passphrase (minimum 12 characters)</label><input class="input" id="backup-password" type="password" autocomplete="new-password" placeholder="A memorable, unique archive passphrase"></div><div class="field full"><label>Confirm backup passphrase</label><input class="input" id="backup-confirm" type="password" autocomplete="new-password"></div></div><p class="mini-help">Keep this passphrase in a safe place. Without it, no one can recover this backup. This archive passphrase may be the same as your login-vault passphrase, but it is managed separately.</p></div><div class="modal-footer"><div class="footer-left"><button class="btn btn-line" data-action="close">Cancel</button></div><div class="footer-right"><button class="btn btn-dark" data-action="backup-encrypt">${ico('download')} Encrypt & download</button></div></div></section></div>`;
  document.body.style.overflow='hidden';
 }catch(e){console.error(e);toast('Unable to gather your local records.');}
}
async function completeEncryptedBackup(){
 const pass=document.getElementById('backup-password')?.value||'',confirm=document.getElementById('backup-confirm')?.value||'';
 if(pass.length<12){toast('Use at least 12 characters for the archive passphrase.');return;}
 if(pass!==confirm){toast('The archive passphrases do not match.');return;}
 if(!pendingExportZip){toast('Restart the backup.');return;}
 try{
  toast('Encrypting your private archive...');
  const inner=new Uint8Array(await pendingExportZip.arrayBuffer());
  const encrypted=await encryptBackupBytes(inner,pass);
  const portable=await buildZip([{name:'READ_ME_FIRST.txt',data:ARCHIVE_HELP},{name:'RECOVER.html',data:RECOVERY_HTML},{name:'backup.encrypted',data:encrypted}]);
  downloadBlob(portable,`WarrantyEase-private-backup-${today()}.zip`);
  lastBackupAt=new Date().toISOString();await storeAction(META_STORE,'readwrite',st=>st.put({id:'lastBackup',at:lastBackupAt}));
  pendingExportZip=null;closeModal(true);toast('Portable encrypted backup downloaded. Save two copies in safe places.');
 }catch(e){console.error(e);toast('Could not encrypt this backup. Check device space and try again.');}
}
async function exportPlainBackup(){
 if(!window.confirm('This ZIP contains unencrypted receipts, serial numbers and warranty information. Only use this option for a secure location or recovery situation. Continue?'))return;
 try{const blob=await createRawBackupZip();downloadBlob(blob,`WarrantyEase-readable-backup-${today()}.zip`);toast('Readable ZIP downloaded. Handle it as sensitive personal data.');}
 catch(e){console.error(e);toast('Could not create the readable ZIP.');}
}
async function restoreBackup(file){
 if(!file)return;
 try{
  toast('Checking your archive...');
  const entries=await readZip(file);
  if(entries.has('backup.encrypted')){
   pendingImportEntries=entries;
   modalKind='restore-archive';
   modalRoot.innerHTML=`<div class="modal-overlay"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Restore encrypted backup"><div class="modal-header"><div><span class="modal-label">Private archive</span><h2>Restore your records</h2><p>Decryption happens only on this device.</p></div><button class="close-btn" data-action="close" aria-label="Close">${ico('close')}</button></div><div class="modal-content"><div class="field full"><label>Archive passphrase</label><input type="password" class="input" id="restore-password" autocomplete="off" placeholder="Enter the backup passphrase"></div><p class="mini-help">A different login-vault passphrase may also be required later to read website passwords.</p></div><div class="modal-footer"><div class="footer-left"><button class="btn btn-line" data-action="close">Cancel</button></div><div class="footer-right"><button class="btn btn-dark" data-action="restore-decrypt">${ico('lock')} Decrypt & restore</button></div></div></section></div>`;
   document.body.style.overflow='hidden';
   return;
  }
  await applyRestoredZip(file);
 }catch(e){console.error(e);toast(`Restore failed: ${e.message||'Could not read the backup'}`);}
}
async function restoreEncryptedBackup(){
 if(!pendingImportEntries)return;
 const pass=document.getElementById('restore-password')?.value||'';
 if(!pass){toast('Enter your archive passphrase.');return;}
 try{
  toast('Decrypting saved records...');
  const zip=await decryptBackupBlob(pendingImportEntries.get('backup.encrypted'),pass);
  await applyRestoredZip(zip);
  pendingImportEntries=null;
 }catch(e){console.error(e);toast(e.name==='OperationError'?'Incorrect archive passphrase or damaged backup.':`Restore failed: ${e.message||'Invalid backup'}`);}
}
async function mergeRestoredRecord(incoming,local){
  if(!local)return incoming;
  // Both devices retain their metadata and independent evidence. Prefer the
  // latest nonempty values without discarding valid local-only originals.
  const newerLocal=(Date.parse(local.updatedAt||'')||0)>=(Date.parse(incoming.updatedAt||'')||0);
  const main=newerLocal?local:incoming,other=newerLocal?incoming:local,merged={...main};
  for(const [field,value] of Object.entries(other)){
    if(['id','files','followUps','updatedAt'].includes(field))continue;
    if((merged[field]===null||merged[field]===undefined||merged[field]==='')&&value!==null&&value!==undefined&&value!=='')merged[field]=value;
  }
  const files=new Map((main.files||[]).map(f=>[f.id,f]));
  const present=f=>f?.blob instanceof Blob&&f.blob.size>0;
  const checksum=async blob=>{
    if(!(blob instanceof Blob)||!blob.size)return null;
    try{
      const buffer=await blob.arrayBuffer();
      const digest=await crypto.subtle.digest('SHA-256',buffer);
      return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    }catch(error){
      // iOS WebKit can retain an IndexedDB Blob with a nonzero length even
      // after its backing file becomes unreadable. A newer, verified cloud
      // original is preferred; no archive or conflicting version is deleted.
      if(['NotFoundError','NotReadableError'].includes(error?.name)||/object can not be found|object cannot be found/i.test(String(error?.message)))return null;
      throw error;
    }
  };
  for(const file of other.files||[]){
    const previous=files.get(file.id);
    if(!previous){files.set(file.id,file);continue;}
    if(!present(previous)&&present(file)){files.set(file.id,{...previous,...file});continue;}
    if(!present(file)||!present(previous)){
      files.set(file.id,{...file,...previous,previewBlob:previous.previewBlob||file.previewBlob});
      continue;
    }
    if(previous.blob===file.blob){
      files.set(file.id,{...file,...previous,previewBlob:previous.previewBlob||file.previewBlob});
      continue;
    }
    // Hashing also verifies the bytes can actually be read. Checking only
    // instanceof Blob or file size would miss an orphaned iOS backing file.
    const previousHash=await checksum(previous.blob),fileHash=await checksum(file.blob);
    if(!previousHash&&fileHash){
      files.set(file.id,{...previous,...file,previewBlob:file.previewBlob||previous.previewBlob});
      continue;
    }
    if(previousHash&&!fileHash){
      files.set(file.id,{...file,...previous,previewBlob:previous.previewBlob||file.previewBlob});
      continue;
    }
    if(!previousHash&&!fileHash){
      // Retain both metadata records rather than inventing lost image bytes.
      files.set(file.id,{...file,...previous});
      continue;
    }
    if(previousHash!==fileHash){
      // Different readable originals under one ID are retained independently,
      // using a stable hash ID to avoid duplicates on later reconciliation.
      const altId=file.id+'-variant-'+fileHash.slice(0,12);
      if(!files.has(altId)||!present(files.get(altId))){
        files.set(altId,{...file,id:altId,name:'Preserved alternative - '+(file.name||'evidence')});
      }
    }else{
      const chosen={...file,...previous,blob:(incoming.files||[]).find(f=>f.id===file.id)?.blob||previous.blob};
      for(const k of ['previewBlob','ocrText','ocrSuggestions','ocrAt','ocrKeyLines']){
        if((chosen[k]===undefined||chosen[k]===null||chosen[k]==='')&&file[k]!==undefined)chosen[k]=file[k];
      }
      files.set(file.id,chosen);
    }
  }
  // Prefer readable derived previews; originals remain authoritative.
  for(const [id,originalFile] of files){
    const file={...originalFile};files.set(id,file);
    if(!(file.previewBlob instanceof Blob))continue;
    try{await file.previewBlob.arrayBuffer();}catch(error){
      // A derived preview can always be regenerated; never block original recovery.
      const candidates=[...(incoming.files||[]),...(local.files||[])].filter(f=>f.id===id&&f.previewBlob instanceof Blob);
      delete file.previewBlob;
      for(const candidate of candidates){try{await candidate.previewBlob.arrayBuffer();file.previewBlob=candidate.previewBlob;break;}catch(e){/* Derived preview unavailable; retain original. */}}
    }
  }
  return {...merged,files:[...files.values()],
    followUps:window.WarrantyFollowUps?.merge?.(incoming.followUps,local.followUps)||[...(incoming.followUps||[]),...(local.followUps||[])]};
}
// Determine whether the locally reconciled state contains information that
// the newest cloud archive does not yet have. This converges older offline
// branches without discarding any local-only evidence or notes.
async function cloudManifestNeedsUpload(zip){
 const entries=await readZip(zip),file=entries.get('warranty-ease-backup.json');
 if(!file)throw Error('Cloud state manifest is missing.');
 const snapshot=JSON.parse(await file.text());
 if(!Array.isArray(snapshot.records))throw Error('Cloud state manifest is invalid.');
 const canonical=value=>{
   if(Array.isArray(value))return value.map(canonical);
   if(value&&typeof value==='object'){
     return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
   }
   return value;
 };
 const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const remote=new Map(snapshot.records.map(r=>[r.id,r]));
 for(const r of appliances){
   const old=remote.get(r.id);if(!old)return true;
   const {files:localFiles=[],...localMeta}=r,{files:remoteFiles=[],...remoteMeta}=old;
   if(!equal(localMeta,remoteMeta))return true;
   const remoteFileMap=new Map(remoteFiles.map(f=>[f.id,f]));
   for(const f of localFiles){
     const prior=remoteFileMap.get(f.id);if(!prior)return true;
     const {blob,previewBlob,...localFields}=f;
     const {path,previewPath,...remoteFields}=prior;
     if(!equal(localFields,remoteFields))return true;
     if(previewBlob instanceof Blob&&previewBlob.size&&previewBlob.type==='image/jpeg'&&!previewPath)return true;
   }
 }
 const remoteAccounts=new Map((snapshot.websiteAccounts||[]).map(x=>[x.id,x]));
 for(const a of websiteAccounts)if(!remoteAccounts.has(a.id)||!equal(a,remoteAccounts.get(a.id)))return true;
 const deletes=await storeAction(META_STORE,'readonly',store=>store.get('syncTombstones'));
 const remoteDeletes=new Map((snapshot.deletions||[]).map(x=>[x.kind+':'+x.id,x.deletedAt]));
 for(const d of deletes?.items||[])if(d.deletedAt>(remoteDeletes.get(d.kind+':'+d.id)||''))return true;
 return false;
}
async function applyRestoredZip(zip,{automatic=false}={}){
 const entries=await readZip(zip),data=entries.get('warranty-ease-backup.json');
 if(!data)throw new Error('The backup manifest is missing');
 const json=JSON.parse(await data.text());
 if(json.app!=='Warranty Ease'||![1,2,3].includes(json.version)||!Array.isArray(json.records))throw new Error('Unsupported backup version');
 const incomingAccounts=json.version>=2?json.websiteAccounts||[]:[];
 const incomingVault=json.version>=2?json.websiteVault||null:null;
 const incomingDeletes=json.version>=3?json.deletions||[]:[];
 if(!Array.isArray(incomingAccounts)||!Array.isArray(incomingDeletes)||incomingAccounts.length&&!incomingVault)throw new Error('Incomplete account vault data');
 if(incomingVault&&vaultMeta&&incomingVault.salt!==vaultMeta.salt&&websiteAccounts.length){
  throw new Error('These devices have different website-login vault keys. Export both vaults before combining. Nothing was changed.');
 }
 const localDeleteRow=await storeAction(META_STORE,'readonly',st=>st.get('syncTombstones'));
 const deleted=new Map();
 for(const item of [...(localDeleteRow?.items||[]),...incomingDeletes]){
  if(!item||!['appliance','account'].includes(item.kind)||typeof item.id!=='string'||!item.id||!Number.isFinite(Date.parse(item.deletedAt||'')))throw new Error('Invalid deletion history');
  const key=item.kind+':'+item.id,prev=deleted.get(key);
  if(!prev||item.deletedAt>prev.deletedAt)deleted.set(key,{id:item.id,kind:item.kind,deletedAt:item.deletedAt});
 }
 const restored=[];
 for(const r of json.records){
  if(!r.id||typeof r.id!=='string'||!Array.isArray(r.files))throw new Error('Invalid record');
  const row={...r,files:[]};
  for(const f of r.files){
   if(!f.path||!entries.has(f.path))throw new Error('Missing file: '+String(f.name));
   const {path,previewPath,...meta}=f;
   const original=new Blob([await entries.get(path).arrayBuffer()],{type:meta.mime||'application/octet-stream'});
   const preview=previewPath&&entries.has(previewPath)?new Blob([await entries.get(previewPath).arrayBuffer()],{type:'image/jpeg'}):null;
   row.files.push({...meta,blob:original,...(preview?.size?{previewBlob:preview}:{})});
  }
  const merged=await mergeRestoredRecord(row,getRecord(row.id));
  if((deleted.get('appliance:'+row.id)?.deletedAt||'')>(merged.updatedAt||''))continue;
  restored.push(merged);
 }
 for(const a of incomingAccounts)if(!a.id||!a.secretBlob?.iv||!a.secretBlob?.ciphertext)throw new Error('Invalid encrypted login');
 if(!automatic&&!window.confirm('Restore '+restored.length+' appliance(s) and '+incomingAccounts.length+' encrypted website login(s)? Existing local evidence is kept.'))return false;
 const storedRestored=[];for(const row of restored)storedRestored.push(await evidenceForStorage(row));
 await ensureStorage();
 // All appliance records, vault entries and deletion history commit together.
 await new Promise((resolve,reject)=>{
  let tx;try{tx=db.transaction([DB_STORE,ACCOUNTS_STORE,META_STORE],'readwrite');}catch(e){if(e?.name==='InvalidStateError')db=null;reject(e);return;}
  const recordStore=tx.objectStore(DB_STORE),accountStore=tx.objectStore(ACCOUNTS_STORE),metaStore=tx.objectStore(META_STORE);
  try{
   for(const r of storedRestored)recordStore.put(r);
   for(const a of incomingAccounts){
    const local=websiteAccounts.find(x=>x.id===a.id);
    const chosen=local&&Date.parse(local.updatedAt||'')>Date.parse(a.updatedAt||'')?local:a;
    if((deleted.get('account:'+a.id)?.deletedAt||'')>(chosen.updatedAt||''))continue;
    accountStore.put(chosen);
   }
   for(const entry of deleted.values()){
    if(entry.kind==='appliance'){
     const row=restored.find(x=>x.id===entry.id)||getRecord(entry.id);
     if(!row||entry.deletedAt>(row.updatedAt||''))recordStore.delete(entry.id);
    }else{
     const incoming=incomingAccounts.find(x=>x.id===entry.id);
     const local=websiteAccounts.find(x=>x.id===entry.id);
     const last=[incoming,local].filter(Boolean).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
     if(!last||entry.deletedAt>(last.updatedAt||''))accountStore.delete(entry.id);
    }
   }
   metaStore.put({id:'syncTombstones',items:[...deleted.values()]});
   if(incomingVault&&(!vaultMeta||!websiteAccounts.length))metaStore.put(incomingVault);
  }catch(error){try{tx.abort()}catch{}reject(error);return}
  tx.oncomplete=resolve;tx.onerror=()=>reject(new Error('RESTORE_METADATA_TRANSACTION: '+(tx.error?.name||'UnknownError')));tx.onabort=()=>reject(new Error('RESTORE_METADATA_ABORT: '+(tx.error?.name||'UnknownError')));
 });
 lockVault(true);await refresh();
 for(const record of restored){
   const missingPreviews=(record.files||[]).filter(f=>f.mime?.startsWith('image/')&&f.blob instanceof Blob&&f.blob.size);
   if(missingPreviews.length&&!automatic)void prepareDisplayImages(record.id,missingPreviews).catch(()=>{});
 }
 if(!automatic){closeModal(true);renderHome();toast('Records restored to this device.');}
 else if(!modalKind){if(currentView==='notes')renderFollowUps();else if(currentView==='logins')renderLogins();else renderHome();}
 return true;
}

async function downloadClaimZip() {
 try{
  const r=getRecord(claim.id),items=[{name:'claim-details.txt',data:`Subject: ${claimSubject()}\nTo: ${document.getElementById('claim-to')?.value||claimRecipient()||''}\n\n${claimBody()}\n`}];
  for(const f of selectedFiles())items.push({name:`evidence/${safeFileName(f.name)}`,data:f.blob});
  const zip=await buildZip(items);downloadBlob(zip,`warranty-claim-${safeFileName(r.brand||'appliance')}-${today()}.zip`);toast('Evidence ZIP downloaded. Attach it to your email if needed.');
 }catch(e){console.error(e);toast('Could not create evidence ZIP.');}
}

// Local-only encrypted website account vault. Password/username/notes are encrypted
// before IndexedDB writes and never travel with warranty claim messages.
function bytesToB64(bytes){let result='';for(const b of bytes)result+=String.fromCharCode(b);return btoa(result);}
function b64ToBytes(s){return Uint8Array.from(atob(s),ch=>ch.charCodeAt(0));}
function randomBytes(n){const b=new Uint8Array(n);crypto.getRandomValues(b);return b;}
async function deriveVaultKey(password,salt,iterations=VAULT_KDF_ITERATIONS){
 const keyData=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},keyData,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptSecret(key,source,aad=''){
 const iv=randomBytes(12),payload=typeof source==='string'?encoder.encode(source):source;
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},key,payload);
 return {iv:bytesToB64(iv),ciphertext:bytesToB64(new Uint8Array(cipher))};
}
async function decryptSecret(key,sealed,aad=''){
 const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64ToBytes(sealed.iv),additionalData:encoder.encode(aad)},key,b64ToBytes(sealed.ciphertext));
 return decoder.decode(decrypted);
}
function touchVault(){
 if(!vaultKey)return;
 clearTimeout(vaultLockTimer);
 vaultLockTimer=setTimeout(()=>lockVault(),10*60*1000);
}
function lockVault(quiet=false){
 vaultKey=null;clearTimeout(vaultLockTimer);vaultLockTimer=null;
 if(modalKind==='account')closeModal(true);
 if(currentView==='logins')renderLogins();
 if(!quiet)toast('Website-login vault locked.');
}
async function createVault(){
 const a=document.getElementById('vault-new-password')?.value||'';
 const b=document.getElementById('vault-confirm-password')?.value||'';
 if(a.length<12){toast('Use at least 12 characters for your vault passphrase.');return;}
 if(a!==b){toast('The two passphrases do not match.');return;}
 if(vaultMeta){toast('A vault already exists. Unlock it instead.');return;}
 const salt=randomBytes(16),key=await deriveVaultKey(a,salt);
 const check=await encryptSecret(key,'warranty-ease-vault-v1','vault-check');
 const meta={id:'vault',version:1,salt:bytesToB64(salt),check};
 await storeAction(META_STORE,'readwrite',st=>st.put(meta));
 vaultMeta=meta;vaultKey=key;touchVault();window.WarrantyCloud?.scheduleUpload?.();renderLogins();
 toast('Encrypted vault created. Keep this passphrase safely; it cannot be reset.');
 // OCR runs in a separate local Web Worker; no third-party page script is loaded.
}
async function unlockVault(){
 const password=document.getElementById('vault-unlock-password')?.value||'';
 if(!password){toast('Enter your vault passphrase.');return;}
 try{
  const key=await deriveVaultKey(password,b64ToBytes(vaultMeta.salt));
  const check=await decryptSecret(key,vaultMeta.check,'vault-check');
  if(check!=='warranty-ease-vault-v1')throw new Error('Vault verification failed');
  vaultKey=key;touchVault();renderLogins();toast('Website logins unlocked on this device.');
 }catch(error){console.warn('Vault unlock failed',error);toast('Incorrect passphrase or damaged vault.');}
}
function renderLogins(){
 currentView='logins';setNavState();clearUrls('main');
 const locked=!!vaultMeta&&!vaultKey;
 root.innerHTML=`<div class="settings-top"><div><div class="eyebrow"><span class="eyebrow-dot"></span> Passwords are kept separate from warranty claims</div><h1>Website logins.</h1><p>One encrypted account can be linked to several appliances, such as your LG washer and dryer.</p></div>${ico('key','welcome-doodle')}</div>
 <section class="vault-hero"><div class="vault-hero-icon">${ico(vaultKey?'checkcircle':'lock')}</div><div class="vault-hero-text"><h2>${!vaultMeta?'Create your private vault':locked?'Your logins are locked':'Your vault is unlocked'}</h2><p>${!vaultMeta?'Set a strong passphrase before adding a warranty website login.':locked?'Unlock with your vault passphrase to access logins, including saved passwords.':'Passwords are decrypted only when you ask to see or edit them. Vault locks when you leave this app or after 10 minutes.'}</p></div>${vaultKey?`<button class="btn btn-line" data-action="vault-lock">${ico('lock')} Lock</button>`:''}</section>
 ${!vaultMeta?`<div class="settings-card vault-setup"><h3>Choose a vault passphrase</h3><p>Use at least 12 characters. This is different from your website password. Without it, encrypted login details cannot be recovered, even from a backup.</p><div class="form-grid"><div class="field full"><label>Passphrase</label><input class="input" type="password" id="vault-new-password" autocomplete="new-password" placeholder="Long, unique passphrase"></div><div class="field full"><label>Confirm passphrase</label><input class="input" type="password" id="vault-confirm-password" autocomplete="new-password"></div></div><button class="btn btn-dark" data-action="vault-create">${ico('shield')} Create vault</button></div>`:''}
 ${locked?`<div class="settings-card vault-setup"><div class="form-grid"><div class="field full"><label>Vault passphrase</label><input class="input" type="password" id="vault-unlock-password" autocomplete="current-password" placeholder="Enter your passphrase"></div></div><button class="btn btn-dark" data-action="vault-unlock">${ico('key')} Unlock saved logins</button><p class="note-muted">Passwords are not stored in plain text and cannot be reset without the original passphrase.</p></div>`:''}
 ${vaultKey?`<div class="section-head"><h2>Saved website accounts <span class="vault-count">${websiteAccounts.length}</span></h2><button class="btn btn-dark" data-action="account-new">+ Add website login</button></div><div class="vault-account-list">${websiteAccounts.length?websiteAccounts.map(a=>`<div class="vault-account-card"><div class="vault-website-icon">${ico('lock')}</div><div class="vault-account-name"><strong>${esc(a.brand||'Warranty website')}</strong><span>${esc(a.siteUrl||'No website saved')} &middot; ${appliances.filter(r=>r.websiteAccountId===a.id).length} linked appliances</span></div><button class="btn btn-line btn-sm" data-action="account-view" data-id="${esc(a.id)}">View login</button></div>`).join(''):`<div class="empty-state"><h3>No accounts yet</h3><p>Save the website where you registered your LG products. Link it to each appliance in its warranty details.</p></div>`}</div>`:''}
 <div class="tip-box">${ico('info')} This is an encrypted local vault, not an automatic login or an integration with LG. For maximum protection, you can also store your credentials in Apple Passwords or another dedicated password manager.</div>`;
}
async function openAccountEditor(id=''){
 if(!vaultKey){renderLogins();toast('Unlock your vault first.');return;}
 const source=websiteAccounts.find(a=>a.id===id);
 let secrets={username:'',password:'',notes:''};
 if(source)secrets=JSON.parse(await decryptSecret(vaultKey,source.secretBlob,source.id));
 accountEditor={id:source?.id||uid(),isNew:!source,brand:source?.brand||'',siteUrl:source?.siteUrl||'',...secrets};
 modalKind='account';
 modalRoot.innerHTML=`<div class="modal-overlay"><section class="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Warranty website login"><div class="modal-header"><div><span class="modal-label">Encrypted website credentials</span><h2>${source?'Website login':'Save a website login'}</h2><p>Nothing in this form is sent to a manufacturer or seller.</p></div><button class="close-btn" data-action="close" aria-label="Close">${ico('close')}</button></div><div class="modal-content"><div class="form-grid">
 <div class="field full"><label for="account-brand">Website or brand</label><input class="input" id="account-brand" value="${esc(accountEditor.brand)}" placeholder="e.g. LG" autocomplete="off"></div>
 <div class="field full"><label for="account-url">Sign-in web address</label><input class="input" id="account-url" type="url" value="${esc(accountEditor.siteUrl)}" placeholder="https://www.lg.com/uk" autocomplete="off"></div>
 <div class="field full"><label for="account-username">Login email / username</label><input class="input" id="account-username" value="${esc(accountEditor.username)}" autocomplete="off" autocapitalize="none"></div>
 <div class="field full"><label for="account-password">Password (optional)</label><div class="password-line"><input class="input" id="account-password" type="password" value="${esc(accountEditor.password)}" autocomplete="off"><button class="btn btn-line btn-sm" type="button" data-action="toggle-password">${ico('eye')} Show</button><button class="btn btn-line btn-sm" type="button" data-action="account-copy-password">${ico('copy')} Copy</button></div><div class="field-hint">Password is encrypted with AES-GCM before it is saved locally.</div></div>
 <div class="field full"><label for="account-notes">Security / recovery notes (optional)</label><textarea class="input textarea" id="account-notes" placeholder="e.g. warranty account reference. Never store 2FA recovery codes here unless necessary.">${esc(accountEditor.notes)}</textarea></div></div>${source&&safeHttp(source.siteUrl)?`<p><a class="link-chip" href="${esc(safeHttp(source.siteUrl))}" target="_blank" rel="noopener noreferrer">${ico('external')} Open website sign-in</a></p>`:''}</div><div class="modal-footer"><div class="footer-left">${source?`<button class="btn btn-ghost btn-sm" data-action="account-delete" data-id="${esc(source.id)}">${ico('trash')} Delete login</button>`:''}</div><div class="footer-right"><button class="btn btn-line" data-action="close">Cancel</button><button class="btn btn-dark" data-action="account-save">${ico('check')} Save encrypted login</button></div></div></section></div>`;
 document.body.style.overflow='hidden';touchVault();
}
async function saveAccount(){
 if(!vaultKey||!accountEditor){toast('Unlock your vault first.');return;}
 const brand=document.getElementById('account-brand')?.value.trim()||'';
 const siteRaw=document.getElementById('account-url')?.value.trim()||'';
 const siteUrl=safeHttp(siteRaw);
 if(!brand){toast('Add a website or brand name.');return;}
 if(siteRaw&&!siteUrl){toast('Enter a valid HTTPS website address.');return;}
 if(siteUrl&&!siteUrl.startsWith('https://')){toast('Use an HTTPS sign-in website.');return;}
 const secrets={username:document.getElementById('account-username')?.value.trim()||'',password:document.getElementById('account-password')?.value||'',notes:document.getElementById('account-notes')?.value||''};
 const previous=websiteAccounts.find(a=>a.id===accountEditor.id);
 const a={id:accountEditor.id,brand,siteUrl,secretBlob:await encryptSecret(vaultKey,JSON.stringify(secrets),accountEditor.id),createdAt:previous?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};
 await storeAction(ACCOUNTS_STORE,'readwrite',st=>st.put(a));
 accountEditor=null;closeModal(true);await refresh();window.WarrantyCloud?.scheduleUpload?.();renderLogins();touchVault();toast('Login encrypted and saved. Cloud sync runs automatically.');
}
async function deleteAccount(id){
 const a=websiteAccounts.find(a=>a.id===id);
 if(!a||!window.confirm(`Delete ${a.brand} login? Linked appliances will remain, without their website link.`))return;
 await deleteWithTombstone(ACCOUNTS_STORE,id,'account');
 for(const r of appliances.filter(r=>r.websiteAccountId===id)){r.websiteAccountId='';await putRecord(r);}
 accountEditor=null;closeModal(true);await refresh();window.WarrantyCloud?.scheduleUpload?.();renderLogins();toast('Website login deleted.');
}

async function handleAction(button) {
 const action=button.dataset.action,id=button.dataset.id;
 document.getElementById('wallet-menu')?.removeAttribute('open');
 if(action.startsWith('cloud-')){window.WarrantyCloud?.handle(action,id);return;}
 switch(action){
 case 'home':closeModal(true);renderHome();break;
 case 'search':closeModal(true);renderHome();document.querySelector('.home-utility')?.classList.add('wallet-show-search');document.getElementById('app-search')?.focus();break;
 case 'settings':closeModal(true);renderSettings();break;
 case 'notes':closeModal(true);renderFollowUps();break;
 case 'followup-filter':followUpFilter=['open','done','archived'].includes(button.dataset.filter)?button.dataset.filter:'open';renderFollowUps();break;
 case 'followup-new':openFollowUpEditor(id);break;
 case 'followup-edit':openFollowUpEditor(id,button.dataset.noteId);break;
 case 'followup-save':await saveFollowUp();break;
 case 'followup-cancel':{const back=followUpEditor?.origin==='detail'?followUpEditor.recordId:'';closeModal(true);if(back)showDetail(back);else if(currentView==='notes')renderFollowUps();else renderHome();break;}
 case 'followup-toggle':await changeFollowUpStatus(id,button.dataset.noteId,button.dataset.status==='done'?'done':'open');break;
 case 'followup-archive':await changeFollowUpStatus(id,button.dataset.noteId,'archived');break;
 case 'logins':closeModal(true);renderLogins();break;
 case 'vault-create':await createVault();break;
 case 'vault-unlock':await unlockVault();break;
 case 'vault-lock':lockVault();break;
 case 'account-new':await openAccountEditor();break;
 case 'account-view':await openAccountEditor(id);break;
 case 'account-save':await saveAccount();break;
 case 'account-delete':await deleteAccount(id);break;
 case 'toggle-password':{const el=document.getElementById('account-password');if(el){el.type=el.type==='password'?'text':'password';button.textContent=el.type==='password'?'Show':'Hide';}break;}
 case 'account-copy-password':{const pw=document.getElementById('account-password')?.value||'';if(pw)await copyText(pw);else toast('No password saved for this account.');break;}
 case 'new':startNew();break;
 case 'quick-add':{const t=templates[Number(button.dataset.template)];if(t)startNew(t);break;}
 case 'close':closeModal();break;
 case 'next':if(editor){editor.step=Math.min(2,editor.step+1);renderEditor(true);}break;
 case 'previous':if(editor){editor.step=Math.max(0,editor.step-1);renderEditor(true);}break;
 case 'save':await saveEditor();break;
 case 'view':showDetail(id);break;
 case 'edit':startEdit(id);break;
 case 'claim':startClaim(id);break;
 case 'open-linked-account':closeModal(true);renderLogins();if(vaultKey)await openAccountEditor(id);else toast('Unlock your login vault to view the website account.');break;
 case 'claim-back':showDetail(claim.id);break;
 case 'ocr-offline-prepare':{
  const status=document.getElementById('ocr-offline-status');
  button.disabled=true;
  if(status)status.textContent='Preparing offline scanner...';
  try{
   if(!window.WarrantyOCR?.prepareOffline)throw Error('Offline scanner is unavailable');
   await window.WarrantyOCR.prepareOffline(({done,total})=>{if(status)status.textContent=`Saving offline scanner files: ${done} of ${total}...`;});
   if(status)status.textContent='Offline scanner ready. Photo text recognition is available without a connection.';
   toast('Scanner saved for offline use.');
  }catch(error){if(status)status.textContent='Not ready yet: '+String(error?.message||error);toast('Connect to the internet and try preparing the scanner again.');}
  finally{button.disabled=false;}
  break;
 }
 case 'download-product-photo':{
   if(!editor)break;
   const draft=editor.draft,matched=window.WarrantyResources?.photoFor?.(draft);
   if(!matched){toast('Enter the exact brand and model first.');break;}
   if(draft.files.some(f=>f.manufacturerPhotoId===matched.id)){toast('Manufacturer picture is already saved for this appliance.');break;}
   if(!window.WarrantyCloud?.fetchManufacturerPhoto){toast('Photo importer is unavailable. Reload the app.');break;}
   button.disabled=true;const originalText=button.textContent;button.textContent='Downloading picture...';
   try{
    const blob=await window.WarrantyCloud.fetchManufacturerPhoto(matched.id);
    const ext=blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg';
    const attached={id:uid(),name:`${matched.brand}-${matched.model}-official.${ext}`,type:'reference',
      mime:blob.type,size:blob.size,blob,source:'manufacturer',sourcePage:matched.sourcePage,
      manufacturerPhotoId:matched.id,ocrText:'',addedAt:new Date().toISOString()};
    await appendReferenceFile(draft.id,attached,draft);
    if(!draft.files.some(f=>f.id===attached.id))draft.files.push(attached);
    await refresh();window.WarrantyCloud?.scheduleUpload?.();
    void prepareDisplayImages(draft.id,[attached]);
    if(editor?.draft===draft&&modalKind==='editor'){editor.dirty=true;renderEditor(false);}
    toast('Official product picture saved separately. Installed photos are unchanged.');
   }catch(error){toast(String(error?.message||'Manufacturer image unavailable.').slice(0,180));}
   finally{button.disabled=false;button.textContent=originalText;}
   break;
  }
  case 'file-scan':if(editor){const f=editor.draft.files.find(x=>x.id===button.dataset.file);if(f&&f.mime.startsWith('image/')){enqueueOcr(editor.draft.id,f.id);ocrMessage='Reading this photograph again...';updateOcr(ocrMessage);runOcrQueue().catch(err=>console.warn(err));}}break;
 case 'file-crop':if(editor){const f=editor.draft.files.find(x=>x.id===button.dataset.file);if(f?.mime?.startsWith('image/')){const crop=await window.WarrantyCrop?.open?.(f.blob);if(crop){enqueueOcr(editor.draft.id,f.id,crop);ocrMessage='Scanning the selected label area...';updateOcr(ocrMessage);runOcrQueue().catch(err=>console.warn(err));}}}break;
 case 'ocr-apply':if(editor){let applied=0;const allowed=new Set(['brand','model','productCode','serial','retailer','orderNumber','purchaseDate','price']);for(const input of modalRoot.querySelectorAll('[data-ocr-edit]')){const key=input.dataset.ocrEdit,value=input.value.trim().slice(0,120);if(!allowed.has(key)||!value)continue;if(editor.draft[key]!==value){editor.draft[key]=value;applied++;}}editor.suggestions={};editor.dirty=true;ocrMessage=applied?`${applied} reviewed detail${applied===1?'':'s'} entered. Verify against the photograph before saving.`:'No details were changed.';renderEditor(false);toast(ocrMessage);}break;
 case 'file-remove':if(editor){editor.draft.files=editor.draft.files.filter(f=>f.id!==button.dataset.file);editor.dirty=true;renderEditor(false);}break;
 case 'file-view':{
  const files=editor?.draft.files||getRecord(detailId)?.files||[];const f=files.find(x=>x.id===button.dataset.file);if(f){if(!(f.blob instanceof Blob)||!f.blob.size){toast('Original unavailable. Automatic cloud repair will retry when connected.');break;}const link=URL.createObjectURL(f.blob);window.open(link,'_blank','noopener,noreferrer');setTimeout(()=>URL.revokeObjectURL(link),60000);}break;
 }
 case 'delete-record':{
  const r=getRecord(id);if(r&&window.confirm(`Delete "${r.productName||r.model}" across synced devices? Older encrypted recovery copies are retained.`)){
   await deleteRecord(id);closeModal(true);renderHome();toast('Appliance deleted locally. The change will sync automatically.');
  }break;
 }
 case 'copy':await copyText(button.dataset.value||'');break;
 case 'claim-target':if(claim){claim.target=button.dataset.target;renderClaim(false);}break;
 case 'claim-copy':await copyText(claimBody());break;
 case 'claim-email':await emailClaim();break;
 case 'claim-share':await shareClaim();break;
 case 'claim-download':await downloadClaimZip();break;
 case 'persist':{
  try{if(!navigator.storage?.persist){toast('Storage persistence is unavailable on this browser.');break;}const okay=await navigator.storage.persist();toast(okay?'This browser has granted persistent storage.':'The browser did not grant persistent storage. Keep backup ZIP files.');updateStorageEstimate();}catch{toast('Could not request storage persistence.');}break;
 }
 }
}
document.addEventListener('click',e=>{
 if(e.target.classList.contains('modal-overlay')){closeModal();return;}
 const b=e.target.closest('[data-action]');if(b){e.preventDefault();handleAction(b).catch(err=>{console.error(err);toast('Something went wrong. Please try again.');});}
});
document.addEventListener('change',e=>{
 const target=e.target;
 if(target.matches('[data-file-type]')){handlePickedFiles(target).catch(e=>{console.error(e);toast('Could not add the selected file.');});return;}
 if(target.matches('[data-field]')){syncDraftField(target);return;}
 if(target.matches('[data-claim-field]')&&claim){claim.fields[target.dataset.claimField]=target.checked;updateClaimPreview();return;}
 if(target.matches('[data-claim-file]')&&claim){if(target.checked)claim.fileIds.add(target.dataset.claimFile);else claim.fileIds.delete(target.dataset.claimFile);updateClaimPreview();return;}
 if(target.id==='restore-input'){restoreBackup(target.files[0]);target.value='';}
});
document.addEventListener('input',e=>{
 const el=e.target;
 if(el.matches('[data-field]'))syncDraftField(el);
 if(el.id==='app-search'){searchTerm=el.value;renderGrid();}
 if(el.id==='claim-problem'&&claim){claim.problem=el.value;updateClaimPreview();}
});
// Decoding support varies on iPad (particularly HEIC). A failed thumbnail does
// not imply the original stored Blob has disappeared.
document.addEventListener('error',event=>{
 const image=event.target;
 if(!(image instanceof HTMLImageElement)||!image.hasAttribute('data-warranty-photo'))return;
 // A corrupt/unsupported small preview must not hide a perfectly good
 // full-size original. Try the local original before showing a placeholder.
 if(image.dataset.originalAttempted!=='true'){
   image.dataset.originalAttempted='true';
   const id=image.dataset.warrantyFile,record=appliances.find(r=>(r.files||[]).some(f=>f.id===id));
   const file=record?.files?.find(f=>f.id===id)||editor?.draft.files?.find(f=>f.id===id);
   if(file?.blob instanceof Blob&&file.blob.size&&file.previewBlob instanceof Blob&&file.previewBlob.size){
     image.src=previewUrl(file.blob,image.dataset.cardPhoto?'main':'modal');
     return;
   }
 }
 if(image.dataset.cardPhoto){
   const box=image.parentElement;box.classList.replace('has-photo','no-photo');
   box.innerHTML=cardIcon(box.nextElementSibling?.textContent||'');
   return;
 }
 image.hidden=true;
 const note=document.createElement('span');note.className='we-photo-preview-fallback';
 note.textContent='Preview unavailable — original kept';
 image.parentElement?.append(note);
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalKind){closeModal();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&vaultKey)lockVault(true);});
document.addEventListener('click',()=>touchVault());
document.addEventListener('input',()=>touchVault());

(async function init(){
 hydrateIcons();
 try{
  if(!('indexedDB'in window))throw new Error('IndexedDB is unavailable');
  db=await openDB();await refresh();renderHome();
   // Legacy snapshots do not carry JPEG thumbnails. Derive them on capable
   // devices and publish the display-safe copy encrypted with the original.
   for(const record of appliances){
     const need=(record.files||[]).filter(f=>f.mime?.startsWith('image/')&&f.blob instanceof Blob&&f.blob.size);
     // Preview regeneration deferred until recovery is stable.
   }
   void window.WarrantyCloud?.start?.().catch(error=>console.warn('Cloud reconnect will retry:',error?.message||error));
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./service-worker.js',{scope:'/WarrantyEase/'}).catch(()=>{});
 }catch(err){
  console.error(err);
  root.innerHTML=`<div class="empty-state" style="margin-top:50px"><div class="empty-art">${ico('alert')}</div><h3>Local storage is not available.</h3><p>This browser is preventing Warranty Ease from saving records. Open the app in a normal browser tab, not private browsing, and ensure site storage is enabled.</p></div>`;
 }
})();