const { chromium } = require('playwright');
(async () => {
  const base='http://localhost:3000';
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const out=[];
  async function runtimeErrorVisible(){
    const t=await page.locator('body').innerText().catch(()=> '');
    return /Unhandled Runtime Error|Application error|Cannot read properties|Error:\s/i.test(t);
  }
  async function scanCurrent(label){
    const items=page.locator('button,a[href]');
    const n=await items.count();
    for(let i=0;i<n;i++){
      const el=items.nth(i);
      if(!(await el.isVisible().catch(()=>false))) continue;
      const tag=await el.evaluate(e=>e.tagName).catch(()=>'?');
      const txt=(await el.innerText().catch(()=>'' )).replace(/\s+/g,' ').trim().slice(0,60)||'(no-text)';
      const href=(await el.getAttribute('href').catch(()=>''))||'';
      const before=page.url();
      let status='pass'; let note='';
      try{
        if(tag==='A'&&href){
          await Promise.all([
            page.waitForLoadState('domcontentloaded',{timeout:4000}).catch(()=>{}),
            el.click({timeout:3000})
          ]);
        }else{
          await el.click({timeout:3000});
          await page.waitForTimeout(300);
        }
        if(await runtimeErrorVisible()){ status='fail'; note='runtime error visible'; }
      }catch(e){ status='fail'; note='click failed'; }
      out.push({page:label,control:`${tag}:${txt}`,status,note});
      if(page.url()!==before){
        await page.goBack({timeout:5000}).catch(()=>{});
        await page.waitForLoadState('domcontentloaded').catch(()=>{});
      }
    }
  }

  for(const p of ['/','/signup','/login']){
    await page.goto(base+p,{waitUntil:'domcontentloaded'});
    await scanCurrent(p);
  }

  await page.goto(base+'/login',{waitUntil:'domcontentloaded'});
  await page.fill('input[name="email"]','ava@circlenest.dev').catch(()=>{});
  await page.fill('input[name="password"]','password123').catch(()=>{});
  await page.click('button:has-text("Enter CircleNest")').catch(()=>{});
  await page.waitForTimeout(1000);
  if(page.url().includes('/login')){
    out.push({page:'/login',control:'BUTTON:Enter CircleNest',status:'fail',note:'login did not proceed'});
  } else {
    out.push({page:'/login',control:'BUTTON:Enter CircleNest',status:'pass',note:''});
    for(const p of ['/home','/friends','/groups','/messages','/notifications','/profile/edit','/settings','/settings/theme']){
      await page.goto(base+p,{waitUntil:'domcontentloaded'});
      await scanCurrent(p);
    }
  }

  await browser.close();
  const fails=out.filter(x=>x.status==='fail');
  console.log(JSON.stringify({tested:out.length,fails:fails.length,fails},null,2));
})();
