/* SightRead Studio MIDI decoding and deterministic first-read assessment.
   No browser dependency: the same functions run in a browser or Node test. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  if(root) root.SightReadMidiCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function decodeMidi(data,time=0,sourceId=''){
    if(!data || data.length<1)return null;
    const st=Number(data[0]); if(!Number.isInteger(st)||st<0x80||st>=0xF0)return null;
    const cmd=st&0xF0,channel=st&0x0F;
    if(![0x80,0x90,0xB0].includes(cmd) || data.length<3)return null;
    const midi=Number(data[1]),value=Number(data[2]);
    if(!Number.isInteger(midi)||midi<0||midi>127||!Number.isInteger(value)||value<0||value>127)return null;
    const type=cmd===0xB0?'cc':cmd===0x80||value===0?'off':'on';
    if(cmd===0xB0&&midi!==64&&midi!==123&&midi!==120)return null;
    return {type,midi,velocity:type==='on'?value:0,value,time:Number.isFinite(time)?time:0,channel,sourceId};
  }
  function expectedNotes(ex){
    return [...(ex.rh||[]),...(ex.lh||[])].map((n,index)=>({
      index,beat:n.bar*4+n.beat,bar:n.bar,withinBar:n.beat,midi:n.midi,duration:n.dur,hand:n.hand
    })).sort((a,b)=>a.beat-b.beat||a.hand.localeCompare(b.hand)||a.index-b.index);
  }
  function analyse(ex,rawEvents,tempo=60,options={}){
    const bpm=clamp(Number(tempo)||60,20,240), beatMs=60000/bpm;
    const expectations=expectedNotes(ex);
    const raw=(rawEvents||[]).filter(e=>e&&Number.isFinite(e.time)&&Number.isInteger(e.midi)&&e.midi>=0&&e.midi<=127);
    const ons=raw.filter(e=>e.type==='on').sort((a,b)=>a.time-b.time);
    const offs=raw.filter(e=>e.type==='off').sort((a,b)=>a.time-b.time);
    const recorded=ons.length;
    // The first note begins the clock unless there was a metronome count-in.
    // The bridge records receipt times in the performance.now() clock domain.
    const startTime=Number.isFinite(options.startTime)?options.startTime:(ons[0]?.time??0);
    const delayCorrection=clamp(Number(options.latencyMs)||0,-250,250);
    const used=new Set(); const usedOffs=new Set();
    const maxWindow=clamp(beatMs*.85,260,950);
    const greenWindow=clamp(beatMs*.18,100,220);
    const amberWindow=clamp(beatMs*.5,220,550);
    const graded=[];
    for(const want of expectations){
      let candidate=-1,best=Infinity;
      const expectedAt=startTime+want.beat*beatMs;
      ons.forEach((hit,i)=>{
        if(used.has(i)||hit.midi!==want.midi)return;
        const delta=hit.time-delayCorrection-expectedAt;
        const abs=Math.abs(delta);
        if(abs<=maxWindow&&(abs<best||abs===best&&hit.time<ons[candidate]?.time)){best=abs;candidate=i;}
      });
      if(candidate===-1){graded.push({...want,status:'missed',deltaMs:null,playedAt:null,heldMs:null,durationOk:null});continue;}
      used.add(candidate);
      const hit=ons[candidate],delta=Math.round(hit.time-delayCorrection-expectedAt);
      const status=Math.abs(delta)<=greenWindow?'correct':Math.abs(delta)<=amberWindow?'late':'offbeat';
      // A note-off is matched to this note-on only, and never reused.
      let offIndex=-1;
      for(let oi=0;oi<offs.length;oi++){
        if(usedOffs.has(oi))continue;
        const off=offs[oi];
        if(off.midi!==hit.midi||off.channel!==hit.channel||off.sourceId!==hit.sourceId||off.time<hit.time)continue;
        if(off.time-hit.time>10000)continue;
        offIndex=oi;break;
      }
      const heldMs=offIndex>=0?Math.round(offs[offIndex].time-hit.time):null;
      if(offIndex>=0)usedOffs.add(offIndex);
      const durationOk=heldMs===null?null:Math.abs(heldMs-want.duration*beatMs)<=Math.max(220,want.duration*beatMs*.42);
      graded.push({...want,status,deltaMs:delta,playedAt:hit.time,heldMs,durationOk,velocity:hit.velocity});
    }
    const extras=ons.map((note,i)=>used.has(i)?null:{midi:note.midi,time:note.time,beat:+((note.time-startTime)/beatMs).toFixed(2)}).filter(Boolean);
    const hitNotes=graded.filter(n=>n.status!=='missed');
    const onBeat=graded.filter(n=>n.status==='correct').length;
    const len=expectations.length;
    const noteAccuracy=Math.round(100*hitNotes.length/Math.max(len,hitNotes.length+extras.length,1));
    const rhythmAccuracy=Math.round(100*(graded.filter(n=>n.status==='correct').length+graded.filter(n=>n.status==='late').length*.55)/Math.max(len,1));
    const durationKnown=graded.filter(n=>n.durationOk!==null),durationAccuracy=durationKnown.length?Math.round(100*durationKnown.filter(n=>n.durationOk).length/durationKnown.length):null;
    const byHand=hand=>{const xs=graded.filter(n=>n.hand===hand);return {correct:xs.filter(n=>n.status!=='missed').length,total:xs.length,percent:Math.round(100*xs.filter(n=>n.status!=='missed').length/Math.max(xs.length,1))}};
    const beats=new Map();for(const note of graded){let group=beats.get(note.beat);if(!group){group=[];beats.set(note.beat,group)}group.push(note)}
    const paired=[...beats.values()].filter(g=>g.some(n=>n.hand==='RH')&&g.some(n=>n.hand==='LH'));
    const synchronised=paired.filter(g=>{
      const rh=g.filter(n=>n.hand==='RH'&&n.playedAt!==null).map(n=>n.playedAt),lh=g.filter(n=>n.hand==='LH'&&n.playedAt!==null).map(n=>n.playedAt);
      return rh.length&&lh.length&&Math.abs(Math.min(...rh)-Math.min(...lh))<=Math.max(130,beatMs*.22);
    }).length;
    const coordination=paired.length?Math.round(100*synchronised/paired.length):null;
    // Count unplanned hesitations from consecutive expected onset groups with played notes.
    const onsetGroups=[...beats.entries()].sort((a,b)=>a[0]-b[0]).map(([beat,notes])=>({beat,time:Math.min(...notes.filter(n=>n.playedAt!==null).map(n=>n.playedAt))})).filter(g=>Number.isFinite(g.time));
    let hesitations=0;
    for(let i=1;i<onsetGroups.length;i++){
      const prev=onsetGroups[i-1],curr=onsetGroups[i];
      const extraGap=(curr.time-prev.time)-(curr.beat-prev.beat)*beatMs;
      if(extraGap>Math.max(700,beatMs*.8))hesitations++;
    }
    const late=graded.filter(n=>n.status==='late').length;
    const offbeat=graded.filter(n=>n.status==='offbeat').length;
    const wrong=graded.filter(n=>n.status==='missed').length+extras.length;
    return {version:1,level:ex.level,seed:ex.seed,tempo:bpm,beatMs,startTime,durationMs:recorded?Math.max(0,Math.round(ons.at(-1).time-startTime)):0,
      noteAccuracy,rhythmAccuracy,durationAccuracy,coordination,hesitations,
      correct:onBeat,late,offbeat,missed:graded.filter(n=>n.status==='missed').length,extra:extras.length,matched:hitNotes.length,total:len,
      hands:{RH:byHand('RH'),LH:byHand('LH')},simultaneous:paired.length,synchronised,graded,extras,
      timings:graded.filter(n=>n.deltaMs!==null).map(n=>n.deltaMs),
      note:'MIDI results compare pitch and onset against a fixed target tempo. MIDI cannot distinguish which physical hand pressed a key.'};
  }
  function demo(ex,tempo=60){
    const expected=expectedNotes(ex),beatMs=60000/tempo,startTime=1000;
    let seq=0;const events=[];
    expected.forEach((n,i)=>{
      const miss=i%13===9;
      if(miss)return;
      const delta=i%11===6?390:i%7===3?235:(i%5===0?55:5);
      const time=startTime+n.beat*beatMs+delta;
      events.push({type:'on',midi:n.midi,time,velocity:70,channel:0,sourceId:'demo'});
      events.push({type:'off',midi:n.midi,time:time+Math.max(160,n.duration*beatMs*.8),velocity:0,channel:0,sourceId:'demo'});
      seq++;
    });
    events.push({type:'on',midi:72,time:startTime+beatMs*2.8,velocity:65,channel:0,sourceId:'demo'});
    return analyse(ex,events,tempo,{startTime});
  }
  return Object.freeze({decodeMidi,expectedNotes,analyse,demo});
});
