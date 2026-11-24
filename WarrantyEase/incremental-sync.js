/* Private R2 sync protocol, independent of authentication and IndexedDB. */
'use strict';
window.WarrantyIncremental=(()=>{
  function canonical(value){
    if(Array.isArray(value))return value.map(canonical);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
    return value;
  }
  const same=(a,b)=>a===b||JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
  const byId=items=>new Map((items||[]).map(item=>[item.id,item]));
  const ordered=items=>[...items].sort((a,b)=>a.id.localeCompare(b.id));
  const hashes=record=>[...new Set((record?.value?.files||[]).flatMap(f=>[f.originalHash,f.previewHash]).filter(Boolean))];
  const hashValid=hash=>typeof hash==='string'&&/^[a-f0-9]{64}$/.test(hash);

  function merge(base,local,remote){
    if(!local)return remote;
    if(!remote)return local;
    if(local.deleted||remote.deleted){
      if(local.deleted&&remote.deleted)return local.deletedAt>remote.deletedAt?local:remote;
      return local.deleted?local:remote;
    }
    const l=local.value,r=remote.value,b=base?.value;
    if(local.kind==='vault'&&!same(l,r))throw Error('These devices have different website-login vault keys. Both vaults are preserved.');
    if(same(local,base))return remote;
    if(same(remote,base)||same(local,remote))return local;
    const localTime=Date.parse(l.updatedAt)||0,remoteTime=Date.parse(r.updatedAt)||0;
    const preferLocal=localTime===remoteTime
      ?JSON.stringify(canonical(l))>JSON.stringify(canonical(r)):localTime>remoteTime;
    const select=(old,left,right)=>{
      if(same(left,right)||same(right,old))return left;
      if(same(left,old))return right;
      return preferLocal?left:right;
    };
    const fields=(old,left,right)=>Object.fromEntries([...new Set([...Object.keys(left),...Object.keys(right)])]
      .map(key=>[key,select(old?.[key],left[key],right[key])]).filter(([,value])=>value!==undefined));
    const value=fields(b,l,r);
    if(local.kind==='appliance'){
      const mergeItems=(baseItems,leftItems,rightItems,{attachments=false}={})=>{
        const old=byId(baseItems),left=byId(leftItems),right=byId(rightItems),merged=new Map();
        for(const id of new Set([...left.keys(),...right.keys()])){
          const before=old.get(id),a=left.get(id),z=right.get(id);
          // Removal wins against a concurrent edit to the same attachment or follow-up.
          if(before&&(!a||!z))continue;
          const item=a&&z?fields(before,a,z):(a||z);
          if(attachments&&a?.originalHash&&z?.originalHash&&a.originalHash!==z.originalHash&&
             a.originalHash!==before?.originalHash&&z.originalHash!==before?.originalHash){
            const other=item.originalHash===a.originalHash?z:a;
            const alternative=id+'-variant-'+other.originalHash.slice(0,12);
            merged.set(alternative,{...other,id:alternative,name:'Preserved alternative - '+(other.name||'evidence')});
          }
          merged.set(id,item);
        }
        return ordered(merged.values());
      };
      value.files=mergeItems(b?.files,l.files,r.files,{attachments:true});
      value.followUps=mergeItems(b?.followUps,l.followUps,r.followUps);
    }
    return {...remote,value};
  }

  async function reconcile({send,localRecords,bases,localBlob,hasLocalBlob=localBlob,saveBlob,commit,active=()=>true}){
    const list=await send('/records');
    if(!list.ok)throw Error('Could not list private cloud records ('+list.status+').');
    const {records}=await list.json();
    if(!Array.isArray(records))throw Error('Invalid private cloud record listing.');
    const index=byId(records),seen=new Set();
    let vault;
    const putFiles=async record=>{
      for(const hash of hashes(record)){
        if(seen.has(hash))continue;
        const path='/files/'+hash,exists=await send(path,{method:'HEAD'});
        if(exists.status===404){
          const blob=await localBlob(hash);
          if(!blob)throw Error('An original attachment is unavailable on this device. Sync will retry when it can be recovered.');
          const result=await send(path,{method:'PUT',headers:{'Content-Type':'application/octet-stream'},body:blob});
          if(!result.ok)throw Error('Attachment upload failed ('+result.status+').');
        }else if(!exists.ok)throw Error('Attachment availability check failed ('+exists.status+').');
        seen.add(hash);
      }
    };
    const hydrateFiles=async record=>{
      for(const hash of hashes(record)){
        if(await hasLocalBlob(hash))continue;
        const result=await send('/files/'+hash);
        if(!result.ok)throw Error('Could not recover an attachment ('+result.status+').');
        await saveBlob(hash,await result.blob());
      }
    };
    const ids=new Set([...index.keys(),...localRecords.keys(),...bases.keys()]);
    // Establish the vault key before syncing any of its encrypted account records.
    for(const id of ['vault',...[...ids].filter(id=>id!=='vault').sort()]){
      if(!active())return false;
      const local=localRecords.get(id),cached=bases.get(id),listed=index.get(id);
      let remote=cached?.record,etag=cached?.etag;
      if(cached&&!listed)throw Error('A private cloud record is missing from the index.');
      if(listed&&listed.etag!==etag){
        const response=await send('/records/'+id);
        if(!response.ok)throw Error('Could not read a changed cloud record ('+response.status+').');
        remote=await response.json();
        etag=response.headers.get('ETag')?.replace(/^"|"$/g,'');
        if(remote?.id!==id||remote.version!==2||!etag)throw Error('Invalid private cloud record.');
      }
      if(!local&&!remote)continue;
      // Old device rows can have intact metadata but no hash after browser
      // eviction. An exact remote reference can identify the missing bytes.
      const repaired=local?.kind==='appliance'&&!local.deleted?{...local,value:{...local.value,files:local.value.files.map(file=>{
        if(hashValid(file.originalHash))return file;
        const match=remote?.value?.files?.find(candidate=>candidate.id===file.id&&candidate.name===file.name&&candidate.mime===file.mime);
        return match?{...file,originalHash:match.originalHash}:file;
      })}}:local;
      const chosen=merge(cached?.record,repaired,remote);
      if(id==='vault')vault=chosen;
      if(chosen.kind==='account'&&!chosen.deleted&&!vault?.value)throw Error('Encrypted account has no matching vault.');
      if(chosen.value?.files?.some(file=>!hashValid(file.originalHash)))throw Error('An original attachment is missing. Keep the device with the original or recover it from an encrypted archive.');

      if(!same(chosen,remote)){
        if(!active())return false;
        // Only probe hashes newly referenced by this record. Previous revisions
        // already verified the immutable bytes on the Worker.
        const previous=new Set(hashes(remote));
        const newFiles=(chosen.value?.files||[]).map(file=>({
          originalHash:previous.has(file.originalHash)?null:file.originalHash,
          previewHash:previous.has(file.previewHash)?null:file.previewHash
        }));
        await putFiles({value:{files:newFiles}});
        if(!active())return false;
        const response=await send('/records/'+id,{
          method:'PUT',headers:{'Content-Type':'application/json',...(etag?{'If-Match':'"'+etag+'"'}:{'If-None-Match':'*'})},
          body:JSON.stringify(chosen)
        });
        if(response.status===412)return false;
        if(!response.ok)throw Error('Could not save a changed cloud record ('+response.status+').');
        ({etag}=await response.json());
        if(!etag)throw Error('Cloud record revision was not acknowledged.');
      }
      await hydrateFiles(chosen);
      if(!active())return false;
      if(!same(local,chosen)||cached?.etag!==etag){
        if(!await commit(id,chosen,etag))return false;
      }
    }
    return true;
  }

  return {reconcile,same,hashValid,hashes};
})();
