/* Warranty Ease cloud transport v0.8 — automatic encrypted local-first sync.
   Records/receipts/OCR and password-vault plaintext never leave the browser.
   Supports existing App Monitor passkey, or kk-syllabus Firebase login as fallback.
   Import/merge consent is required before a second device can replace local records. */
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
    syncRevision:0,uploadedRevision:0,resyncWanted:false,remembered:false,liveTimer:0,deviceEntries:[]};
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt=x=>x?new Date(x).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not yet';
  const size=x=>x<1e6?`${Math.round(x/1024)} KB`:`${(x/1048576).toFixed(1)} MB`;
  const localCount=()=>{try{return (appliances?.length||0)+(websiteAccounts?.length||0)}catch{return 0}};
  const latest=()=>state.backups[0];
  function panel(){
    const online=navigator.onLine,ready=state.connected&&!!state.passphrase;
    let content='';
    if(!state.connected){
      content=`<div class="cloud-form">
        <div class="field"><label for="cloud-passphrase">Private cloud encryption passphrase</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off" placeholder="${state.passphrase?'Encryption key saved securely — leave blank':'Same passphrase on every device (12+ characters)'}"></div>
        <button class="btn btn-dark" data-action="cloud-passkey" ${!online||state.busy?'disabled':''}>Unlock with existing App Monitor passkey</button>
        <p class="cloud-hint">Connect once, then your verified session and encrypted archive key are remembered on this trusted device. You may need to unlock again when the session expires.</p>
        <details class="cloud-fallback"><summary>Alternatively: existing Firebase login</summary>
        <div class="field"><label for="cloud-email">Firebase email</label><input id="cloud-email" class="input" type="email" autocomplete="username" value="${esc(localStorage.getItem('we-cloud-email')||'')}"></div>
        <div class="field"><label for="cloud-password">Firebase password</label><input id="cloud-password" class="input" type="password" autocomplete="current-password"></div>
        <button class="btn btn-line" data-action="cloud-login" ${!online||state.busy?'disabled':''}>Connect with Firebase</button></details></div>`;
    }else{
      const entries=state.backups.slice(0,12).map((b,i)=>`<div class="cloud-row"><span><strong>${fmt(b.created)}</strong><small>${size(b.size)} encrypted${i===0?' · Latest':''}</small></span><button class="btn btn-line btn-sm" data-action="cloud-restore" data-id="${esc(b.id)}">Restore</button><button class="btn btn-ghost btn-sm" data-action="cloud-download" data-id="${esc(b.id)}">Download</button></div>`).join('');
      const recovery=state.pendingRestore&&latest()?`<div class="cloud-recover"><strong>Automatic sync needs attention</strong><p>Local records and historic cloud copies are preserved.</p><button class="btn btn-dark" data-action="cloud-sync" ${!ready||state.busy?'disabled':''}>Try again</button></div>`:'';
      content=`<div class="cloud-connected"><span class="cloud-user">${esc(state.email||'Signed in')}</span><span class="cloud-state">${state.method==='passkey'?'Passkey verified':'Firebase verified'}</span></div>
        ${!ready?`<div class="field"><label for="cloud-passphrase">Unlock encrypted cloud copies</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off"><button class="btn btn-line btn-sm" data-action="cloud-unlock">Unlock</button></div>`:''}
        ${recovery}
        <div class="cloud-actions"><button class="btn btn-dark" data-action="cloud-sync" ${!ready||!online||state.busy?'disabled':''}>Sync now</button><button class="btn btn-line" data-action="cloud-list" ${!online||state.busy?'disabled':''}>Check cloud</button><button class="btn btn-ghost" data-action="cloud-logout">Forget this device</button></div>
        <p class="cloud-hint">Last cloud sync: ${fmt(state.lastCloudCopy)}. Encrypted device checkpoints: ${state.deviceCopies}${state.lastDeviceCopy?' (latest '+fmt(state.lastDeviceCopy)+')':''}. Appliances, photos, receipts, notes and protected logins synchronise when online and open. Device checkpoints remain in browser storage; a separate exported archive is still recommended.</p>
        ${entries?`<details class="cloud-backup-history"><summary>Recovery history</summary><div class="cloud-list">${entries}</div></details>`:'<p class="cloud-hint">No encrypted cloud copies found yet.</p>'}`;
    }
    const rows=state.deviceEntries.map(x=>`<div class="cloud-row"><span><strong>${fmt(x.at)}</strong><small>${size(x.bytes)} encrypted</small></span><button class="btn btn-line btn-sm" data-action="cloud-device-restore" data-id="${esc(x.id)}">Restore</button><button class="btn btn-ghost btn-sm" data-action="cloud-device-download" data-id="${esc(x.id)}">Download</button></div>`).join('');
    if(rows)content+=`<details class="cloud-backup-history"><summary>Encrypted recovery copies on this device (${state.deviceCopies})</summary><p class="cloud-hint">These copies are stored inside this browser. Download a separate file for protection against clearing browser data.</p><div class="cloud-list">${rows}</div></details>`;
    const msg=state.busy?'Synchronising securely…':state.error||(!online?'Offline — changes will sync when online.':state.connected?(state.needsSync?'Changes saved locally; automatic sync pending.':'Cloud synchronised; data also available offline.'):'Connect once to enable automatic cloud synchronisation.');
    return `<section class="cloud-panel"><div class="cloud-head"><span class="cloud-symbol">☁</span><div><h3>Encrypted cloud backups &amp; recovery</h3><p>Use the same account and encryption passphrase on each device.</p></div></div>${content}<p class="cloud-status" role="status">${esc(msg)}</p></section>`;
  }
  function banner(){
    if(!localCount()&&!state.pendingRestore)return '';
    // A normal completed sync needs no large banner on the minimal wallet home.
    const status=state.error?'Cloud sync needs attention: '+state.error:
      state.connected?(state.needsSync?'Changes saved locally; syncing automatically':''):
      'Connect cloud sync once to keep your appliances on every device';
    if(!status)return '';
    return '<div class="we-sync-banner" role="status"><span>'+esc(status)+
      '</span><button type="button" data-action="settings">'+(state.error?'Fix sync':'Sync settings')+'</button></div>';
  }
  function redraw(){const target=document.getElementById('cloud-ui');if(target)target.innerHTML=panel();const bannerNode=document.getElementById('we-cloud-banner');if(bannerNode)bannerNode.innerHTML=banner();const nudge=document.querySelector?.('.backup-nudge');if(nudge)nudge.style.display=state.connected?'none':'';}
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
    const copies=await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.getAll());
    const sha=await window.WarrantyCloudChunks.digest(bytes),at=new Date().toISOString();
    if(Array.isArray(copies)&&copies.some(x=>x.sha===sha))return;
    const id='device-'+Date.now()+'-'+crypto.randomUUID();
    await storeAction(DEVICE_BACKUPS_STORE,'readwrite',st=>st.put({id,at,sha,
      blob:new Blob([bytes],{type:'application/octet-stream'}),bytes:bytes.byteLength}));
    const updated=await storeAction(DEVICE_BACKUPS_STORE,'readonly',st=>st.getAll());
    const sorted=(updated||[]).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
    for(const old of sorted.slice(3))await storeAction(DEVICE_BACKUPS_STORE,'readwrite',st=>st.delete(old.id));
    state.deviceCopies=Math.min(3,sorted.length);state.lastDeviceCopy=at;
    state.deviceEntries=sorted.slice(0,3).map(x=>({id:x.id,at:x.at,bytes:x.bytes}));
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
      state.lastCloudCopy=new Date().toISOString();
      state.lastBackupId=id;state.knownLatestId=id;
      state.cloudOriginals=appliances.reduce((n,r)=>n+(r.files||[]).filter(x=>x.blob instanceof Blob&&x.blob.size>0).length,0);
      state.uploadedRevision=Math.max(state.uploadedRevision,revision);
      state.needsSync=state.syncRevision>revision;
      await saveCloudMarker();
      await persistQueue();
      // Browser checkpoints are secondary encrypted copies, never a substitute for independent files.
      if(state.checkpointTimer){clearTimeout(state.checkpointTimer);state.checkpointTimer=0;}
      try{await saveDeviceCheckpoint(new Uint8Array(bytes))}catch(error){console.warn('Cloud saved, device checkpoint unavailable:',error?.message||error)}
      try{await writeIndex(id,sha,bytes.byteLength)}catch(error){console.warn('Cloud stored; optional Firebase metadata index not updated:',error?.message||error)}
      await list({quiet:true});
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
    if(state.syncPromise){if(state.needsSync)state.resyncWanted=true;return state.syncPromise}
    if(!state.connected||!state.passphrase)throw Error('Connect once to enable automatic cloud synchronisation.');
    if(!navigator.onLine){state.error='Offline; changes remain on this device.';redraw();return}
    if(editing()){state.resyncWanted=true;return}
    state.syncPromise=(async()=>{
      state.busy=true;state.error='';state.pendingRestore=false;redraw();
      try{
        await list({quiet:true});
        // Append-only snapshots may form concurrent branches. Merge every new
        // snapshot since the previous checkpoint, oldest first.
        const candidates=state.backups.filter(x=>x.id!==state.lastBackupId);
        const previous=state.backups.find(x=>x.id===state.lastBackupId);
        const pending=previous?candidates.filter(x=>x.created>=previous.created):
          state.lastCloudCopy?candidates.filter(x=>x.created>=state.lastCloudCopy):
          candidates.slice(0,3);
        let merged=false;
        for(const remote of pending.slice().reverse()){
          if(editing()){state.resyncWanted=true;return}
          const encrypted=await getEncrypted(remote.id);
          const zip=await decryptBackupBlob(encrypted,state.passphrase);
          const applied=await applyRestoredZip(zip,{automatic:true});
          if(applied!==true)throw Error('Cloud archive merge did not complete.');
          merged=true;
          state.lastBackupId=remote.id;
          state.knownLatestId=remote.id;
          state.lastCloudCopy=remote.created||state.lastCloudCopy;
          await saveCloudMarker();
        }
        if(merged){
          queueDeviceCheckpoint(); // Also keep a verified encrypted browser copy of recovered cloud records.
          // A new device with no local edits needs only to download, not overwrite.
          if(localCount()&&state.syncRevision>state.uploadedRevision)state.needsSync=true;
        }
        // Keep the most recent archive marker, including after multiple branch merges.
        const remoteLatest=latest();
        if(remoteLatest){
          state.lastBackupId=remoteLatest.id;state.knownLatestId=remoteLatest.id;
          state.lastCloudCopy=remoteLatest.created||state.lastCloudCopy;
          await saveCloudMarker();
        }
        if(state.needsSync||force&&!remoteLatest&&localCount())await uploadCurrent();
        state.error='';state.pendingRestore=false;state.retryDelay=5000;
      }catch(error){
        state.error=String(error.message||'Cloud synchronisation failed.');
        state.pendingRestore=!!latest()&&state.lastBackupId!==latest()?.id;
        planRetry();throw error;
      }finally{state.busy=false;redraw()}
    })().finally(()=>{
      state.syncPromise=null;
      if(state.resyncWanted){
        state.resyncWanted=false;
        if(!editing()&&state.connected&&navigator.onLine){
          setTimeout(()=>syncNow().catch(()=>{}),2500);
        }
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
    if(!state.connected)throw Error('Open Backup & privacy and connect with your existing App Monitor passkey first. You can still open the manufacturer product page without signing in.');
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
    queueDeviceCheckpoint();
    if(state.autoTimer)clearTimeout(state.autoTimer);
    if(!state.connected||!state.passphrase){redraw();return}
    state.autoTimer=setTimeout(()=>{state.autoTimer=0;syncNow().catch(()=>{})},2500);
    redraw();
  }
  function handle(action,id){
    const invoke={'cloud-passkey':passkeyLogin,'cloud-login':firebaseLogin,'cloud-unlock':unlock,'cloud-logout':disconnect,
      'cloud-upload':upload,'cloud-sync':()=>syncNow({force:true}),'cloud-list':()=>syncNow({force:false}),
      'cloud-device-restore':()=>restoreDeviceCopy(id),'cloud-device-download':()=>downloadDeviceCopy(id),'cloud-restore':()=>restore(id),'cloud-restore-latest':()=>restore(latest()?.id),'cloud-download':()=>download(id)}[action];
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
    state.deviceCopies=sorted.length;state.lastDeviceCopy=sorted[0]?.at||'';
    state.deviceEntries=sorted.map(x=>({id:x.id,at:x.at,bytes:x.bytes}));
    // Upgrade from the old snapshot client: detect edits which were not queued
    // before a refresh, including previously saved photos and website vault entries.
    const localChanges=[...appliances,...websiteAccounts].some(x=>x.updatedAt&&x.updatedAt>state.lastCloudCopy);
    const deletes=await storeAction(META_STORE,'readonly',st=>st.get('syncTombstones'));
    const newerDeletion=(deletes?.items||[]).some(x=>x.deletedAt&&x.deletedAt>state.lastCloudCopy);
    if(localChanges||newerDeletion||localCount()&&!state.lastBackupId)state.needsSync=true;
    redraw();
  }
  async function start(){
    if(state.starting)return state.starting;
    state.starting=(async()=>{
      await loadPrevious();
      try{
        const saved=await readRemembered();
        if(!saved){redraw();return}
        state.passphrase=saved.passphrase;state.remembered=true;
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
        state.connected=false;
        state.error=String(error.message||'Cloud connection needs verification.');
        redraw();
      }
      if(!state.liveTimer&&typeof setInterval==='function'){
        state.liveTimer=setInterval(()=>{if(!document.hidden&&state.connected&&navigator.onLine&&Date.now()-state.lastCheck>60000)syncNow().catch(()=>{})},60000);
      }
    })();
    return state.starting;
  }
  addEventListener('online',()=>{if(state.connected)syncNow().catch(()=>{});redraw()});
  addEventListener('visibilitychange',()=>{if(!document.hidden&&state.connected&&Date.now()-state.lastCheck>30000)syncNow().catch(()=>{})});

  return{panel,banner,redraw,handle,scheduleUpload,fetchManufacturerPhoto,start,syncNow,status:()=>({connected:state.connected,method:state.method,latestBackup:state.lastCloudCopy,pendingRestore:state.pendingRestore,error:state.error,needsSync:state.needsSync,deviceCopies:state.deviceCopies,remembered:state.remembered})};
})();