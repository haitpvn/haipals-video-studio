import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { spawn } from 'child_process';
const FPS=30, DUR=23.5, NF=Math.round(FPS*DUR);
const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-i','music.wav','-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-shortest','-movflags','+faststart','video-nopost.mp4'],{stdio:['pipe','inherit','inherit']});
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
await p.goto('file://'+process.cwd()+'/index.html');
await p.evaluate(async()=>{await window.ready;for(const w of [500,600,700,800,900])for(const f of ['"Be Vietnam Pro"','Pacifico'])await document.fonts.load(`${w} 80px ${f}`,'Cầm hộ chiếu đâu Đi Đâu ẩn mò ạ');await document.fonts.ready;});
for(let i=0;i<NF;i++){
  await p.evaluate(t=>window.render(t),i/FPS);
  const buf=await p.screenshot({type:'jpeg',quality:95});
  if(!ff.stdin.write(buf)) await new Promise(r=>ff.stdin.once('drain',r));
  if(i%100==0) console.log('frame',i);
}
ff.stdin.end(); await new Promise(r=>ff.on('close',r)); await b.close(); console.log('done');
