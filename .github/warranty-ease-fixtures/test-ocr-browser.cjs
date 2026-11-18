// Warranty Ease: real browser OCR smoke test. Only synthetic screenshots; no owner data.
const {chromium,webkit}=require(process.env.RUNNER_TEMP+'/we-pw/node_modules/playwright');
const path=require('node:path');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8822/WarrantyEase/';
const label=path.resolve('.github/warranty-ease-fixtures/sample-lg-label.png');
const receipt=path.resolve('.github/warranty-ease-fixtures/sample-ao-receipt.png');
const engines={chromium,webkit};
const timeout=150000;
async function waitForOCR(page,expected){
 await page.waitForFunction((expected)=>{
  const box=document.getElementById('ocr-message');
  return !!box?.textContent?.includes(expected);
 },expected,{timeout});
}
async function run(name){
 const browser=await engines[name].launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,ignoreHTTPSErrors:false});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push('Page: '+error.message));
 page.on('console',msg=>{if(msg.type()==='error')errors.push('Console: '+msg.text().slice(0,400));});
 try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
  await page.locator('[data-action="new"]:visible').first().click();
  assert.equal(await page.locator('[data-field="model"]').inputValue(),'');
  await page.locator('input[data-file-type="label"]').last().setInputFiles(label);
  await waitForOCR(page,'Found');
  const ocr=await page.locator('#ocr-message').innerText();
  assert.match(ocr,/F4Y511WWLA1/);
  assert.match(ocr,/1234AB567890/);
  assert.equal(await page.locator('[data-field="model"]').inputValue(),'','OCR must never silently overwrite model');
  await page.locator('[data-action="ocr-apply"]').click();
  const proposedModel=await page.locator('[data-field="model"]').inputValue();
  assert.match(proposedModel,/^F4Y511WWLA1/,'OCR sometimes adds a character, which must be reviewed');
  assert.equal(await page.locator('[data-field="serial"]').inputValue(),'1234AB567890');
  await page.locator('[data-action="next"]').click();
  await page.locator('input[data-file-type="receipt"]').last().setInputFiles(receipt);
  await page.waitForFunction(()=>document.getElementById('ocr-message')?.textContent?.includes('449.00'),undefined,{timeout});
  const receiptResults=await page.locator('#ocr-message').innerText();
  assert.match(receiptResults,/449.00/);
  assert.equal(await page.locator('[data-field="purchaseDate"]').inputValue(),'','Receipt date must be user-approved');
  await page.locator('[data-action="ocr-apply"]').click();
  assert.equal(await page.locator('[data-field="purchaseDate"]').inputValue(),'2026-11-12');
  assert.equal(await page.locator('[data-field="price"]').inputValue(),'449.00');
  await page.locator('[data-action="save"]').click();
  await page.waitForFunction(()=>!!document.querySelector('.detail-block'));
  await page.locator('[data-action="close"]').first().click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('.home-utility');
  console.log(name+': OCR label + receipt, approval, save and reload PASS');
  if(errors.length)console.log(name+' browser notes:',errors.slice(0,8));
 }catch(error){
  const body=(await page.locator('body').innerText().catch(()=>''))||'';
  console.error(name+' FAILED:',error.stack,'\nBody excerpt:',body.slice(0,2500),'\nConsole:',errors);
  throw error;
 }finally{await context.close();await browser.close();}
}
(async()=>{for(const name of ['chromium','webkit'])await run(name);})().catch(e=>{console.error(e);process.exitCode=1});