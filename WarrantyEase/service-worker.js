/* Warranty Ease scoped offline shell; adapted from shared Apps PWA v1 conventions. */
const CACHE='warranty-ease-v10-0';
const PREFIX='warranty-ease-v';
const OCR_CACHE='warranty-ease-ocr-v7';
const PASSKEY_SCRIPT='/Apps/apps-passkey-auth.js';
const ASSETS=['./','./index.html','./release-check.js?v=1.0.0','./style.css?v=1.0.0','./improvements.css?v=1.0.0','./media.css?v=1.0.0','./followups.css?v=1.0.0','./wallet.css?v=1.0.0','./followups.js?v=1.0.0','./followups-ui.js?v=1.0.0','./media.js?v=1.0.0','./resources.js?v=1.0.0','./cloud-chunks.js?v=1.0.0','./app.js?v=1.0.0','./platform.js?v=1.0.0','./apps-manifest.json','./incremental-sync.js?v=1.0.0','./cloud.js?v=1.0.0','./boot.mjs?v=1.0.0','./ocr-control.js?v=1.0.0','./ocr-extract.js?v=1.0.0','./ocr-crop.js?v=1.0.0','./ocr-runner.js?v=1.0.0','./recovery.html','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon.png'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})));await cache.add(PASSKEY_SCRIPT).catch(()=>{});await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE&&k!==OCR_CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname===PASSKEY_SCRIPT){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{const response=await fetch(request);if(response.ok)await cache.put(PASSKEY_SCRIPT,response.clone());return response;}
   catch{return await cache.match(PASSKEY_SCRIPT)||Response.error();}
  })());
  return;
 }
 if(!url.pathname.startsWith('/WarrantyEase/'))return;
 event.respondWith((async()=>{const cache=await caches.open(url.pathname.startsWith('/WarrantyEase/ocr/')?OCR_CACHE:CACHE);
  if(request.mode==='navigate'||url.pathname.endsWith('/version.json')||url.pathname.endsWith('/release-integrity.json')){
   try{const online=await fetch(request,{cache:'no-store'});if(online.ok)await cache.put(request,online.clone());return online}catch{return await cache.match(request)||(request.mode==='navigate'?await cache.match('./index.html'):null)||Response.error()}
  }
  const cached=await cache.match(request);if(cached)return cached;
  try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response}catch{return Response.error()}
 })());
});

// The OCR engine is optional for opening warranties. Explicitly download it for
// offline photo scanning without making the main PWA installation depend on ~MBs of WASM.
self.addEventListener('message',event=>{
 if(event.data?.type!=='warranty-ease:cache-ocr')return;
 const port=event.ports?.[0];
 event.waitUntil((async()=>{
  try{
   const cache=await caches.open(OCR_CACHE);
   const manifestURL=new URL('./ocr/assets.json',self.registration.scope);
   const manifestRequest=new Request(manifestURL.href);
   let response=await cache.match(manifestRequest);
   if(!response){response=await fetch(manifestRequest,{cache:'no-store'});if(!response.ok)throw Error('OCR download list not available');await cache.put(manifestRequest,response.clone());}
   const manifest=await response.json();
   if(!Array.isArray(manifest.assets)||manifest.assets.length<5||manifest.assets.length>40)throw Error('Invalid OCR download list');
   let done=0;
   for(const asset of manifest.assets){
    if(!/^ocr\/[a-zA-Z0-9./_-]+$/.test(asset)||asset.includes('..'))throw Error('Invalid OCR asset');
    const url=new URL('./'+asset,self.registration.scope);
    const request=new Request(url.href);
    if(!await cache.match(request)){
     const file=await fetch(request,{cache:'no-store'});
     if(!file.ok)throw Error('OCR resource unavailable: '+asset);
     await cache.put(request,file);
    }
    port?.postMessage({type:'progress',done:++done,total:manifest.assets.length});
   }
   port?.postMessage({type:'complete',total:done});
  }catch(error){port?.postMessage({type:'error',message:String(error?.message||error)})}
 })());
});