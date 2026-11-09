export function parseDate(value){const m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value||'');return m?`${m[3]}-${m[2]}-${m[1]}`:'';}
export function normalize(input){const list=Array.isArray(input)?input:input.activities;if(!Array.isArray(list))throw new Error('Choose an activities JSON export.');if(list.length>10000)throw new Error('Too many activities.');return list.map((a,i)=>{if(!a||typeof a.title!=='string'||!Array.isArray(a.questions))throw new Error('Invalid activity data.');const validScore=Number.isFinite(a.score_correct)&&Number.isFinite(a.score_total)&&a.score_total>0&&a.score_correct>=0&&a.score_correct<=a.score_total;return {...a,id:a.sourceUrl||`${a.title}|${a.date}|${i}`,score_correct:validScore?a.score_correct:null,score_total:validScore?a.score_total:null,questions:a.questions.map(q=>({...q,answers:Array.isArray(q.answers)?q.answers:[],time_seconds:Number.isFinite(q.time_seconds)&&q.time_seconds>=0?q.time_seconds:null,correct:typeof q.correct==='boolean'?q.correct:null,details_captured:Boolean(q.explanation&&q.answers?.length)}))};});}
export function summaries(activities){const qs=activities.flatMap(a=>a.questions);return {activities:activities.length,questions:qs.length,details:qs.filter(q=>q.details_captured).length,unavailable:activities.filter(a=>!a.questions.length).length};}
export function topics(activities){const map=new Map();for(const a of activities)for(const q of a.questions){if(!q.topic)continue;const t=map.get(q.topic)||{topic:q.topic,count:0,correct:0,times:[]};if(q.correct!==null){t.count++;if(q.correct)t.correct++;}if(q.time_seconds!==null)t.times.push(q.time_seconds);map.set(q.topic,t);}return [...map.values()].map(t=>({...t,median:t.times.length?median(t.times):null})).sort((a,b)=>b.count-a.count);}
export function median(xs){const a=[...xs].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;}
export function matching(q,filter,note={}){return filter==='all'||filter==='wrong'&&q.correct===false||filter==='slow'&&q.time_seconds!==null&&q.time_seconds>=60||filter==='missing'&&!q.details_captured||filter==='bookmarked'&&note.bookmarked;}


/** Readable presentation of the original Atom transcript. No source data is mutated. */
export function explanationSections(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  const sections = [];
  let heading = '', lines = [];
  const finish = () => {
    if (!heading && !lines.length) return;
    const text = lines.join(' ')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/(\d+)\s+o\b/g, '$1°')
      .replace(/\b(\d+)\s+(st|nd|rd|th)\b/gi, '$1$2')
      .replace(/\s+([.,!?;:])/g, '$1')
      .replace(/'\s+([^']+?)\s+'/g, (_, word) => "'" + word.trim() + "'")
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/∘/g, '•')
      .trim();
    sections.push({heading, text});
  };
  for (const raw of value.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([A-Za-z][A-Za-z0-9 ,/()\-]{1,50}):$/.exec(line);
    if (match) { finish(); heading = match[1]; lines = []; }
    else lines.push(line);
  }
  finish();
  return sections;
}

/** Original teaching content rather than reused Atom questions. */
export const SKILLS = Object.freeze({
  'Nets and Cubes': {
    name:'Cube nets and opposite faces',
    idea:'A folded cube preserves the six faces, their neighbours and their opposite pairs.',
    steps:[
      'Name the six faces before imagining any folding.',
      'Mark opposite pairs: opposite faces can never share an edge.',
      'Inspect the three faces meeting at a corner. All three must be mutually adjacent.',
      'Check for extra, missing or changed symbols before deciding.'
    ],
    check:'Can you name one pair of faces that must never touch?',
    transfer:'Draw a simple cross-shaped cube net and mark its opposite faces.'
  },
  'Rotating 3D Shapes': {
    name:'Rotate objects without changing their parts',
    idea:'Rotation changes the view, never the number, lengths or connections of the blocks.',
    steps:[
      'Count the cubes and the long/short cuboids separately.',
      'Choose an anchor block (a distinctive colour or long edge).',
      'Turn the structure mentally around that anchor; keep the neighbouring blocks together.',
      'Eliminate options with different block counts, lengths or connections.'
    ],
    check:'Which features stay the same even when the object turns?',
    transfer:'Build a three-block shape and photograph it from two directions.'
  },
  'Sequences': {
    name:'Find each changing rule separately',
    idea:'A sequence may change position and rotation at the same time.',
    steps:[
      'Check rotation, then position, then count, then colour or shading.',
      'Describe each change from frame 1 to 2, and test it from 2 to 3.',
      'Predict the missing frame before looking at the options.',
      'Eliminate candidates that break even one verified rule.'
    ],
    check:'Are two changes happening at once? Test them one at a time.',
    transfer:'Invent an arrow sequence that turns and moves one place each step.'
  },
  'Odd One Out': {
    name:'Find the rule shared by the other four',
    idea:'The odd one out breaks an invariant; the four remaining choices share it.',
    steps:[
      'Compare number, shape, shading, symmetry and orientation.',
      'Propose a property shared by at least four options.',
      'Check the property against every other option.',
      'Explain precisely how the fifth option breaks that rule.'
    ],
    check:'Can you state one rule that applies to all four remaining options?',
    transfer:'Draw five figures where only one breaks a rule you chose.'
  },
  'Following Folds': {
    name:'Unfold in reverse',
    idea:'A fold acts like a mirror line; holes repeat across the folded layers.',
    steps:[
      'Count the layers of folded paper.',
      'Undo the final fold first, reflecting the cuts across its crease.',
      'Undo earlier folds one at a time.',
      'Check both positions and the number of cutouts.'
    ],
    check:'Which fold must you undo first?',
    transfer:'Fold paper twice, punch one safe hole, then unfold to check.'
  },
  'Match to a Group': {
    name:'Find the group rule',
    idea:'Check several properties rather than matching by appearance alone.',
    steps:['Write down what every group member shares.','Check number and shading independently.','Test each answer against all group rules.'],
    check:'What two features do all the group members have?',
    transfer:'Sort six drawn shapes using two different criteria.'
  },
  'Match to a Pair': {
    name:'Match relationships, not just shapes',
    idea:'What matters is how two shapes relate.',
    steps:['Compare size and number.','Compare relative position and shading.','Choose the pair with the same relationships.'],
    check:'What relationship does every matching pair preserve?',
    transfer:'Create two pairs that share a position rule.'
  },
  'Pairing Shapes': {
    name:'Recognise consistent pairing',
    idea:'A correct pair preserves a relationship across several elements.',
    steps:['Identify the invariant.','Compare the pair using number, shape and placement.','Rule out a pair with a mismatched feature.'],
    check:'What relationship is shared?',
    transfer:'Invent two pairs with the same rule.'
  },
  'Parts within a Shape': {
    name:'Compare parts using exact proportions',
    idea:'Similar-looking fragments may have different lengths and proportions.',
    steps:['Identify the target fragment.','Ignore surrounding distracting lines.','Compare corner angles and relative side lengths.'],
    check:'Does the whole fragment match in proportions, not only outline?',
    transfer:'Search a drawing for a hidden triangle.'
  }
});

export const PRACTICE_ITEMS = Object.freeze([
  {id:'net-1',topic:'Nets and Cubes',prompt:'In a cube net, the red face is opposite the blue face. Could red and blue touch along an edge when folded?',options:['Yes','No','Only when turned upside down'],answer:1,hint:'Opposite faces are on different sides of the cube, not neighbours.',why:'Opposite faces never meet at an edge, regardless of how you rotate the cube.'},
  {id:'net-2',topic:'Nets and Cubes',prompt:'A net has exactly one star-marked face. One suggested cube shows stars on two visible faces. Is that possible?',options:['Yes','No','Only if a face is hidden'],answer:1,hint:'Folding cannot create new markings.',why:'The net contains one marked face, and that count stays one when the cube folds.'},
  {id:'net-3',topic:'Nets and Cubes',prompt:'A red face and a green face share an edge on a net. After folding, must they still be neighbours?',options:['Yes','No','Only if both are on the front'],answer:0,hint:'A shared edge remains connected after folding.',why:'Two net squares sharing a fold edge become adjacent cube faces.'},
  {id:'rotate-1',topic:'Rotating 3D Shapes',prompt:'A block arrangement has two cubes and one long cuboid. After turning it round, how many pieces does it have?',options:['Two','Three','Four'],answer:1,hint:'Rotation changes the viewpoint, not the pieces.',why:'There are still three pieces: two cubes and one cuboid.'},
  {id:'rotate-2',topic:'Rotating 3D Shapes',prompt:'Two blocks are joined face-to-face. Can a rotation make those blocks stop touching?',options:['Yes','No','Only a quarter-turn can'],answer:1,hint:'Keep track of which faces are connected.',why:'Rotation preserves contact and relative structure.'},
  {id:'rotate-3',topic:'Rotating 3D Shapes',prompt:'An option has a shorter long block than the original. Could it be a rotation of the same arrangement?',options:['Yes','No','If seen from above'],answer:1,hint:'A rigid object does not change size when rotated.',why:'A turn never changes the real lengths or sizes of its blocks.'},
  {id:'sequence-1',topic:'Sequences',prompt:'An arrow points up, then down, then up, then down. What comes next?',options:['Up','Down','Left'],answer:0,hint:'The direction alternates each step.',why:'Up and down alternate, so the fifth arrow points up.'},
  {id:'sequence-2',topic:'Sequences',prompt:'An arrow alternates up and down while moving one square to the right in every step. Which two things must you check?',options:['Only direction','Only position','Direction and position'],answer:2,hint:'There are two independent changes.',why:'A correct answer needs both the next orientation and the next location.'},
  {id:'sequence-3',topic:'Sequences',prompt:'A pattern turns 90° clockwise each step. After four equal turns, which way will it point?',options:['The starting direction','Opposite the starting direction','A quarter turn from the start'],answer:0,hint:'Four quarter-turns make one full revolution.',why:'4 × 90° = 360°, which returns to the starting direction.'},
  {id:'odd-1',topic:'Odd One Out',prompt:'Four shapes have exactly one shaded corner. A fifth has two shaded corners. Which is the strongest rule?',options:['Pick the largest','Count shaded corners','Pick your favourite'],answer:1,hint:'Focus on the one feature shared by four.',why:'The odd shape breaks the consistent number of shaded corners.'},
  {id:'odd-2',topic:'Odd One Out',prompt:'Four figures each have rotational symmetry. One has only mirror symmetry. What should you examine?',options:['Overall colour','Rotational symmetry','Shape size alone'],answer:1,hint:'The difference is a transformation property.',why:'Symmetry type is the rule that distinguishes the single figure.'},
  {id:'odd-3',topic:'Odd One Out',prompt:'You found a rule that works for three of five choices, but not the other two. Is it enough to identify one odd one out?',options:['Yes','No','Only if the shapes are small'],answer:1,hint:'Four choices must share the proposed rule.',why:'A credible odd-one-out rule must hold for the other four.'}
]);

/** Statistics describe results only. They cannot identify a child's thought process. */
export function reviewInsights(activities, notes={}) {
  const byTopic = new Map();
  let correct = 0, wrong = 0, withTime = 0, slow = 0, slowWrong = 0, reviewed = 0, details = 0;
  const barrierCounts = new Map();
  const reviewCandidates=[];
  for (const a of activities) for (const q of a.questions) {
    if (q.correct === true) correct++;
    if (q.correct === false) wrong++;
    if (q.time_seconds !== null) {
      withTime++;
      if (q.time_seconds >= 60) {
        slow++;
        if (q.correct === false) slowWrong++;
      }
    }
    if (q.details_captured) details++;
    const id=a.id+'::'+q.number;
    const note=notes[id]||{};
    if (note.reviewedAt && (note.reasoning || note.barrier || note.support || note.confidence)) {
      reviewed++;
      if (note.barrier && !['unknown','other'].includes(note.barrier))
        barrierCounts.set(note.barrier,(barrierCounts.get(note.barrier)||0)+1);
    }
    if (q.topic) {
      const t=byTopic.get(q.topic)||{topic:q.topic,count:0,correct:0,wrong:0,times:[],full:0,reviewed:0};
      t.count++;
      if(q.correct===true)t.correct++;
      if(q.correct===false)t.wrong++;
      if(q.time_seconds!==null)t.times.push(q.time_seconds);
      if(q.details_captured)t.full++;
      if(note.reviewedAt)t.reviewed++;
      byTopic.set(q.topic,t);
    }
    if(q.correct===false || (q.time_seconds!==null && q.time_seconds>=60)) {
      let rank=(q.correct===false?60:15) + (q.time_seconds>=60?18:0)
        +(q.time_seconds>=120?8:0)+(q.details_captured?12:0)
        +(['Nets and Cubes','Rotating 3D Shapes'].includes(q.topic)?8:0)
        -(note.reviewedAt?65:0);
      reviewCandidates.push({id,activityId:a.id,number:q.number,topic:q.topic||'Topic not captured',title:a.title,date:a.date,seconds:q.time_seconds,correct:q.correct,details:q.details_captured,rank});
    }
  }
  const topicRows=[...byTopic.values()].map(t=>({topic:t.topic,count:t.count,correct:t.correct,wrong:t.wrong,
    accuracy:t.correct+t.wrong?Math.round(100*t.correct/(t.correct+t.wrong)):null,
    medianSeconds:median(t.times),details:t.full,reviewed:t.reviewed}))
    .sort((a,b)=>(a.accuracy??101)-(b.accuracy??101) || b.count-a.count);
  const priorities=topicRows.filter(t=>t.count>=8 && t.accuracy!==null && t.accuracy<65);
  reviewCandidates.sort((a,b)=>b.rank-a.rank || (parseDate(b.date)||'').localeCompare(parseDate(a.date)||'') || a.number-b.number);
  return {correct,wrong,withTime,slow,slowWrong,reviewed,details,topicRows,priorities,
    barriers:[...barrierCounts].sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})),
    sequenceProfile:sequenceRuleProfile(activities),queue:reviewCandidates.slice(0,12)};
}


/**
 * Legacy-worker-compatible private storage. The deployed Worker currently stores
 * only {bookmarked,text} per note. Sidecar entries preserve richer family
 * observations and practice counts without requiring a new backend deployment.
 * All content stays inside the authenticated private notes collection.
 */
export function packPrivateNotes(notes) {
  const result=Object.create(null);
  for(const [id,entry] of Object.entries(notes||{})){
    if(id.startsWith('coach::'))continue;
    const n=entry||{};
    if(id.startsWith('practice::')){
      const packed={v:1,attempts:n.attempts||0,successes:n.successes||0,reason:String(n.text||'').slice(0,3000)};
      result[id]={bookmarked:false,text:JSON.stringify(packed)};
      continue;
    }
    result[id]={bookmarked:!!n.bookmarked,text:String(n.text||'').slice(0,5000)};
    const observed={v:1};
    for(const field of ['reasoning','confidence','barrier','support','outcome','reviewedAt'])
      if(typeof n[field]==='string' && n[field])observed[field]=n[field];
    if(Object.keys(observed).length>1)
      result['coach::'+id]={bookmarked:false,text:JSON.stringify(observed)};
  }
  return result;
}

export function unpackPrivateNotes(payload) {
  const result=Object.create(null);
  if(!payload || typeof payload!=='object'||Array.isArray(payload))return result;
  for(const [id,entry] of Object.entries(payload)){
    if(id.startsWith('coach::')||id.startsWith('practice::'))continue;
    result[id]={bookmarked:!!entry?.bookmarked,text:String(entry?.text||'')};
    // Supports a future Worker that can persist structured fields directly.
    for(const field of ['reasoning','confidence','barrier','support','outcome','reviewedAt'])
      if(typeof entry?.[field]==='string')result[id][field]=entry[field];
  }
  for(const [id,entry] of Object.entries(payload)){
    if(id.startsWith('coach::')){
      const key=id.slice('coach::'.length);
      try {
        const parsed=JSON.parse(entry?.text||'');
        if(parsed?.v!==1 || !key || typeof parsed!=='object')continue;
        if(!result[key])result[key]={bookmarked:false,text:''};
        for(const field of ['reasoning','confidence','barrier','support','outcome','reviewedAt'])
          if(typeof parsed[field]==='string')result[key][field]=parsed[field];
      }catch{/* Ignore malformed sidecars; keep ordinary notes readable. */}
    }else if(id.startsWith('practice::')){
      try {
        const data=JSON.parse(entry?.text||'');
        if(data?.v===1 && Number.isSafeInteger(data.attempts) &&
          Number.isSafeInteger(data.successes) && data.attempts>=0 &&
          data.successes>=0 && data.successes<=data.attempts){
          result[id]={bookmarked:false,text:String(data.reason||''),attempts:data.attempts,successes:data.successes};
        }
      }catch{/* Not a practice record. */}
    }
  }
  return result;
}


/** Detect whether a saved Atom sequence explanation describes one or several linking rules. */
export function sequenceRuleProfile(activities){
  const groups={single:{right:0,wrong:0},multi:{right:0,wrong:0}};
  for(const activity of activities)for(const q of activity.questions){
    if(q.topic!=='Sequences'||typeof q.explanation!=='string'||typeof q.correct!=='boolean')continue;
    const matches=[...q.explanation.matchAll(/Linking Element\s*(\d+)\s*:/gi)].map(m=>Number(m[1]));
    const number=matches.length?Math.max(...matches):/Linking Element\s*:/i.test(q.explanation)?1:0;
    if(!number)continue;
    const row=number>=2?groups.multi:groups.single;
    row[q.correct?'right':'wrong']++;
  }
  return groups;
}
