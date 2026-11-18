/* Shared Apps Platform, headless. Offline warranties are independent of platform health.
 * Device/session telemetry is strictly OPT-IN; never include receipts, OCR text, serials or passwords. */
(function(){'use strict';
 const PREF='warranty-ease-monitor-consent.v1';
 const enabled=()=>{try{return localStorage.getItem(PREF)==='yes'}catch{return false}};
 window.APP_MONITOR_APP='WarrantyEase';
 window.FIREBASE_USAGE_APP='warranty-ease';
 window.FIREBASE_USAGE_PROJECT='kk-syllabus';
 window.FIREBASE_USAGE_DATABASE='(default)';
 window.WarrantyPlatform={enabled,setEnabled(v){try{localStorage.setItem(PREF,v?'yes':'no')}catch{};location.reload()},status:'initialising'};
 async function boot(){
   const consent=enabled();
   if(!window.AppsPlatformLoaderV1){window.WarrantyPlatform.status='offline';return;}
   try{
     const platform=await window.AppsPlatformLoaderV1.boot({manifestUrl:'./apps-manifest.json',capabilities:{monitor:consent,firebaseUsage:consent}});
     window.WarrantyPlatform.status='ready';window.WarrantyPlatform.services=platform.services;
   }catch(error){window.WarrantyPlatform.status='unavailable';/* monitoring must never block warranty access */}
 }
 if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot,{once:true});else void boot();
 addEventListener('change',event=>{
   if(event.target?.id==='we-monitor-consent')window.WarrantyPlatform.setEnabled(event.target.checked);
 });
})();