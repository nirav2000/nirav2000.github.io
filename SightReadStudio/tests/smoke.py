from playwright.sync_api import sync_playwright
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*src="[^"]+"[^>]*></script>','',html)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
    for size in [(1300,880),(390,844)]:
        page=browser.new_page(viewport={'width':size[0],'height':size[1]},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(html)
        page.add_style_tag(content=(root/'styles.css').read_text())
        page.add_script_tag(content=(root/'midi-core.js').read_text())
        page.add_script_tag(content=(root/'midi-bridge.js').read_text())
        page.add_script_tag(content=(root/'app.js').read_text())
        print('Viewport',size,'main text',page.locator('h1').all_text_contents(),'errors',errors)
        for tab in ['connect','reading','notes','rhythm','hands','progress','settings']:
            page.evaluate('(id)=>location.hash=id',tab)
            page.wait_for_timeout(50)
            print(tab,page.locator('#app-main').inner_text()[:90].replace('\n',' '),'errors',errors[-2:])
            if tab=='connect':page.screenshot(path=str(root/'tests'/f'connect-{size[0]}.png'),full_page=True)
            if tab=='reading':
                page.locator('[data-action="demo-reading"]').first.click()
                page.wait_for_timeout(100)
                print('demo?',page.locator('.result-hero').count(), 'color?',page.locator('.graded-staff ellipse[fill="#16a57f"]').count(),'errors',errors[-2:])
                page.screenshot(path=str(root/'tests'/f'assessment-{size[0]}.png'),full_page=True)
        page.close()
    browser.close()
