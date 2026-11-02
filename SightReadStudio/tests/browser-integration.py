from pathlib import Path
from playwright.sync_api import sync_playwright
import re
root=Path(__file__).resolve().parents[1]
html=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',(root/'index.html').read_text())
script_files=['midi-core.js','midi-bridge.js','app.js']
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 for mode in ['web','native']:
  page=browser.new_page(viewport={'width':1100,'height':880})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html)
  page.add_style_tag(content=(root/'styles.css').read_text())
  mock="""
  window.__memory={};Object.defineProperty(window,'localStorage',{value:{getItem:k=>window.__memory[k]||null,setItem:(k,v)=>window.__memory[k]=v,removeItem:k=>delete window.__memory[k]}});
  """
  if mode=='web':
   mock+="""
   window.__fakeInput={id:'casio-cdp-160',name:'CASIO USB-MIDI',manufacturer:'Casio',state:'connected',connection:'open',onmidimessage:null};
   navigator.requestMIDIAccess=async()=>({inputs:new Map([['casio-cdp-160',window.__fakeInput]]),onstatechange:null});
   window.__playMidi=(m,v=85,channel=0)=>window.__fakeInput.onmidimessage?.({data:[0x90|channel,m,v]});
   """
  else:
   mock+="""
   window.__nativeCommands=[];
   window.webkit={messageHandlers:{sightread:{postMessage:data=>window.__nativeCommands.push(data)}}};
   window.__playMidi=m=>window.dispatchEvent(new CustomEvent('sightread-native-message',{detail:{type:'midi',sourceId:'yamaha-745',bytes:[0x90,m,95]}}));
   """
  page.evaluate(mock)
  for file in script_files:page.add_script_tag(content=(root/file).read_text())
  page.evaluate("location.hash='connect'")
  page.wait_for_timeout(70)
  if mode=='native':
   page.evaluate("window.dispatchEvent(new CustomEvent('sightread-native-message',{detail:{type:'sources',sources:[{id:'yamaha-745',name:'Yamaha CLP-745 Bluetooth MIDI',state:'connected'}]}}))")
  else:
   page.locator('[data-action="connect-midi"]').first.click()
  page.wait_for_timeout(80)
  assert page.locator('.connection-hero.connected').count()==1,(mode,'not connected',errors)
  assert page.locator('input[name=midi-device]:checked').count()==1,(mode,'not selected')
  page.evaluate('__playMidi(60)')
  page.wait_for_timeout(50)
  assert 'C4' in page.locator('#midi-last-note').inner_text(),(mode,'key test failed')
  page.evaluate("location.hash='notes'")
  page.wait_for_timeout(80)
  q=page.evaluate('window.__sightreadTest.getNoteQuestion()')
  before=page.evaluate('window.__sightreadTest.getProgress().noteAttempts.length')
  page.evaluate('(pitch)=>__playMidi(pitch)',q['midi'])
  page.wait_for_timeout(20)
  after=page.evaluate('window.__sightreadTest.getProgress().noteAttempts.length')
  assert after==before+1,(mode,'auto note scoring did not happen',errors)
  assert page.evaluate('window.__sightreadTest.getProgress().noteAttempts.at(-1).correct')
  page.evaluate("location.hash='reading'")
  page.wait_for_timeout(50)
  page.locator('[data-action="begin-preview"]').first.click()
  page.locator('[data-action="begin-playing"]').first.click()
  assert page.locator('[data-action="start-midi-first"]').count()==1,(mode,'start MIDI absent')
  page.locator('[data-action="start-midi-first"]').first.click()
  ex=page.evaluate('window.__sightreadTest.getCurrentReading()')
  notes=sorted(ex['rh']+ex['lh'],key=lambda n:(n['bar']*4+n['beat'],n['hand']))
  for n in notes[:7]:page.evaluate('(pitch)=>__playMidi(pitch)',n['midi'])
  assert page.locator('#live-note-count').inner_text()=='7',(mode,'record count mismatch')
  page.locator('[data-action="finish-midi-record"]').first.click()
  assert page.locator('.result-hero').count()==1,(mode,'result UI absent',errors)
  assert page.locator('.graded-staff ellipse[fill="#dd5e68"]').count()>0,(mode,'missing notes not red')
  rec=page.evaluate('window.__sightreadTest.getProgress().readingRuns.at(-1)')
  assert rec['source']=='midi' and rec['analysis']['total']>7,(mode,'record was not stored')
  page.evaluate("location.hash='progress'")
  assert page.locator('[data-action="view-midi-record"]').count()>0,(mode,'no saved history')
  page.locator('[data-action="view-midi-record"]').first.click()
  assert page.locator('.result-hero').count()==1,(mode,'cannot reopen archived notes')
  if mode=='native':
   assert page.evaluate('window.__nativeCommands.some(x=>x.type==="select"&&x.id==="yamaha-745")'),(mode,'native source selection was not sent')
  assert not errors,(mode,errors)
  print('PASS',mode,'connected, note detection, recording, coloured result, save and review',rec['noteAccuracy'],'%')
  page.close()
 browser.close()
