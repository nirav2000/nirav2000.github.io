/* App-side OCR transport. Runs OCR in a dedicated Worker, not in the website-login UI.
   Never sends images, extracted text or vault data to a third-party API. */
(function(){
  'use strict';
  let worker = null;
  let active = null;
  let seq = 0;
  const TIMEOUT = 120000;
  function stop(){
    if(worker){worker.terminate();worker=null;}
    if(active){clearTimeout(active.timer);active.reject(new Error('Image scan stopped.'));active=null;}
  }
  function recognize(blob, onProgress){
    if(active) return Promise.reject(new Error('A photo is already being scanned.'));
    if(!blob||!/^image\//i.test(blob.type||''))return Promise.reject(new Error('Please select a photo.'));
    if(typeof Worker==='undefined')return Promise.reject(new Error('This browser does not support offline photo scanning.'));
    return new Promise((resolve,reject)=>{
      const id='we-ocr-'+(++seq);
      try{
        worker ||= new Worker('./ocr-runner.js');
      }catch(error){reject(new Error('Could not start the offline scanner. '+String(error?.message||error)));return;}
      active={id,resolve,reject,onProgress,timer:setTimeout(()=>{
        stop();
      },TIMEOUT)};
      worker.onmessage=e=>{
        const data=e.data||{};
        if(!active||data.id!==active.id)return;
        if(data.kind==='progress'){try{active.onProgress?.(data);}catch{}return;}
        clearTimeout(active.timer);
        const current=active;active=null;
        if(data.kind==='result')current.resolve({data:{text:data.text,confidence:data.confidence}});
        else if(data.kind==='error'){worker?.terminate();worker=null;current.reject(new Error(data.message||'Photo scan failed.'));}
      };
      worker.onerror=e=>{
        const current=active;active=null;
        worker?.terminate();worker=null;
        if(current){clearTimeout(current.timer);current.reject(new Error('Offline recognition engine failed to start. Check that the scanner files are available.'));}
      };
      try{worker.postMessage({kind:'recognize',id,blob});}catch(error){stop();reject(error);}
    });
  }
  async function prepareOffline(onProgress){
    if(!('serviceWorker'in navigator))throw Error('Offline scanner cache is not supported in this browser.');
    const registration=await navigator.serviceWorker.ready;
    const target=navigator.serviceWorker.controller||registration.active;
    if(!target)throw Error('The app has not finished installing. Reload and try again.');
    const channel=new MessageChannel();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{channel.port1.close();reject(Error('Scanner download timed out. Please retry online.'));},300000);
      channel.port1.onmessage=({data})=>{
        if(data?.type==='progress'){try{onProgress?.(data)}catch{}}
        else if(data?.type==='complete'){clearTimeout(timer);channel.port1.close();resolve(data)}
        else if(data?.type==='error'){clearTimeout(timer);channel.port1.close();reject(Error(data.message||'Offline scanner download failed.'))}
      };
      target.postMessage({type:'warranty-ease:cache-ocr'},[channel.port2]);
    });
  }
  window.WarrantyOCR={recognize,stop,prepareOffline,isRunning:()=>!!active};
})();