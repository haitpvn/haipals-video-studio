import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const times=process.argv.slice(2).map(Number);
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+process.cwd()+'/index.html');
await p.evaluate(async()=>{await window.ready;for(const w of [500,600,700,800,900])for(const f of ['"Be Vietnam Pro"','Pacifico'])await document.fonts.load(`${w} 80px ${f}`,'Cầm hộ chiếu đâu Đi Đâu ẩn mò ạ');await document.fonts.ready;});
for(const t of times){await p.evaluate(t=>window.render(t),t);await p.screenshot({path:`still-${t.toFixed(2)}.jpg`,type:'jpeg',quality:80});}
await b.close();
