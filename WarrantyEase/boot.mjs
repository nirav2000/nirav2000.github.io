/* Shared PWA registration with safe same-app offline fallback. */
import('/Apps/pwa/v1/index.js').then(({initPWA})=>
  initPWA({serviceWorkerUrl:'./service-worker.js',scope:'/WarrantyEase/'})
).catch(()=>{
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./service-worker.js',{scope:'/WarrantyEase/'}).catch(()=>{});
});