const assert=require('node:assert/strict');
const Core=require('../midi-core.js');
const fs=require('node:fs'),vm=require('node:vm');
function makeScore(level,seed){
 const src=fs.readFileSync(__dirname+'/../app.js','utf8');
 const nodes=new Map(),ls={};
 const document={getElementById(id){return nodes.get(id)||{innerHTML:'',textContent:'',classList:{add(){},remove(){}}}},addEventListener(){}};
 const window={SightReadMidiCore:Core,SightReadMidi:{onMidi(){},onStatus(){},getStatus(){return {mode:'unsupported',connected:false}}},addEventListener(){},scrollTo(){}};
 const ctx={window,document,console,Date,JSON,Math,performance:{now:()=>1},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},cancelAnimationFrame(){},requestAnimationFrame(){},navigator:{},location:{hash:''},localStorage:{getItem(){return null},setItem(){}},URL:{},Blob};
 vm.createContext(ctx);vm.runInContext(src,ctx);return window.__sightreadTest.makeExercise(level,seed)
}
for(let level=0;level<4;level++){
 const ex=makeScore(level,100+level),tempo=60,beatMs=1000,start=4000;
 const hits=[];
 for(const n of Core.expectedNotes(ex)){
  hits.push({type:'on',midi:n.midi,channel:0,sourceId:'test',time:start+n.beat*beatMs,velocity:70});
  hits.push({type:'off',midi:n.midi,channel:0,sourceId:'test',time:start+(n.beat+n.duration*.8)*beatMs,velocity:0});
 }
 const res=Core.analyse(ex,hits,tempo,{startTime:start});
 assert.equal(res.matched,res.total,`perfect pitch level ${level}`);
 assert.equal(res.noteAccuracy,100,`perfect note accuracy level ${level}`);
 assert.equal(res.rhythmAccuracy,100,`perfect rhythm level ${level}`);
 assert.equal(res.extra,0,`perfect extras level ${level}`);
 assert.equal(res.hesitations,0,`perfect continuity level ${level}`);
 assert.equal(res.coordination,100,`perfect coordination level ${level}`);
 // One late note; one missing note and one unexpected key.
 const targets=Core.expectedNotes(ex); const target=targets.find(x=>x.beat>0&&x.beat<12);
 const offbeat=hits.filter(e=>!(e.midi===target.midi&&Math.abs(e.time-(start+target.beat*beatMs))<1&&e.type==='on'));
 offbeat.push({type:'on',midi:83,channel:0,sourceId:'test',time:start+8000,velocity:70});
 const graded=Core.analyse(ex,offbeat,tempo,{startTime:start});
 assert(graded.extra>=1,`unexpected key should be scored level ${level}`);
 assert(graded.noteAccuracy<=100);
 const demo=Core.demo(ex,tempo);
 assert(demo.graded.some(n=>n.status==='correct'));
 assert(demo.graded.some(n=>n.status==='late'||n.status==='offbeat'));
 assert(demo.extra>0);
}
assert.equal(Core.decodeMidi([0x90,60,100],120,'piano').type,'on');
assert.equal(Core.decodeMidi([0x90,60,0],120,'piano').type,'off');
assert.equal(Core.decodeMidi([0x80,60,64],120,'piano').type,'off');
assert.equal(Core.decodeMidi([0xb0,64,127],120,'piano').type,'cc');
assert.equal(Core.decodeMidi([0xb0,1,127],120,'piano'),null);
assert.equal(Core.decodeMidi([0xf0,60,127],120,'piano'),null);
assert.equal(Core.decodeMidi([0x90,150,127],120,'piano'),null);
const sample={level:1,seed:1,rh:[{bar:0,beat:0,midi:60,dur:1,hand:'RH'},{bar:0,beat:1,midi:62,dur:1,hand:'RH'}],lh:[{bar:0,beat:0,midi:48,dur:2,hand:'LH'}]};
const t0=1000, perfectlyTimed=[{type:'on',midi:60,time:t0,sourceId:'demo',channel:0},{type:'on',midi:48,time:t0+60,sourceId:'demo',channel:0},{type:'on',midi:62,time:t0+1350,sourceId:'demo',channel:0}];
const result=Core.analyse(sample,perfectlyTimed,60,{startTime:t0});
assert.equal(result.late,1);
assert.equal(result.coordination,100);
assert.equal(result.matched,3);
console.log('PASS: 4 grades, chord and duration matching, timing windows, missed notes, unexpected notes, MIDI decoding, demonstration and both-hand scoring.');
