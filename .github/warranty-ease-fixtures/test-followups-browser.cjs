/* Synthetic browser-only Warranty Ease note workflow. No user data, authentication or network writes. */
'use strict';
const assert=require('node:assert/strict');
const {chromium,webkit}=require(process.env.RUNNER_TEMP+'/we-pw/node_modules/playwright');
const url='http://127.0.0.1:8822/WarrantyEase/';
async function smoke(engine,width){
 const browser=await engine.launch({headless:true});
 const context=await browser.newContext({viewport:{width,height:850},acceptDownloads:true});
 const page=await context.newPage(),problems=[];
 page.on('pageerror',e=>problems.push(e.message));
 page.on('dialog',dialog=>dialog.accept());
 try{
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#main .home-head').waitFor({timeout:30000});
  const countBefore=await page.locator('.appliance-card').count();
  assert.equal(countBefore,0,'test browser should not contain user data');
  await page.locator(width>700?'.btn-top-add[data-action="new"]':'.mobile-nav [data-action="new"]').click();
  await page.locator('#field-productName').fill('Test washing machine');
  await page.locator('#field-brand').fill('LG');
  await page.locator('#field-model').fill('F4Y511WWLA1');
  await page.locator('.modal [data-action="save"]').click();
  await page.locator('.modal [data-action="close"]').click();
  await page.locator('.we-followup-home [data-action="followup-new"]').click();
  const title='Call LG to confirm five-year warranty';
  await page.locator('#we-followup-title').fill(title);
  await page.locator('#we-followup-date').fill('2026-11-20');
  await page.locator('#we-followup-details').fill('Ask for the written warranty terms and registration reference.');
  await page.locator('.modal [data-action="followup-save"]').click();
  await page.locator('.we-followup-home .we-followup-item').waitFor();
  assert.match(await page.locator('.we-followup-home .we-followup-item').first().innerText(),/Call LG/);
  const nav=width>700?'.header-nav [data-action="notes"]':'.mobile-nav [data-action="notes"]';
  await page.locator(nav).click();
  await page.locator('.we-followup-page').waitFor();
  assert.match(await page.locator('.we-followup-page').innerText(),/Call LG to confirm five-year warranty/);
  await page.locator('.we-followup-page [data-action="followup-toggle"][data-status="done"]').first().click();
  await page.locator('[data-action="followup-filter"][data-filter="done"]').click();
  assert.match(await page.locator('.we-followup-page .we-followup-list').innerText(),/Call LG to confirm five-year warranty/);
  await page.locator('.we-followup-page [data-action="followup-edit"]').first().click();
  await page.locator('#we-followup-details').fill('LG confirmed cover; case reference: DEMO-123.');
  await page.locator('.modal [data-action="followup-save"]').click();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#main .home-head').waitFor();
  await page.locator(nav).click();
  await page.locator('[data-action="followup-filter"][data-filter="done"]').click();
  assert.match(await page.locator('.we-followup-page .we-followup-list').innerText(),/DEMO-123/);
  await page.locator('.we-followup-page [data-action="followup-toggle"][data-status="open"]').first().click();
  await page.locator('[data-action="followup-filter"][data-filter="open"]').click();
  assert.match(await page.locator('.we-followup-page .we-followup-list').innerText(),/Call LG/);
  await page.locator('.we-followup-page [data-action="followup-archive"]').first().click();
  await page.locator('[data-action="followup-filter"][data-filter="archived"]').click();
  assert.match(await page.locator('.we-followup-page .we-followup-list').innerText(),/Call LG/);
  const all=await page.locator('html').innerHTML();
  assert.ok(!all.includes('PASSKEY_SESSION_SAMPLE_NOT_REAL'));
  assert.equal(problems.length,0,'page errors: '+problems.join(' | '));
  console.log(engine.name()+' '+width+'px PASS: add, due, complete, edit outcome, reload, reopen, archive');
 }catch(error){
  console.error(engine.name()+' '+width+'px FAIL',error.stack||error);
  await page.screenshot({path:'/tmp/warranty-followups-'+engine.name()+'.png',fullPage:true}).catch(()=>{});
  throw error;
 }finally{await context.close();await browser.close();}
}
(async()=>{await smoke(chromium,1180);await smoke(webkit,390);})().catch(e=>{console.error(e);process.exitCode=1});
