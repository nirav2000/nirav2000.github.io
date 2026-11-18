/* Warranty Ease: crop the text region locally, never replace the saved original. */
(function(){'use strict';
function open(source){
  if(!source||!/^image\//.test(source.type))return Promise.reject(new Error('Select an image first.'));
  return new Promise((resolve,reject)=>{
    const link=URL.createObjectURL(source);const overlay=document.createElement('div');overlay.className='we-crop-overlay';
    overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Select text to scan" class="we-crop-dialog"><div class="we-crop-heading"><strong>Scan a clearer area</strong><button type="button" data-crop="cancel" aria-label="Close">×</button></div><p>Drag across the printed model, product code or serial number. We will scan only that area and keep your original photograph.</p><div class="we-crop-stage"><img alt="Original appliance label" draggable="false"><div class="we-crop-highlight" hidden></div></div><div class="we-crop-actions"><button type="button" data-crop="full">Scan full photo</button><button type="button" data-crop="selected" class="btn btn-dark" disabled>Scan selection</button></div></section>`;
    document.body.appendChild(overlay);const stage=overlay.querySelector('.we-crop-stage'),img=overlay.querySelector('img'),highlight=overlay.querySelector('.we-crop-highlight'),selected=overlay.querySelector('[data-crop="selected"]');
    img.src=link;let selection=null,start=null;
    function cleanup(value){URL.revokeObjectURL(link);overlay.remove();resolve(value);}
    function pos(event){const box=img.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(event.clientX-box.left)/Math.max(1,box.width))),y:Math.max(0,Math.min(1,(event.clientY-box.top)/Math.max(1,box.height)))}};
    stage.addEventListener('pointerdown',event=>{if(event.button!==0&&event.pointerType!=='touch')return;event.preventDefault();start=pos(event);stage.setPointerCapture?.(event.pointerId);selection={x:start.x,y:start.y,w:0,h:0};highlight.hidden=false;draw()});
    stage.addEventListener('pointermove',event=>{if(!start)return;const now=pos(event);selection={x:Math.min(start.x,now.x),y:Math.min(start.y,now.y),w:Math.abs(start.x-now.x),h:Math.abs(start.y-now.y)};draw()});
    function finish(){start=null;selected.disabled=!selection||selection.w<.035||selection.h<.02;}
    stage.addEventListener('pointerup',finish);stage.addEventListener('pointercancel',finish);
    function draw(){if(!selection)return;Object.assign(highlight.style,{left:selection.x*100+'%',top:selection.y*100+'%',width:selection.w*100+'%',height:selection.h*100+'%'})}
    overlay.addEventListener('click',async event=>{
      const action=event.target.closest('[data-crop]')?.dataset.crop;if(!action)return;
      if(action==='cancel'){cleanup(null);return}if(action==='full'){cleanup(source);return}
      if(action==='selected'&&!selected.disabled){selected.disabled=true;selected.textContent='Preparing...';
        try{
          const width=img.naturalWidth,height=img.naturalHeight;if(!width||!height)throw Error('Image not loaded yet');
          const sx=Math.floor(selection.x*width),sy=Math.floor(selection.y*height),sw=Math.min(width-sx,Math.ceil(selection.w*width)),sh=Math.min(height-sy,Math.ceil(selection.h*height));
          if(sw<15||sh<10)throw Error('Select a larger label area');
          const factor=Math.min(3,Math.max(1,1200/Math.max(sw,sh)));
          const canvas=document.createElement('canvas');canvas.width=Math.min(2400,Math.round(sw*factor));canvas.height=Math.min(2400,Math.round(sh*factor));
          const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
          // Improve black/dark lettering contrast without storing altered evidence.
          const px=ctx.getImageData(0,0,canvas.width,canvas.height);
          for(let i=0;i<px.data.length;i+=4){const r=px.data[i],g=px.data[i+1],b=px.data[i+2];const lum=Math.round((r*0.299+g*0.587+b*0.114));const v=Math.max(0,Math.min(255,Math.round((lum-128)*1.35+128)));px.data[i]=px.data[i+1]=px.data[i+2]=v;}
          ctx.putImageData(px,0,0);
          canvas.toBlob(blob=>{if(blob)cleanup(blob);else{selected.disabled=false;reject(Error('Could not prepare crop'));overlay.remove();}},'image/png');
        }catch(error){selected.disabled=false;selected.textContent='Scan selection';window.alert(error.message||'Try another selection');}
      }
    });
    overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();cleanup(null)}});
    img.onerror=()=>{URL.revokeObjectURL(link);overlay.remove();reject(Error('Could not display the selected photo'));};
  });
}
window.WarrantyCrop={open};
})();