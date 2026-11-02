/* MIDI input adapter for Chromium Web MIDI and the optional native iPad WKWebView bridge.
   No microphone, note/audio recording or network transmission. */
(function(root){
  'use strict';
  const Core=root.SightReadMidiCore;
  if(!Core)throw new Error('midi-core.js must load before midi-bridge.js');
  const listeners=new Set(),statusListeners=new Set();
  const KEY='sightread-midi-input-v1';
  let saved='';try{saved=localStorage.getItem(KEY)||''}catch{}
  const hasNative=()=>Boolean(root.webkit?.messageHandlers?.sightread);
  const hasWeb=()=>typeof navigator.requestMIDIAccess==='function';
  let mode=hasNative()?'native':hasWeb()?'web':'unsupported';
  let access=null,inputs=[],selected=saved,lastNote=null,lastTime=null,permission='unrequested',error='',listening=false;
  const notify=()=>{const state=getStatus();statusListeners.forEach(cb=>{try{cb(state)}catch(e){console.warn(e)}})};
  function getStatus(){const chosen=inputs.find(s=>s.id===selected);return {mode,permission,selected,selectedName:chosen?.name||'',connected:Boolean(chosen&&chosen.state==='connected'),inputs:inputs.slice(),lastNote,lastTime,error};}
  function emit(bytes,at,sourceId){
    const parsed=Core.decodeMidi(bytes,at,sourceId);
    if(!parsed)return;
    if(selected!==sourceId)return;
    if(parsed.type==='on'){
      lastNote=parsed.midi;lastTime=performance.now();
      const badge=document.getElementById('midi-last-note');
      if(badge)badge.textContent=noteName(parsed.midi)+' · '+new Date().toLocaleTimeString('en-GB');
      const el=document.querySelector('.piano-key[data-midi="'+parsed.midi+'"]');
      if(el){el.classList.add('active');setTimeout(()=>el.classList.remove('active'),130)}
    }
    listeners.forEach(cb=>{try{cb(parsed)}catch(e){console.warn('MIDI listener failed',e)}});
  }
  function noteName(n){return ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][n%12]+(Math.floor(n/12)-1)}
  function pickDefault(){
    if(selected&&inputs.some(i=>i.id===selected&&i.state==='connected'))return;
    const candidate=inputs.find(i=>i.state==='connected'&&(/CASIO|YAMAHA|CLP|CDP/i).test(i.name))||inputs.find(i=>i.state==='connected');
    selected=candidate?.id||'';
    try{localStorage.setItem(KEY,selected)}catch{}
  }
  function refreshWeb(){
    if(!access)return;
    inputs=[...access.inputs.values()].map(i=>({id:i.id,name:i.name||'MIDI keyboard',manufacturer:i.manufacturer||'',state:i.state||'disconnected',connection:i.connection||''}));
    pickDefault();
    for(const input of access.inputs.values()){
      input.onmidimessage=(message)=>emit(message.data,performance.now(),input.id);
    }
    notify();
  }
  async function connect(){
    error='';
    if(hasNative()){
      mode='native';permission='granted';postNative({type:'list'});notify();return getStatus();
    }
    if(!hasWeb()){
      mode='unsupported';permission='unsupported';error='This browser cannot read MIDI. Use Chrome or Edge on a Mac, or the native iPad companion app.';notify();return getStatus();
    }
    mode='web';permission='requesting';notify();
    try{
      // Intentionally excludes sysex; MIDI notes do not require privileged device commands.
      access=await navigator.requestMIDIAccess({sysex:false});permission='granted';
      access.onstatechange=()=>refreshWeb();refreshWeb();
    }catch(e){permission='denied';error=(e&&e.message)||'MIDI access denied';notify();}
    return getStatus();
  }
  function select(id){
    if(id&&!inputs.some(i=>i.id===id))return false;
    selected=id;try{localStorage.setItem(KEY,id)}catch{}
    if(mode==='native')postNative({type:'select',id});
    notify();return true;
  }
  function postNative(payload){try{root.webkit?.messageHandlers?.sightread?.postMessage(payload)}catch(e){error=e.message||'Native MIDI connection failed';notify()}}
  function pairBluetooth(){if(mode==='native')postNative({type:'pairBluetooth'});}
  function nativeReceive(message){
    if(!message||typeof message!=='object')return;
    if(message.type==='sources'){
      mode='native';permission='granted';
      inputs=(Array.isArray(message.sources)?message.sources:[]).filter(s=>typeof s.id==='string').map(s=>({id:s.id,name:String(s.name||'MIDI keyboard'),manufacturer:String(s.manufacturer||''),state:s.state==='connected'?'connected':'disconnected'}));
      if(message.selected&&inputs.some(s=>s.id===message.selected))selected=message.selected;
      pickDefault();if(selected)postNative({type:'select',id:selected});notify();
    }else if(message.type==='midi'&&Array.isArray(message.bytes)){
      emit(message.bytes,performance.now(),String(message.sourceId||''));
    }else if(message.type==='error'){error=String(message.message||'Native connection error');notify();}
  }
  root.addEventListener('sightread-native-message',e=>nativeReceive(e.detail));
  const api=Object.freeze({getStatus,connect,select,pairBluetooth,onMidi(fn){listeners.add(fn);return ()=>listeners.delete(fn)},onStatus(fn){statusListeners.add(fn);return ()=>statusListeners.delete(fn)},receiveNative:nativeReceive});
  root.SightReadMidi=api;
  // The native companion can fire this before the first click, and has no dependence on browser MIDI.
  if(hasNative())setTimeout(()=>{mode='native';connect()},100);
})(window);
