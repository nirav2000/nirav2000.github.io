/* Warranty Ease uses its private R2 Worker and the existing owner sign-in. */
'use strict';
window.WarrantyCloud=(()=>{
  const ROOT='https://warranty-ease-api.nirav2000-github.workers.dev';
  const V1=ROOT+'/v1',V2=ROOT+'/v2';
  const MONITOR='https://apps-monitor-api.nirav2000-github.workers.dev/app-monitor';
  const FIREBASE_KEY='AIzaSyDrreK9rhsoOpIYNr4QeNZ7CsXgQiMPW0E';
  const OWNER_UID='2AJSfYdtg5URWHv7HCzpNMmKIlg2';
  const state={connected:false,method:'',error:'',busy:false,verified:false,migration:false,passphrase:'',
    pending:false,refreshNeeded:false,session:null,starting:null,timer:0,retry:5000,revision:0,connection:0,archives:[]};
  const trace=[];
  const {reconcile,same,hashValid}=window.WarrantyIncremental;
  const disconnectKey='we-sync-disconnected';
  const editing=()=>['editor','account','followup','restore-archive'].includes(modalKind);
  const recordId=(kind,id)=>kind==='vault'?'vault':(kind==='appliance'?'a-':'l-')+id;
  const kindOf=id=>id==='vault'?'vault':id.startsWith('a-')?'appliance':'account';
  const keyOf=id=>id==='vault'?id:id.slice(2);
  const storeOf=kind=>kind==='vault'?META_STORE:kind==='appliance'?DB_STORE:ACCOUNTS_STORE;
  const connectionClient=()=>window.AppsPasskeyAuth?.create({
    baseUrl:MONITOR,sessionStoreKey:'app-monitor.admin-session.v2',failureStoreKey:'app-monitor.auth-failures.v2'
  });

  function indication(){
    if(!navigator.onLine)return {label:'Offline',tone:'pending',detail:'Records on this device remain available. Sync resumes when online.'};
    if(state.busy)return {label:'Syncing…',tone:'pending',detail:'Checking for record changes and missing attachments.'};
    if(state.migration&&state.connected)return {label:'Archive migration needed',tone:'pending',detail:'Unlock the existing archive once to bring its records into automatic sync.'};
    if(state.error)return {label:'Sync needs attention',tone:'error',detail:state.error};
    if(!state.connected)return {label:'Connect sync',tone:'idle',detail:'Sign in once to sync your appliances, photos and receipts.'};
    if(state.pending||!state.verified)return {label:'Sync pending',tone:'pending',detail:'Checking private cloud records.'};
    return {label:'Synced',tone:'ok',detail:'Records and original attachments are available here and in private cloud storage.'};
  }
  function panel(){
    const status=indication(),disabled=(!navigator.onLine||state.busy)?'disabled':'';
    const connect=state.connected
      ?'<p class="cloud-hint">Connected with '+esc(state.method==='passkey'?'your App Monitor passkey':'your Firebase account')+'. Sync runs while the app is open and online.</p>'
      :`<div class="cloud-form"><button class="btn btn-dark" data-action="cloud-passkey" ${disabled}>Connect with existing passkey</button>
       <details class="cloud-fallback"><summary>Or use existing Firebase login</summary>
       <div class="field"><label for="cloud-email">Email</label><input id="cloud-email" class="input" type="email" autocomplete="username" value="${esc(localStorage.getItem('we-cloud-email')||'')}"></div>
       <div class="field"><label for="cloud-password">Password</label><input id="cloud-password" class="input" type="password" autocomplete="current-password"></div>
       <button class="btn btn-line" data-action="cloud-login" ${disabled}>Connect with Firebase</button></details></div>`;
    const migration=state.connected&&state.migration?`<div class="cloud-form">
      <label for="cloud-passphrase">Original archive passphrase</label><input class="input" type="password" id="cloud-passphrase" autocomplete="off">
      <button class="btn btn-dark" data-action="cloud-migrate" ${disabled}>Unlock and migrate archive</button>
      <p class="cloud-hint">Required once for the existing encrypted data. Automatic sync then uses your sign-in. ${esc(state.error)}</p></div>`:'';
    const recovery=state.connected?`<details id="cloud-export"><summary>Historical encrypted recovery archives</summary>
      <p class="cloud-hint">These archives use their original passphrase. Download a copy to recover it separately.</p>
      <button class="btn btn-line" data-action="cloud-export-list" ${disabled}>List cloud archives</button>
      ${state.archives.map(a=>`<div><span>${esc(new Date(a.created).toLocaleString('en-GB'))}</span>
      <button class="btn btn-line btn-sm" data-action="cloud-export" data-id="${esc(a.id)}" ${disabled}>Download recovery ZIP</button></div>`).join('')}
      </details><details class="cloud-fallback"><summary>Connection settings</summary>
      <button type="button" class="btn btn-ghost btn-sm" data-action="cloud-logout">Disconnect this device</button></details>`:'';
    return `<section class="cloud-panel"><div class="cloud-head"><span class="cloud-symbol">☁</span><div><h3>Cloud sync</h3>
      <p class="cloud-status" role="status"><strong>${esc(status.label)}</strong> · ${esc(status.detail)}</p></div></div>
      ${connect}${migration}${recovery}<details id="sync-debug"><summary>Sync diagnostics</summary>
      <pre style="white-space:pre-wrap">${esc(trace.join('\n'))}</pre></details></section>`;
  }
  function banner(){
    const {label,tone,detail}=indication();
    return `<button type="button" class="sync-indicator" data-tone="${tone}" data-action="settings"
      aria-label="Cloud sync: ${esc(label)}. Open sync settings" title="${esc(detail)}">${esc(label)}</button>`;
  }
  function redraw(){
    const target=document.getElementById('cloud-ui');
    if(target){
      const open=['sync-debug','cloud-export'].filter(id=>document.getElementById(id)?.open);
      if(!target.contains(document.activeElement)||!document.activeElement.matches('input')){
        target.innerHTML=panel();
        for(const id of open){const details=document.getElementById(id);if(details)details.open=true;}
      }
    }
    const node=document.getElementById('we-cloud-banner');
    if(node)node.innerHTML=banner();
  }
  function mark(message){
    trace.push(new Date().toISOString()+' '+message);
    if(trace.length>25)trace.shift();
  }
  async function jsonResponse(response){
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(String(data?.error?.message||data?.error||'HTTP '+response.status));
    return data;
  }

  async function deviceKey(){
    const existing=await storeAction(META_STORE,'readonly',store=>store.get('cloudDeviceKey'));
    if(existing?.key)return existing.key;
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    try{await storeAction(META_STORE,'readwrite',store=>store.add({id:'cloudDeviceKey',key}));}
    catch(error){if(error?.name!=='ConstraintError')throw error;}
    return (await storeAction(META_STORE,'readonly',store=>store.get('cloudDeviceKey'))).key;
  }
  async function rememberFirebase(){
    const iv=crypto.getRandomValues(new Uint8Array(12)),key=await deviceKey();
    const bytes=new TextEncoder().encode(JSON.stringify({method:'firebase',email:state.email,refresh:state.refresh}));
    const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,
      additionalData:new TextEncoder().encode('WarrantyEase:cloudSession:v2')},key,bytes);
    await storeAction(META_STORE,'readwrite',store=>store.put({id:'cloudConnection',version:2,iv:[...iv],ciphertext:[...new Uint8Array(ciphertext)]}));
  }
  async function readConnection(id){
    const saved=await storeAction(META_STORE,'readonly',store=>store.get(id));
    if(!saved)return null;
    const key=await storeAction(META_STORE,'readonly',store=>store.get('cloudDeviceKey'));
    if(!key?.key)return null;
    try{
      const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(saved.iv),
        additionalData:new TextEncoder().encode('WarrantyEase:cloudSession:v'+saved.version)},
        key.key,new Uint8Array(saved.ciphertext));
      return JSON.parse(new TextDecoder().decode(data));
    }catch{return null;}
  }
  async function firebaseToken(){
    if(state.expires>Date.now()+60000)return state.token;
    const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_KEY)}`,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({grant_type:'refresh_token',refresh_token:state.refresh})
    });
    if([400,401,403].includes(response.status))state.connected=false;
    const data=await jsonResponse(response);
    if(data.user_id!==OWNER_UID)throw Error('Firebase account does not match the warranty owner.');
    Object.assign(state,{token:data.id_token,expires:Date.now()+(+data.expires_in||3600)*1000});
    if(data.refresh_token&&data.refresh_token!==state.refresh){
      state.refresh=data.refresh_token;
      await rememberFirebase();
    }
    return state.token;
  }
  async function authorised(url,options={}){
    if(!state.connected)throw Error('Sign in to access private Warranty Ease storage.');
    const generation=state.connection;
    const auth=state.method==='passkey'?state.passkeyClient.authHeaders():{Authorization:'Bearer '+await firebaseToken()};
    const response=await fetch(url,{...options,signal:AbortSignal.timeout?.(90000),
      headers:{...options.headers,...auth},cache:'no-store'});
    if(response.status===401&&generation===state.connection){
      state.connected=false;
      throw Error('Your sign-in expired. Connect again to resume automatic sync.');
    }
    return response;
  }

  async function passkeyLogin(interactive){
    const client=connectionClient();
    if(!client){if(interactive)throw Error('The shared passkey library is unavailable. Reload or use the Firebase fallback.');return false;}
    const retained=client.restoreSession();
    if(interactive||retained||localStorage.getItem('app-monitor.admin-session.v2')){
      let session=await client.validateSession();
      if(interactive&&session?.method!=='passkey'){await client.passkeyLogin();session=await client.validateSession();}
      if(session?.method==='passkey'){
        Object.assign(state,{method:'passkey',passkeyClient:client,connected:true,error:''});
        return true;
      }
    }
    return false;
  }
  async function firebaseLogin(email,password){
    if(!email||!password)throw Error('Enter your Firebase email and password.');
    const data=await jsonResponse(await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_KEY)}`,{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})
    }));
    if(data.localId!==OWNER_UID)throw Error('This Firebase account is not the warranty owner.');
    Object.assign(state,{method:'firebase',email,token:data.idToken,refresh:data.refreshToken,
      expires:Date.now()+Number(data.expiresIn||3600)*1000,connected:true,error:''});
    localStorage.setItem('we-cloud-email',email);
    await rememberFirebase();
  }

  function snapshotStamp(row){
    return JSON.stringify(row,(_key,value)=>value instanceof Blob
      ?{size:value.size,type:value.type}:value instanceof ArrayBuffer?{bytes:value.byteLength}:value);
  }
  async function localSnapshot({migrating=false}={}){
    await ensureStorage();
    const [rows,accounts,baseRows,vault,tombstoneRow]=await new Promise((resolve,reject)=>{
      const tx=db.transaction([DB_STORE,ACCOUNTS_STORE,META_STORE],'readonly');
      const meta=tx.objectStore(META_STORE);
      const requests=[tx.objectStore(DB_STORE).getAll(),tx.objectStore(ACCOUNTS_STORE).getAll(),
        meta.getAll(IDBKeyRange.bound('weSyncBase:','weSyncBase;',false,true)),meta.get('vault'),meta.get('syncTombstones')];
      tx.oncomplete=()=>resolve(requests.map(r=>r.result));
      tx.onabort=()=>reject(tx.error||Error('Local sync read interrupted.'));
    });
    const records=new Map(),raw=new Map(),bases=new Map(),unresolved=new Map();
    for(const item of baseRows)bases.set(item.record.id,item);
    const add=(kind,value,original)=>{
      const id=recordId(kind,value.id);raw.set(id,original);
      records.set(id,{id,version:2,kind,deleted:false,value});
    };
    for(const row of rows){
      const value={...row,files:[]};
      for(const file of row.files||[]){
        const {blob,previewBlob,originalBytes,previewBytes,...ref}=file;
        for(const [field,source,bytes] of [['originalHash',blob,originalBytes],['previewHash',previewBlob,previewBytes]]){
          if(!hashValid(ref[field])){
            const data=bytes instanceof ArrayBuffer?new Blob([bytes]):source;
            if(data instanceof Blob&&data.size){
              try{ref[field]=await saveEvidence(data);}
              catch(error){if(!['NotFoundError','NotReadableError'].includes(error.name))throw error;}
            }
          }
          if(!hashValid(ref[field]))delete ref[field];
        }
        if(!ref.originalHash||migrating&&!await hasStoredEvidence(ref.originalHash)){
          unresolved.set(row.id,[...(unresolved.get(row.id)||[]),file.id]);
        }
        value.files.push(ref);
      }
      value.files.sort((a,b)=>a.id.localeCompare(b.id));
      add('appliance',value,row);
    }
    for(const row of accounts)add('account',row,row);
    if(vault)add('vault',vault,vault);
    const tombstones=new Map();
    for(const item of tombstoneRow?.items||[]){
      const id=recordId(item.kind,item.id),live=records.get(id);
      tombstones.set(id,item.deletedAt);
      if(!live||item.deletedAt>=(live.value.updatedAt||'')){
        records.set(id,{id,version:2,kind:item.kind,deleted:true,value:null,deletedAt:item.deletedAt});
        if(item.kind==='appliance')unresolved.delete(item.id);
      }
    }
    return {records,raw,bases,tombstones,unresolved};
  }
  async function commitLocal(snapshot,id,record,etag,active){
    const {raw,bases,tombstones}=snapshot,kind=kindOf(id),key=keyOf(id);
    const name=storeOf(kind),baseKey='weSyncBase:'+id;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction([...new Set([name,META_STORE])],'readwrite');
      const store=tx.objectStore(name),meta=tx.objectStore(META_STORE);
      const row=store.get(key),previous=meta.get(baseKey),deletions=meta.get('syncTombstones');
      let applied=false;
      deletions.onsuccess=()=>{
        const items=deletions.result?.items||[];
        const gone=items.find(item=>item.id===key&&item.kind===kind)?.deletedAt;
        if(!active()||snapshotStamp(row.result)!==snapshotStamp(raw.get(id))||
           previous.result?.etag!==bases.get(id)?.etag||gone!==tombstones.get(id))return;
        if(record.deleted){
          store.delete(key);
          meta.put({id:'syncTombstones',items:[...items.filter(item=>item.id!==key||item.kind!==kind),
            {id:key,kind,deletedAt:record.deletedAt}]});
        }else if(!same(snapshot.records.get(id),record)||snapshotStamp(raw.get(id))!==snapshotStamp(record.value)){
          store.put(record.value);
        }
        meta.put({id:baseKey,record,etag});
        applied=true;
      };
      tx.oncomplete=()=>resolve(applied);
      tx.onabort=()=>reject(tx.error||Error('Local sync write interrupted.'));
    });
  }
  async function localBlob(hash){
    const response=await evidenceResponse(hash);
    if(!response)return null;
    try{
      const blob=await response.blob();
      if(!blob.size)return null;
      await blob.slice(0,1).arrayBuffer();
      return blob;
    }catch(error){
      if(!['NotFoundError','NotReadableError'].includes(error.name))throw error;
      return null;
    }
  }
  async function archives({all=false}={}){
    const items=[];let offset=0;
    do{
      const result=await jsonResponse(await authorised(V1+'/backups'+(offset?'?offset='+offset:'')));
      if(!Array.isArray(result.backups))throw Error('Invalid legacy archive listing.');
      items.push(...result.backups);
      offset=all?result.nextOffset:null;
    }while(offset);
    return items;
  }
  async function encryptedArchive(item){
    const transfer=window.WarrantyCloudChunks;
    const blob=await transfer.download(item.id,{send:(path,options)=>authorised(V1+path,options)});
    if(item.sha256&&await transfer.digest(await blob.arrayBuffer())!==item.sha256)throw Error('Historical archive integrity check failed.');
    return blob;
  }
  async function prepareMigration(active){
    const status=await jsonResponse(await authorised(V2+'/migration'));
    if(status.completed)return null;
    const [latest]=await archives();
    const head=latest?.id||'';
    if(!head)return {head};
    const marker=await storeAction(META_STORE,'readonly',store=>store.get('weLegacySeed'));
    if(marker?.archiveId===head)return {head};
    const pass=state.passphrase||(await readConnection('cloudSession'))?.passphrase;
    if(!pass){state.migration=true;return null;}
    mark('Opening latest legacy archive for one-time migration');
    try{
      const zip=await decryptBackupBlob(await encryptedArchive(latest),pass);
      if(!active())return false;
      await refresh();
      if(!active()||!await applyRestoredZip(zip,{automatic:true,canApply:active}))return false;
      await storeAction(META_STORE,'readwrite',store=>store.put({id:'weLegacySeed',archiveId:head}));
      return {head};
    }catch(error){
      if(error.code==='WE_ARCHIVE_UNLOCK'){state.migration=true;state.passphrase='';}
      throw error;
    }
  }
  async function repairLegacyReferences(snapshot,active){
    if(!snapshot.unresolved.size)return;
    // Pre-v1 records can retain only attachment metadata after iOS evicts a
    // Blob. Recover exact record/file matches without merging older state.
    const pass=state.passphrase||(await readConnection('cloudSession'))?.passphrase;
    if(pass){
      const repair=async blob=>{
        const zip=await decryptBackupBlob(blob,pass),entries=await readZip(zip,{asBytes:true});
        const manifest=JSON.parse(decoder.decode(entries.get('warranty-ease-backup.json')));
        for(const row of manifest.records||[]){
          const missing=snapshot.unresolved.get(row.id);
          const local=snapshot.records.get(recordId('appliance',row.id))?.value;
          if(!missing||!local)continue;
          for(const file of row.files||[]){
            if(!missing.includes(file.id)||!entries.has(file.path))continue;
            const current=local.files.find(f=>f.id===file.id);
            if(file.name!==current.name||file.mime!==current.mime)continue;
            const bytes=await recoverEvidenceBytes(entries.get(file.path),file.path,file.mime);
            if(!bytes)continue;
            const blob=new Blob([bytes],{type:file.mime}),digest=await window.WarrantyCloudChunks.digest(bytes);
            if(current.originalHash&&current.originalHash!==digest)continue;
            current.originalHash=await saveEvidence(blob);
            missing.splice(missing.indexOf(file.id),1);
          }
          if(!missing.length)snapshot.unresolved.delete(row.id);
        }
      };
      const copies=await storeAction(DEVICE_BACKUPS_STORE,'readonly',store=>store.getAll());
      for(const item of copies.sort((a,b)=>String(b.at).localeCompare(String(a.at)))){
        if(!active()||!snapshot.unresolved.size)return;
        try{await repair(item.blob);}catch{mark('An encrypted device archive could not repair legacy evidence');}
      }
      for(const item of await archives({all:true})){
        if(!active()||!snapshot.unresolved.size)return;
        try{await repair(await encryptedArchive(item));}catch{mark('A historical archive could not repair legacy evidence');}
      }
    }
    // A second device may already have migrated this attachment. Adopt its
    // recorded hash for an otherwise matching legacy reference.
    if(snapshot.unresolved.size)mark('Some legacy evidence requires matching cloud records');
  }

  function retry(delay){
    clearTimeout(state.timer);
    if(state.connected&&navigator.onLine)state.timer=setTimeout(()=>{void syncNow().catch(()=>{});},delay);
  }
  function syncNow(){
    if(state.session)return state.session;
    if(!state.connected||!navigator.onLine||editing())return Promise.resolve(false);
    const revision=state.revision,generation=state.connection;
    const active=()=>state.connected&&generation===state.connection&&revision===state.revision&&navigator.onLine&&!editing();
    const run=async()=>{
      if(!active())return false;
      let completed=false;
      state.busy=true;state.error='';state.verified=false;state.migration=false;redraw();
      try{
        const migration=await prepareMigration(active);
        if(state.migration||migration===false)return false;
        if(!active())return false;
        const snapshot=await localSnapshot({migrating:!!migration});
        if(snapshot.unresolved.size)await repairLegacyReferences(snapshot,active);
        if(!active())return false;
        if(migration)state.refreshNeeded=true;
        const ok=await reconcile({
          send:(path,options)=>authorised(V2+path,options),localRecords:snapshot.records,bases:snapshot.bases,
          localBlob,hasLocalBlob:hasStoredEvidence,
          async saveBlob(hash,blob){await saveEvidence(blob,hash);state.refreshNeeded=true;},
          async commit(id,record,etag){
            if(!await commitLocal(snapshot,id,record,etag,active))return false;
            if(!same(snapshot.records.get(id),record))state.refreshNeeded=true;
            return true;
          },
          active
        });
        if(!ok||!active()){retry(1000);return false;}
        if(migration){
          await jsonResponse(await authorised(V2+'/migration',{method:'PUT',headers:{'X-Warranty-Legacy-Head':migration.head}}));
          mark('Legacy migration verified');
        }
        state.passphrase='';
        completed=true;
        state.retry=5000;
        mark('Incremental sync complete');
      }catch(error){
        state.error=error.message||'Private cloud sync failed.';
        mark('Sync will retry after a storage, connection or sign-in error');
        if(!state.migration){retry(state.retry);state.retry=Math.min(state.retry*2,60000);}
        throw error;
      }finally{
        if(state.refreshNeeded&&!editing()){
          try{
            await refresh();
            state.refreshNeeded=false;
            if(!modalKind&&currentView==='notes')renderFollowUps();
            else if(!modalKind&&currentView==='logins')renderLogins();
            else if(!modalKind&&currentView==='home')renderHome();
          }catch(error){state.verified=false;state.error=error.message;retry(state.retry);}
        }
        state.verified=completed&&active()&&!state.refreshNeeded;
        state.pending=!state.verified;
        state.busy=false;redraw();
      }
      return state.verified;
    };
    state.session=(navigator.locks?.request?navigator.locks.request('warranty-ease-sync',run):run())
      .finally(()=>{state.session=null;});
    return state.session;
  }
  function scheduleUpload(){
    state.revision++;
    state.pending=true;
    retry(700);redraw();
  }
  async function start(){
    if(state.starting)return state.starting;
    if(!navigator.onLine||localStorage.getItem(disconnectKey)==='1')return;
    state.starting=(async()=>{
      if(!state.connected){
        const saved=await readConnection('cloudConnection')||await readConnection('cloudSession');
        if(!await passkeyLogin(false)&&saved?.method==='firebase'&&saved.refresh){
          Object.assign(state,{method:'firebase',email:saved.email,refresh:saved.refresh,connected:true});
          await firebaseToken();
          if(!await readConnection('cloudConnection'))await rememberFirebase();
        }
      }
      if(state.connected)await syncNow();
    })();
    try{await state.starting;}finally{state.starting=null;redraw();}
  }
  async function handle(action,id){
    try{
      if(action==='cloud-logout'){
        state.connection++;
        localStorage.setItem(disconnectKey,'1');
        clearTimeout(state.timer);
        Object.assign(state,{connected:false,method:'',token:'',refresh:'',expires:0,passkeyClient:null,
          passphrase:'',migration:false,verified:false,error:'',archives:[]});
        await storeAction(META_STORE,'readwrite',store=>store.delete('cloudConnection'));
      }else if(action==='cloud-passkey'){
        if(!await passkeyLogin(true))throw Error('A verified owner passkey session is required.');
        localStorage.removeItem(disconnectKey);
        await syncNow();
      }else if(action==='cloud-login'){
        const email=document.getElementById('cloud-email')?.value.trim(),password=document.getElementById('cloud-password')?.value;
        await firebaseLogin(email,password);
        localStorage.removeItem(disconnectKey);
        await syncNow();
      }else if(action==='cloud-migrate'){
        const pass=document.getElementById('cloud-passphrase')?.value;
        if(!pass)throw Error('Enter the original archive passphrase.');
        state.passphrase=pass;
        await syncNow();
      }else if(action==='cloud-export-list'){
        state.archives=await archives({all:true});
      }else if(action==='cloud-export'){
        const item=state.archives.find(archive=>archive.id===id);
        if(!item)throw Error('List the historical archives first.');
        const blob=await encryptedArchive(item);
        const zip=await buildZip([{name:'READ_ME_FIRST.txt',data:ARCHIVE_HELP},{name:'RECOVER.html',data:RECOVERY_HTML},{name:'backup.encrypted',data:blob}]);
        downloadBlob(zip,'WarrantyEase-cloud-recovery-'+id+'.zip');
      }
    }catch(error){state.error=error.message||'Cloud service unavailable.';toast(state.error);}
    finally{redraw();}
  }
  async function fetchManufacturerPhoto(id){
    if(!/^(lg-f4y511wwla1|lg-rhx1009nwk|tcl-65c8l)$/.test(id))throw Error('Manufacturer photo not available for this model.');
    const response=await authorised(V1+'/product-photos/'+encodeURIComponent(id));
    if(!response.ok)await jsonResponse(response);
    const mime=(response.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
    if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('Manufacturer returned an unsupported photo.');
    const blob=await response.blob();
    if(!blob.size||blob.size>8*1024*1024)throw Error('Manufacturer photo is empty or too large.');
    return blob;
  }
  const resume=()=>{void start().catch(error=>{state.error=error.message;redraw();});};
  addEventListener('online',resume);
  addEventListener('offline',redraw);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)resume();});
  setInterval(()=>{if(!document.hidden&&navigator.onLine)resume();},60000);
  return {panel,banner,redraw,handle,scheduleUpload,fetchManufacturerPhoto,start,syncNow,
    status:()=>({connected:state.connected,method:state.method,error:state.error,needsSync:state.pending,migration:state.migration,verified:state.verified})};
})();
