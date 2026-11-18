/* Warranty Ease scoped offline shell; adapted from shared Apps PWA v1 conventions. */
const CACHE='warranty-ease-v3';
const PREFIX='warranty-ease-v';
const ASSETS=['./','./index.html','./style.css','./app.js','./cloud.js','./boot.mjs','./recovery.html','./manifest.webmanifest','./assets/icon-192.png','./assets/icon-512.png','./assets/favicon.png'];
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(ASSETS);await self.skipWaiting();})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/WarrantyEase/'))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);
  if(request.mode==='navigate'||url.pathname.endsWith('/version.json')){
   try{const online=await fetch(request,{cache:'no-store'});if(online.ok)await cache.put(request,online.clone());return online}catch{return await cache.match(request)||await cache.match('./index.html')||Response.error()}
  }
  const cached=await cache.match(request);if(cached)return cached;
  try{const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response}catch{return Response.error()}
 })());
});