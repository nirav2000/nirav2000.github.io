/* Client-only transport for encrypted Warranty Ease archives larger than a single R2 request.
   A fragment is opaque ciphertext; no record, image or credential is ever sent unencrypted. */
(function(global){
'use strict';
const PART=12*1024*1024, MAX_PARTS=12, MAX_TOTAL=PART*MAX_PARTS;
const text=new TextDecoder();
const toHex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const digest=async bytes=>toHex(await crypto.subtle.digest('SHA-256',bytes));
async function checkedJson(res){let value=await res.json().catch(()=>({}));if(!res.ok)throw Error(String(value.error||value.message||'Cloud request failed: HTTP '+res.status));return value;}
function validManifest(m,id){if(m?.kind!=='chunked'||m?.id!==id||!Number.isInteger(m.parts?.length)||m.parts.length<1||m.parts.length>MAX_PARTS||!Number.isSafeInteger(m.bytes)||m.bytes<49||m.bytes>MAX_TOTAL||!/^[0-9a-f]{64}$/.test(m.sha256||''))throw Error('Cloud snapshot manifest failed validation');let n=0;for(let i=0;i<m.parts.length;i++){let p=m.parts[i];if(p.index!==i||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>PART||!/^[0-9a-f]{64}$/.test(p.sha256||''))throw Error('Cloud snapshot part metadata is invalid');n+=p.bytes;}if(n!==m.bytes)throw Error('Cloud snapshot total does not match manifest');return m;}
async function upload(bytes,{id,send,onProgress}={}){
 const src=bytes instanceof ArrayBuffer?new Uint8Array(bytes):bytes;
 if(!/^[A-Za-z0-9-]{5,80}$/.test(id||'')||typeof send!=='function')throw Error('Invalid cloud upload parameters');
 if(src.byteLength<49||src.byteLength>MAX_TOTAL)throw Error('Encrypted backup too large for safe cloud upload; export a local archive.');
 if(text.decode(src.subarray(0,8))!=='WEASE02!')throw Error('Refusing to upload non-encrypted bytes');
 const parts=[];
 for(let offset=0,index=0;offset<src.byteLength;offset+=PART,index++){
  const chunk=src.subarray(offset,Math.min(src.byteLength,offset+PART));const sha256=await digest(chunk);
  const response=await send(`/backups/${encodeURIComponent(id)}/parts/${index}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Warranty-Digest':sha256},body:chunk});await checkedJson(response);
  parts.push({index,bytes:chunk.byteLength,sha256});onProgress?.({part:index+1,total:Math.ceil(src.byteLength/PART)});
 }
 const manifest=validManifest({kind:'chunked',id,sha256:await digest(src),bytes:src.byteLength,parts},id);
 const done=await send(`/backups/${encodeURIComponent(id)}/complete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(manifest)});await checkedJson(done);
 return manifest;
}
async function download(id,{send,onProgress}={}){
 if(!/^[A-Za-z0-9-]{5,80}$/.test(id||'')||typeof send!=='function')throw Error('Invalid snapshot reference');
 const response=await send(`/backups/${encodeURIComponent(id)}`);
 if(!response.ok)await checkedJson(response);
 const format=response.headers.get('X-Warranty-Format');
 if(format!=='chunked'){
  const blob=await response.blob();const expected=response.headers.get('X-Warranty-Digest');
  if(expected&&await digest(await blob.arrayBuffer())!==expected)throw Error('Cloud archive checksum mismatch');
  return blob;
 }
 const m=validManifest(await response.json(),id);
 const joined=new Uint8Array(m.bytes);let offset=0;
 for(const p of m.parts){
  const part=await send(`/backups/${encodeURIComponent(id)}/parts/${p.index}`);
  if(!part.ok)await checkedJson(part);
  const data=new Uint8Array(await part.arrayBuffer());
  if(data.byteLength!==p.bytes||await digest(data)!==p.sha256)throw Error('Cloud photo/archive part failed integrity verification');
  joined.set(data,offset);offset+=data.byteLength;onProgress?.({part:p.index+1,total:m.parts.length});
 }
 if(text.decode(joined.subarray(0,8))!=='WEASE02!'||await digest(joined)!==m.sha256)throw Error('Cloud encrypted archive failed end-to-end verification');
 return new Blob([joined],{type:'application/octet-stream'});
}
const api={PART,MAX_PARTS,MAX_TOTAL,digest,validManifest,upload,download};global.WarrantyCloudChunks=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);