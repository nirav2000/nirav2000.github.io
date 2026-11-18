/* Warranty Ease cloud transport v0.6 — encrypted client-side backup snapshots.
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
    pendingRestore:false,remoteChanged:false,autoTimer:0,lastCheck:0,needsSync:false,uploading:false,cloudOriginals:0};
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
        <div class="field"><label for="cloud-passphrase">Private cloud encryption passphrase</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off" placeholder="Same passphrase on every device (12+ characters)"></div>
        <button class="btn btn-dark" data-action="cloud-passkey" ${!online||state.busy?'disabled':''}>Unlock with existing App Monitor passkey</button>
        <p class="cloud-hint">This reuses your existing passkey. Your cloud passphrase remains separate and never leaves this device. If the shared passkey service is unavailable, you can still access all locally saved appliances.</p>
        <details class="cloud-fallback"><summary>Alternatively: existing Firebase login</summary>
        <div class="field"><label for="cloud-email">Firebase email</label><input id="cloud-email" class="input" type="email" autocomplete="username" value="${esc(localStorage.getItem('we-cloud-email')||'')}"></div>
        <div class="field"><label for="cloud-password">Firebase password</label><input id="cloud-password" class="input" type="password" autocomplete="current-password"></div>
        <button class="btn btn-line" data-action="cloud-login" ${!online||state.busy?'disabled':''}>Connect with Firebase</button></details></div>`;
    }else{
      const entries=state.backups.slice(0,12).map((b,i)=>`<div class="cloud-row"><span><strong>${fmt(b.created)}</strong><small>${size(b.size)} encrypted${i===0?' · Latest':''}</small></span><button class="btn btn-line btn-sm" data-action="cloud-restore" data-id="${esc(b.id)}">Restore</button><button class="btn btn-ghost btn-sm" data-action="cloud-download" data-id="${esc(b.id)}">Download</button></div>`).join('');
      const recovery=state.pendingRestore&&latest()?`<div class="cloud-recover"><strong>Cloud records found from another device</strong><p>These appliances are not automatically copied into this browser. Restore the most recent encrypted snapshot to bring them here, keeping any local-only records.</p><button class="btn btn-dark" data-action="cloud-restore-latest" ${!ready||state.busy?'disabled':''}>Restore latest cloud records</button></div>`:'';
      content=`<div class="cloud-connected"><span class="cloud-user">${esc(state.email||'Signed in')}</span><span class="cloud-state">${state.method==='passkey'?'Passkey verified':'Firebase verified'}</span></div>
        ${!ready?`<div class="field"><label for="cloud-passphrase">Unlock encrypted cloud copies</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off"><button class="btn btn-line btn-sm" data-action="cloud-unlock">Unlock</button></div>`:''}
        ${recovery}
        <div class="cloud-actions"><button class="btn btn-dark" data-action="cloud-upload" ${!ready||state.pendingRestore||!online||state.busy?'disabled':''}>Save encrypted cloud copy</button><button class="btn btn-line" data-action="cloud-list" ${!online||state.busy?'disabled':''}>Check other devices</button><button class="btn btn-ghost" data-action="cloud-logout">Disconnect</button></div>
        <p class="cloud-hint">Last saved from this device: ${fmt(state.lastCloudCopy)}. ${state.cloudOriginals?'Backup includes '+state.cloudOriginals+' original photos/documents. ':''} ${state.pendingRestore?'Restore or review cloud changes before uploading from this device.':'New saved changes are queued for encrypted backup while signed in.'} A second device must unlock and restore its latest copy before displaying records.</p>
        ${entries?`<div class="cloud-list">${entries}</div>`:'<p class="cloud-hint">No encrypted cloud copies found yet.</p>'}`;
    }
    const msg=state.busy?'Working securely…':state.error||(state.pendingRestore?'Cloud records are ready to restore.':!online?'Offline — local records are still available.':state.connected?'Cloud connected. Local records remain available offline.':'Cloud backup is optional; local records do not require sign-in.');
    return `<section class="cloud-panel"><div class="cloud-head"><span class="cloud-symbol">☁</span><div><h3>Encrypted cloud backups &amp; recovery</h3><p>Use the same account and encryption passphrase on each device.</p></div></div>${content}<p class="cloud-status" role="status">${esc(msg)}</p></section>`;
  }
  function banner(){
    if(!localCount()&&!state.pendingRestore)return '';
    const status=state.pendingRestore?'Cloud copies found — restore them to see appliances from another device':
      state.error?'Cloud backup needs attention: '+state.error:
      state.connected?(state.needsSync?'Local changes awaiting encrypted backup':`Encrypted cloud copy ${state.lastCloudCopy?'saved '+fmt(state.lastCloudCopy):'not saved yet'}`):
      'Records on this device only — connect cloud backup to use them elsewhere';
    return `<div class="we-sync-banner" role="status"><span>${esc(status)}</span><button type="button" data-action="settings">${state.pendingRestore?'Restore cloud copies':'Backup & sync'}</button></div>`;
  }
  function redraw(){const target=document.getElementById('cloud-ui');if(target)target.innerHTML=panel();const bannerNode=document.getElementById('we-cloud-banner');if(bannerNode)bannerNode.innerHTML=banner();}
  async function jsonResponse(response){const d=await response.json().catch(()=>({}));if(!response.ok)throw new Error(String(d?.error?.message||d?.error||d?.message||`HTTP ${response.status}`));return d;}
  async function requestFirebaseToken(){
    if(state.expires>Date.now()+60e3)return state.token;
    const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_KEY)}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:state.refresh})});
    const x=await jsonResponse(response);if(x.user_id!==OWNER_UID)throw Error('Firebase account does not match the warranty owner.');
    state.token=x.id_token;state.refresh=x.refresh_token||state.refresh;state.expires=Date.now()+(+x.expires_in||3600)*1000;return state.token;
  }
  async function authorised(url,options={}){
    let auth={};
    if(state.method==='passkey'){
      if(!state.passkeyClient)throw Error('App Monitor passkey session is not available. Connect again.');
      const session=await state.passkeyClient.validateSession();
      if(session?.method!=='passkey')throw Error('App Monitor passkey session expired. Unlock again.');
      auth=state.passkeyClient.authHeaders();
    }else if(state.method==='firebase')auth={Authorization:`Bearer ${await requestFirebaseToken()}`};
    else throw Error('Connect to encrypted cloud backup first.');
    return fetch(url,{...options,headers:{...(options.headers||{}),...auth},cache:'no-store'});
  }
  async function beforeCloudUse(){
    state.lastCheck=Date.now();await list({quiet:true});
    // Do NOT upload an empty new-device archive over already existing data.
    const remote=latest();state.pendingRestore=!!remote&&remote.id!==state.lastBackupId;
    state.knownLatestId=remote?.id||'';
    if(!remote&&localCount())await upload({quiet:true});
    redraw();
  }
  async function passkeyLogin(){
    const pass=document.getElementById('cloud-passphrase')?.value||'';
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
    }catch(error){disconnect({quiet:true});throw error;}finally{state.busy=false;redraw();}
  }
  async function firebaseLogin(){
    const email=document.getElementById('cloud-email')?.value.trim()||'',pw=document.getElementById('cloud-password')?.value||'',pass=document.getElementById('cloud-passphrase')?.value||'';
    if(!email||!pw)throw Error('Enter your Firebase email and password.');
    if(pass.length<12)throw Error('Enter your existing cloud encryption passphrase (12+ characters).');
    state.busy=true;state.error='';redraw();
    try{
      const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_KEY)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});
      const r=await jsonResponse(response);if(r.localId!==OWNER_UID)throw Error('This Firebase account is not the warranty owner.');
      Object.assign(state,{uid:r.localId,token:r.idToken,refresh:r.refreshToken,expires:Date.now()+Number(r.expiresIn||3600)*1000,email,passphrase:pass,connected:true,method:'firebase'});
      localStorage.setItem('we-cloud-email',email);await beforeCloudUse();
    }catch(error){disconnect({quiet:true});throw error;}finally{state.busy=false;redraw();}
  }
  function disconnect({quiet=false}={}){
    if(state.autoTimer)clearTimeout(state.autoTimer);
    Object.assign(state,{token:'',refresh:'',expires:0,passphrase:'',email:'',uid:'',method:'',passkeyClient:null,connected:false,busy:false,autoTimer:0,backups:[],pendingRestore:false});
    // This ONLY disconnects Warranty Ease, and deliberately never revokes App Monitor's shared session.
    if(!quiet)redraw();
  }
  async function unlock(){const pass=document.getElementById('cloud-passphrase')?.value||'';if(pass.length<12)throw Error('Enter your original cloud encryption passphrase.');state.passphrase=pass;state.error='';redraw();}
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
      const remote=latest();if(remote&&remote.id!==state.knownLatestId&&remote.id!==state.lastBackupId)state.pendingRestore=true;
      state.knownLatestId=remote?.id||'';state.lastCheck=Date.now();
    }finally{if(!quiet){state.busy=false;redraw();}}
  }
  async function upload({quiet=false}={}){
    if(!state.connected||!state.passphrase)throw Error('Unlock cloud encryption first.');
    if(state.pendingRestore)throw Error('Another device has cloud records. Restore or review them before uploading.');
    if(state.uploading)return;
    state.uploading=true;state.busy=true;state.error='';state.needsSync=true;redraw();
    try{
      if(!navigator.onLine)throw Error('Offline. Your records are still on this device.');
      // Prevent a second active device from silently writing a newer, divergent archive.
      const prior=state.knownLatestId;await list({quiet:true});
      if(latest()&&latest().id!==prior){state.pendingRestore=true;throw Error('Another device saved a newer cloud copy. Review it before continuing.');}
      const raw=await createRawBackupZip();
      const encrypted=await encryptBackupBytes(new Uint8Array(await raw.arrayBuffer()),state.passphrase);const bytes=await encrypted.arrayBuffer();
       const transfer=window.WarrantyCloudChunks;
       if(!transfer)throw Error('The encrypted cloud transfer module is not installed; reload before backing up.');
       if(bytes.byteLength>transfer.MAX_TOTAL)throw Error('Encrypted backup is larger than 144 MB. Keep a complete portable archive; reduce file sizes or split your records before cloud upload.');
       const sha=await transfer.digest(bytes);
       const id=crypto.randomUUID?.()||`archive-${Date.now()}`;
       if(bytes.byteLength>30*1048576){
         await transfer.upload(new Uint8Array(bytes),{id,send:(path,options)=>authorised(API+path,options),onProgress:({part,total})=>{state.error=`Saving encrypted parts ${part} of ${total}...`;redraw()}});
       }else{
         const saved=await authorised(`${API}/backups/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Warranty-Digest':sha},body:bytes});await jsonResponse(saved);
       }
      state.error='';state.lastCloudCopy=new Date().toISOString();state.lastBackupId=id;state.knownLatestId=id;state.needsSync=false;state.pendingRestore=false;state.cloudOriginals=appliances.reduce((n,r)=>n+(r.files||[]).filter(f=>f.blob instanceof Blob&&f.blob.size>0).length,0);
      await storeAction(META_STORE,'readwrite',tx=>tx.put({id:'lastCloudBackup',at:state.lastCloudCopy,archiveId:id,originals:state.cloudOriginals}));
      try{await writeIndex(id,sha,bytes.byteLength)}catch(error){state.error='Cloudflare copy saved. Firebase index update did not succeed: '+error.message;}
      await list({quiet:true});if(!quiet)toast('Encrypted cloud backup completed.');
    }finally{state.uploading=false;state.busy=false;redraw();}
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
    if(state.autoTimer)clearTimeout(state.autoTimer);
    if(!state.connected||!state.passphrase||state.pendingRestore){redraw();return;}
    state.autoTimer=setTimeout(()=>{state.autoTimer=0;if(!navigator.onLine){redraw();return;}upload({quiet:true}).catch(error=>{state.error='Cloud backup pending: '+error.message;state.needsSync=true;redraw();});},2500);
    redraw();
  }
  function handle(action,id){
    const invoke={'cloud-passkey':passkeyLogin,'cloud-login':firebaseLogin,'cloud-unlock':unlock,'cloud-logout':disconnect,
      'cloud-upload':upload,'cloud-list':list,'cloud-restore':()=>restore(id),'cloud-restore-latest':()=>restore(latest()?.id),'cloud-download':()=>download(id)}[action];
    if(!invoke)return false;
    try{Promise.resolve(invoke()).catch(error=>{state.error=error.message||'Cloud service unavailable.';state.busy=false;redraw();toast(state.error);});}
    catch(error){state.error=error.message||'Cloud service unavailable.';state.busy=false;redraw();toast(state.error);}
    return true;
  }
  async function loadPrevious(){
    try{const x=await storeAction(META_STORE,'readonly',tx=>tx.get('lastCloudBackup'));state.lastBackupId=x?.archiveId||'';state.lastCloudCopy=x?.at||'';state.cloudOriginals=Number(x?.originals)||0;redraw()}catch{};
  }
  addEventListener('online',()=>{if(state.needsSync&&state.connected&&state.passphrase&&!state.pendingRestore)scheduleUpload();redraw()});
  addEventListener('visibilitychange',()=>{if(!document.hidden&&state.connected&&Date.now()-state.lastCheck>120000)list().catch(e=>{state.error=e.message;redraw()})});
  setTimeout(loadPrevious,500);
  return{panel,banner,redraw,handle,scheduleUpload,fetchManufacturerPhoto,status:()=>({connected:state.connected,method:state.method,latestBackup:state.lastCloudCopy,pendingRestore:state.pendingRestore,error:state.error,needsSync:state.needsSync})};
})();