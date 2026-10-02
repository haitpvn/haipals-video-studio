import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const p = await b.newPage({viewport:{width:800,height:800}});
await p.goto('file://'+process.cwd()+'/lp.html');
await p.waitForTimeout(500);
await p.screenshot({path:'logo-preview.png'});
await b.close();
