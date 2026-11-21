/* Warranty Ease cloud transport v0.9 — verified automatic encrypted sync.
   Records/receipts/OCR and password-vault plaintext never leave the browser.
   Supports existing App Monitor passkey, or kk-syllabus Firebase login as fallback.
   Preserve local evidence and historical encrypted cloud versions without a manual backup flow. */
'use strict';
window.WarrantyCloud=(()=>{
  const API='https://warranty-ease-api.nirav2000-github.workers.dev/v1';
  const FIREBASE_KEY='AIzaSyDrreK9rhsoOpIYNr4QeNZ7CsXgQiMPW0E';
  const OWNER_UID='2AJSfYdtg5URWHv7HCzpNMmKIlg2';
  const FIRESTORE='https://firestore.googleapis.com/v1/projects/kk-syllabus/databases/(default)/documents';
  const MONITOR='https://apps-monitor-api.nirav2000-github.workers.dev/app-monitor';
  const SESSION_KEY='app-monitor.admin-session.v2';
  const state={token:'',refresh:'',expires:0,passphrase:'',email:'',uid:'',method:'',passkeyClient:null,
    lastCloudCopy:'',lastBackupId:'',knownLatestId:'',busy:false,backups:[],error:'',connected:false,
    pendingRestore:false,remoteChanged:false,autoTimer:0,lastCheck:0,needsSync:false,uploading:false,cloudOriginals:0,
    syncPromise:null,starting:null,retryTimer:0,retryDelay:5000,checkpointTimer:0,deviceCopies:0,lastDeviceCopy:'',
    syncRevision:0,uploadedRevision:0,resyncWanted:false,remembered:false,liveTimer:0,deviceEntries:[],cachedCloudId:'',verified:false,repairing:false,initialReconciled:false};
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=x=>x?new Date(x).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not yet';
  const size=x=>x<1e6?`${Math.round(x/1024)} KB`:`${(x/1048576).toFixed(1)} MB`;
  const localCount=()=>{try{return (appliances?.length||0)+(websiteAccounts?.length||0)}catch{return 0}};
  const latest=()=>state.backups[0];
  const missingOriginals=()=>{try{return appliances.flatMap(r=>(r.files||[]).filter(f=>!(f.blob instanceof Blob)||f.blob.size===0).map(f=>({record:r.id,file:f.id})));}catch{return []}};
  function indication(){
    const missing=missingOriginals().length;
    if(!navigator.onLine)return {label:'Offline',tone:'pending',detail:'Your local records remain available. Changes will reconcile when online.'};
    if(state.busy||state.repairing)return {label:'Syncing…',tone:'pending',detail:missing?'Repairing missing originals.':'Reconciling encrypted cloud and local records.'};
    if(state.error)return {label:'Sync needs attention',tone:'error',detail:state.error};
    if(!state.connected)return {label:'Connect sync',tone:'idle',detail:'Connect once to automatically protect and synchronise your appliances, pictures and receipts.'};
    if(state.busy||state.repairing||state.needsSync||missing||!state.verified||state.cachedCloudId!==state.lastBackupId){
      return {label:missing?'Repairing photos…':'Syncing…',tone:'pending',detail:missing?'Checking encrypted cloud history for '+missing+' missing original file(s).':'Checking that every local file and the newest encrypted cloud copy are in sync.'};
    }
    return {label:'Synced',tone:'ok',detail:'Appliances, original photos and receipts are saved here and in your private encrypted cloud copy.'};
  }
  function panel(){
    const status=indication(),online=navigator.onLine;
    const form=!state.connected?`<div class="cloud-form">
      <div class="field"><label for="cloud-passphrase">Private encryption passphrase</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off" placeholder="Your existing cloud passphrase (12+ characters)"></div>
      <button class="btn btn-dark" data-action="cloud-passkey" ${!online||state.busy?'disabled':''}>Connect with existing passkey</button>
      <details class="cloud-fallback"><summary>Or use existing Firebase login</summary>
        <div class="field"><label for="cloud-email">Email</label><input id="cloud-email" class="input" type="email" autocomplete="username" value="${esc(localStorage.getItem('we-cloud-email')||'')}"></div>
        <div class="field"><label for="cloud-password">Password</label><input id="cloud-password" class="input" type="password" autocomplete="current-password"></div>
        <button class="btn btn-line" data-action="cloud-login" ${!online||state.busy?'disabled':''}>Connect with Firebase</button>
      </details>
      <p class="cloud-hint">One-time connection. Future visits use the remembered encrypted session when it is still valid.</p>
    </div>`:`<p class="cloud-hint">Connected as ${esc(state.email||'your existing account')}. Sync runs automatically whenever this app is open and online.</p>
      <details class="cloud-fallback"><summary>Connection settings</summary><button type="button" class="btn btn-ghost btn-sm" data-action="cloud-logout">Disconnect this device</button></details>`;
    return `<section class="cloud-panel"><div class="cloud-head"><span class="cloud-symbol">☁</span><div><h3>Cloud sync</h3><p class="cloud-status" role="status"><strong>${esc(status.label)}</strong> · ${esc(status.detail)}</p></div></div>${form}</section>`;
  }
  function banner(){
    const status=indication();
    return '<button type="button" class="sync-indicator" data-tone="'+status.tone+'" data-action="settings" aria-label="Cloud sync: '+esc(status.label)+'. Open sync settings" title="'+esc(status.detail)+'">'+esc(status.label)+'</button>';
  }
  function redraw(){const target=document.getElementById('cloud-ui');if(target)target.innerHTML=panel();const bannerNode=document.getElementById('we-cloud-banner');if(bannerNode)bannerNode.innerHTML=banner();}
  async function jsonResponse(response){const d=await response.json().catch(()=>({}));if(!response.ok)throw new Error(String(d?.error?.message||d?.error||d?.message||`HTTP ${response.status}`));return d;}
  async function requestFirebaseToken(){
    if(state.expires>Date.now()+60e3)return state.token;
    const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_KEY)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:state.refresh})});
    const x=await jsonResponse(response);if(x.user_id!==OWNER_UID)throw Error('Firebase account does not match the warranty owner.');
    state.token=x.id_token;state.refresh=x.refresh_token||state.refresh;state.expires=Date.now()+(+x.expires_in||3600)*1000;
    if(state.remembered)void rememberConnection().catch(()=>{});
    return state.token;
  }
  async function authorised(url,options={}){
    let auth={};
    if(state.method==='passkey'){
      if(!state.passkeyClient)throw Error('App Monitor passkey session is not available. Connect again.');
      const session=await state.passkeyClient.validateSession();
      if(session?.method!=='passkey'){
        state.connected=false;state.method='';
        throw Error('Passkey session expired. Unlock again to resume automatic sync.');
      }
      auth=state.passkeyClient.authHeaders();
    }else if(state.method==='firebase')auth={Authorization:`Bearer ${await requestFirebaseToken()}`};
    else throw Error('Connect to encrypted cloud backup first.');
    return fetch(url,{...options,headers:{...(options.headers||{}),...auth},cache:'no-store'});
  }

  // A trusted-device convenience: credentials are encrypted with a non-extractable
  // device key before IndexedDB persistence. This is NOT an XSS barrier on
  // a shared browser origin. Never store credentials in public repos or telemetry.
  async function deviceKey(){
    let entry=await storeAction(META_STORE,'readonly',tx=>tx.get('cloudDeviceKey'));
    if(entry?.key)return entry.key;
    const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    await storeAction(META_STORE,'readwrite',tx=>tx.put({id:'cloudDeviceKey',key}));
    entry=await storeAction(META_STORE,'readonly',tx=>tx.get('cloudDeviceKey'));
    return entry.key;
  }
  async function rememberConnection(){
    if(!state.passphrase||!['firebase','passkey'].includes(state.method))return;
    const iv=crypto.getRandomValues(new Uint8Array(12)),key=await deviceKey();
    const payload=JSON.stringify({method:state.method,passphrase:state.passphrase,
      email:state.method==='firebase'?state.email:'',refresh:state.method==='firebase'?state.refresh:''});
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('WarrantyEase:cloudSession:v1')},key,new TextEncoder().encode(payload));
    await storeAction(META_STORE,'readwrite',tx=>tx.put({id:'cloudSession',version:1,iv:[...iv],ciphertext:[...new Uint8Array(encrypted)]}));
    state.remembered=true;
  }
  async function readRemembered(){
    const saved=await storeAction(META_STORE,'readonly',tx=>tx.get('cloudSession'));
    if(!saved)return null;
    if(saved.version!==1||!Array.isArray(saved.iv)||!Array.isArray(saved.ciphertext))throw Error('Remembered cloud session is invalid.');
    const key=await deviceKey(),bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(saved.iv),
      additionalData:new TextEncoder().encode('WarrantyEase:cloudSession:v1')},key,new Uint8Array(saved.ciphertext));
    const entry=JSON.parse(new TextDecoder().decode(bytes));
    if(!['firebase','passkey'].includes(entry.method)||String(entry.passphrase||'').length<12)throw Error('Remembered cloud credentials are incomplete.');
    return entry;
  }
  async function forgetRemembered(){
    await storeAction(META_STORE,'readwrite',tx=>tx.delete('cloudSession'));
    state.remembered=false;
  }
  async function persistQueue(){
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(META_STORE,'readwrite'),st=tx.objectStore(META_STORE),req=st.get('cloudQueue');
      req.onsuccess=()=>st.put({id:'cloudQueue',revision:Math.max(Number(req.result?.revision)||0,state.syncRevision),
        uploaded:Math.max(Number(req.result?.uploaded)||0,state.uploadedRevision)});
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||Error('Cannot save pending edits'));
      tx.onabort=()=>reject(tx.error||Error('Pending edits interrupted'));
    });
  }
  async function saveCloudMarker(){
    await storeAction(META_STORE,'readwrite',tx=>tx.put({id:'lastCloudBackup',at:state.lastCloudCopy,
      archiveId:state.lastBackupId,originals:state.cloudOriginals}));
  }

  async function beforeCloudUse(){
    await syncNow({force:true});
    try{await rememberConnection()}
    catch(error){state.error='Sync connected, but this browser cannot remember credentials. Reconnect after reopening.';console.warn('Encrypted device session could not be saved:',error?.message||error)}
  }
  async function passkeyLogin(){
    const pass=document.getElementById('cloud-passphrase')?.value||state.passphrase;
    if(pass.length<12)throw Error('Enter your existing cloud encryption passphrase (12+ characters).');
    if(!window.AppsPasskeyAuth?.create)throw Error('The shared passkey library is unavailable. Reload or use the Firebase fallback.');
    state.busy=true;state.error='';redraw();
    try{
      const client=window.AppsPasskeyAuth.create({baseUrl:MONITOR,sessionStoreKey:SESSION_KEY,failureStoreKey:'app-monitor.auth-failures.v2'});
      client.restoreSession();let session=await client.validateSession();
      if(session?.method!=='passkey'){await client.passkeyLogin();session=await client.validateSession();}
      if(session?.method!=='passkey')throw Error('A verified administrator passkey session is required.');
      state.passkeyClient=client;state.method='passkey';state.uid=OWNER_UID;state.email='App Monitor passkey';state.connected=true;state.passphrase=pass;
      await beforeCloudUse();
    }catch(error){state.connected=false;state.error=error.message||'Cloud login unavailable.';throw error;}finally{state.busy=false;redraw();}
  }
  async function firebaseLogin(){
    const email=document.getElementById('cloud-email')?.value.trim()||'',pw=document.getElementById('cloud-password')?.value||'',pass=document.getElementById('cloud-passphrase')?.value||state.passphrase;
    if(!email||!pw)throw Error('Enter your Firebase email and password.');
    if(pass.length<12)throw Error('Enter your existing cloud encryption passphrase (12+ characters).');
    state.busy=true;state.error='';redraw();
    try{
      const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});
      const r=await jsonResponse(response);if(r.localId!==OWNER_UID)throw Error('This Firebase account is not the warranty owner.');
      Object.assign(state,{uid:r.localId,token:r.idToken,refresh:r.refreshToken,expires:Date.now()+Number(r.expiresIn||3600)*1000,email,passphrase:pass,connected:true,method:'firebase'});
      localStorage.setItem('we-cloud-email',email);await beforeCloudUse();
    }catch(error){state.connected=false;state.error=error.message||'Cloud login unavailable.';throw error;}finally{state.busy=false;redraw();}
  }
  function disconnect({quiet=false,forget=true}={}){
    if(state.autoTimer)clearTimeout(state.autoTimer);
    if(state.retryTimer)clearTimeout(state.retryTimer);
    if(state.checkpointTimer)clearTimeout(state.checkpointTimer);
    Object.assign(state,{token:'',refresh:'',expires:0,passphrase:'',email:'',uid:'',method:'',
      passkeyClient:null,connected:false,busy:false,autoTimer:0,retryTimer:0,checkpointTimer:0,
      backups:[],pendingRestore:false,error:'',remembered:false});
    // Disconnect ONLY Warranty Ease. Other apps may rely on App Monitor's passkey session.
    if(forget)void forgetRemembered().catch(()=>{});
    if(!quiet)redraw();
  }
  async function unlock(){const pass=document.getElementById('cloud-passphrase')?.value||state.passphrase;if(pass.length<12)throw Error('Enter your original cloud encryption passphrase.');state.passphrase=pass;state.error='';await syncNow({force:true});await rememberConnection();redraw();}
  async function writeIndex(id,sha,bytes){
    if(state.method!=='firebase')return; // Existing Firestore owner rules require Firebase ID token.
    const url=`${FIRESTORE}/warrantyEase/${encodeURIComponent(state.uid)}/snapshots/${encodeURIComponent(id)}`;
    const data={fields:{schema:{integerValue:'1'},ownerUid:{stringValue:state.uid},archiveId:{stringValue:id},sha256:{stringValue:sha},bytes:{integerValue:String(bytes)},savedAt:{timestampValue:new Date().toISOString()}}};
    const r=await authorised(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});await jsonResponse(r);
    // Log only aggregate operations — never the archive ID, serial number, photo name or user identity.
    window.FirebaseUsageMonitor?.write?.(1,'warranty-encrypted-backup-index','warranty-ease','kk-syllabus','(default)');
  }
  async function list({quiet=false}={}){
    if(!state.connected)throw Error('Connect to the cloud first.');
    if(!quiet){state.busy=true;state.error='';redraw();}
    try{
      const result=await jsonResponse(await authorised(`${API}/backups`));
      if(!Array.isArray(result.backups))throw Error('Unexpected cloud-backup response.');
      state.backups=result.backups.filter(b=>/^[A-Za-z0-9_-]{5,80}$/.test(b.id)).sort((a,b)=>String(b.created).localeCompare(String(a.created)));
      if(result.truncated)state.error='The backup history is extensive; only the newest available copies are shown.';
      const remote=latest();state.remoteChanged=!!remote&&remote.id!==state.lastBackupId;
      state.knownLatestId=remote?.id||'';state.lastCheck=Date.now();
    }finally{if(!quiet){state.busy=false;redraw();}}
  }
  const editing=()=>typeof modalKind!=='undefined'&&['editor','account'].includes(modalKind);
  async function saveDeviceCheckpoint(bytes){
    if(!bytes?.byteLength)return;
    const copies=(await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.getAll())||[]).filter(x=>x.id.startsWith('device-'));
    const sha=await window.WarrantyCloudChunks.digest(bytes),at=new Date().toISOString();
    if(Array.isArray(copies)&&copies.some(x=>x.sha===sha))return;
    const id='device-'+Date.now()+'-'+crypto.randomUUID();
    await storeAction(DEVICE_BACKUPS_STORE,'readwrite',st=>st.put({id,at,sha,
      blob:new Blob([bytes],{type:'application/octet-stream'}),bytes:bytes.byteLength}));
    const updated=await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.getAll());
    const sorted=(updated||[]).filter(x=>x.id.startsWith('device-')).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    for(const old of sorted.slice(3))await storeAction(DEVICE_BACKUPS_STORE,'readwrite',st=>st.delete(old.id));
    state.deviceCopies=Math.min(3,sorted.length);state.lastDeviceCopy=at;
    state.deviceEntries=sorted.slice(0,3).map(x=>({id:x.id,at:x.at,bytes:x.bytes}));
  }
  // A verified, opaque encrypted copy of the newest cloud archive is retained
  // in IndexedDB. It is never a public URL or an unencrypted copy of the photos.
  async function cacheLatestCloud(id,encrypted,created=''){
    if(!/^[A-Za-z0-9_-]{5,80}$/.test(id)||!(encrypted instanceof Blob)||!encrypted.size)throw Error('Invalid encrypted cloud copy.');
    const bytes=await encrypted.arrayBuffer();
    if(bytes.byteLength>window.WarrantyCloudChunks.MAX_TOTAL)throw Error('Cloud copy exceeds local storage protection limit.');
    if(new TextDecoder().decode(new Uint8Array(bytes,0,8))!=='WEASE02!')throw Error('Cloud copy is not encrypted.');
    const sha=await window.WarrantyCloudChunks.digest(bytes);
    const matching=state.backups.find(x=>x.id===id);
    if(matching?.sha256&&matching.sha256!==sha)throw Error('Cloud copy integrity check failed.');
    await storeAction(DEVICE_BACKUPS_STORE,'readwrite',st=>st.put({
      id:'cloud-current',archiveId:id,at:created||matching?.created||new Date().toISOString(),
      sha,blob:encrypted,bytes:bytes.byteLength
    }));
    state.cachedCloudId=id;
  }
  async function repairLocalOriginals(){
    let missing=missingOriginals().length;
    if(!missing)return false;
    state.repairing=true;redraw();
    try{
      const current=await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.get('cloud-current')).catch(()=>null);
      const older=await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.getAll()).catch(()=>[]);
      const copies=[current,...(older||[]).filter(x=>x.id!=='cloud-current').sort((a,b)=>String(b.at).localeCompare(String(a.at)))].filter(Boolean);
      for(const copy of copies){
        if(!missing)break;
        if(!(copy.blob instanceof Blob)||!copy.blob.size)continue;
        try{
          const actual=await window.WarrantyCloudChunks.digest(await copy.blob.arrayBuffer());
          if(actual!==copy.sha)continue;
          const zip=await decryptBackupBlob(copy.blob,state.passphrase);
          await applyRestoredZip(zip,{automatic:true});
          missing=missingOriginals().length;
        }catch(error){console.warn('Previous encrypted device copy could not repair originals:',error?.name||'invalid');}
      }
      return !missing;
    }finally{state.repairing=false;redraw();}
  }
  function queueDeviceCheckpoint(){
    if(state.checkpointTimer)clearTimeout(state.checkpointTimer);
    if(!state.passphrase||!localCount()||typeof DEVICE_BACKUPS_STORE==='undefined')return;
    state.checkpointTimer=setTimeout(async()=>{
      state.checkpointTimer=0;
      if(state.uploading||editing()){queueDeviceCheckpoint();return}
      try{
        const raw=await createRawBackupZip();
        const blob=await encryptBackupBytes(new Uint8Array(await raw.arrayBuffer()),state.passphrase);
        await saveDeviceCheckpoint(new Uint8Array(await blob.arrayBuffer()));
      }catch(error){console.warn('Device checkpoint unavailable:',error?.message||error)}
      redraw();
    },9000);
  }
  async function uploadCurrent(){
    if(!state.connected||!state.passphrase)throw Error('Unlock cloud encryption first.');
    if(state.uploading)return;
    state.uploading=true;
    const revision=state.syncRevision;
    try{
      if(!navigator.onLine)throw Error('Offline: your local edits will sync when connected.');
      // Refuse to publish a stale snapshot if another device wrote after our merge.
      const earlier=latest()?.id||'';
      await list({quiet:true});
      if((latest()?.id||'')!==earlier)throw Error('A new cloud copy arrived during sync; retrying a safe merge.');
      const raw=await createRawBackupZip();
      const encrypted=await encryptBackupBytes(new Uint8Array(await raw.arrayBuffer()),state.passphrase);
      const bytes=await encrypted.arrayBuffer();
      const transfer=window.WarrantyCloudChunks;
      if(!transfer)throw Error('Encrypted transfer module is unavailable; reload the app.');
      if(bytes.byteLength>transfer.MAX_TOTAL)throw Error('Archive exceeds the 144 MB encrypted upload limit. Original data remains local.');
      const sha=await transfer.digest(bytes),id=crypto.randomUUID?.()||'archive-'+Date.now();
      if(bytes.byteLength>30*1048576){
        await transfer.upload(new Uint8Array(bytes),{id,send:(part,options)=>authorised(API+part,options),
          onProgress:({part,total})=>{state.error='Saving encrypted part '+part+' of '+total+'…';redraw()}});
      }else{
        const res=await authorised(API+'/backups/'+encodeURIComponent(id),{
          method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Warranty-Digest':sha},body:bytes});
        await jsonResponse(res);
      }
      // Verify the completed encrypted object is visible in R2 before declaring success.
      await list({quiet:true});
      const persisted=state.backups.find(x=>x.id===id);
      if(!persisted||persisted.sha256&&persisted.sha256!==sha)throw Error('Cloud upload is not yet verified. Your original files remain on this device.');
      state.lastCloudCopy=persisted.created||new Date().toISOString();
      state.lastBackupId=id;state.knownLatestId=id;
      state.cloudOriginals=appliances.reduce((n,r)=>n+(r.files||[]).filter(x=>x.blob instanceof Blob&&x.blob.size>0).length,0);
      state.uploadedRevision=Math.max(state.uploadedRevision,revision);
      state.needsSync=state.syncRevision>revision;
      await saveCloudMarker();
      await persistQueue();
      await cacheLatestCloud(id,new Blob([bytes],{type:'application/octet-stream'}),state.lastCloudCopy);
      if(state.checkpointTimer){clearTimeout(state.checkpointTimer);state.checkpointTimer=0;}
      try{await writeIndex(id,sha,bytes.byteLength)}catch(error){console.warn('Cloud stored; optional Firebase index not updated:',error?.name||'network')}
      state.error='';state.pendingRestore=false;
      if(state.needsSync)state.resyncWanted=true;
      return id;
    }finally{state.uploading=false}
  }
  function planRetry(){
    if(state.retryTimer)clearTimeout(state.retryTimer);
    if(!state.connected||!state.passphrase||!navigator.onLine)return;
    const wait=state.retryDelay;state.retryDelay=Math.min(wait*2,300000);
    state.retryTimer=setTimeout(()=>{state.retryTimer=0;syncNow().catch(()=>{})},wait);
  }
  async function syncNow({force=false}={}){
    if(state.syncPromise){if(state.needsSync)state.resyncWanted=true;return state.syncPromise;}
    if(!state.connected||!state.passphrase)throw Error('Connect once to enable automatic cloud synchronisation.');
    if(!navigator.onLine){state.verified=false;redraw();return;}
    if(editing()){state.resyncWanted=true;return;}
    state.syncPromise=(async()=>{
      state.busy=true;state.verified=false;state.error='';redraw();
      try{
        // Repair bytes from local encrypted cloud/history even if the R2 list
        // still points to the same archive as the last successful sync.
        if(missingOriginals().length)await repairLocalOriginals();
        await list({quiet:true});
        const remoteLatest=latest();
        if(!remoteLatest&&state.lastBackupId)throw Error('Cloud archive listing is unavailable; local originals remain intact.');
        const previousIndex=state.backups.findIndex(x=>x.id===state.lastBackupId);
        // Existing cloud snapshots are full archives. On a new device, merge
        // several recent heads to preserve possible concurrent offline branches.
        const pending=remoteLatest?(previousIndex>=0
          ?state.backups.slice(0,previousIndex).reverse()
          :state.backups.slice(0,Math.min(8,state.backups.length)).reverse()):[];
        const processed=new Set();let latestZip=null;
        for(const remote of pending){
          if(editing()){state.resyncWanted=true;return;}
          const encrypted=await getEncrypted(remote.id);
          const zip=await decryptBackupBlob(encrypted,state.passphrase);
          if(await applyRestoredZip(zip,{automatic:true})!==true)throw Error('Encrypted cloud merge did not complete.');
          processed.add(remote.id);
          if(remote.id===remoteLatest?.id){latestZip=zip;await cacheLatestCloud(remote.id,encrypted,remote.created);}
        }
        // Missing originals must not be treated as synchronized. Search older
        // immutable snapshots until restored or history is exhausted.
        if(missingOriginals().length){
          state.repairing=true;redraw();
          try{
            for(const remote of state.backups){
              if(!missingOriginals().length)break;
              if(processed.has(remote.id))continue;
              const encrypted=await getEncrypted(remote.id);
              const zip=await decryptBackupBlob(encrypted,state.passphrase);
              if(await applyRestoredZip(zip,{automatic:true})!==true)throw Error('Cloud evidence recovery was interrupted.');
              processed.add(remote.id);
              if(remote.id===remoteLatest?.id){latestZip=zip;await cacheLatestCloud(remote.id,encrypted,remote.created);}
            }
          }finally{state.repairing=false;redraw();}
        }
        const missing=missingOriginals().length;
        if(missing)throw Error(missing+' original file(s) are missing from this device and available cloud history. Keep other devices intact and reconnect the device holding those files.');
        // Always retain the latest verified encrypted cloud copy locally, even
        // if the user has not modified a record since the previous launch.
        if(remoteLatest&&(state.cachedCloudId!==remoteLatest.id||!state.initialReconciled||!localCount()&&!processed.has(remoteLatest.id))){
          const encrypted=await getEncrypted(remoteLatest.id);
          if(!processed.has(remoteLatest.id)){
            const zip=await decryptBackupBlob(encrypted,state.passphrase);
            if(await applyRestoredZip(zip,{automatic:true})!==true)throw Error('Cloud records could not be recovered.');
            latestZip=zip;
          }
          await cacheLatestCloud(remoteLatest.id,encrypted,remoteLatest.created);
        }
        if(remoteLatest){
          state.lastBackupId=remoteLatest.id;
          state.lastCloudCopy=remoteLatest.created||state.lastCloudCopy;
          state.knownLatestId=remoteLatest.id;
          await saveCloudMarker();
        }
        if(remoteLatest&&latestZip){
          if(typeof cloudManifestNeedsUpload!=='function')throw Error('Cloud reconciliation audit is not ready. Reload this app.');
          if(await cloudManifestNeedsUpload(latestZip)&&!state.needsSync){
            state.syncRevision=Math.max(state.syncRevision,state.uploadedRevision)+1;
            state.needsSync=true;
            await persistQueue();
          }
        }
        if(state.needsSync||force&&!remoteLatest&&localCount())await uploadCurrent();
        state.initialReconciled=true;
        if(missingOriginals().length)throw Error('Local originals changed during sync; retrying repair.');
        if(state.lastBackupId&&state.cachedCloudId!==state.lastBackupId)throw Error('Latest cloud copy is not yet safely cached on this device.');
        state.error='';state.pendingRestore=false;state.retryDelay=5000;state.verified=true;
      }catch(error){
        state.verified=false;
        state.error=String(error.message||'Automatic synchronisation failed.');
        state.pendingRestore=!!latest()&&state.lastBackupId!==latest()?.id;
        planRetry();throw error;
      }finally{state.busy=false;redraw();}
    })().finally(()=>{
      state.syncPromise=null;
      if(state.resyncWanted){
        state.resyncWanted=false;
        if(!editing()&&state.connected&&navigator.onLine)setTimeout(()=>syncNow().catch(()=>{}),2500);
      }
    });
    return state.syncPromise;
  }
  async function upload(){return syncNow({force:true})}
  async function getDeviceCopy(id){
    if(!/^device-[A-Za-z0-9-]{5,100}$/.test(id))throw Error('Invalid device recovery copy reference.');
    const saved=await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.get(id));
    if(!saved?.blob||!saved.blob.size)throw Error('This device recovery copy is missing.');
    const digest=await window.WarrantyCloudChunks.digest(await saved.blob.arrayBuffer());
    if(digest!==saved.sha)throw Error('This encrypted device recovery copy failed integrity verification.');
    return saved;
  }
  async function downloadDeviceCopy(id){
    const saved=await getDeviceCopy(id);
    const zip=await buildZip([{name:'READ_ME_FIRST.txt',data:ARCHIVE_HELP},{name:'RECOVER.html',data:RECOVERY_HTML},{name:'backup.encrypted',data:saved.blob}]);
    downloadBlob(zip,'WarrantyEase-device-recovery-'+id+'.zip');
  }
  async function restoreDeviceCopy(id){
    const saved=await getDeviceCopy(id),pass=state.passphrase||document.getElementById('cloud-passphrase')?.value||'';
    if(pass.length<12)throw Error('Enter your original cloud encryption passphrase first.');
    const zip=await decryptBackupBlob(saved.blob,pass);
    if(await applyRestoredZip(zip)){scheduleUpload();toast('Encrypted device records recovered safely.');}
  }

  async function getEncrypted(id){
    if(!/^[A-Za-z0-9_-]{5,80}$/.test(id))throw Error('Invalid cloud archive identifier.');
     const transfer=window.WarrantyCloudChunks;
     if(!transfer)throw Error('The encrypted cloud restore module is not installed. Reload the app.');
     return transfer.download(id,{send:(path,options)=>authorised(API+path,options),onProgress:({part,total})=>{state.error=`Checking encrypted parts ${part} of ${total}...`;redraw()}});
  }
  async function restore(id){
    if(!state.passphrase)throw Error('Enter the cloud encryption passphrase first.');
    state.busy=true;state.error='';redraw();
    try{
      const encrypted=await getEncrypted(id);
      const zip=await decryptBackupBlob(encrypted,state.passphrase);
      // applyRestoredZip asks for explicit confirmation, protects differing vault keys,
      // and merges incoming IDs without deleting unrelated local records.
      const applied=await applyRestoredZip(zip);
      if(applied!==true)return;
      state.lastBackupId=id;state.knownLatestId=id;state.pendingRestore=false;state.lastCloudCopy=state.backups.find(b=>b.id===id)?.created||new Date().toISOString();
      await storeAction(META_STORE,'readwrite',tx=>tx.put({id:'lastCloudBackup',archiveId:id,at:state.lastCloudCopy}));
      state.needsSync=false;state.error='';
      // A new merged snapshot also backs up any pre-existing local-only appliance records.
      scheduleUpload();
      toast('Cloud records restored to this device. They can now be used offline.');
    }finally{state.busy=false;redraw();}
  }
  async function download(id){state.busy=true;state.error='';redraw();try{const blob=await getEncrypted(id);const zipped=await buildZip([{name:'READ_ME_FIRST.txt',data:ARCHIVE_HELP},{name:'RECOVER.html',data:RECOVERY_HTML},{name:'backup.encrypted',data:blob}]);downloadBlob(zipped,`WarrantyEase-cloud-recovery-${id}.zip`)}finally{state.busy=false;redraw();}}

  // Private product reference import. Requires already verified shared App Monitor
  // passkey / Firebase owner token. Does not alter shared authentication services.
  async function fetchManufacturerPhoto(id){
    if(!state.connected)throw Error('Open Sync & privacy and connect with your existing App Monitor passkey first. You can still open the manufacturer product page without signing in.');
    if(!/^(lg-f4y511wwla1|lg-rhx1009nwk|tcl-65c8l)$/.test(id))throw Error('Manufacturer photo not available for this model.');
    const response=await authorised(`${API}/product-photos/${encodeURIComponent(id)}`);
    if(!response.ok){await jsonResponse(response);throw Error('Manufacturer photo could not be downloaded.');}
    const mime=(response.headers.get('Content-Type')||'').split(';')[0].toLowerCase();
    if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('Manufacturer returned an unsupported photo.');
    const blob=await response.blob();
    if(!blob.size||blob.size>8*1024*1024)throw Error('Manufacturer photo is empty or too large.');
    return blob;
  }

  function scheduleUpload(){
    state.needsSync=true;
    state.syncRevision=Math.max(state.syncRevision,state.uploadedRevision)+1;
    void persistQueue().catch(error=>console.warn('Pending edits stored with the appliance; queue marker unavailable:',error?.message||error));
    if(state.autoTimer)clearTimeout(state.autoTimer);
    if(!state.connected||!state.passphrase){redraw();return}
    state.autoTimer=setTimeout(()=>{state.autoTimer=0;syncNow().catch(()=>{})},2500);
    redraw();
  }
  function handle(action,id){
    const invoke={'cloud-passkey':passkeyLogin,'cloud-login':firebaseLogin,'cloud-unlock':unlock,'cloud-logout':disconnect}[action];
    if(!invoke)return false;
    try{Promise.resolve(invoke()).catch(error=>{state.error=error.message||'Cloud service unavailable.';state.busy=false;redraw();toast(state.error);});}
    catch(error){state.error=error.message||'Cloud service unavailable.';state.busy=false;redraw();toast(state.error);}
    return true;
  }
  async function loadPrevious(){
    const last=await storeAction(META_STORE,'readonly',tx=>tx.get('lastCloudBackup'));
    state.lastBackupId=last?.archiveId||'';
    state.lastCloudCopy=last?.at||'';
    state.cloudOriginals=Number(last?.originals)||0;
    const queue=await storeAction(META_STORE,'readonly',tx=>tx.get('cloudQueue'));
    state.syncRevision=Number(queue?.revision)||0;
    state.uploadedRevision=Number(queue?.uploaded)||0;
    state.needsSync=state.syncRevision>state.uploadedRevision;
    const copies=await storeAction(DEVICE_BACKUPS_STORE,'readonly',tx=>tx.getAll()).catch(()=>[]);
    const sorted=(copies||[]).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    state.deviceCopies=sorted.filter(x=>x.id.startsWith('device-')).length;state.lastDeviceCopy=sorted.filter(x=>x.id.startsWith('device-'))[0]?.at||'';
    state.deviceEntries=sorted.filter(x=>x.id!=='cloud-current').map(x=>({id:x.id,at:x.at,bytes:x.bytes}));
    state.cachedCloudId=sorted.find(x=>x.id==='cloud-current')?.archiveId||'';
    state.verified=false;
    // Upgrade from the old snapshot client: detect edits which were not queued
    // before a refresh, including previously saved photos and website vault entries.
    const localChanges=[...appliances,...websiteAccounts].some(x=>x.updatedAt&&x.updatedAt>state.lastCloudCopy);
    const deletes=await storeAction(META_STORE,'readonly',st=>st.get('syncTombstones'));
    const newerDeletion=(deletes?.items||[]).some(x=>x.deletedAt&&x.deletedAt>state.lastCloudCopy);
    if(localChanges||newerDeletion||localCount()&&!state.lastBackupId)state.needsSync=true;
    redraw();
  }
  async function start(){
      if(!state.liveTimer&&typeof setInterval==='function'){
        state.liveTimer=setInterval(()=>{if(!document.hidden&&state.connected&&navigator.onLine&&Date.now()-state.lastCheck>60000)syncNow().catch(()=>{})},60000);
      }
    if(state.starting)return state.starting;
    state.starting=(async()=>{
      await loadPrevious();
      try{
        const saved=await readRemembered();
        if(!saved){redraw();return}
        state.passphrase=saved.passphrase;state.remembered=true;
        if(!navigator.onLine){if(missingOriginals().length)await repairLocalOriginals();redraw();return;}
        if(saved.method==='passkey'){
          if(!window.AppsPasskeyAuth?.create)throw Error('Shared passkey library unavailable.');
          const client=window.AppsPasskeyAuth.create({baseUrl:MONITOR,sessionStoreKey:SESSION_KEY,failureStoreKey:'app-monitor.auth-failures.v2'});
          client.restoreSession();
          const session=await client.validateSession();
          if(session?.method!=='passkey')throw Error('Passkey session expired. Unlock again to resume automatic sync.');
          Object.assign(state,{passkeyClient:client,method:'passkey',uid:OWNER_UID,email:'App Monitor passkey',connected:true});
        }else{
          Object.assign(state,{method:'firebase',email:saved.email,refresh:saved.refresh,uid:OWNER_UID});
          await requestFirebaseToken();
          state.connected=true;
        }
        await syncNow();
      }catch(error){
        state.error=String(error.message||'Cloud connection needs verification.');
        if(state.connected)planRetry();
        redraw();
      }

    })();
    try{return await state.starting;}finally{state.starting=null;}
  }
  addEventListener('online',()=>{if(state.connected)syncNow().catch(()=>{});else if(state.remembered)start().catch(()=>{});redraw()});
  addEventListener('offline',redraw);
  document.addEventListener?.('visibilitychange',()=>{if(!document.hidden&&state.connected&&Date.now()-state.lastCheck>30000)syncNow().catch(()=>{})});

  return{panel,banner,redraw,handle,scheduleUpload,fetchManufacturerPhoto,start,syncNow,status:()=>({connected:state.connected,method:state.method,latestBackup:state.lastCloudCopy,pendingRestore:state.pendingRestore,error:state.error,needsSync:state.needsSync,deviceCopies:state.deviceCopies,remembered:state.remembered})};
})();