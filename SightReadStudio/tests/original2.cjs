const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../app.js','utf8');
const nodes={}, handlers={}, store={};
function el(id){return nodes[id]??(nodes[id]={innerHTML:'',textContent:'',value:'',classList:{add(){},remove(){}},scrollIntoView(){}})}
const context={console,Date,Math,JSON,performance:{now:()=>Date.now()},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},navigator:{},location:{hash:''},localStorage:{getItem(k){return store[k]||null},setItem(k,v){store[k]=v}},window:{addEventListener(){},scrollTo(){},confirm:()=>false},document:{getElementById:el,addEventListener(n,f){handlers[n]=f},body:{appendChild(){}},createElement:()=>({click(){},remove(){}})},Blob:class{},URL:{createObjectURL:()=>'',revokeObjectURL(){}}};
context.window.navigator=context.navigator;context.window.location=context.location;
vm.createContext(context);vm.runInContext(src,context,{filename:'app.js'});
const hook=context.window.__sightreadTest;
assert(hook,'Test hooks should be exported');
let sharpFound=false,groupCount=0;
for(let level=0;level<=3;level++)for(let seed=1;seed<=300;seed++){
 const score=hook.makeExercise(level,seed);
 for(let bar=0;bar<4;bar++){
  const rh=score.rh.filter(n=>n.bar===bar),lh=score.lh.filter(n=>n.bar===bar);
  assert.equal(rh.reduce((v,n)=>v+n.dur,0),4,`right-hand bar length level=${level} seed=${seed}`);
  assert(lh.length>=1,`left hand in each bar ${level}:${seed}`);
  const expected=level===3&&bar%2===1?6:4;
  assert.equal(lh.reduce((v,n)=>v+n.dur,0),expected,`left-hand bar with chords level=${level} seed=${seed}`);
  for(const n of [...rh,...lh])assert(n.midi>=36&&n.midi<=84,`note outside playable virtual keyboard ${n.midi}`);
 }
 assert(score.groups.length>=12);
 assert(score.groups.every((g,i,a)=>i===0||g.beat>a[i-1].beat));
 const svg=hook.scoreSvg(score);
 if(score.lh.some(n=>n.midi%12===6)){assert(svg.includes('♯'),'F# chord must show sharp accidental');sharpFound=true}
 groupCount+=score.groups.length;
}
assert(sharpFound);
assert.equal(hook.rhythmOnsets([[1,1,2],[.5,.5,1,2]]).length,7);
const pages=['home','plan','notes','rhythm','hands','reading','progress','guide','settings'];
function nav(page){handlers.click({target:{closest(s){return s==='[data-page]'?{dataset:{page}}:null}}})}
function action(name){handlers.click({target:{closest(s){return s==='[data-action]'?{dataset:{action:name}}:null}}})}
for(const pg of pages){nav(pg);assert(el('app-main').innerHTML.length>1000,`Page ${pg} renders`)}
nav('reading');action('begin-preview');action('begin-playing');action('save-reading');
assert.equal((JSON.parse(store['sightread-studio-progress-v1'])?.readingRuns||[]).length,0,'must not save without choosing scores');
for(const [id,value] of Object.entries({'reading-accuracy':'85','reading-stops':'1','reading-pulse':'3','reading-hands':'3'}))el(id).value=value;
action('save-reading');
assert.equal(JSON.parse(store['sightread-studio-progress-v1']).readingRuns.length,1);
console.log(`PASS: ${4*300} scores, ${groupCount} note groups, accidental notation, 9 pages, form validation and saved first-read record.`);
