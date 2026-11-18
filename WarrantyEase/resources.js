/* Official manufacturer reference links. Links are not warranty entitlement evidence.
   Do not hotlink a manufacturer image or claim a PDF is archived until bytes are saved. */
(function(global){
'use strict';
const KNOWN=[
 {model:'F4Y511WWLA1',brand:'LG',links:[
  {kind:'product',title:'LG product pictures and specifications',url:'https://www.lg.com/uk/laundry/washing-machines/f4y511wwla1/'},
  {kind:'warranty',title:'LG 5-year warranty registration and conditions',url:'https://www.lg.com/uk/5-year-warranty/'},
  {kind:'updates',title:'LG appliance help and support',url:'https://www.lg.com/uk/support/'},
 ]},
 {model:'RHX1009NWK',brand:'LG',links:[
  {kind:'product',title:'LG dryer product pictures',url:'https://www.lg.com/uk/laundry/tumble-dryers/rhx1009nwk/'},
  {kind:'manual',title:'LG dryer manuals and product support',url:'https://www.lg.com/uk/support/product-support/cs-RHX1009NWK.AGWQPUK/'},
  {kind:'warranty',title:'LG 5-year warranty registration and conditions',url:'https://www.lg.com/uk/5-year-warranty/'},
 ]},
 {model:'65C8L',brand:'TCL',links:[
  {kind:'product',title:'TCL TV pictures and specifications',url:'https://www.tcl.com/uk/en/tvs/65c8l'},
  {kind:'manual',title:'TCL model support and downloads',url:'https://www.tcl.com/uk/en/support-tv/model/65c8l'},
  {kind:'warranty',title:'TCL UK warranty policy',url:'https://www.tcl.com/uk/en/warranty'},
  {kind:'updates',title:'TCL user manuals and software downloads',url:'https://www.tcl.com/uk/en/download'},
 ]}
];
function officialLinks(record){const model=String(record?.model||'').trim().toUpperCase();const brand=String(record?.brand||'').trim().toUpperCase();const found=KNOWN.find(p=>brand===p.brand&&(model===p.model||model===p.model+'-UK'));return found?found.links.map(x=>({...x,source:'manufacturer',verifiedDate:'2026-11-18'})):[];}
function allowedUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!!url.hostname&&!url.username&&!url.password&&url.href.length<1500?url.href:''}catch{return ''}}
const api={officialLinks,allowedUrl};global.WarrantyResources=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);