/* Warranty Ease OCR interpretation, v0.6. Text stays in the user's browser.
 * Treat OCR as evidence for suggestions, never as authoritative field values. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.WarrantyOCRExtract=api;
})(typeof globalThis==='object'?globalThis:self,function(){
  'use strict';
  const labels={
    model:/\b(?:MODEL(?:\s*(?:NO\.?|NUMBER|NAME))?|MODEL\s*#|MOD(?:EL)?\.?\s*NO\.?|M\s*[\/\\]\s*N)\s*[.:#=\-]*\s*/ig,
    serial:/\b(?:SERIAL(?:\s*(?:NO\.?|NUMBER|NBR))?|S\s*[\/\\]\s*NO\.?|S\s*[\/\\]\s*N\.?|S\.\s*NO\.?|S\s*NO\.?|SER\.?\s*NO\.?)\s*[.:#=\-]*\s*/ig,
    productCode:/\b(?:PRODUCT\s*(?:CODE|NO\.?|NUMBER)|PROD\.?\s*(?:CODE|NO\.?|NUMBER)|P\s*[\/\\]\s*NO\.?)\s*[.:#=\-]*\s*/ig
  };
  const token=/^[A-Z0-9][A-Z0-9._\/\-]{3,36}/;
  const readTokens=(text,pattern)=>{
    const matches=[];let m;
    pattern.lastIndex=0;
    while((m=pattern.exec(text))){
      const rest=text.slice(m.index+m[0].length,Math.min(text.length,m.index+m[0].length+80));
      // The OCR engine often adds a newline or a decoration between label and value.
      const t=rest.replace(/^[\s:;=.,|!\-\[\]()]+/,'').toUpperCase().match(token)?.[0];
      if(!t||t.length>36||/^(MODEL|SERIAL|NUMBER|TYPE|CODE|PRODUCT|DRY|MADE|NAME|VOLTAGE)$/.test(t))continue;
      // Don't select generic boilerplate if an OCR label has no valid value.
      if(!/[0-9]/.test(t)||/^(220|240|680|660|850|145|50|800)$/.test(t))continue;
      const line=text.slice(text.lastIndexOf('\n',m.index)+1,text.indexOf('\n',m.index)===-1?Math.min(text.length,m.index+115):text.indexOf('\n',m.index));
      const sameLine=t.length&&line.toUpperCase().includes(t);
      const isCode=/^[A-Z0-9][A-Z0-9._-]+$/.test(t);
      const score=Number(sameLine)*4+Number(isCode)*2+Number(/[A-Z]/.test(t))*2+Number(t.length>=8&&t.length<=24)*2-Number(/\//.test(t))*3;
      matches.push({value:t.replace(/[.,;:\-]+$/,''),score,context:line.trim().slice(0,150)});
    }
    return matches.sort((a,b)=>b.score-a.score||a.value.length-b.value.length);
  };
  function normalize(input){return String(input||'').normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e]/g,'').replace(/\u00a0/g,' ').replace(/\r/g,'').replace(/\bS\s*[/\\]\s*NO\b/ig,'S/NO').replace(/\bS\s*[/\\]\s*N\b/ig,'S/N');}
  function parseLabel(input){
    const text=normalize(input).toUpperCase();
    const get=(name)=>readTokens(text,labels[name])[0]?.value||'';
    const model=get('model'),serial=get('serial'),productCode=get('productCode');
    const result={};
    if(model&&model.length>=5)result.model=model;
    if(serial&&serial.length>=6)result.serial=serial;
    if(productCode&&productCode.length>=5)result.productCode=productCode;
    const brand=String(text).match(/\b(LG(?:\s+ELECTRONICS)?|TCL|BOSCH|SIEMENS|SAMSUNG|MIELE|BEKO|WHIRLPOOL|HOTPOINT|AEG|ELECTROLUX|SONY|PANASONIC|HISENSE|HOOVER|INDESIT|DYSON|HAIER)\b/);
    if(brand)result.brand=brand[1].startsWith('LG')?'LG':brand[1];
    return result;
  }
  function dateFrom(input){
    const match=String(input||'').match(/\b(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(20\d\d|\d\d)\b/);
    if(match){const day=+match[1],month=+match[2],year=+match[3]+(match[3].length===2?2000:0);const actual=new Date(Date.UTC(year,month-1,day));if(year>=2000&&year<=2100&&actual.getUTCFullYear()===year&&actual.getUTCMonth()===month-1&&actual.getUTCDate()===day)return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
    const named=String(input||'').match(/\b(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(20\d\d)\b/i);
    if(named){const m=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'].indexOf(named[2].toUpperCase());return `${named[3]}-${String(m+1).padStart(2,'0')}-${String(+named[1]).padStart(2,'0')}`;}
    const iso=String(input||'').match(/\b20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/);return iso?.[0]||'';
  }
  function parseReceipt(input){
    const text=normalize(input);const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);const out={};
    const retailers=[['AO.COM','AO'],['MARKS ELECTRICAL','Marks Electrical'],['APPLIANCE CITY','Appliance City'],['CURRYS','Currys'],['JOHN LEWIS','John Lewis'],['ARGOS','Argos'],['COSTCO','Costco'],['RICHER SOUNDS','Richer Sounds'],['AMAZON','Amazon'],['PAUL DAVIES','Paul Davies']];
    for(const [needle,retailer] of retailers){if(text.toUpperCase().includes(needle)){out.retailer=retailer;break;}}
    if(!out.retailer&&/\bAO\b/i.test(text))out.retailer='AO';
    for(const line of lines){
      if(!out.orderNumber){const m=line.match(/(?:ORDER\s*(?:NO\.?|NUMBER|ID|REF(?:ERENCE)?|#)|INVOICE\s*(?:NO\.?|NUMBER|#))\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9\-]{4,32})\b/i);if(m&&/\d/.test(m[1]))out.orderNumber=m[1];}
      if(!out.purchaseDate&&/(?:ORDER\s*DATE|DATE|PURCHASED|INVOICE)/i.test(line))out.purchaseDate=dateFrom(line);
      if(!out.price&&/(?:TOTAL|AMOUNT\s+PAID|AMOUNT\s+DUE)/i.test(line)){
        const m=line.match(/(?:£|GBP\s*)([\d,]+\.\d\d)\b|\b([\d,]+\.\d\d)\b(?=\s*$)/i);
        if(m)out.price=(m[1]||m[2]).replace(/,/g,'');
      }
    }
    return out;
  }
  function extract(input,type='label'){
    const text=normalize(input),label=parseLabel(text),receipt=parseReceipt(text);
    const labelCount=['serial','model','productCode'].filter(k=>label[k]).length;
    const receiptCount=['orderNumber','price','purchaseDate'].filter(k=>receipt[k]).length;
    const kind=type==='receipt'?'receipt':type==='label'?'label':receiptCount>=2&&receiptCount>labelCount?'receipt':'label';
    const suggestions=kind==='receipt'?receipt:label;
    // Capture a short, relevant excerpt, not thousands of OCR rubbish.
    const lines=text.split('\n').map(x=>x.trim()).filter(x=>x&&/(MODEL|SERIAL|S\s*[/\\]\s*NO|PRODUCT\s*CODE|ORDER|TOTAL|PRICE|INVOICE|PURCHASE|\bLG\s+ELECTRONICS\b)/i.test(x));
    return {kind,suggestions,confidence:Object.keys(suggestions).filter(k=>suggestions[k]).length>1?'review':'low',keyLines:lines.slice(0,12).map(x=>x.slice(0,180)),rawLength:text.length};
  }
  return{extract,parseLabel,parseReceipt,normalize};
});