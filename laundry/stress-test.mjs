import { chromium } from 'playwright';
import http from 'http'; import fs from 'fs'; import path from 'path';
const root='/workspace/kyiv-slots';
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(root,p);fs.readFile(f,(e,d)=>{if(e){r.writeHead(404);r.end();return}r.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});r.end(d)})}).listen(8775);
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
const pg=await b.newPage({viewport:{width:390,height:844}});const errs=[];
pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>m.type()==='error'&&errs.push(m.text()));
await pg.goto('http://localhost:8775/laundry/');
const N=+(process.env.N||300);
const res=await pg.evaluate(async(N)=>{
 const L=window.__laundry;const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 let stuck=0,moves=0,games=0,maxBusy=0,info=[];
 const fast=!!L.tick;
 L.start();games++;
 for(let i=0;i<N;i++){
  let s=L.getState();
  if(!s.running){L.start();games++;}
  if(L.setMoves)L.setMoves(30), L.setTarget&&L.setTarget(1e9);
  if(i%25===7)L.forceOutage(0.3);
  if(s.outage)L.clearOutage();
  if(L.injectCascade&&i%5===0)L.injectCascade(i%3);
  let m=Math.random()<0.8?L.findMove():null;
  if(!m){const r=(Math.random()*7)|0,c=(Math.random()*6)|0;m={r1:r,c1:c,r2:r,c2:c+1};}
  L.playMove(m);moves++;
  let t=0;
  while(L.getState().busy){ if(fast)L.tick(0.05);else await sleep(20); t+= fast?50:20; if(t>15000)break;}
  maxBusy=Math.max(maxBusy,t);
  if(L.getState().busy){stuck++;info.push(JSON.stringify(L.debug?L.debug():L.getState()));break;}
 }
 return {moves,games,stuck,maxBusy,info:info.slice(0,3),fast};
},N);
console.log(JSON.stringify(res));console.log('errors',errs.length,errs.slice(0,5));
await b.close();srv.close();
