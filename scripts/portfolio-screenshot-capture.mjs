import { chromium } from "playwright";
const browser = await chromium.launch({headless:true,executablePath:"/usr/bin/google-chrome",args:["--no-sandbox","--disable-dev-shm-usage"]});
const page = await browser.newPage({
  viewport:{width:1600,height:900},deviceScaleFactor:1,
  locale:"de-DE",timezoneId:"Europe/Berlin"
});
try{
  page.on("pageerror",(e)=>console.error("PAGE_ERROR",e.message));
  await page.goto("http://127.0.0.1:3000/login",{waitUntil:"domcontentloaded",timeout:60000});
  await page.locator("#email").fill("demo@example.invalid");
  await page.locator("#password").fill("Portfolio-Screenshot-Demo-2026-NoLiveAccount!");
  await page.getByRole("button",{name:"Anmelden"}).click();
  await page.waitForURL(/\/dashboard(?:\?.*)?$/,{timeout:60000});
  await page.getByText("Aktive Leads",{exact:true}).waitFor({state:"visible",timeout:60000});
  await page.waitForTimeout(3000);
  await page.screenshot({path:"crm-dashboard-1600x900.png",animations:"disabled"});
  await page.screenshot({path:"crm-dashboard-full.png",fullPage:true,animations:"disabled"});
  // Image conversion only if Sharp is present (Next.js commonly depends on it).
  try {
    const sharp=(await import("sharp")).default;
    await sharp("crm-dashboard-1600x900.png").webp({quality:86,effort:4})
      .toFile("crm-dashboard-portfolio.webp");
    console.log("Screenshot WebP created.");
  } catch (error) {
    console.log("WebP conversion unavailable:",error.message);
  }
  console.log("REAL CRM DASHBOARD SCREENSHOT SUCCESS. URL:",page.url());
} catch(e){
  console.error("SCREENSHOT ERROR:",String(e.message).slice(0,450));
  try{console.error("Browser at:",page.url(),"Title:",await page.title());}catch{}
  throw e;
} finally{await browser.close();}
