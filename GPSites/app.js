/* No build, API key, CDN or analytics. All charts derived from local JSON. */
'use strict';
const $ = s => document.querySelector(s);
let all=[], filtered=[], dataset={}, page=0;
const PAGE_SIZE=60;
const supplierNames={silicon_practice:'Silicon Practice',fpm_my_surgery_website:'My Surgery Website / FPM',improvewell:'ImproveWell'};
const text = value => String(value??'').trim();
const esc = value => text(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time = iso => iso ? new Date(iso).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Not yet';
const rels = r => r.historical_supplier_relationships||[];
const websiteRel = r=>rels(r).filter(x=>x.relationship_scope==='website');
const suppliers = r=>new Set([...rels(r).map(x=>x.supplier_id),r.current_website_supplier].filter(Boolean));
const count = (fn,rows=filtered) => rows.filter(fn).length;
const number = n => (n||0).toLocaleString('en-GB');
function setLabel() {
  const fullODS=(dataset.source_runs||[]).some(x=>x.source==='ODS epraccur'&&x.rows>=4500);
  const fullFootfall=(dataset.source_runs||[]).some(x=>x.source?.startsWith('NHS Tech Register')&&x.complete_registry_extract&&x.practices_extracted>=750);
  const pill=$('#coveragePill');pill.textContent=fullODS&&fullFootfall?'National imports complete':'Incomplete source coverage';pill.className='pill '+(fullODS&&fullFootfall?'complete':'incomplete');
  const last=(dataset.source_runs||[]).slice(-4).map(x=>`${esc(x.source)} (${esc(x.rows??x.practices_extracted??x.sites_attempted??'—')})`).join(' · ');
  $('#sourceStatus').innerHTML=`<strong>Research status:</strong> ${fullODS?'ODS national import ✓':'ODS national import pending'} · ${fullFootfall?'FootFall directory import ✓':'FootFall directory import pending'} · Last dataset update: ${esc(time(dataset.last_modified||dataset.created_at))}. <span class="muted">${last||'Seed data only; live scan not yet executed.'}</span>`;
}
function metrics(){
  const cells=[
    ['Organisations',all.length],
    ['Website URLs',count(r=>!!r.website,all)],
    ['Official ODS codes',count(r=>r.ods_code_provenance==='official_ODS_epraccur'||r.ods_code_provenance==='validated_NHS_website_directory',all)],
    ['Silicon associations',count(r=>suppliers(r).has('silicon_practice'),all)],
    ['My Surgery Website',count(r=>suppliers(r).has('fpm_my_surgery_website'),all)],
    ['Websites scanned',count(r=>!!r.website_last_scanned_at,all)]
  ];
  $('#kpis').innerHTML=cells.map(([label,n])=>`<div class="kpi"><div class="value">${number(n)}</div><div class="name">${esc(label)}</div></div>`).join('');
}
function populateRegions(){
  const regions=[...new Set(all.map(r=>r.region).filter(Boolean))].sort();
  $('#regionFilter').innerHTML='<option value="">All regions</option>'+regions.map(r=>`<option value="${esc(r)}">${esc(r)}</option>`).join('');
}
function match(r){
  const q=$('#search').value.trim().toLowerCase();
  if(q && ![r.name,r.ods_code,r.postcode,r.address,r.website,r.region,r.public_phone].some(v=>text(v).toLowerCase().includes(q)))return false;
  const sup=$('#supplierFilter').value, set=suppliers(r);
  if(sup==='unknown' && set.size)return false;
  if(sup==='other' && (![...set].some(x=>!['silicon_practice','fpm_my_surgery_website'].includes(x))))return false;
  if(sup && !['unknown','other'].includes(sup) && !set.has(sup))return false;
  const product=$('#productFilter').value;
  if(product==='website'&&!websiteRel(r).length)return false;
  if(product==='footfall'&&!rels(r).some(x=>/footfall/i.test(x.product||'')))return false;
  if(product==='improvewell'&&!rels(r).some(x=>/improvewell/i.test(x.product||'')))return false;
  if(product==='direct'&&r.current_supplier_status!=='attribution_on_page')return false;
  if(product==='inferred'&&!r.supplier_candidates_from_template?.length)return false;
  const web=$('#websiteFilter').value;
  if(web==='has'&&!r.website || web==='missing'&&r.website || web==='scanned'&&!r.website_last_scanned_at || web==='unchecked'&&r.website_last_scanned_at || web==='not200'&&r.website_status==='http_200')return false;
  const scope=$('#scopeFilter').value;
  if(scope==='ods'&&!r.ods_code)return false;
  if(scope==='gp'&&r.kind!=='GP practice')return false;
  if(scope==='seed'&&r.ods_code_provenance==='official_ODS_epraccur')return false;
  const region=$('#regionFilter').value;
  if(region&&region!==r.region)return false;
  return true;
}
function filter(){
  filtered=all.filter(match);page=0;draw();
}
function drawBars(target,items,total,filterKey){
  const max=Math.max(1,...items.map(x=>x[1]));
  $(target).innerHTML=items.length?items.map(([label,n,key])=>`<div class="bar-line" ${filterKey?`data-filter="${esc(key||'')}" tabindex="0" role="button" aria-label="Filter ${esc(label)}"`:''}><span class="bar-label" title="${esc(label)}">${esc(label)}</span><span class="bar-bg"><span class="bar-fill" style="display:block;width:${(n/max*100).toFixed(1)}%"></span></span><span class="bar-count">${number(n)}</span></div>`).join(''):'<div class="empty">No records match the selected filters.</div>';
  if(filterKey)$(target).querySelectorAll('[data-filter]').forEach(el=>{
    const activate=()=>{$(filterKey).value=el.dataset.filter;filter()};
    el.addEventListener('click',activate);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate()}});
  });
}
function charts(){
  const n=filtered.length;
  const supplier=[['Silicon Practice',count(r=>suppliers(r).has('silicon_practice')),'silicon_practice'],['My Surgery Website',count(r=>suppliers(r).has('fpm_my_surgery_website')),'fpm_my_surgery_website'],['Other named suppliers',count(r=>[...suppliers(r)].some(x=>!['silicon_practice','fpm_my_surgery_website'].includes(x))),'other'],['Unknown',count(r=>suppliers(r).size===0),'unknown']];
  drawBars('#supplierBars',supplier,n,'#supplierFilter');
  const metrics=[['Published website address',count(r=>!!r.website)],['Website inspected',count(r=>!!r.website_last_scanned_at)],['Direct supplier credit found',count(r=>r.current_supplier_status==='attribution_on_page')],['Website product history',count(r=>websiteRel(r).length>0)]];
  $('#coverageBars').innerHTML=metrics.map(([label,v])=>`<div><div class="coverage-title"><span>${esc(label)}</span><b>${number(v)} / ${number(n)} (${n?Math.round(v/n*100):0}%)</b></div><div class="meter"><div style="width:${n?v/n*100:0}%"></div></div></div>`).join('');
  const byArea={};filtered.forEach(r=>{const area=r.region||'Unknown';byArea[area]=(byArea[area]||0)+1});
  drawBars('#regionBars',Object.entries(byArea).sort((a,b)=>b[1]-a[1]).slice(0,6),n);
  const it=[['FootFall leads',count(r=>rels(r).some(x=>/footfall/i.test(x.product||'')))],['Public direct credits',count(r=>r.current_supplier_status==='attribution_on_page')],['No site URL',count(r=>!r.website)],['Source evidence links',filtered.reduce((sum,r)=>sum+(r.evidence||[]).length,0)]];
  $('#integritySummary').innerHTML=it.map(([label,num])=>`<div class="integrity-cell"><strong>${number(num)}</strong><span>${esc(label)}</span></div>`).join('');
}
function badge(status){
  if(status==='http_200')return '<span class="chip green">HTTP 200</span>';
  if(status?.startsWith('http_'))return `<span class="chip amber">${esc(status.replace('http_','HTTP '))}</span>`;
  if(status==='unreachable_or_blocked')return '<span class="chip amber">Unreachable / blocked</span>';
  if(status==='scan_disallowed')return '<span class="chip amber">Robots disallowed</span>';
  return '<span class="chip">Not checked</span>';
}
function table(){
  const ordered=filtered.slice().sort((a,b)=>text(a.name).localeCompare(text(b.name)));
  const size=Math.max(1,Math.ceil(ordered.length/PAGE_SIZE));page=Math.min(Math.max(page,0),size-1);
  $('#rows').innerHTML=ordered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map(r=>{
    const sups=[...suppliers(r)].map(s=>supplierNames[s]||s);
    const type=r.current_supplier_status==='attribution_on_page'?'green':websiteRel(r).length?'purple':'amber';
    const label=sups.length?sups.slice(0,2).join(', '):'Unknown';
    return `<tr role="button" tabindex="0" data-id="${esc(r.record_id)}" aria-label="View ${esc(r.name)}"><td><div class="name">${esc(r.name)}</div><div class="small">${esc(r.kind||'GP practice')}</div></td><td>${esc(r.ods_code||'—')}</td><td>${esc(r.postcode||'—')}</td><td>${r.website?`<a href="${esc(r.website)}" target="_blank" rel="noopener noreferrer" >${esc(r.domain||r.website)} ↗</a>`:'<span class="muted">Not found</span>'}</td><td><span class="chip ${type}">${esc(label)}</span></td><td>${badge(r.website_status)}</td></tr>`;
  }).join('')||'<tr><td colspan="6" class="empty">No matching organisations. Try clearing filters.</td></tr>';
  $('#pageInfo').textContent=`Page ${page+1} of ${size} · ${number(ordered.length)} results`;
  $('#prevBtn').disabled=page===0;$('#nextBtn').disabled=page===size-1;
  $('#rows').querySelectorAll('tr[data-id]').forEach(el=>{
    const activate=()=>showDetails(all.find(r=>r.record_id===el.dataset.id));
    el.addEventListener('click',e=>{if(e.target.closest('a'))return;activate()});el.addEventListener('keydown',e=>{if(e.key==='Enter'){activate()}});
  });
  $('#shownCount').textContent=`${number(filtered.length)} of ${number(all.length)} records`;
}
function showDetails(r){
  if(!r)return;
  const links=(r.evidence||[]).slice(0,25).map(e=>`<li><a target="_blank" rel="noopener noreferrer" href="${esc(e.url)}">${esc(e.type||'Public evidence')}</a> · ${esc(e.product||'')} · ${esc(e.verification||'Unverified')}</li>`).join('');
  const rel=rels(r).map(e=>`<li>${esc(e.supplier||supplierNames[e.supplier_id]||e.supplier_id)} / ${esc(e.product)} · ${esc(e.relationship_scope||'other')} · ${esc(e.historical_evidence||'')}</li>`).join('');
  const box=$('#details');box.hidden=false;
  box.innerHTML=`<button id="closeDetail" class="button button-secondary close">Close ×</button><h2>${esc(r.name)}</h2><div><b>ODS:</b> ${esc(r.ods_code||'Unknown')} · <b>Address:</b> ${esc(r.address||'Unknown')} · <b>Postcode:</b> ${esc(r.postcode||'Unknown')}</div><div><b>Public phone:</b> ${esc(r.public_phone||'Not recorded')}</div><div><b>Website:</b> ${r.website?`<a target="_blank" rel="noopener noreferrer" href="${esc(r.website)}">${esc(r.website)}</a>`:'Not recorded'} · <b>Last scan:</b> ${esc(time(r.website_last_scanned_at))}</div><div><b>Current on-page attribution:</b> ${esc(r.current_website_supplier||'No verified live attribution')}</div><h3>Historical relationships</h3><ul>${rel||'<li>None recorded</li>'}</ul><h3>Public evidence</h3><ul>${links||'<li>No evidence references</li>'}</ul><h3>Technical / scan evidence</h3><pre>${esc(JSON.stringify({website_status:r.website_status,last_scanned_at:r.website_last_scanned_at,public_status_note:'Detailed technology scans remain in the private source repository'},null,2))}</pre>`;
  $('#closeDetail').addEventListener('click',()=>box.hidden=true);
  box.scrollIntoView({behavior:'smooth',block:'start'});
}
function draw(){charts();table();}
function exportFile(filename,mime,data){const url=URL.createObjectURL(new Blob([data],{type:mime}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function csvExport(){
  const fields=['name','kind','ods_code','postcode','address','region','website','public_phone','current_website_supplier','current_supplier_status','website_status','website_last_scanned_at'];
  const quote=x=>'"'+text(x).replaceAll('"','""')+'"';
  const csv=[fields.join(','),...filtered.map(r=>fields.map(k=>quote(r[k])).join(','))].join('\r\n');exportFile('gp-intelligence-filtered.csv','text/csv;charset=utf-8',csv);
}
async function init(){
  try{
    const res=await fetch('./data/public.json',{cache:'no-store'});if(!res.ok)throw Error(`HTTP ${res.status}`);
    dataset=await res.json();
    if(Array.isArray(dataset.record_shards)){
      if(dataset.record_shards.length<1)throw Error('No public data parts');
      const parts=await Promise.all(dataset.record_shards.map(async filename=>{
        if(!/^part-\d{4}\.json$/.test(filename))throw Error('Invalid public data part');
        const response=await fetch('./data/'+filename,{cache:'no-store'});
        if(!response.ok)throw Error('Part '+filename+' HTTP '+response.status);
        const body=await response.json();
        if(!Array.isArray(body.records))throw Error('Invalid public data part '+filename);
        return body.records;
      }));
      dataset.records=parts.flat();
      if(dataset.coverage?.total_records!==dataset.records.length)throw Error('Public dataset count mismatch');
    }
    if(!Array.isArray(dataset.records))throw Error('Invalid dataset: missing records array');
    all=dataset.records;setLabel();metrics();populateRegions();filter();
  }catch(err){
    $('#sourceStatus').textContent=`Unable to load JSON: ${err.message}. Please reload the page or try again later.`;
    $('#coveragePill').textContent='Data unavailable';$('#coveragePill').className='pill incomplete';
  }
}
['#search','#supplierFilter','#productFilter','#websiteFilter','#scopeFilter','#regionFilter'].forEach(s=>$(s).addEventListener(s==='#search'?'input':'change',filter));
$('#resetBtn').addEventListener('click',()=>{['#search','#supplierFilter','#productFilter','#websiteFilter','#scopeFilter','#regionFilter'].forEach(s=>$(s).value='');filter()});
$('#prevBtn').addEventListener('click',()=>{page--;table()});$('#nextBtn').addEventListener('click',()=>{page++;table()});
$('#exportBtn').addEventListener('click',csvExport);
$('#downloadJson').addEventListener('click',()=>exportFile('gp-intelligence-filtered.json','application/json',JSON.stringify({exported_at:new Date().toISOString(),records:filtered},null,2)));
init();