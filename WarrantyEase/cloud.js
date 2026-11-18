/* Warranty Ease — optional client-side encrypted cloud snapshots.
   No user evidence or vault plaintext is sent to Firebase or R2.
   The installed IndexedDB copy is always authoritative for immediate offline use. */
'use strict';
window.WarrantyCloud = (() => {
  const API = 'https://warranty-ease-api.nirav2000-github.workers.dev/v1';
  // Firebase web API keys are public project identifiers, not administrative secrets.
  const FIREBASE_KEY = 'AIzaSyDrreK9rhsoOpIYNr4QeNZ7CsXgQiMPW0E';
  const OWNER_UID = '2AJSfYdtg5URWHv7HCzpNMmKIlg2';
  const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/kk-syllabus/databases/(default)/documents';
  const state = {token:'', refresh:'', expires:0, passphrase:'', email:'', uid:'',
                 lastCloudCopy:'', busy:false, backups:[], error:'', connected:false, autoTimer:0};
  const html = x => String(x ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatTime = x => x ? new Date(x).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Never';
  const size = n => n < 1e6 ? `${Math.round(n/1024)} KB` : `${(n/1024/1024).toFixed(1)} MB`;
  function panel(){
    const online=navigator.onLine;
    const ready=state.connected && !!state.passphrase;
    const sub=state.busy?'Working securely…':state.error||(!online?'Offline. Your local records still work.':'Your records remain on this device, even if cloud services fail.');
    let content='';
    if(!state.connected){
      content=`<div class="cloud-form"><div class="field"><label for="cloud-email">Your existing Firebase account</label><input id="cloud-email" class="input" type="email" autocomplete="username" placeholder="Email" value="${html(localStorage.getItem('we-cloud-email')||'')}"></div>
        <div class="field"><label for="cloud-password">Account password</label><input id="cloud-password" class="input" type="password" autocomplete="current-password" placeholder="Firebase account password"></div>
        <div class="field"><label for="cloud-passphrase">Private cloud encryption passphrase</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off" placeholder="12+ characters; keep this safe"></div>
        <p class="cloud-hint">Only encrypted copies go to Cloudflare R2; Firebase stores an owner-only backup index. You need this passphrase to recover cloud copies from another device. It is not sent to either service.</p>
        <button class="btn btn-dark" data-action="cloud-login" ${!online?'disabled':''}>Connect account ${window.innerWidth>500?'&amp; make a secure copy':''}</button></div>`;
    }else{
      const list=state.backups.length?`<div class="cloud-list">${state.backups.slice(0,10).map(b=>`<div class="cloud-row"><span><strong>${formatTime(b.created)}</strong><small>${size(b.size)} encrypted</small></span><button class="btn btn-line btn-sm" data-action="cloud-restore" data-id="${html(b.id)}">Restore</button><button class="btn btn-ghost btn-sm" data-action="cloud-download" data-id="${html(b.id)}">Download</button></div>`).join('')}</div>`:'<p class="cloud-hint">Your cloud backups will appear here after the first successful upload.</p>';
      content=`<div class="cloud-connected"><span class="cloud-user">${html(state.email)}</span><span class="cloud-state">${ready?'Connected':'Locked'}</span></div>
        ${ready?'':`<div class="field"><label for="cloud-passphrase">Unlock cloud snapshots</label><input id="cloud-passphrase" class="input" type="password" autocomplete="off" placeholder="Your cloud encryption passphrase"><button data-action="cloud-unlock" class="btn btn-line btn-sm">Unlock</button></div>`}
        <div class="cloud-actions"><button class="btn btn-dark" data-action="cloud-upload" ${!ready||!online||state.busy?'disabled':''}>Save encrypted cloud copy</button><button class="btn btn-line" data-action="cloud-list" ${!online||state.busy?'disabled':''}>View backups</button><button class="btn btn-ghost" data-action="cloud-logout">Sign out</button></div>
        <p class="cloud-hint">Last successful copy: ${formatTime(state.lastCloudCopy)}. New saves are queued automatically while you stay signed in and online. Cloud restores require your confirmation and do not silently overwrite local records.</p>
        ${list}`;
    }
    return `<section class="cloud-panel"><div class="cloud-head"><span class="cloud-symbol">☁</span><div><h3>Encrypted cloud backup</h3><p>Private copies using your existing Firebase and Cloudflare accounts.</p></div></div>${content}<p class="cloud-status" role="status">${html(sub)}</p></section>`;
  }
  function redraw(){const target=document.getElementById('cloud-ui');if(target)target.innerHTML=panel();}
  async function bodyJson(response){
    const body=await response.json().catch(()=>({}));
    if(!response.ok){const message=body?.error?.message||body?.error||body?.message||`HTTP ${response.status}`;throw new Error(String(message));}
    return body;
  }
  async function requestToken(){
    if(!state.connected)throw new Error('Sign into your Firebase account first.');
    if(state.expires>Date.now()+60_000)return state.token;
    const response=await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(FIREBASE_KEY)}`,{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:state.refresh})
    });
    const x=await bodyJson(response);
    if(x.user_id!==OWNER_UID)throw new Error('The account no longer matches the warranty owner.');
    state.token=x.id_token;state.refresh=x.refresh_token||state.refresh;state.expires=Date.now()+(+x.expires_in||3600)*1000;
    return state.token;
  }
  async function authorised(url,options={}){
    const token=await requestToken();
    return fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`},cache:'no-store'});
  }
  async function login(){
    const email=document.getElementById('cloud-email')?.value.trim()||'';
    const pw=document.getElementById('cloud-password')?.value||'';
    const pass=document.getElementById('cloud-passphrase')?.value||'';
    if(!email||!pw)throw new Error('Enter your Firebase email and password.');
    if(pass.length<12)throw new Error('Choose a private cloud passphrase of at least 12 characters.');
    state.busy=true;state.error='';redraw();
    try{
      const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(FIREBASE_KEY)}`,{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:pw,returnSecureToken:true})});
      const r=await bodyJson(response);
      if(r.localId!==OWNER_UID)throw new Error('This vault currently allows only the existing owner Firebase account.');
      // Do not retain or cache the account password; the ID token remains in memory.
      state.uid=r.localId;state.token=r.idToken;state.refresh=r.refreshToken;state.expires=Date.now()+Number(r.expiresIn||3600)*1000;
      state.email=email;state.passphrase=pass;state.connected=true;
      localStorage.setItem('we-cloud-email',email);
      await list({quiet:true});
      await upload({quiet:true});
    }catch(error){logout({quiet:true});throw error;}finally{state.busy=false;redraw();}
  }
  async function unlock(){
    const pass=document.getElementById('cloud-passphrase')?.value||'';
    if(pass.length<12)throw new Error('Enter the cloud encryption passphrase you originally used.');
    state.passphrase=pass;state.error='';redraw();
  }
  function logout({quiet=false}={}){
    if(state.autoTimer)clearTimeout(state.autoTimer);
    Object.assign(state,{token:'',refresh:'',expires:0,passphrase:'',email:'',uid:'',busy:false,connected:false,autoTimer:0,backups:[]});
    if(!quiet)redraw();
  }
  async function writeIndex(id,sha,byteCount){
    const path=`${FIRESTORE}/warrantyEase/${encodeURIComponent(state.uid)}/snapshots/${encodeURIComponent(id)}`;
    const data={fields:{schema:{integerValue:'1'},ownerUid:{stringValue:state.uid},archiveId:{stringValue:id},sha256:{stringValue:sha},bytes:{integerValue:String(byteCount)},savedAt:{timestampValue:new Date().toISOString()}}};
    const response=await authorised(path,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    await bodyJson(response);
  }
  async function upload({quiet=false}={}){
    if(!state.connected||!state.passphrase)throw new Error('Unlock cloud encryption first.');
    if(state.busy&&!quiet)return;
    state.busy=true;state.error='';redraw();
    try{
      if(!navigator.onLine)throw new Error('Offline. Your records are saved locally and can be backed up later.');
      const raw=await createRawBackupZip();
      const encrypted=await encryptBackupBytes(new Uint8Array(await raw.arrayBuffer()),state.passphrase);
      const ab=await encrypted.arrayBuffer();
      if(ab.byteLength>30*1024*1024)throw new Error('This backup is over 30 MB. Export locally; large cloud uploads need chunking.');
      const digest=await crypto.subtle.digest('SHA-256',ab);
      const sha=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      const id=(crypto.randomUUID?crypto.randomUUID():`archive-${Date.now()}`).replace(/[^a-zA-Z0-9-]/g,'');
      const uploaded=await authorised(`${API}/backups/${id}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Warranty-Digest':sha},body:ab});
      await bodyJson(uploaded);
      try{await writeIndex(id,sha,ab.byteLength);}catch(err){
        // R2 copy is already recoverable via the secure list endpoint; never misrepresent Firestore index failure.
        state.error=`Encrypted Cloudflare copy saved, but Firebase index failed: ${err.message}`;
      }
      state.lastCloudCopy=new Date().toISOString();
      await storeAction(META_STORE,'readwrite',x=>x.put({id:'lastCloudBackup',at:state.lastCloudCopy,archiveId:id}));
      await list({quiet:true});
      if(!quiet)toast('Encrypted cloud snapshot saved. Your device copy was not changed.');
    }finally{state.busy=false;redraw();}
  }
  async function list({quiet=false}={}){
    if(!state.connected)throw new Error('Connect to cloud backup first.');
    if(!quiet){state.busy=true;state.error='';redraw();}
    try{
      const res=await authorised(`${API}/backups`,{method:'GET'});
      const data=await bodyJson(res);
      if(!Array.isArray(data.backups))throw new Error('Invalid secure-backup list.');
      state.backups=data.backups.filter(b=>/^[\w-]{5,80}$/.test(b.id)).sort((a,b)=>String(b.created).localeCompare(String(a.created)));
    }finally{if(!quiet){state.busy=false;redraw();}}
  }
  async function getEncrypted(id){
    if(!/^[\w-]{5,80}$/.test(id))throw new Error('Invalid archive identifier.');
    const response=await authorised(`${API}/backups/${encodeURIComponent(id)}`);
    if(!response.ok){await bodyJson(response);throw new Error('Encrypted archive unavailable.');}
    const data=await response.blob();
    if(data.size>31*1024*1024)throw new Error('Cloud archive exceeds the supported recovery size.');
    return data;
  }
  async function restore(id){
    if(!state.passphrase)throw new Error('Enter your private cloud passphrase first.');
    if(!window.confirm('Restore records from this encrypted cloud snapshot? You will review replacement details before any local records are changed.'))return;
    state.busy=true;state.error='';redraw();
    try{
      const encrypted=await getEncrypted(id);
      const inner=await decryptBackupBlob(encrypted,state.passphrase);
      await applyRestoredZip(inner);
    }finally{state.busy=false;redraw();}
  }
  async function download(id){
    state.busy=true;state.error='';redraw();
    try{
      const encrypted=await getEncrypted(id);
      const zipped=await buildZip([{name:'READ_ME_FIRST.txt',data:ARCHIVE_HELP},{name:'RECOVER.html',data:RECOVERY_HTML},{name:'backup.encrypted',data:encrypted}]);
      downloadBlob(zipped,`WarrantyEase-cloud-recovery-${id}.zip`);
    }finally{state.busy=false;redraw();}
  }
  function scheduleUpload(){
    if(!state.connected||!state.passphrase)return;
    if(state.autoTimer)clearTimeout(state.autoTimer);
    state.autoTimer=setTimeout(()=>{state.autoTimer=0;if(!navigator.onLine)return;upload({quiet:true}).catch(err=>{state.error=`Cloud backup pending: ${err.message}`;redraw();});},3_000);
  }
  function handle(action,id){
    const invoke={'cloud-login':login,'cloud-unlock':unlock,'cloud-logout':logout,'cloud-upload':upload,'cloud-list':list,'cloud-restore':()=>restore(id),'cloud-download':()=>download(id)}[action];
    if(!invoke)return false;
    Promise.resolve().then(()=>invoke()).catch(error=>{state.error=error.message||'Cloud service unavailable';state.busy=false;redraw();toast(state.error);});
    return true;
  }
  window.addEventListener('online',()=>{if(state.connected&&state.passphrase&&state.autoTimer===0)scheduleUpload();redraw();});
  return{panel,handle,scheduleUpload,redraw,status:()=>({connected:state.connected,lastCloudCopy:state.lastCloudCopy})};
})();