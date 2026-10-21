(function () {
  'use strict';
  const E = window.KingdomEngine, $ = id => document.getElementById(id);
  const canvas = $('map'), viewport = $('viewport'), CELL = 56;
  if (!window.Phaser || !window.KingdomRenderer) { $('loading').textContent='描画エンジンを読み込めませんでした。再読み込みしてください。'; return; }
  let renderer;
  const names = { grass: '平地', forest: '森林 / Wood', food: '食料 / Food', mine: '鉱山 / Gold', camp: 'ゴブリン拠点跡', lair: 'Dragonの巣' };
  const assets = {}, assetNames = ['grass','forest','food','mine','camp','lair','chest','keep','farm','house','barracks','tower','windmill','blacksmith','worker','soldier','goblin','dragon'];
  let world = E.create(), selected = world.keepId, mode = 'explore', buildKind = null, zoom = 1, previousSpeed = 1;
  let pointer = null, last = performance.now(), uiElapsed = 0, lastEvent = null, actionKey = '', queueKey = '', resultShown = false, confirmSpeed = 1;
  const mobile = window.matchMedia('(max-width:760px)'), systemMotion = window.matchMedia('(prefers-reduced-motion:reduce)');
  let seenEffects = new WeakSet(), visualTime = 0, feedbackUntil = 0, resultAt = null, audio = null, guideStage = 0;
  $('motion').checked = systemMotion.matches;
  const reduced = () => systemMotion.matches || $('motion').checked;
  function sound(important = false) {
    if (!$('sound').checked || document.hidden) return;
    try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if(audio.state !== 'running') return;
      const oscillator=audio.createOscillator(),gain=audio.createGain(),now=audio.currentTime;
      oscillator.type='sine';oscillator.frequency.setValueAtTime(important ? 660 : 440,now);oscillator.frequency.exponentialRampToValueAtTime(important ? 880 : 280,now+.12);
      gain.gain.setValueAtTime(.035,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(now+.2);
    } catch (_) { $('sound').checked=false; }
  }
  $('sound').addEventListener('change',()=>{if($('sound').checked){try{audio ||= new (window.AudioContext || window.webkitAudioContext)();audio.resume().then(()=>sound(true)).catch(()=>{$('sound').checked=false;});}catch(_){$('sound').checked=false;}}});
  function sheet(which) {
    $('context-panel').classList.toggle('open',Boolean(which));
    document.querySelectorAll('[data-sheet]').forEach(p=>p.classList.toggle('visible',p.dataset.sheet===which));
    $('sheet-title').textContent=({detail:'選択情報・軍備',build:'建築計画',queue:'作業予約'})[which] || '';
  }
  $('sheet-close').addEventListener('click',()=>sheet(null));
  $('queue-open').addEventListener('click',()=>sheet('queue'));
  document.querySelectorAll('[data-dock]').forEach(b=>b.addEventListener('click',()=>{
    const action=b.dataset.dock;
    if(action==='build'){sheet('build');return;}
    if(action==='army'){const barracks=world.tiles.find(t=>t.building?.kind==='barracks');selected=barracks?.id ?? world.keepId;setMode('select');center(selected);render();sheet('detail');return;}
    sheet(null);setMode(action);
  }));
  $('guide-toggle').addEventListener('click',()=>{const hide=!document.querySelector('.guide').classList.contains('collapsed');document.querySelector('.guide').classList.toggle('collapsed',hide);$('guide-toggle').textContent=hide?'案内を表示':'案内を隠す';$('guide-toggle').setAttribute('aria-expanded',String(!hide));});
  $('threat').addEventListener('click',()=>{const enemy=[...world.enemies].sort((a,b)=>Math.hypot(a.x-10,a.y-10)-Math.hypot(b.x-10,b.y-10))[0];if(enemy){selected=E.index(Math.max(0,Math.min(19,Math.round(enemy.x))),Math.max(0,Math.min(19,Math.round(enemy.y))));center(selected);render();}});
  const helpSeenKey = 'kingdom-sweeper-help-v1';
  let firstHelp = true, helpSpeed = 0;
  try { firstHelp = localStorage.getItem(helpSeenKey) !== 'seen'; } catch (_) { /* Storage may be unavailable in private/file contexts. */ }
  world.speed = 0;
  function openHelp(initial = false) {
    if ($('help').open || world.result || world.pendingRewards.length) return;
    helpSpeed = initial ? 0 : world.speed;
    world.speed = 0; pointer = null; render(); $('help').showModal();
  }
  $('help-open').addEventListener('click', () => openHelp());
  $('help-close').addEventListener('click', () => $('help').close());
  $('help').addEventListener('close', () => {
    try { localStorage.setItem(helpSeenKey, 'seen'); } catch (_) { /* Reading help must not depend on storage. */ }
    setSpeed(document.hidden ? 0 : helpSpeed);
  });
  const costText = cost => Object.entries(cost).map(([key,n]) => `${key.toUpperCase()} ${n}`).join(' / ');
  const timeText = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2,'0')}`;
  function notice(message) { $('notice').textContent = message; $('feedback').textContent=message;$('feedback').hidden=false;feedbackUntil=visualTime+3; }
  function draw() { renderer.sync(world, { selected, buildKind, reduced: reduced() }); }
  function setSpeed(speed) { if(world.result) return;world.speed=speed;if(speed) previousSpeed=speed;render(); }
  function setMode(next,kind=null) {
    mode=next;buildKind=kind;
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    document.querySelectorAll('[data-build]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.build===kind)));
    document.querySelectorAll('[data-dock]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.dock===(mode==='select'?'army':mode))));
    $('mode-help').textContent=({explore:'未探索マスをタップして開拓予約。ドラッグでまとめて予約。',select:'マスをタップして情報確認。資源採集・育成・集合を指示できます。',flag:'未探索マスをタップして危険メモを付ける／外す。',pan:'地図をドラッグして移動。＋／−で拡大・縮小できます。',build:`${kind ? E.BUILDINGS[kind].name : ''}：開拓済みの空き平地をタップ。`})[mode];
  }
  function button(action,label) {return `<button type="button" data-action="${action}">${label}</button>`;}
  $('army-pursue').addEventListener('click',()=>{E.setArmyMode(world,'pursue');render();});
  $('army-defend').addEventListener('click',()=>{E.setArmyMode(world,'defend');render();});
  function renderReward() {
    const reward=world.pendingRewards[0];
    if (!reward || world.result) { if($('treasure').open)$('treasure').close();return; }
    if ($('help').open || $('confirm').open) return;
    if ($('upgrade-choices').dataset.rewardId!==String(reward.id)) {
      $('upgrade-choices').dataset.rewardId=reward.id;
      $('upgrade-choices').replaceChildren(...Object.entries(E.UPGRADES).map(([kind,spec])=>{
        const b=document.createElement('button');b.type='button';b.dataset.upgrade=kind;b.dataset.rewardId=reward.id;
        const title=document.createElement('strong'),detail=document.createElement('span'),icon=document.createElement('img');icon.src=`assets/${kind==='soldier'?'soldier':kind}.png`;icon.alt='';title.textContent=spec.name;
        const base={farm:1.6,soldier:16,tower:3}[kind],current=base*(1+world.upgrades[kind]*spec.step),next=current+base*spec.step;
        const count=kind==='soldier'?world.units.filter(u=>u.kind==='soldier').length:world.tiles.filter(t=>t.building?.kind===kind).length;
        detail.textContent=`${spec.description} ｜ 基本${kind==='farm'?'生産':kind==='soldier'?'攻撃':'射程'} ${current.toFixed(2)} → ${next.toFixed(2)}${kind==='farm'?'/秒':kind==='tower'?'マス':''} ｜ 現在${count}${kind==='soldier'?'体':'棟'}（今後も有効）${kind==='farm'?'・風車分はさらに×1.25':kind==='soldier'?'・鍛冶兵はさらに×1.2':''}`;b.append(icon,title,detail);return b;
      }));
    }
    if (!$('treasure').open) { pointer=null;$('treasure').showModal(); }
  }
  $('treasure').addEventListener('cancel',e=>e.preventDefault());
  $('upgrade-choices').addEventListener('click',e=>{
    const b=e.target.closest('[data-upgrade]');if(!b)return;
    if(E.chooseUpgrade(world,Number(b.dataset.rewardId),b.dataset.upgrade)){sound(true);render();notice('王国強化を取得しました。');}
  });
  function render() {
    for(const k of ['food','wood','gold']) $(k).textContent=Math.floor(world.resources[k]);
    const pop=E.population(world);$('population').textContent=`${pop.used} / ${pop.cap}`;
    const keep=world.tiles[world.keepId].building;$('keep-hp').textContent=`${Math.max(0,Math.ceil(keep.hp))} / ${keep.maxHp}`;$('keep-bar').style.width=`${Math.max(0,keep.hp/keep.maxHp)*100}%`;
    $('army').textContent=`Worker ${world.units.filter(u=>u.kind==='worker').length} ・ Soldier ${world.units.filter(u=>u.kind==='soldier').length}`;
    $('territory').textContent=`領土 ${world.tiles.filter(t=>t.revealed).length} / 400`;
    $('status').textContent=world.result ? (world.result==='victory' ? 'Dragon討伐！' : '王城陥落') : world.pendingRewards.length ? '宝箱の強化を選択中・停止' : world.speed===0 ? '停止中・予約できます' : world.enemies.length ? `迎撃中！ 敵 ${world.enemies.length}` : world.dragonAwake ? 'Dragonとの決戦' : '領土を広げ、軍備を整えよう';
    $('clock').textContent=timeText(world.time);$('seed').textContent=`王国 #${world.seed}`;
    const has=kind=>world.tiles.some(t=>t.building?.kind===kind),soldiers=world.units.filter(u=>u.kind==='soldier').length;
    if(has('farm'))guideStage=Math.max(guideStage,1);if(has('farm')&&has('barracks'))guideStage=Math.max(guideStage,2);if(soldiers>=3)guideStage=Math.max(guideStage,3);if(world.kills)guideStage=Math.max(guideStage,4);if(world.dragonAwake)guideStage=5;
    const goals=[['農場で食料を安定させよう','建築 → 農場 → 空き草地。空き地がなければ外側を少し開拓。予約後は1×で進行。'],['兵舎を建てよう','建築 → 兵舎 → 空き草地。木材不足なら作業員の採集時間を確保。'],['兵士を育成しよう','軍備、または兵舎を選択 → 兵士育成。まず3体を目標に。'],['数字を読んで敵拠点へ','数字は周囲8マスの初期危険度。少しずつ開拓し、旗で推測をメモ。'],['王国を育て、ドラゴンへ備えよう','農場・民家・兵士・塔を増強。軍の集合地点を決めてから巣の候補を開拓。'],['ドラゴンとの決戦','兵士は自動迎撃。襲撃表示を押して戦況を確認し、王城を守ろう。']];
    $('guide-step').textContent=`王国づくり ${guideStage+1} / 6`;$('guide-title').textContent=world.result?'戦いが終わりました':goals[guideStage][0];$('guide-text').textContent=goals[guideStage][1];
    $('threat').hidden=!world.enemies.length;const nearestEnemy=[...world.enemies].sort((a,b)=>Math.hypot(a.x-10,a.y-10)-Math.hypot(b.x-10,b.y-10))[0];
    if(nearestEnemy){const dx=nearestEnemy.x-10,dy=nearestEnemy.y-10;$('threat').textContent=`⚠ ${Math.hypot(dx,dy)<2?'王城付近で交戦':`${Math.abs(dx)>Math.abs(dy)?dx>0?'東':'西':dy>0?'南':'北'}方面に敵`} ${world.enemies.length}体 · 押して現場へ`;}
    const dragon=world.enemies.find(e=>e.kind==='dragon');$('boss').hidden=!dragon;if(dragon){$('boss-hp').textContent=`${Math.ceil(dragon.hp)} / ${dragon.maxHp}`;$('boss-bar').max=dragon.maxHp;$('boss-bar').value=dragon.hp;}
    fitMap();
    document.querySelectorAll('[data-speed]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.speed)===world.speed)));
    document.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('unaffordable',!E.canPay(world,E.BUILDINGS[b.dataset.build].cost)));
    const t=world.tiles[selected], b=t.building, task=world.tasks.find(q=>q.tileId===selected);
    $('tile-title').textContent=`${b ? E.BUILDINGS[b.kind].name : t.revealed ? names[t.terrain] : '未探索'} (${t.x+1}, ${t.y+1})`;
    $('tile-description').textContent=t.revealed ? `周囲の初期危険度 ${t.clue}${b ? ` ・ HP ${Math.ceil(b.hp)}/${b.maxHp}` : ['forest','food','mine'].includes(t.terrain) ? ` ・ 残量 ${Math.ceil(t.amount)}` : ''}${b?.train.length ? ` ・ 育成待ち ${b.train.length}` : ''}` : `上下左右から開拓。${E.frontier(world,t.id) ? '今すぐ作業できます。' : '領土がつながるまで予約待機。'}${t.flag ? ' 危険メモあり。' : ''}`;
    const k=buildKind || b?.kind;
    const forged=E.hasNeighbor(world,selected,'blacksmith',false);
    $('building-effects').textContent=({
      farm:`農場生産 ${E.farmRate(world,selected).toFixed(2)} FOOD/秒。黄色枠：風車の隣接判定（周囲8マス）。${E.hasNeighbor(world,selected,'windmill',true) ? '風車効果ON（×1.25）。' : '風車効果なし。'}`,
      windmill:'黄色枠内の農場を25%増産。風車を複数隣接させても重複しません。',
      barracks:`青枠：鍛冶屋の隣接判定（上下左右）。${forged ? '効果ON：育成完了時の兵士が攻撃・HP×1.2。' : '効果なし：通常兵士を育成。'}既に育成済みの兵士は変わりません。`,
      blacksmith:'青枠内の兵舎から育成完了した兵士の攻撃・HPを20%強化。複数の鍛冶屋でも重複しません。',
      tower:`青い円：射程${E.towerRange(world).toFixed(2)}マス。範囲内の敵を自動攻撃。`
    })[k] || '';
    $('kingdom-upgrades').textContent=`農場 +${world.upgrades.farm*25}% ・ 兵士攻撃 +${world.upgrades.soldier*20}% ・ 塔射程 +${world.upgrades.tower*30}%`;
    let actions='';
    $('army-pursue').setAttribute('aria-pressed',String(world.armyMode==='pursue'));
    $('army-defend').setAttribute('aria-pressed',String(world.armyMode==='defend'));
    const rally=world.tiles[world.rally];
    $('army-orders').textContent=`集合地点 (${rally.x+1},${rally.y+1})：${world.armyMode==='defend'?'半径3マスを防衛。範囲外は追わず、接近されたら自衛。':'全域の敵を自動追撃。'}`;
    if(!t.revealed && t.flag && !task) actions+=button('prepare','集結後に開拓予約');
    if(t.revealed && t.clue===0) actions+=button('safe','周囲の安全マスをまとめて予約');
    if(task?.preparation) $('tile-description').textContent+=` ・ ${E.preparationStatus(world,task)||'集結完了・開拓準備中'} ・ 集合(${world.tiles[task.preparation.rally].x+1},${world.tiles[task.preparation.rally].y+1})`;
    const stats=world.stats;
    $('result-stats').textContent=`損失：Worker ${stats.lost.worker}体 / 兵士 ${stats.lost.soldier}体。育成完了：Worker ${stats.trained.worker}体 / 兵士 ${stats.trained.soldier}体。実支出：WOOD ${stats.spent.wood} / FOOD ${stats.spent.food} / GOLD ${stats.spent.gold}（取消返金を控除、育成待ちを含む）。`;
    if(!t.revealed) actions+=(!task ? button('explore',t.flag ? '旗を外して開拓予約' : '開拓予約') : '')+button('flag',t.flag ? '旗を外す' : '危険メモ');
    else {
      if(b?.kind==='keep') actions+=button('worker','Worker育成 / FOOD 25');
      if(b?.kind==='barracks') actions+=button('soldier','Soldier育成 / FOOD 30・WOOD 15');
      if(['forest','food','mine'].includes(t.terrain)) actions+=button('gather','全Workerでこの資源を採集');
      actions+=button('rally','兵士の集合地点にする');
    }
    actions+=button('auto','Workerの採集を自動に戻す');
    if(task) actions+=button('cancel','この予約を取り消す');
    if(actions!==actionKey){$('tile-actions').innerHTML=actions;actionKey=actions;}
    $('queue-count').textContent=world.tasks.length;
    $('queue-open').textContent=`作業予約 ${world.tasks.length}件を確認`;
    const queues=world.tasks.slice(0,8).map(q=>{const t=world.tiles[q.tileId];return `<div class="queue-item"><button data-locate="${t.id}">${q.kind==='build' ? E.BUILDINGS[q.building].name.split(' / ')[1] : q.preparation ? '準備開拓' : '開拓'} (${t.x+1},${t.y+1}) <small>${E.preparationStatus(world,q) || (q.workerId ? `${Math.ceil(q.remaining)}秒` : '接続・作業員待ち')}</small></button><button data-cancel="${t.id}" aria-label="予約取消">×</button></div>`;}).join('')+(world.tasks.length>8 ? `<p class="muted">ほか ${world.tasks.length-8} 件</p>` : '') || '<p class="muted">予約はありません</p>';
    if(queues!==queueKey){$('queue-list').innerHTML=queues;queueKey=queues;}
    if(lastEvent!==world.events.at(-1)) {lastEvent=world.events.at(-1);notice(lastEvent.text);$('log').replaceChildren(...world.events.slice(-6).reverse().map(e=>{const li=document.createElement('li');li.textContent=`${timeText(e.time)} ${e.text}`;return li;}));}
    renderReward();
    if(world.result&&!resultShown){resultShown=true;resultAt=visualTime+(reduced()?.15:1.2);sheet(null);if(world.result==='victory'){$('viewport').classList.add('celebrate');selected=world.dragonId;center(selected);renderer.playEffect({kind:'victory',...E.xy(selected)});sound(true);}notice(world.result==='victory'?'⚑ ドラゴン討伐！ 王国に平和が戻った！':'王城のHPが0になり、陥落しました。');$('result-label').textContent=world.result==='victory' ? 'VICTORY' : 'DEFEAT';$('result-title').textContent=world.result==='victory' ? '王国に平和が戻った！' : '王城が陥落しました';$('result-summary').textContent=`経過 ${timeText(world.time)} ・ 討伐 ${world.kills}体 ・ 領土 ${world.tiles.filter(t=>t.revealed).length}マス ・ 建物 ${world.tiles.filter(t=>t.building&&t.building.hp>0).length}棟 ・ 生存兵士 ${soldiers}体`;}
  }
  function center(id=world.keepId) {const t=world.tiles[id];viewport.scrollLeft=(t.x+.5)*CELL*zoom-viewport.clientWidth/2;viewport.scrollTop=(t.y+.5)*CELL*zoom-viewport.clientHeight/2;}
  function fitMap(){if(!mobile.matches){viewport.style.height='';return;}const top=viewport.getBoundingClientRect().top+window.scrollY,dock=document.querySelector('.mobile-dock').getBoundingClientRect().height,next=Math.max(220,window.innerHeight-top-dock-70),old=viewport.clientHeight;if(Math.abs(old-next)>1){const mid=viewport.scrollTop+old/2;viewport.style.height=`${next}px`;viewport.scrollTop=mid-viewport.clientHeight/2;}}
  window.addEventListener('resize',()=>{fitMap();});
  mobile.addEventListener('change',()=>{sheet(null);center(selected);});
  function setZoom(next) {const cx=(viewport.scrollLeft+viewport.clientWidth/2)/zoom,cy=(viewport.scrollTop+viewport.clientHeight/2)/zoom;zoom=Math.max(.6,Math.min(1.8,next));if(renderer?.scene)renderer.setZoom(zoom);else{canvas.style.width=`${1120*zoom}px`;canvas.style.height=`${1120*zoom}px`;} $('zoom-label').textContent=`${Math.round(zoom*100)}%`;viewport.scrollLeft=cx*zoom-viewport.clientWidth/2;viewport.scrollTop=cy*zoom-viewport.clientHeight/2;}
  function point(event) {const r=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-r.left)/r.width*20),y=Math.floor((event.clientY-r.top)/r.height*20);return x>=0&&y>=0&&x<20&&y<20 ? E.index(x,y) : null;}
  function operate(id) {
    selected=id;if(world.result) return;
    const t=world.tiles[id];
    if(mode==='build'){const r=E.queueBuild(world,id,buildKind);notice(r.ok ? '建築を予約しました。' : r.reason);}
    else if(mode==='flag'&&!t.revealed){t.flag=!t.flag;notice(t.flag ? '危険メモを付けました。開拓する場合は旗を外してください。' : '危険メモを外しました。');}
    else if(mode==='explore'&&!t.revealed){notice(t.flag ? '危険メモのあるマスです。先に旗を外してください。' : E.queueExplore(world,id) ? '開拓を予約しました。' : 'すでに開拓予約済みです。');}
    render();if(mobile.matches&&mode!=='build'&&(t.revealed||mode==='flag'||mode==='select'))sheet('detail');if(mode==='build')sheet(null);
  }
  canvas.addEventListener('pointerdown',e=>{if(e.button!==0)return;const id=point(e);if(id===null)return;pointer={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,start:id,last:id,cells:new Set([id])};canvas.setPointerCapture(e.pointerId);e.preventDefault();});
  canvas.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;if(mode==='pan'){viewport.scrollLeft=pointer.left-e.clientX+pointer.x;viewport.scrollTop=pointer.top-e.clientY+pointer.y;return;}const id=point(e);if(id===null)return;if(mode==='explore'){const a=E.xy(pointer.last),b=E.xy(id),steps=Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));for(let i=1;i<=steps;i++)pointer.cells.add(E.index(Math.round(a.x+(b.x-a.x)*i/steps),Math.round(a.y+(b.y-a.y)*i/steps)));}pointer.last=id;});
  canvas.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;const p=pointer;pointer=null;if(mode==='pan')return;if(mode==='explore'&&p.cells.size>1){let count=0;for(const id of p.cells)if(!world.tiles[id].flag&&E.queueExplore(world,id))count++;selected=p.last;render();notice(`${count}マスを開拓予約しました。奥のマスは道がつながるまで待機します。`);}else operate(p.last);});
  canvas.addEventListener('pointercancel',()=>{pointer=null;});
  canvas.addEventListener('contextmenu',e=>{e.preventDefault();const id=point(e);if(id===null||world.result)return;selected=id;const t=world.tiles[id];if(!t.revealed){if(!t.flag)E.queueExplore(world,id);}else if(['forest','food','mine'].includes(t.terrain)){world.workerFocus=t.terrain;notice('全Workerの採集対象を変更しました。');}else{world.rally=id;notice('兵士の集合地点を変更しました。');}render();});
  $('tile-actions').addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action;if(!action||world.result)return;const t=world.tiles[selected];if(action==='worker'||action==='soldier'){const r=E.train(world,selected,action);notice(r.ok ? '育成を予約しました。' : r.reason);}if(action==='explore'){t.flag=false;E.queueExplore(world,selected);}if(action==='flag')t.flag=!t.flag;if(action==='gather'){world.workerFocus=t.terrain;notice('全Workerの採集対象を変更しました。');}if(action==='rally'){world.rally=selected;notice('兵士の集合地点を変更しました。');}if(action==='auto'){world.workerFocus=null;notice('採集を自動分担に戻しました。');}if(action==='cancel')E.cancelTask(world,selected);render();});
  $('queue-list').addEventListener('click',e=>{const locate=e.target.closest('[data-locate]'),cancel=e.target.closest('[data-cancel]');if(locate){selected=Number(locate.dataset.locate);center(selected);}if(cancel)E.cancelTask(world,Number(cancel.dataset.cancel));render();});
  $('tile-actions').addEventListener('click',e=>{
    const action=e.target.closest('[data-action]')?.dataset.action;if(world.result)return;
    if(action==='prepare')notice(E.queuePreparedExplore(world,selected,Number($('prepare-count').value))?'集結後の開拓を予約しました。':'防衛モードにして、集合地点から3マス以内の未予約の旗付きマスを選んでください。');
    if(action==='safe')notice(`${E.queueSafeNeighbors(world,selected)}マスを予約。Workerの採集時間にも注意してください。`);
    if(action==='prepare'||action==='safe')render();
  });
  for(const [kind,spec] of Object.entries(E.BUILDINGS))if(kind!=='keep'){const b=document.createElement('button');b.type='button';b.dataset.build=kind;b.setAttribute('aria-pressed','false');b.innerHTML=`<img src="assets/${kind}.png" alt=""><span>${spec.name.split(' / ')[1]}<small>${costText(spec.cost)}</small></span>`;b.addEventListener('click',()=>{setMode('build',kind);sheet(null);notice(`${spec.name.split(' / ')[1]}：空き草地を選んでください。`);});$('build-list').append(b);}
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));
  document.querySelectorAll('[data-speed]').forEach(b=>b.addEventListener('click',()=>setSpeed(Number(b.dataset.speed))));
  $('zoom-in').addEventListener('click',()=>setZoom(zoom+.2));$('zoom-out').addEventListener('click',()=>setZoom(zoom-.2));$('center').addEventListener('click',()=>{selected=world.keepId;center();render();});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.target.closest('button,input,select,textarea,dialog')){e.preventDefault();setSpeed(world.speed ? 0 : previousSpeed);}if(e.target===viewport){const t=world.tiles[selected],delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta){e.preventDefault();selected=E.index(Math.max(0,Math.min(19,t.x+delta[0])),Math.max(0,Math.min(19,t.y+delta[1])));center(selected);render();}if(e.key==='Enter'){e.preventDefault();operate(selected);}}});
  function restart(seed){world=E.create(seed);selected=world.keepId;resultShown=false;resultAt=null;guideStage=0;seenEffects=new WeakSet();$('viewport').classList.remove('celebrate');sheet(null);lastEvent=null;actionKey='';queueKey='';pointer=null;$('upgrade-choices').dataset.rewardId='';previousSpeed=1;setMode('explore');setSpeed(0);center();render();}
  $('replay').addEventListener('click',()=>{const seed=world.seed;$('result').close();restart(seed);});
  $('restart').addEventListener('click',()=>{confirmSpeed=world.speed;world.speed=0;$('confirm').showModal();render();});
  $('cancel-restart').addEventListener('click',()=>{$('confirm').close();setSpeed(confirmSpeed);});
  $('confirm').addEventListener('cancel',()=>setSpeed(confirmSpeed));
  $('confirm-restart').addEventListener('click',()=>{$('confirm').close();restart();});
  $('again').addEventListener('click',()=>{$('result').close();restart();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){world.speed=0;if($('help').open)helpSpeed=0;render();}});
  function frame(now){const elapsed=Math.min(.25,(now-last)/1000);last=now;visualTime+=elapsed;let remaining=elapsed*world.speed;while(remaining>0&&!world.result&&!world.pendingRewards.length){const dt=Math.min(.05,remaining);E.tick(world,dt);for(const effect of world.effects)if(!seenEffects.has(effect)){seenEffects.add(effect);renderer.playEffect(effect);if(effect.kind==='build')sound(true);}remaining-=dt;}if(feedbackUntil<visualTime)$('feedback').hidden=true;uiElapsed+=elapsed;if(uiElapsed>.2||world.pendingRewards.length&&!$('treasure').open){render();uiElapsed=0;}if(resultAt!==null&&visualTime>=resultAt){resultAt=null;if($('treasure').open)$('treasure').close();if($('help').open)$('help').close();$('result').showModal();}draw();}
  Promise.all(assetNames.map(name=>new Promise(resolve=>{const img=new Image();img.onload=()=>{assets[name]=img;resolve(true);};img.onerror=()=>resolve(false);img.src=`assets/${name}.png`;}))).then(async results=>{
    renderer=new window.KingdomRenderer(canvas,assets,frame); await renderer.ready;
    last=performance.now(); $('loading').hidden=true;setZoom(zoom);center();render();draw();if(firstHelp)openHelp(true);
    if(results.some(ok=>!ok))notice('一部の画像が読み込めませんでした。再読み込みしてください。');
  }).catch(error=>{console.error('Kingdom renderer initialization failed',error);$('loading').hidden=false;$('loading').textContent='描画を開始できませんでした。再読み込みするか、別のブラウザをお試しください。';});
})();
