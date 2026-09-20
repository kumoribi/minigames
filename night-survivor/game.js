const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),arena=document.querySelector('#arena');
const ui={level:document.querySelector('#level'),time:document.querySelector('#time'),kills:document.querySelector('#kills'),score:document.querySelector('#score'),best:document.querySelector('#best'),hp:document.querySelector('#hp-bar'),hpText:document.querySelector('#hp-text'),xp:document.querySelector('#xp-bar'),xpText:document.querySelector('#xp-text'),loadout:document.querySelector('#loadout-list'),pause:document.querySelector('#pause'),paused:document.querySelector('#paused-panel'),start:document.querySelector('#start-panel'),upgrade:document.querySelector('#upgrade-dialog'),upgradeList:document.querySelector('#upgrade-list'),result:document.querySelector('#result-dialog'),bossAlert:document.querySelector('#boss-alert'),stick:document.querySelector('#stick')};
const GAME_LENGTH=300,MAX_ENEMIES=180;
const ENEMY_TYPES={
  slime:{hp:20,speed:42,radius:15,damage:10,xp:4,color:'#58d68d',score:10},
  bat:{hp:12,speed:78,radius:11,damage:8,xp:4,color:'#bf74ff',score:14},
  golem:{hp:75,speed:27,radius:21,damage:16,xp:9,color:'#a48165',score:30},
  elite:{hp:360,speed:36,radius:29,damage:22,xp:35,color:'#ff8b51',score:500},
  boss:{hp:2400,speed:31,radius:43,damage:30,xp:100,color:'#ff426d',score:5000}
};
const UPGRADES={
  magic:{name:'魔法弾',symbol:'✦',max:5,desc:'弾数と威力を強化'},
  orbit:{name:'回転刃',symbol:'◈',max:5,desc:'周囲を回る刃を追加'},
  lightning:{name:'雷撃',symbol:'ϟ',max:5,desc:'複数の敵へ落雷'},
  power:{name:'攻撃力',symbol:'⚔',max:5,desc:'すべてのダメージ +18%'},
  speed:{name:'移動速度',symbol:'➤',max:5,desc:'移動速度 +10%'},
  cooldown:{name:'攻撃速度',symbol:'⌛',max:5,desc:'攻撃間隔を8%短縮'},
  magnet:{name:'吸引範囲',symbol:'◎',max:5,desc:'経験値の取得範囲を拡大'},
  vitality:{name:'生命力',symbol:'♥',max:5,desc:'最大HP +20、HPを回復'}
};
let state,input,keys={},pointerId=null,stickOrigin={x:0,y:0},lastTime=0,raf=0;

function freshState(){
  return {running:false,paused:false,ended:false,time:0,kills:0,score:0,level:1,xp:0,nextXp:18,player:{x:0,y:0,radius:15,hp:100,maxHp:100,speed:150,invulnerable:0},levels:{magic:1,orbit:0,lightning:0,power:0,speed:0,cooldown:0,magnet:0,vitality:0},enemies:[],projectiles:[],orbs:[],particles:[],floaters:[],magicTimer:0,lightningTimer:1,spawnTimer:0,eliteAt:45,bossSpawned:false,boss:null,screenShake:0};
}
function reset(){cancelAnimationFrame(raf);state=freshState();input={x:0,y:0};lastTime=0;ui.result.hidden=true;ui.upgrade.hidden=true;ui.paused.hidden=true;ui.start.hidden=false;ui.bossAlert.hidden=true;ui.pause.textContent='Ⅱ';resize();updateUI();draw();}
function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
function screen(){return {w:canvas.clientWidth,h:canvas.clientHeight};}
function start(){if(state.running)return;state.running=true;state.paused=false;ui.start.hidden=true;lastTime=performance.now();raf=requestAnimationFrame(loop);}
function togglePause(force){if(!state.running||state.ended||!ui.upgrade.hidden)return;state.paused=force===undefined?!state.paused:force;ui.paused.hidden=!state.paused;ui.pause.textContent=state.paused?'▶':'Ⅱ';if(!state.paused){lastTime=performance.now();raf=requestAnimationFrame(loop);}else cancelAnimationFrame(raf);}
function loop(now){if(!state.running||state.paused||state.ended)return;const dt=Math.min(.04,(now-lastTime)/1000||0);lastTime=now;update(dt);draw();if(!state.ended)raf=requestAnimationFrame(loop);}
function moveVector(){let x=input.x+(keys.ArrowRight||keys.d?1:0)-(keys.ArrowLeft||keys.a?1:0),y=input.y+(keys.ArrowDown||keys.s?1:0)-(keys.ArrowUp||keys.w?1:0);const length=Math.hypot(x,y);return length>1?{x:x/length,y:y/length}:{x,y};}
function update(dt){
  state.time+=dt;const p=state.player,v=moveVector(),speed=p.speed*(1+state.levels.speed*.1);p.x+=v.x*speed*dt;p.y+=v.y*speed*dt;p.invulnerable=Math.max(0,p.invulnerable-dt);state.screenShake=Math.max(0,state.screenShake-dt);
  const phase=Math.min(5,Math.floor(state.time/60));state.spawnTimer-=dt;if(state.spawnTimer<=0&&state.enemies.length<MAX_ENEMIES&&!state.bossSpawned){const amount=1+Math.floor(phase/2);for(let i=0;i<amount;i++)spawnEnemy(pickEnemyType(phase));state.spawnTimer=Math.max(.16,.72-phase*.09);}
  if(state.time>=state.eliteAt&&state.time<GAME_LENGTH&&!state.bossSpawned){spawnEnemy('elite');state.eliteAt+=60;showAlert('⚠ エリート出現 ⚠',1200);}
  if(state.time>=GAME_LENGTH&&!state.bossSpawned){state.bossSpawned=true;state.enemies=state.enemies.filter(e=>e.type==='elite');state.boss=spawnEnemy('boss');showAlert('⚠ BOSS APPROACHING ⚠',2200);}
  updateWeapons(dt);updateProjectiles(dt);updateEnemies(dt);updateOrbs(dt);updateParticles(dt);updateUI();
}
function pickEnemyType(phase){const r=Math.random();if(phase<1)return r<.78?'slime':'bat';if(phase<3)return r<.52?'slime':r<.82?'bat':'golem';return r<.34?'slime':r<.67?'bat':'golem';}
function spawnEnemy(type){const {w,h}=screen(),angle=Math.random()*Math.PI*2,distance=Math.hypot(w,h)*.62+60,t=ENEMY_TYPES[type],scale=type==='boss'||type==='elite'?1:1+Math.min(1.2,state.time/300);const enemy={type,x:state.player.x+Math.cos(angle)*distance,y:state.player.y+Math.sin(angle)*distance,hp:t.hp*scale,maxHp:t.hp*scale,speed:t.speed*(1+Math.min(.45,state.time/600)),radius:t.radius,damage:t.damage,orbitHit:-9,color:t.color};state.enemies.push(enemy);return enemy;}
function cooldownFactor(){return Math.max(.55,1-state.levels.cooldown*.08)}
function powerFactor(){return 1+state.levels.power*.18}
function updateWeapons(dt){
  state.magicTimer-=dt;if(state.magicTimer<=0){const count=1+Math.floor((state.levels.magic-1)/2),targets=nearestEnemies(count);targets.forEach((enemy,i)=>{const a=Math.atan2(enemy.y-state.player.y,enemy.x-state.player.x)+(i-(count-1)/2)*.08;state.projectiles.push({x:state.player.x,y:state.player.y,vx:Math.cos(a)*360,vy:Math.sin(a)*360,radius:5,damage:(13+state.levels.magic*6)*powerFactor(),life:1.5,pierce:state.levels.magic>=4?2:1,color:'#d8c4ff'});});state.magicTimer=(.72-state.levels.magic*.055)*cooldownFactor();}
  if(state.levels.lightning){state.lightningTimer-=dt;if(state.lightningTimer<=0){nearestEnemies(1+state.levels.lightning).forEach(e=>{damageEnemy(e,(24+state.levels.lightning*13)*powerFactor());burst(e.x,e.y,'#89eaff',8);state.floaters.push({x:e.x,y:e.y,text:'ϟ',color:'#bdf5ff',life:.55});});state.lightningTimer=(2.4-state.levels.lightning*.18)*cooldownFactor();}}
  if(state.levels.orbit){const blades=1+state.levels.orbit,range=54+state.levels.orbit*7,now=state.time*2.2;state.enemies.forEach(e=>{for(let i=0;i<blades;i++){const a=now+i*Math.PI*2/blades,bx=state.player.x+Math.cos(a)*range,by=state.player.y+Math.sin(a)*range;if(Math.hypot(e.x-bx,e.y-by)<e.radius+10&&state.time-e.orbitHit>.35){e.orbitHit=state.time;damageEnemy(e,(8+state.levels.orbit*5)*powerFactor());break;}}});}
}
function nearestEnemies(count){return state.enemies.filter(e=>e.hp>0).sort((a,b)=>dist2(a,state.player)-dist2(b,state.player)).slice(0,count)}
function dist2(a,b){return (a.x-b.x)**2+(a.y-b.y)**2}
function updateProjectiles(dt){for(const shot of state.projectiles){shot.x+=shot.vx*dt;shot.y+=shot.vy*dt;shot.life-=dt;for(const e of state.enemies){if(e.hp<=0||shot.life<=0)continue;if(Math.hypot(e.x-shot.x,e.y-shot.y)<e.radius+shot.radius){damageEnemy(e,shot.damage);shot.pierce--;if(shot.pierce<=0)shot.life=0;}}}state.projectiles=state.projectiles.filter(s=>s.life>0);}
function updateEnemies(dt){
  const p=state.player;
  for(const e of state.enemies){const dx=p.x-e.x,dy=p.y-e.y,d=Math.hypot(dx,dy)||1;e.x+=dx/d*e.speed*dt;e.y+=dy/d*e.speed*dt;if(d<e.radius+p.radius&&p.invulnerable<=0){p.hp=Math.max(0,p.hp-e.damage);p.invulnerable=.65;state.screenShake=.18;burst(p.x,p.y,'#ff5671',12);if(!p.hp){finish(false);return;}}}
  state.enemies=state.enemies.filter(e=>e.hp>0);
}
function damageEnemy(enemy,amount){enemy.hp-=amount;state.floaters.push({x:enemy.x,y:enemy.y-10,text:Math.round(amount),color:'#ffe5a5',life:.55});if(enemy.hp<=0){state.kills++;state.score+=ENEMY_TYPES[enemy.type].score;state.orbs.push({x:enemy.x,y:enemy.y,value:ENEMY_TYPES[enemy.type].xp,radius:5});burst(enemy.x,enemy.y,enemy.color,enemy.type==='boss'?30:7);if(enemy.type==='boss')finish(true);}}
function updateOrbs(dt){const p=state.player,range=75+state.levels.magnet*34;for(const orb of state.orbs){const d=Math.hypot(p.x-orb.x,p.y-orb.y);if(d<range){const speed=110+(range-d)*5;orb.x+=(p.x-orb.x)/(d||1)*speed*dt;orb.y+=(p.y-orb.y)/(d||1)*speed*dt;}if(d<p.radius+10){orb.collected=true;gainXp(orb.value);}}state.orbs=state.orbs.filter(o=>!o.collected);}
function gainXp(amount){state.xp+=amount;while(state.xp>=state.nextXp&&!state.ended){state.xp-=state.nextXp;state.level++;state.nextXp=Math.round(18+state.level*10+state.level**1.35);showUpgrade();break;}}
function showUpgrade(){state.paused=true;cancelAnimationFrame(raf);const choices=shuffle(Object.keys(UPGRADES).filter(k=>state.levels[k]<UPGRADES[k].max)).slice(0,3);ui.upgradeList.replaceChildren();choices.forEach(key=>{const u=UPGRADES[key],button=document.createElement('button');button.type='button';button.className='upgrade-card';button.innerHTML=`<span class="symbol">${u.symbol}</span><span><strong>${u.name}</strong><small>${u.desc}</small></span><em>Lv ${state.levels[key]} → ${state.levels[key]+1}</em>`;button.onclick=()=>chooseUpgrade(key);ui.upgradeList.append(button);});ui.upgrade.hidden=false;}
function chooseUpgrade(key){state.levels[key]++;if(key==='vitality'){state.player.maxHp+=20;state.player.hp=Math.min(state.player.maxHp,state.player.hp+35);}ui.upgrade.hidden=true;state.paused=false;updateUI();lastTime=performance.now();raf=requestAnimationFrame(loop);}
function shuffle(items){const a=[...items];for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function burst(x,y,color,count){for(let i=0;i<count&&state.particles.length<140;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*100;state.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,color,life:.35+Math.random()*.35});}}
function updateParticles(dt){for(const p of state.particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}for(const f of state.floaters){f.y-=28*dt;f.life-=dt;}state.particles=state.particles.filter(p=>p.life>0);state.floaters=state.floaters.filter(f=>f.life>0);}
function draw(){
  const {w,h}=screen(),p=state.player,shake=state.screenShake?5:0,ox=w/2-p.x+(Math.random()-.5)*shake,oy=h/2-p.y+(Math.random()-.5)*shake;ctx.clearRect(0,0,w,h);drawGround(w,h,ox,oy);
  for(const orb of state.orbs){const x=orb.x+ox,y=orb.y+oy;ctx.save();ctx.translate(x,y);ctx.rotate(state.time*2);ctx.fillStyle='#8d74ff';ctx.shadowColor='#b9a7ff';ctx.shadowBlur=12;ctx.fillRect(-5,-5,10,10);ctx.restore();}
  for(const shot of state.projectiles){ctx.beginPath();ctx.arc(shot.x+ox,shot.y+oy,shot.radius,0,Math.PI*2);ctx.fillStyle=shot.color;ctx.shadowColor=shot.color;ctx.shadowBlur=13;ctx.fill();}
  for(const e of state.enemies)drawEnemy(e,e.x+ox,e.y+oy);
  if(state.levels.orbit){const blades=1+state.levels.orbit,range=54+state.levels.orbit*7;for(let i=0;i<blades;i++){const a=state.time*2.2+i*Math.PI*2/blades,x=w/2+Math.cos(a)*range,y=h/2+Math.sin(a)*range;ctx.save();ctx.translate(x,y);ctx.rotate(a*2);ctx.fillStyle='#aeefff';ctx.shadowColor='#5bddff';ctx.shadowBlur=10;ctx.fillRect(-10,-4,20,8);ctx.restore();}}
  drawPlayer(w/2,h/2,p);
  for(const particle of state.particles){ctx.globalAlpha=Math.min(1,particle.life*3);ctx.fillStyle=particle.color;ctx.fillRect(particle.x+ox-2,particle.y+oy-2,4,4);}ctx.globalAlpha=1;
  for(const f of state.floaters){ctx.globalAlpha=Math.min(1,f.life*3);ctx.fillStyle=f.color;ctx.font='800 14px system-ui';ctx.textAlign='center';ctx.fillText(f.text,f.x+ox,f.y+oy);}ctx.globalAlpha=1;
}
function drawGround(w,h,ox,oy){ctx.fillStyle='#090b1d';ctx.fillRect(0,0,w,h);const grid=64,startX=((ox%grid)+grid)%grid,startY=((oy%grid)+grid)%grid;ctx.strokeStyle='#5e4a8522';ctx.lineWidth=1;for(let x=startX;x<w;x+=grid){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=startY;y<h;y+=grid){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.fillStyle='#7d5daa18';for(let x=startX;x<w;x+=grid)for(let y=startY;y<h;y+=grid){ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();}}
function drawPlayer(x,y,p){ctx.save();ctx.translate(x,y);if(p.invulnerable&&Math.floor(state.time*18)%2)ctx.globalAlpha=.35;ctx.shadowColor='#a982ff';ctx.shadowBlur=18;ctx.fillStyle='#6f4cc6';ctx.beginPath();ctx.arc(0,0,p.radius,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#eaddff';ctx.beginPath();ctx.moveTo(0,-18);ctx.lineTo(11,10);ctx.lineTo(0,6);ctx.lineTo(-11,10);ctx.closePath();ctx.fill();ctx.restore();}
function drawEnemy(e,x,y){ctx.save();ctx.translate(x,y);ctx.shadowColor=e.color;ctx.shadowBlur=e.type==='boss'?20:7;ctx.fillStyle=e.color;ctx.beginPath();if(e.type==='bat'){ctx.moveTo(-e.radius,0);ctx.lineTo(-4,-8);ctx.lineTo(0,3);ctx.lineTo(4,-8);ctx.lineTo(e.radius,0);ctx.lineTo(0,e.radius);ctx.closePath();}else ctx.arc(0,0,e.radius,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#170c20';ctx.fillRect(-7,-3,4,4);ctx.fillRect(3,-3,4,4);if(e.type==='elite'||e.type==='boss'){ctx.fillStyle='#240b15';ctx.fillRect(-e.radius,-e.radius-9,e.radius*2,5);ctx.fillStyle='#ffdf72';ctx.fillRect(-e.radius,-e.radius-9,e.radius*2*Math.max(0,e.hp/e.maxHp),5);}ctx.restore();}
function updateUI(){const p=state.player,remaining=Math.max(0,Math.ceil(GAME_LENGTH-state.time)),minutes=Math.floor(remaining/60),seconds=remaining%60;ui.level.textContent=state.level;ui.time.textContent=`${minutes}:${String(seconds).padStart(2,'0')}`;ui.kills.textContent=state.kills;ui.score.textContent=Math.floor(state.score+state.time*5);ui.hp.style.width=`${p.hp/p.maxHp*100}%`;ui.hpText.textContent=`${Math.ceil(p.hp)} / ${p.maxHp}`;ui.xp.style.width=`${state.xp/state.nextXp*100}%`;ui.xpText.textContent=`${state.xp} / ${state.nextXp} XP`;ui.best.textContent=Number(localStorage.getItem('night-survivor-best')||0);ui.loadout.replaceChildren();Object.keys(UPGRADES).filter(k=>state.levels[k]).forEach(k=>{const s=document.createElement('span');s.textContent=`${UPGRADES[k].symbol} ${UPGRADES[k].name} `;const b=document.createElement('b');b.textContent=`Lv${state.levels[k]}`;s.append(b);ui.loadout.append(s);});}
function showAlert(text,duration){ui.bossAlert.textContent=text;ui.bossAlert.hidden=false;setTimeout(()=>ui.bossAlert.hidden=true,duration);}
function finish(success){if(state.ended)return;state.ended=true;state.running=false;cancelAnimationFrame(raf);const total=Math.floor(state.score+state.time*5+(success?5000:0)),best=Math.max(total,Number(localStorage.getItem('night-survivor-best')||0));localStorage.setItem('night-survivor-best',best);document.querySelector('#result-label').textContent=success?'NIGHT CLEARED':'GAME OVER';document.querySelector('#result-title').textContent=success?'夜明けを迎えた！':'夜に飲まれた…';document.querySelector('#result-summary').textContent=`レベル ${state.level}・撃破 ${state.kills}体・スコア ${total}`;ui.result.hidden=false;updateUI();}
function pointerVector(event){const rect=arena.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,dx=x-stickOrigin.x,dy=y-stickOrigin.y,d=Math.hypot(dx,dy),limit=38,nx=d?dx/d:0,ny=d?dy/d:0,strength=Math.min(1,d/limit),move=Math.min(limit,d);input.x=nx*strength;input.y=ny*strength;ui.stick.firstElementChild.style.transform=`translate(${nx*move}px,${ny*move}px)`;}
arena.addEventListener('pointerdown',event=>{if(!state.running||state.paused||state.ended)return;pointerId=event.pointerId;arena.setPointerCapture(pointerId);const rect=arena.getBoundingClientRect();stickOrigin={x:event.clientX-rect.left,y:event.clientY-rect.top};ui.stick.style.left=`${Math.max(8,Math.min(rect.width-100,stickOrigin.x-46))}px`;ui.stick.style.top=`${Math.max(8,Math.min(rect.height-100,stickOrigin.y-46))}px`;ui.stick.style.bottom='auto';ui.stick.classList.add('active');input={x:0,y:0};});
arena.addEventListener('pointermove',event=>{if(event.pointerId===pointerId)pointerVector(event);});
function releasePointer(event){if(event.pointerId!==pointerId)return;pointerId=null;input={x:0,y:0};ui.stick.classList.remove('active');ui.stick.firstElementChild.style.transform='';}
arena.addEventListener('pointerup',releasePointer);arena.addEventListener('pointercancel',releasePointer);
addEventListener('keydown',event=>{const k=event.key.length===1?event.key.toLowerCase():event.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(k)){event.preventDefault();keys[k]=true;}if(k==='Escape')togglePause();});addEventListener('keyup',event=>{const k=event.key.length===1?event.key.toLowerCase():event.key;keys[k]=false;});
addEventListener('resize',()=>{resize();draw();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.running&&!state.paused)togglePause(true);});
document.querySelector('#start').onclick=start;ui.pause.onclick=()=>togglePause();document.querySelector('#resume').onclick=()=>togglePause(false);document.querySelector('#again').onclick=reset;
reset();
