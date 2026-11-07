(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 540, LEVEL_END = 5660;
  const ui = Object.fromEntries(['ringCount','scoreCount','lifeCount','progressFill','introOverlay','pauseOverlay','endOverlay','startBtn','resumeBtn','againBtn','pauseBtn','soundToggle','soundIcon','endKicker','endTitle','endMessage','finalRings','finalScore','finalTime'].map(id => [id, document.getElementById(id)]));
  const keys = new Set(), touch = { left:false, right:false, jump:false };
  let mode = 'intro', audioOn = true, audioCtx = null, lastTime = 0, elapsed = 0, camera = 0;
  let score = 0, rings = 0, lives = 3, collected = new Set(), defeated = new Set(), particles = [], player, ringsOnMap, enemies, platforms, spikes, springs, checkpoint = 120;
  const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
  const rnd = (a,b) => a + Math.random()*(b-a);
  const fmtScore = n => String(n).padStart(6,'0');
  const groundData = [
    [0,820,440],[870,1320,395],[1360,1800,440],[1900,2670,410],[2780,3850,440],[3980,4870,410],[4940,LEVEL_END,440]
  ];
  function makeLevel(){
    platforms = groundData.map(([x,end,y])=>({x,y,w:end-x,h:H-y,end}));
    ringsOnMap=[]; enemies=[]; spikes=[]; springs=[];
    let id=0;
    const line=(x,y,n,dx=38,dy=0)=>{for(let i=0;i<n;i++)ringsOnMap.push({id:id++,x:x+i*dx,y:y+Math.sin(i/(n-1||1)*Math.PI)*dy,taken:false});};
    line(190,375,7,37,0); line(480,380,7,38,38); line(910,335,8,36,0); line(1190,340,6,36,0);
    line(1450,375,8,38,0); line(1730,350,7,38,44); line(1930,350,7,38,0); line(2220,345,9,38,18);
    line(2480,350,6,36,0); line(2820,375,9,38,0); line(3150,350,8,38,55); line(3490,375,7,38,0);
    line(4020,350,8,38,0); line(4330,340,8,38,34); line(4670,350,7,38,0); line(5000,375,9,38,0); line(5350,350,6,38,0);
    enemies=[{id:0,x:720,y:440,dir:-1,min:610,max:790,alive:true},{id:1,x:1510,y:440,dir:1,min:1415,max:1690,alive:true},{id:2,x:2380,y:410,dir:-1,min:2100,max:2580,alive:true},{id:3,x:3320,y:440,dir:1,min:2870,max:3750,alive:true},{id:4,x:4530,y:410,dir:-1,min:4080,max:4790,alive:true},{id:5,x:5200,y:440,dir:1,min:5000,max:5500,alive:true}];
    spikes=[{x:1015,y:395,w:72},{x:1588,y:440,w:66},{x:2160,y:410,w:72},{x:2980,y:440,w:70},{x:3635,y:440,w:72},{x:4220,y:410,w:68},{x:4780,y:410,w:72},{x:5410,y:440,w:66}];
    springs=[{x:780,y:440},{x:1660,y:440},{x:2570,y:410},{x:3750,y:440},{x:4770,y:410}];
  }
  function reset(){
    makeLevel(); collected.clear(); defeated.clear(); particles=[]; score=0;rings=0;lives=3;elapsed=0;camera=0;checkpoint=120;
    player={x:112,y:440,vx:0,vy:0,w:28,h:42,grounded:true,face:1,invuln:0,anim:0,jumpWas:false,dead:false};
    updateHud();
  }
  function sound(freq=600,dur=.08,type='sine',vol=.035){
    if(!audioOn)return;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended')audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,audioCtx.currentTime);o.frequency.exponentialRampToValueAtTime(Math.max(80,freq*.65),audioCtx.currentTime+dur);g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch(_){}}
  function updateHud(){ui.ringCount.textContent=String(rings).padStart(2,'0');ui.scoreCount.textContent=fmtScore(score);ui.lifeCount.textContent=lives;ui.progressFill.style.width=`${Math.min(100,player?player.x/LEVEL_END*100:0)}%`;}
  function startGame(){reset();mode='playing';ui.introOverlay.classList.add('hidden');ui.endOverlay.classList.add('hidden');ui.pauseOverlay.classList.add('hidden');sound(520,.12,'triangle');}
  function pauseGame(){if(mode==='playing'){mode='paused';ui.pauseOverlay.classList.remove('hidden');}else if(mode==='paused'){mode='playing';ui.pauseOverlay.classList.add('hidden');lastTime=performance.now();}}
  function finish(win){mode='ended';ui.endOverlay.classList.remove('hidden');ui.endKicker.textContent=win?'COAST CLEARED':'OUT OF LIVES';ui.endTitle.innerHTML=win?'NICE<br><em>RUN!</em><span class="end-star">✦</span>':'ONE MORE<br><em>GO?</em><span class="end-star">↗</span>';ui.endMessage.textContent=win?'That was one seriously speedy sprint.':'The coast is still waiting. Give it another dash.';ui.finalRings.textContent=String(rings).padStart(2,'0');ui.finalScore.textContent=fmtScore(score);ui.finalTime.textContent=`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`;sound(win?880:180,.28,win?'triangle':'sawtooth');}
  function keydown(e){if(['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='Escape'){if(mode==='playing'||mode==='paused')pauseGame();}if((e.code==='Enter'||e.code==='Space')&&(mode==='intro'||mode==='ended'))startGame();}
  function keyup(e){keys.delete(e.code);}
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',()=>{keys.clear();if(mode==='playing')pauseGame();});
  ui.startBtn.addEventListener('click',startGame);ui.againBtn.addEventListener('click',startGame);ui.resumeBtn.addEventListener('click',pauseGame);ui.pauseBtn.addEventListener('click',pauseGame);
  ui.soundToggle.addEventListener('click',()=>{audioOn=!audioOn;ui.soundIcon.textContent=audioOn?'♫':'♪';ui.soundToggle.querySelector('.sound-label').textContent=audioOn?'SOUND ON':'SOUND OFF';if(audioOn)sound(700,.08);});
  document.querySelectorAll('[data-control]').forEach(btn=>{const key=btn.dataset.control;const down=e=>{e.preventDefault();touch[key]=true;btn.classList.add('pressed');if(key==='jump')keys.add('Space');};const up=e=>{e.preventDefault();touch[key]=false;btn.classList.remove('pressed');if(key==='jump')keys.delete('Space');};btn.addEventListener('pointerdown',down);btn.addEventListener('pointerup',up);btn.addEventListener('pointercancel',up);btn.addEventListener('pointerleave',up);});

  function update(dt){
    if(mode!=='playing')return;
    elapsed+=dt;
    const p=player, frame=dt*60, left=keys.has('ArrowLeft')||keys.has('KeyA')||touch.left, right=keys.has('ArrowRight')||keys.has('KeyD')||touch.right, jump=keys.has('Space')||keys.has('ArrowUp')||keys.has('KeyW')||touch.jump;
    const accel=p.grounded?.72:.42;
    if(left){p.vx-=accel*frame;p.face=-1;}if(right){p.vx+=accel*frame;p.face=1;}
    if(!left&&!right)p.vx*=Math.pow(p.grounded?.82:.99,frame);
    p.vx=clamp(p.vx,-8.5,8.5);
    if(jump&&!p.jumpWas&&p.grounded){p.vy=-13.6;p.grounded=false;sound(430,.11,'triangle');spawnBurst(p.x,p.y-12,'#d7f7ff',5);}
    p.jumpWas=jump;
    if(!jump&&p.vy< -5)p.vy+=.38*frame;
    p.vy=Math.min(15,p.vy+.62*frame);
    const prevY=p.y;
    p.x+=p.vx*frame;p.y+=p.vy*frame;
    if(p.x<12){p.x=12;p.vx=0;}
    p.grounded=false;
    for(const pl of platforms){if(p.x+p.w/2>pl.x&&p.x-p.w/2<pl.end&&prevY<=pl.y&&p.y>=pl.y&&p.vy>=0){p.y=pl.y;p.vy=0;p.grounded=true;}}
    if(p.grounded&&Math.abs(p.vx)>.6){p.anim+=dt*(8+Math.abs(p.vx)*1.8);if(Math.random()<.14)spawnDust(p.x-p.face*8,p.y,'#fff2bf',1);}
    if(p.invuln>0)p.invuln-=dt;
    for(const s of springs){if(Math.abs(p.x-s.x)<23&&Math.abs(p.y-s.y)<5&&p.vy>=0){p.vy=-17;p.grounded=false;p.vx+=p.face*1.1;sound(260,.16,'square',.025);spawnBurst(s.x,s.y-10,'#ffec70',9);}}
    for(const r of ringsOnMap){if(collected.has(r.id))continue;const dx=p.x-r.x,dy=p.y-p.h*.55-r.y;if(dx*dx+dy*dy<29*29){collected.add(r.id);rings++;score+=100;sound(970+Math.min(rings,12)*22,.09,'sine',.028);spawnBurst(r.x,r.y,'#ffe34f',5);}}
    for(const e of enemies){if(!e.alive)continue;e.x+=e.dir*1.05*frame;if(e.x<e.min||e.x>e.max)e.dir*=-1;const hit=Math.abs(p.x-e.x)<27&&Math.abs(p.y-p.h/2-(e.y-17))<31;if(hit){if(p.vy>1&&prevY-p.h<=e.y-25){e.alive=false;defeated.add(e.id);p.vy=-9;score+=500;sound(350,.12,'square');spawnBurst(e.x,e.y-18,'#ffb346',10);}else hurt();}}
    for(const s of spikes){if(p.x+p.w*.4>s.x&&p.x-p.w*.4<s.x+s.w&&p.y>s.y-19&&p.y-p.h<s.y)hurt();}
    if(p.y>650)hurt(true);
    if(p.x>2150&&checkpoint<1900)checkpoint=1960;if(p.x>4000)checkpoint=4050;
    camera=clamp(p.x-W*.36,0,LEVEL_END-W);
    particles=particles.filter(a=>a.life>0);for(const a of particles){a.x+=a.vx*frame;a.y+=a.vy*frame;a.vy+=.12*frame;a.life-=dt;}
    if(p.x>LEVEL_END-120){score+=rings*50;finish(true);}
    updateHud();
  }
  function hurt(fall=false){const p=player;if(p.invuln>0)return;if(rings>0){const spill=Math.min(10,rings);rings-=spill;for(let i=0;i<spill;i++)spawnBurst(p.x,p.y-20,'#ffe34f',1);}else lives--;
    p.invuln=1.6;p.vy=-8;p.vx=-p.face*5;if(fall||p.y>620){p.x=checkpoint;p.y=(groundData.find(g=>checkpoint>=g[0]&&checkpoint<=g[1])||groundData[0])[2];p.vy=0;p.vx=0;}
    sound(150,.22,'sawtooth',.045);if(lives<=0)finish(false);updateHud();}
  function spawnBurst(x,y,color,n){for(let i=0;i<n;i++)particles.push({x,y,vx:rnd(-3,3),vy:rnd(-4,1),life:rnd(.25,.55),color,size:rnd(2,5)});}
  function spawnDust(x,y,color,n){for(let i=0;i<n;i++)particles.push({x:x+rnd(-5,5),y:y-2,vx:rnd(-1,1),vy:rnd(-2,0),life:rnd(.2,.35),color,size:rnd(2,4)});}

  function draw(){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#65c8f2');sky.addColorStop(.58,'#9be3f5');sky.addColorStop(1,'#e4f9e9');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // Sunlit clouds and distant island silhouettes.
    ctx.save();
    for(let i=0;i<8;i++){const x=((i*203-camera*.12)%1250+1250)%1250-120,y=78+(i%3)*49;drawCloud(x,y,.65+(i%3)*.16);}
    drawHills('#9bd8c4',.16,350,[0,80,40,130,50,105,5,85,25,120]);
    drawHills('#52b6a4',.28,400,[80,8,56,110,25,82,0,100,24,79]);
    drawHills('#257d85',.42,443,[25,90,4,125,35,75,0,110,10,80]);
    ctx.restore();
    ctx.save();ctx.translate(-camera,0);
    // Repeating checkerboard earth gives the coast its own bright arcade look.
    for(const pl of platforms){
      if(pl.end<camera-80||pl.x>camera+W+80)continue;
      ctx.fillStyle='#b85b37';ctx.fillRect(pl.x,pl.y,pl.w,H-pl.y);
      ctx.fillStyle='#edb24d';ctx.fillRect(pl.x,pl.y,pl.w,10);
      ctx.fillStyle='#69d064';ctx.fillRect(pl.x,pl.y,pl.w,7);
      const start=Math.floor(pl.x/38)*38;
      for(let x=start;x<pl.end;x+=38){for(let y=pl.y+11,row=0;y<H;y+=34,row++){const odd=(Math.floor(x/38)+row)%2;ctx.fillStyle=odd?'#ce7440':'#b96238';ctx.fillRect(Math.max(x,pl.x),y,38,34);ctx.fillStyle=odd?'#dd8746':'#ca713f';ctx.fillRect(Math.max(x,pl.x),y,19,17);}}
      ctx.fillStyle='#f8c861';for(let i=0;i<pl.w/28;i++){const x=pl.x+i*28+6;ctx.fillRect(x,pl.y+13,3,3);}
    }
    drawDecor();
    for(const s of springs)drawSpring(s);
    for(const s of spikes)drawSpikes(s);
    for(const r of ringsOnMap)if(!collected.has(r.id))drawRing(r);
    for(const e of enemies)if(e.alive)drawEnemy(e);
    drawGoal();
    for(const a of particles){ctx.globalAlpha=clamp(a.life*3,0,1);ctx.fillStyle=a.color;ctx.beginPath();ctx.arc(a.x,a.y,a.size,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    drawPlayer();ctx.restore();
    // Subtle scanline-free vignette keeps the edges cinematic.
    const v=ctx.createRadialGradient(W/2,H*.45,150,W/2,H*.45,650);v.addColorStop(0,'#06244300');v.addColorStop(1,'#06244326');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  }
  function drawCloud(x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='#ffffffaa';ctx.beginPath();ctx.ellipse(32,14,39,12,0,0,Math.PI*2);ctx.ellipse(15,9,17,13,0,0,Math.PI*2);ctx.ellipse(43,4,20,19,0,0,Math.PI*2);ctx.ellipse(62,11,17,11,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawHills(color,parallax,base,heights){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,H);for(let i=-1;i<heights.length+1;i++){const x=i*150-(camera*parallax%150);const h=heights[(i+heights.length)%heights.length];ctx.quadraticCurveTo(x+55,base-h-35,x+150,base-h);}ctx.lineTo(W,H);ctx.closePath();ctx.fill();}
  function drawDecor(){
    for(let i=0;i<16;i++){const x=150+i*368;if(x<camera-70||x>camera+W+70)continue;const y=groundData.find(g=>x>=g[0]&&x<=g[1])?.[2]||440;drawPalm(x,y,0.82+(i%3)*.15);}
    for(let i=0;i<42;i++){const x=90+i*137;if(x<camera-20||x>camera+W+20)continue;const y=groundData.find(g=>x>=g[0]&&x<=g[1])?.[2]||440;ctx.fillStyle=i%2?'#fff5b4':'#ffb8a5';ctx.beginPath();ctx.arc(x,y-9,3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#3bb578';ctx.fillRect(x-1,y-7,2,7);}
  }
  function drawPalm(x,y,s){ctx.save();ctx.translate(x,y);ctx.scale(s,s);ctx.fillStyle='#a96837';ctx.beginPath();ctx.moveTo(-2,0);ctx.quadraticCurveTo(-10,-24,0,-61);ctx.lineTo(5,-61);ctx.quadraticCurveTo(-2,-24,3,0);ctx.fill();ctx.fillStyle='#148c70';for(let a=-2;a<=2;a++){ctx.save();ctx.translate(2,-59);ctx.rotate(a*.55);ctx.beginPath();ctx.ellipse(18,0,23,6,.1,0,Math.PI*2);ctx.fill();ctx.restore();}ctx.fillStyle='#37b976';ctx.beginPath();ctx.arc(2,-59,5,0,Math.PI*2);ctx.fill();ctx.restore();}
  function drawRing(r){const pulse=1+Math.sin(elapsed*5+r.id)*.07;ctx.save();ctx.translate(r.x,r.y);ctx.scale(pulse,1);ctx.shadowColor='#ffe64a';ctx.shadowBlur=10;ctx.lineWidth=5;ctx.strokeStyle='#ffcb31';ctx.beginPath();ctx.ellipse(0,0,9,12,0,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;ctx.lineWidth=2;ctx.strokeStyle='#fff4a8';ctx.beginPath();ctx.ellipse(-1,-1,5,8,0,0,Math.PI*2);ctx.stroke();ctx.restore();}
  function drawSpikes(s){ctx.fillStyle='#c9544f';ctx.fillRect(s.x,s.y-4,s.w,5);const n=Math.floor(s.w/18);for(let i=0;i<n;i++){const x=s.x+i*s.w/n;ctx.fillStyle='#e7f2ef';ctx.beginPath();ctx.moveTo(x,s.y-3);ctx.lineTo(x+s.w/n/2,s.y-22);ctx.lineTo(x+s.w/n,s.y-3);ctx.closePath();ctx.fill();ctx.strokeStyle='#9bb9bd';ctx.lineWidth=1;ctx.stroke();}}
  function drawSpring(s){ctx.save();ctx.translate(s.x,s.y);ctx.fillStyle='#e84c58';ctx.fillRect(-13,-12,26,9);ctx.fillStyle='#ffd84e';ctx.fillRect(-13,-19,26,7);ctx.fillStyle='#fff2a1';ctx.fillRect(-9,-17,5,3);ctx.fillStyle='#d34152';ctx.fillRect(-10,-3,20,4);ctx.restore();}
  function drawEnemy(e){const bob=Math.sin(elapsed*8+e.id)*2;ctx.save();ctx.translate(e.x,e.y-16+bob);ctx.fillStyle='#852f55';ctx.fillRect(-18,10,7,9);ctx.fillRect(11,10,7,9);ctx.strokeStyle='#b64155';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-13,1);ctx.lineTo(-25,-8);ctx.lineTo(-29,-4);ctx.moveTo(13,1);ctx.lineTo(25,-8);ctx.lineTo(29,-4);ctx.stroke();ctx.fillStyle='#d95763';ctx.beginPath();ctx.roundRect(-20,-14,40,28,10);ctx.fill();ctx.fillStyle='#ffcb53';ctx.beginPath();ctx.arc(-7,-3,4,0,Math.PI*2);ctx.arc(7,-3,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#172743';ctx.beginPath();ctx.arc(-7,-3,1.5,0,Math.PI*2);ctx.arc(7,-3,1.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#8c3657';for(let i=-1;i<=1;i++)ctx.fillRect(i*8-2,-19,4,6);ctx.restore();}
  function drawGoal(){const x=LEVEL_END-92;ctx.fillStyle='#f9f1ca';ctx.fillRect(x,260,5,180);ctx.fillStyle='#ffdf49';ctx.beginPath();ctx.moveTo(x+5,264);ctx.lineTo(x+72,278);ctx.lineTo(x+5,299);ctx.closePath();ctx.fill();ctx.fillStyle='#105df2';ctx.font='900 11px Outfit';ctx.fillText('GO!',x+17,283);ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(x+2,259,8,4,0,0,Math.PI*2);ctx.fill();}
  function drawPlayer(){
    const p=player;if(!p)return;if(p.invuln>0&&Math.floor(p.invuln*12)%2===0)return;
    const run=Math.sin(p.anim)*5, airborne=!p.grounded, spin=airborne&&Math.abs(p.vx)>4;
    ctx.save();ctx.translate(p.x,p.y);if(p.face<0)ctx.scale(-1,1);
    if(spin){ctx.rotate(elapsed*9*p.face);ctx.fillStyle='#1170ee';ctx.beginPath();ctx.arc(0,-22,17,0,Math.PI*2);ctx.fill();ctx.fillStyle='#54c9ff';ctx.beginPath();ctx.arc(-3,-27,8,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(4,-27,4,0,Math.PI*2);ctx.fill();ctx.restore();return;}
    // Quills silhouette, swept back for a fast-moving hero.
    ctx.fillStyle='#0860d9';ctx.beginPath();ctx.moveTo(-11,-31);ctx.lineTo(-28,-39);ctx.lineTo(-20,-25);ctx.lineTo(-32,-26);ctx.lineTo(-20,-16);ctx.lineTo(-26,-8);ctx.lineTo(-12,-12);ctx.lineTo(7,-7);ctx.lineTo(13,-22);ctx.closePath();ctx.fill();
    ctx.fillStyle='#137cf1';ctx.beginPath();ctx.ellipse(0,-24,14,17,0,0,Math.PI*2);ctx.fill();
    // Face and muzzle.
    ctx.fillStyle='#ffdfbd';ctx.beginPath();ctx.ellipse(7,-19,10,8,-.25,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(7,-29,5.5,9,-.15,0,Math.PI*2);ctx.ellipse(13,-28,4.4,7,-.15,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#10264a';ctx.beginPath();ctx.ellipse(9,-28,1.7,4,0,0,Math.PI*2);ctx.ellipse(14,-27,1.5,3.2,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e56a70';ctx.beginPath();ctx.ellipse(17,-20,3.2,2.4,-.2,0,Math.PI*2);ctx.fill();
    // Gloves, running legs and signature red shoes.
    ctx.strokeStyle='#ffdfbd';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-8,-15);ctx.lineTo(-15,-9+run*.2);ctx.stroke();ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(-16,-7+run*.2,5,4,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#094fb7';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-4,-10);ctx.lineTo(-6+run*.35,-5);ctx.moveTo(6,-10);ctx.lineTo(7-run*.35,-5);ctx.stroke();
    ctx.fillStyle='#e84150';ctx.beginPath();ctx.ellipse(-8+run*.35,-3,10,5,-.05,0,Math.PI*2);ctx.ellipse(8-run*.35,-3,10,5,-.05,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.fillRect(-14+run*.35,-5,11,2);ctx.fillRect(2-run*.35,-5,11,2);
    ctx.restore();
  }
  function frame(now){const dt=Math.min(.033,(now-lastTime)/1000||0);lastTime=now;update(dt);draw();requestAnimationFrame(frame);}
  reset();requestAnimationFrame(frame);
})();
