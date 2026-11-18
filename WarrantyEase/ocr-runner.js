/* Warranty Ease image OCR — isolated dedicated worker.
 * No account tokens or vault keys are passed to this worker.
 * Tesseract.js and English language data are pinned and self-hosted below /WarrantyEase/ocr/.
 * The worker posts text only; the parent app decides what, if anything, to save.
 */
'use strict';
let engine = null;
let current = null;
function progress(status, progress) {
  self.postMessage({kind:'progress',id:current,stage:String(status||'Reading image'),progress:Math.min(1,Math.max(0,Number(progress)||0))});
}
async function getEngine() {
  if (engine) return engine;
  importScripts('./ocr/tesseract.min.js');
  if (!self.Tesseract?.createWorker) throw new Error('Local OCR bundle is missing or invalid.');
  const base = new URL('./ocr/', self.location.href);
  engine = await self.Tesseract.createWorker('eng', 1, {
    workerPath: new URL('worker.min.js', base).href,
    corePath: new URL('core/', base).href,
    langPath: new URL('lang/', base).href.replace(/\/$/, ''),
    gzip: true,
    cacheMethod: 'write',
    logger: info => progress(info.status, info.progress)
  });
  return engine;
}
self.addEventListener('message', async event => {
  const {kind,id,blob} = event.data || {};
  if (kind !== 'recognize' || typeof id !== 'string') return;
  if (!(blob instanceof Blob) || !/^image\//i.test(blob.type)) {
    self.postMessage({kind:'error',id,message:'Choose a photo in a supported image format.'});
    return;
  }
  current = id;
  try {
    const worker = await getEngine();
    progress('recognizing text',0);
    const result = await worker.recognize(blob);
    self.postMessage({kind:'result',id,text:String(result?.data?.text||'').slice(0,30000),confidence:Number(result?.data?.confidence||0)});
  } catch (error) {
    // Drop the possibly failed engine. A subsequent Scan again tries a fresh instance.
    try { await engine?.terminate(); } catch {}
    engine = null;
    self.postMessage({kind:'error',id,message:String(error?.message||error||'Unable to read this image').slice(0,240)});
  } finally {
    current = null;
  }
});