import {normalize,summaries,topics,parseDate,matching} from './model.mjs';
const $=id=>document.getElementById(id);
const API='https://apps-monitor-api.nirav2000-github.workers.dev/app-monitor';
const IS_LOCAL=['localhost','127.0.0.1'].includes(location.hostname);
const KEY='nvr-review-notes-v1', SESSION_STORE='app-monitor.admin-session.v2';
const access=$('accessGate'),review=$('reviewMain'),signin=$('signInBtn'),signout=$('signOutBtn');
const loginMessage=$('loginMessage'),cloudStatus=$('cloudStatus'),saveBtn=$('saveNotes'),appActions=$('appActions');
const auth=IS_LOCAL?null:window.AppsPasskeyAuth?.create({baseUrl:API,sessionStoreKey:SESSION_STORE});
let activities=[],assetMap={},selected=null,notes={},noteTimer=null,notesDirty=false,savingNotes=false,sessionReady=false;
const objectUrls=new Map(),pendingAssets=new Map();
if(IS_LOCAL){try{notes=JSON.parse(localStorage.getItem(KEY)||'{}');if(!notes||typeof notes!=='object')notes={};}catch{notes={};}}
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const noteId=(a,q)=>a.id+'::'+q.number;
function revokeAssets(){for(const url of objectUrls.values())URL.revokeObjectURL(url);objectUrls.clear();pendingAssets.clear();}
function resetData(){activities=[];assetMap={};selected=null;notes={};notesDirty=false;clearTimeout(noteTimer);revokeAssets();$('metrics').replaceChildren();$('activity-list').replaceChildren();$('question-list').replaceChildren();$('detail').replaceChildren();$('history').replaceChildren();$('topics').replaceChildren();}
function setLocked(message='Sign in with the Apps passkey to load private assessment records.'){
  sessionReady=false;resetData();access.hidden=false;review.hidden=true;signin.disabled=false;
  loginMessage.textContent=message;cloudStatus.textContent='';signout.hidden=true;saveBtn.hidden=true;appActions.hidden=true;
}
function setUnlocked(){access.hidden=true;review.hidden=false;appActions.hidden=false;signout.hidden=IS_LOCAL;saveBtn.hidden=IS_LOCAL;sessionReady=true;}
function headers(){return auth?.authHeaders()||{};}
async function privateFetch(route,opts={}){
  const response=await fetch(API+'/nvr/'+route,{
    ...opts,headers:{...headers(),...(opts.headers||{})},cache:'no-store',credentials:'omit'
  });
  if(response.status===401||response.status===403) {
    auth?.clearCached();setLocked('The Apps passkey session has expired. Sign in again.');
    throw new Error('Passkey authentication required.');
  }
  return response;
}
async function saveCloudNotes(){
  if(IS_LOCAL||!sessionReady||savingNotes||!notesDirty)return;
  savingNotes=true;saveBtn.disabled=true;
  try{
    while(notesDirty&&sessionReady){
      notesDirty=false;
      const response=await privateFetch('notes',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes})});
      if(!response.ok)throw Error('Could not save notes (HTTP '+response.status+')');
    }
    cloudStatus.textContent='Private notes saved securely.';
  }catch(error){
    notesDirty=true;
    cloudStatus.textContent='Notes not saved: '+error.message+' Export a backup if needed.';
  }finally{savingNotes=false;saveBtn.disabled=false;}
}
function storeNote(id,value){
  notes[id]={bookmarked:!!value.bookmarked,text:String(value.text||'')};
  if(IS_LOCAL){try{localStorage.setItem(KEY,JSON.stringify(notes));}catch{$('message').textContent='Could not save local notes. Export a backup.';}return;}
  notesDirty=true;cloudStatus.textContent='Unsaved note changes…';
  clearTimeout(noteTimer);noteTimer=setTimeout(saveCloudNotes,700);
}
async function fetchPrivateAsset(filename){
  if(objectUrls.has(filename))return objectUrls.get(filename);
  if(pendingAssets.has(filename))return pendingAssets.get(filename);
  const promise=(async()=>{
    const r=await privateFetch('assets/'+encodeURIComponent(filename));
    if(!r.ok)throw Error('Image HTTP '+r.status);
    const blob=await r.blob();
    if(!/^image\/(svg\+xml|png|jpeg|gif|webp)$/.test(blob.type))throw Error('Image type unsupported');
    const url=URL.createObjectURL(blob);objectUrls.set(filename,url);return url;
  })();
  pendingAssets.set(filename,promise);
  try{return await promise;}finally{pendingAssets.delete(filename);}
}
async function loadPrivateActivities(){
  const response=await privateFetch('activities');
  if(!response.ok){
    const data=await response.json().catch(()=>({}));
    throw Error(data.error||'Private dataset is unavailable (HTTP '+response.status+').');
  }
  const data=await response.json();
  if(!data.ok||!Array.isArray(data.activities))throw Error('The private dataset response was invalid.');
  activities=normalize(data.activities);assetMap=data.assets||{};selected=null;
  render();
  cloudStatus.textContent='Assessments loaded securely from '+(data.source==='private-Biz'?'private Biz':data.source==='private-cache'?'protected cloud storage':'a saved private cache')+'.';
}
async function loadCloudNotes(){
  const response=await privateFetch('notes');
  if(!response.ok)throw Error('Could not load private notes.');
  const data=await response.json();
  if(!data.ok||!data.notes||typeof data.notes!=='object')throw Error('Invalid private notes response.');
  notes=data.notes;
}
async function unlockAndLoad(){
  setUnlocked();$('message').textContent='Loading private assessment records…';
  try{
    await loadCloudNotes();
    await loadPrivateActivities();
  }catch(error){
    if(!sessionReady)return;
    $('message').textContent=error.message+' You can still use Import data to review a local activities.json file in this session.';
    cloudStatus.textContent='Private data connection needs attention.';
  }
}
async function login(){
  if(!auth||!window.PublicKeyCredential){loginMessage.textContent='Passkey authentication is unavailable in this browser.';return;}
  signin.disabled=true;loginMessage.textContent='Approve the Apps passkey on your device…';
  try{
    const result=await auth.passkeyLogin();
    if(result.method&&result.method!=='passkey')throw Error('A verified passkey is required.');
    await unlockAndLoad();
  }catch(error){
    if(!sessionReady)setLocked(error.name==='NotAllowedError'?'Passkey sign-in cancelled.':'Could not sign in: '+error.message);
  }finally{signin.disabled=false;}
}
async function start(){
  if(IS_LOCAL){setUnlocked();signout.hidden=true;saveBtn.hidden=true;
    try{const [r,a]=await Promise.all([fetch('../data/activities.json'),fetch('../data/assets.json')]);
      if(!r.ok)throw Error('Local activities.json is missing');
      activities=normalize(await r.json());assetMap=a.ok?await a.json():{};
      render();
    }catch(error){$('message').textContent=error.message+' Import an activities.json file.';}
    return;
  }
  if(!auth)return setLocked('Apps authentication script could not load. Refresh the page.');
  const existing=auth.restoreSession();
  if(!existing)return setLocked();
  try{
    const verified=await auth.validateSession();
    if(verified?.method==='passkey')return unlockAndLoad();
    return setLocked('Please sign in using a passkey rather than a recovery session.');
  }catch{return setLocked('Previous passkey session could not be verified. Sign in again.');}
}
signin.addEventListener('click',login);
signout.addEventListener('click',async()=>{
  if(notesDirty)await saveCloudNotes();
  try{await auth?.logout();}catch{auth?.clearCached();}
  setLocked('Signed out. Private assessment information has been cleared from the page.');
});
saveBtn.addEventListener('click',async()=>{clearTimeout(noteTimer);notesDirty=true;await saveCloudNotes();});
window.addEventListener('storage',event=>{if(event.key===SESSION_STORE&&!event.newValue&&!IS_LOCAL)setLocked('Signed out in another tab.');});
window.addEventListener('pagehide',revokeAssets);
function show(view){document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==view);document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));
function score(a){return a.score_total?`${a.score_correct}/${a.score_total} · ${Math.round(a.score_correct/a.score_total*100)}%`:'Score unavailable';}
function metrics(){const s=summaries(activities);$('metrics').replaceChildren(...[[s.activities,'activity records'],[s.questions,'question summaries'],[s.details,'answer / explanation records'],[s.unavailable,'sessions without answers']].map(([n,t])=>{const d=el('div',undefined,'metric');d.append(el('b',n),el('span',t));return d;}));$('message').textContent=`Partial Atom capture: ${s.details} of ${s.questions} listed questions include answer details. Missing content is marked. This is not the complete test history.`;}
function renderActivities(){const search=$('search').value.toLowerCase();$('activity-list').replaceChildren(...activities.filter(a=>`${a.title} ${a.date}`.toLowerCase().includes(search)).map(a=>{const b=el('button',undefined,'activity-card');b.append(el('small',`${a.date} · ${a.type}`),el('h3',a.title),el('span',score(a),'score'),el('p',a.total_time_display||'Time unavailable'),el('span',`${a.questions.filter(q=>q.details_captured).length}/${a.questions.length} question details captured`,'badge'));if(!a.questions.length)b.append(el('p','Atom returned no answers for this session.','warning'));b.addEventListener('click',()=>{$('activity').value=a.id;show('questions');selected=null;renderQuestions();});return b;}));if(!$('activity-list').children.length)$('activity-list').append(el('p','No activities match.'));}
function renderQuestions(){const rows=[];for(const a of activities){if($('activity').value!=='all'&&$('activity').value!==a.id)continue;for(const q of a.questions){const id=noteId(a,q);if(matching(q,$('filter').value,notes[id]))rows.push({a,q,id});}}if(!rows.some(r=>r.id===selected))selected=rows[0]?.id||null;$('question-list').replaceChildren(...rows.map(r=>{const b=el('button');b.setAttribute('aria-pressed',String(r.id===selected));b.append(el('b',`Q${r.q.number} · ${r.q.correct===null?'Unknown':r.q.correct?'Correct':'Incorrect'}`,r.q.correct?'correct':'incorrect'),el('small',`${r.a.date} · ${r.q.time_seconds??'?'}s`),el('small',r.a.title));b.addEventListener('click',()=>{selected=r.id;renderQuestions();});return b;}));const row=rows.find(r=>r.id===selected);if(row)renderDetail(row);else{$('detail').replaceChildren(el('p','No questions match this filter.'));}}
function picture(url,label){
  const source=assetMap[url];
  if(!source||!/^assets\/asset-[0-9]{4}\.(svg|png|jpe?g|webp|gif|bin)$/.test(source))
    return el('p','Diagram not captured.','missing');
  const img=el('img');img.alt=label;img.loading='lazy';
  const unavailable=()=>{if(img.isConnected)img.replaceWith(el('p','Diagram file is unavailable.','missing'));};
  img.addEventListener('error',unavailable,{once:true});
  if(IS_LOCAL)img.src='../data/'+source;
  else fetchPrivateAsset(source.slice(7)).then(loadedUrl=>{if(sessionReady&&img.isConnected)img.src=loadedUrl;}).catch(unavailable);
  return img;
}
function renderDetail({a,q,id}){const box=$('detail');box.replaceChildren();box.append(el('span',`${a.date} · Question ${q.number} · ${q.time_seconds??'?'}s`,'badge'),el('h2',q.prompt||q.header||'Question'),el('p',q.topic||'Topic not captured','muted'));if(q.questionImage){const d=el('div',undefined,'question-image');d.append(picture(q.questionImage,'Question diagram'));box.append(d);}if(q.answers.length){const opts=el('div',undefined,'options');q.answers.forEach(answer=>{const d=el('div',undefined,`option ${answer.correct?'right':''} ${answer.selected?'chosen':''}`);d.append(el('b',answer.letter),el('small',answer.selected?'Selected answer':''),el('small',answer.correct?'Correct answer':'',answer.correct?'correct':''));(answer.images||[]).forEach(u=>d.append(picture(u,`Option ${answer.letter}`)));opts.append(d);});box.append(opts);}if(q.explanation){const d=el('details');d.append(el('summary','Show Atom’s explanation'),el('p',q.explanation,'explanation'));const used=new Set([q.questionImage,...q.answers.flatMap(a=>a.images||[])]);for(const i of q.images||[]){if(i.src&&i.src.includes('/questions/')&&!used.has(i.src)){const panel=el('div',undefined,'question-image');panel.append(picture(i.src,'Explanation diagram'));d.append(panel);used.add(i.src);}}box.append(d);}if(!q.details_captured)box.append(el('p','Some answer details were not captured. This does not mean the question was left unanswered.','missing'));const bookmark=el('button',notes[id]?.bookmarked?'★ Bookmarked':'☆ Bookmark');bookmark.addEventListener('click',()=>{storeNote(id,{...notes[id],bookmarked:!notes[id]?.bookmarked});renderQuestions();});box.append(bookmark);const label=el('label','What did we notice?','note-label');const area=el('textarea');area.placeholder='For example: checked the rotation but missed the shading rule.';area.value=notes[id]?.text||'';area.addEventListener('input',()=>storeNote(id,{...notes[id],text:area.value}));label.append(area);box.append(label,el('p','Ask your child to explain their reasoning before deciding why an answer was wrong.','muted'));}
function table(headers,rows){const wrap=el('div',undefined,'table-wrap'),t=el('table'),head=el('thead'),tr=el('tr');headers.forEach(h=>tr.append(el('th',h)));head.append(tr);t.append(head);const body=el('tbody');rows.forEach(row=>{const tr=el('tr');row.forEach(v=>tr.append(el('td',v)));body.append(tr);});t.append(body);wrap.append(t);return wrap;}
function progress(){$('history').replaceChildren(table(['Date','Activity','Accuracy','Total time'],[...activities].sort((a,b)=>parseDate(a.date).localeCompare(parseDate(b.date))).map(a=>[a.date,a.title,score(a),a.total_time_display||'Unavailable'])));$('topics').replaceChildren(table(['Topic','Captured questions','Correct','Median time'],topics(activities).map(t=>[t.topic,t.count,`${t.correct}/${t.count}`,t.median===null?'Unavailable':`${t.median}s`])));$('topics').append(el('p','Topic statistics use only questions with captured topic labels; coverage is incomplete.','muted'));}
function render(){metrics();$('activity').replaceChildren(new Option('All activities','all'),...activities.map(a=>new Option(`${a.date} · ${a.title}`,a.id)));renderActivities();renderQuestions();progress();}
$('search').addEventListener('input',renderActivities);$('activity').addEventListener('change',()=>{selected=null;renderQuestions();});$('filter').addEventListener('change',renderQuestions);
$('import').addEventListener('change',async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>30*1024*1024)throw new Error('Import file is too large.');const data=JSON.parse(await f.text());const next=normalize(data);activities=next;assetMap={};selected=null;render();$('message').textContent+=' Imported data is held for this session; it is not uploaded.';}catch(error){$('message').textContent=`Import failed: ${error.message}`;}finally{e.target.value='';}});
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,notes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='nvr-review-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
await start();
