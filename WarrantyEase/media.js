/* Warranty Ease media: local-only derived thumbnails; original photo is NEVER replaced. */
(function(global){
'use strict';
const isBlob=value=>typeof Blob!=='undefined'&&value instanceof Blob&&value.size>0;
const originalBytes=files=>(files||[]).reduce((n,f)=>n+(isBlob(f?.blob)?f.blob.size:0),0);
const inspect=(files=[])=>({total:files.length,originals:files.filter(f=>isBlob(f?.blob)).length,missing:files.filter(f=>!isBlob(f?.blob)).length,bytes:originalBytes(files),previews:files.filter(f=>isBlob(f?.previewBlob)).length});
const imageBlob=file=>isBlob(file?.previewBlob)?file.previewBlob:(isBlob(file?.blob)?file.blob:null);
function chooseWarrantyLabel(months){const n=Number(months);if(!Number.isFinite(n)||n<=0)return '';if(n%12===0){const years=n/12;return years+'-year warranty'}return n+'-month warranty';}
function createPreview(original,{type='device',maxEdge}={}){
 if(!isBlob(original)||!/^image\//i.test(original.type||''))return Promise.resolve(null);
 return new Promise(resolve=>{
  const url=URL.createObjectURL(original);const im=new Image();let closed=false;
  const done=value=>{if(closed)return;closed=true;URL.revokeObjectURL(url);resolve(value||null)};
  im.onload=()=>{
   try{
    if(!im.naturalWidth||!im.naturalHeight)return done(null);
    const edge=maxEdge||(['label','receipt','warranty'].includes(type)?1800:1100);
    const scale=Math.min(1,edge/Math.max(im.naturalWidth,im.naturalHeight));
    const width=Math.max(1,Math.round(im.naturalWidth*scale));const height=Math.max(1,Math.round(im.naturalHeight*scale));
    // Avoid a huge full-resolution canvas; preserve ORIGINAL blob for full detail, OCR and evidence.
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d',{alpha:false});if(!context)return done(null);
    context.fillStyle='white';context.fillRect(0,0,width,height);
    context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(im,0,0,width,height);
    const quality=type==='label'||type==='receipt'?0.94:0.88;
    canvas.toBlob(blob=>{
     canvas.width=0;canvas.height=0;
     if(!isBlob(blob)||blob.size>=original.size)return done(null);
     done(blob);
    },'image/jpeg',quality);
   }catch{return done(null)}
  };
  im.onerror=()=>done(null);
  im.src=url;
 });
}
const api={isBlob,inspect,imageBlob,originalBytes,createPreview,chooseWarrantyLabel};
global.WarrantyMedia=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);