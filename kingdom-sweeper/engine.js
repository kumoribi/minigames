/* Pure simulation: coordinates are tile centres, time is simulation seconds. */
(function (root) {
  'use strict';
  const SIZE = 20;
  // Alpha>=128 content bounds of the bundled PNGs; ignore transparent padding.
  // A simple circle uses the longer visible edge, not a pixel-perfect silhouette.
  const UNIT_VISUALS=Object.freeze({
    worker:Object.freeze({size:42,width:127,height:128,bounds:Object.freeze([24,16,95,106])}),
    soldier:Object.freeze({size:50,width:128,height:127,bounds:Object.freeze([22,24,102,106])}),
    goblin:Object.freeze({size:50,width:128,height:128,bounds:Object.freeze([12,21,113,109])}),
    dragon:Object.freeze({size:108,width:192,height:189,bounds:Object.freeze([2,3,190,172])}),
    miniDragon:Object.freeze({size:64.8,width:192,height:189,bounds:Object.freeze([2,3,190,172]),texture:'dragon'})
  });
  const BODY_RADIUS=Object.freeze(Object.fromEntries(Object.entries(UNIT_VISUALS).map(([kind,v])=>[kind,Math.max(v.bounds[2]-v.bounds[0],v.bounds[3]-v.bounds[1])*v.size/Math.max(v.width,v.height)/112*(kind==='soldier'?.8:1)])));
  const RAID_RULES = Object.freeze({ first: 90, spread: 60, interval: 60, ambushMultiplier: 2 });
  const CAMP_REWARD=Object.freeze({food:30,wood:30,gold:15});
  const isDragon=u=>u.kind==='dragon'||u.kind==='miniDragon';
  const enemySpeed=u=>u.kind==='miniDragon'?1.2:u.kind==='dragon'?1:1.35;
  const BUILDINGS = {
    keep: { name: 'Keep / 王城', hp: 900, cost: {}, time: 0 },
    farm: { name: 'Farm / 農場', hp: 160, cost: { wood: 30 }, time: 5 },
    house: { name: 'House / 民家', hp: 180, cost: { wood: 35 }, time: 5 },
    barracks: { name: 'Barracks / 兵舎', hp: 260, cost: { wood: 50, food: 20 }, time: 8 },
    tower: { name: 'Tower / 監視塔', hp: 300, cost: { wood: 60, gold: 15 }, time: 8 },
    windmill: { name: 'Windmill / 風車', hp: 220, cost: { wood: 55, gold: 10 }, time: 7 },
    blacksmith: { name: 'Blacksmith / 鍛冶屋', hp: 240, cost: { wood: 55, gold: 25 }, time: 8 }
  };
  const UNIT_COST = { worker: { food: 25 }, soldier: { food: 30, wood: 15 } };
  const UPGRADES = {
    farm: { name: '豊穣の祝福', description: 'すべての農場の生産量 +25%', step: .25 },
    soldier: { name: '勇者の誓い', description: '既存・今後の全兵士の攻撃 +20%', step: .2 },
    tower: { name: '遠見の眼', description: '王城とすべての監視塔の射程 +5%', step: .05 },
    outpost: { name: '前線設営の支援', description: '監視塔1棟のWood60・Gold15を免除。Workerの建築8秒と通常の建築条件は必要', step: 0 }
  };
  function hasNeighbor(s, id, kind, diagonal) { return neighbors(id, diagonal).some(n => s.tiles[n].building?.kind === kind && s.tiles[n].building.hp > 0); }
  function farmRate(s, id) { return 1.6 * (1 + s.upgrades.farm * .25) * (hasNeighbor(s, id, 'windmill', true) ? 1.25 : 1); }
  function towerRange(s) { return 3 * (1 + s.upgrades.tower * UPGRADES.tower.step); }
  function soldierAttack(s, unit) { return unit.attack * (1 + s.upgrades.soldier * .2); }
  function enemyMultiplier(s) {
    if(s.enemyGrowth===false)return 1;
    const progress=Math.max(0,Math.min(1,(s.tiles.filter(t=>t.revealed).length-9)/(SIZE*SIZE-9)));
    return 1+4*progress*progress;
  }
  function scaleEnemy(enemy,multiplier){
    if(enemy.hp<=0)return;
    const previous=enemy.territoryMultiplier??1;if(previous===multiplier)return;
    const ratio=multiplier/previous;
    enemy.hp*=ratio;enemy.maxHp*=ratio;enemy.attack*=ratio;enemy.territoryMultiplier=multiplier;
  }
  function updateEnemyStrength(s){
    const multiplier=enemyMultiplier(s);
    for(const enemy of s.enemies)scaleEnemy(enemy,multiplier);
    for(const pending of s.pendingSpawns)scaleEnemy(pending.enemy,multiplier);
  }
  function rewardOptions(s) {
    const hasTower=s.tiles.some(t=>t.building?.kind==='tower'&&t.building.hp>0);
    return ['farm','soldier',!hasTower&&!s.towerSupport.claimed?'outpost':'tower'];
  }
  function chooseUpgrade(s, rewardId, kind) {
    if (s.result || !rewardOptions(s).includes(kind) || s.pendingRewards[0]?.id !== rewardId) return false;
    if(kind==='outpost'){s.towerSupport.claimed=1;s.towerSupport.available=1;}
    else s.upgrades[kind]++;
    s.pendingRewards.shift();
    log(s, `${UPGRADES[kind].name}：${UPGRADES[kind].description}（${kind==='outpost'?'この王国で1回限り':`累計${s.upgrades[kind]}回`}）`, 'reward'); return true;
  }
  const index = (x, y) => y * SIZE + x;
  const xy = id => ({ x: id % SIZE, y: Math.floor(id / SIZE) });
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const bodyRadius = u => BODY_RADIUS[u.kind] || .5;
  const collisionEnabled=u=>u.hp>0&&!(u.kind==='worker'&&u.waitingNonSolid);
  const bodies = s => [...s.units,...s.enemies].filter(collisionEnabled);
  const collisionContexts=new WeakMap();
  function trackBody(s,u){
    const c=collisionContexts.get(s);if(!c)return;
    const key=`${Math.floor(u.x/2.5)},${Math.floor(u.y/2.5)}`,old=c.keys.get(u);
    if(!collisionEnabled(u)){if(old)c.grid.get(old)?.delete(u);c.keys.delete(u);return;}
    if(old===key)return;if(old)c.grid.get(old)?.delete(u);
    if(!c.grid.has(key))c.grid.set(key,new Set());c.grid.get(key).add(u);c.keys.set(u,key);
  }
  function nearbyBodies(s,p){
    const c=collisionContexts.get(s);if(!c)return bodies(s);
    const near=[],x=Math.floor(p.x/2.5),y=Math.floor(p.y/2.5);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(const u of c.grid.get(`${x+dx},${y+dy}`)||[])if(collisionEnabled(u))near.push(u);
    return near;
  }
  function circlesOverlap(a,b) { return distance(a,b)<bodyRadius(a)+bodyRadius(b)-1e-7; }
  function overlaps(a,b) { return collisionEnabled(a)&&collisionEnabled(b)&&circlesOverlap(a,b); }
  function validGround(s,u,p) {
    const h=bodyRadius(u);
    if(p.x<h-.5||p.y<h-.5||p.x>SIZE-.5-h||p.y>SIZE-.5-h)return false;
    if((u.kind==='worker'||u.kind==='soldier')&&!s.tiles[index(Math.round(p.x),Math.round(p.y))]?.revealed)return false;
    return true;
  }
  function canStand(s,u,p) {
    if(!validGround(s,u,p))return false;
    const h=bodyRadius(u);
    // Reserve an emerging Dragon's circle, while allowing units inside to leave.
    if((u.kind==='worker'||u.kind==='soldier')&&s.pendingSpawns.some(q=>isDragon(q.enemy)&&distance(p,q.origin)<h+bodyRadius(q.enemy)&&distance(p,q.origin)<distance(u,q.origin)-1e-7))return false;
    // Also validates a non-solid waiting Worker's position BEFORE restoring it.
    return !nearbyBodies(s,p).some(other=>other!==u&&distance(p,other)<h+bodyRadius(other)-1e-7);
  }
  const pushable=u=>collisionEnabled(u)&&(u.kind==='worker'||u.kind==='soldier');
  function pushFeedback(s,moved) {
    for(const u of moved){
      u.detour=null;u.navKey=null;u.rallySpot=null;u.workSpot=null;
      if((u.lastPushEffectAt??-Infinity)+.25<=s.time){
        s.effects.push({kind:'push',x:u.x,y:u.y,life:.35});u.lastPushEffectAt=s.time;
      }
    }
  }
  // Transactional short displacements: a blocked chain is rolled back in full.
  function pushBodies(s,dragon,point,initial=null) {
    const saved=new Map(),visiting=new Set();
    const shift=(u,p,depth=0)=>{
      if(depth>8||visiting.has(u)||!pushable(u)||!validGround(s,u,p))return false;
      const old=saved.get(u)||{x:u.x,y:u.y};
      if(distance(old,p)>.16)return false;
      if(!saved.has(u))saved.set(u,old);visiting.add(u);
      for(const other of nearbyBodies(s,p))if(other!==u&&other!==dragon&&distance(p,other)<bodyRadius(u)+bodyRadius(other)-1e-7){
        const dx=other.x-p.x,dy=other.y-p.y,d=Math.hypot(dx,dy),angle=d>1e-7?Math.atan2(dy,dx):Math.atan2(other.y-point.y,other.x-point.x);
        const amount=bodyRadius(u)+bodyRadius(other)-d+1e-6;
        if(!shift(other,{x:other.x+Math.cos(angle)*amount,y:other.y+Math.sin(angle)*amount},depth+1))return false;
      }
      // Movement pushes must also clear the Dragon's proposed circle.
      if(!initial&&distance(p,point)<bodyRadius(u)+bodyRadius(dragon)-1e-7)return false;
      if(!canStand(s,u,p))return false;
      u.x=p.x;u.y=p.y;trackBody(s,u);visiting.delete(u);return true;
    };
    let ok=true;
    if(initial)ok=shift(initial.unit,initial.point);
    else for(const u of nearbyBodies(s,point))if(u!==dragon&&distance(u,point)<bodyRadius(u)+bodyRadius(dragon)-1e-7){
      const d=distance(u,point),angle=d>1e-7?Math.atan2(u.y-point.y,u.x-point.x):0;
      const amount=bodyRadius(u)+bodyRadius(dragon)-d+1e-6;
      if(!shift(u,{x:u.x+Math.cos(angle)*amount,y:u.y+Math.sin(angle)*amount})){ok=false;break;}
    }
    if(ok&&!initial)ok=canStand(s,dragon,point);
    if(!ok){for(const [u,p] of saved){u.x=p.x;u.y=p.y;trackBody(s,u);}return false;}
    pushFeedback(s,saved.keys());return true;
  }
  function emergeDragon(s,p,dt) {
    const dragon=p.enemy,origin=p.origin;
    for(const u of nearbyBodies(s,origin))if(pushable(u)){
      const d=distance(u,origin),clearance=bodyRadius(u)+bodyRadius(dragon)+.01;
      if(d>=clearance)continue;
      const angle=d>1e-7?Math.atan2(u.y-origin.y,u.x-origin.x):u.id*2.399963;
      const amount=Math.min(clearance-d,1.5*dt);
      pushBodies(s,dragon,origin,{unit:u,point:{x:u.x+Math.cos(angle)*amount,y:u.y+Math.sin(angle)*amount}});
    }
    if(!canStand(s,dragon,origin))return false;
    dragon.x=origin.x;dragon.y=origin.y;
    s.effects.push({kind:'dragon-emerge',mini:dragon.kind==='miniDragon',...origin,life:.8});return true;
  }
  function placeBody(s,u,origin) {
    // Deterministic nearby slots; no overlapping fallback when the exit is full.
    const candidates=[{...origin}];
    for(let ring=1;ring<=5;ring++)for(let y=-ring;y<=ring;y++)for(let x=-ring;x<=ring;x++)if(Math.max(Math.abs(x),Math.abs(y))===ring)candidates.push({x:origin.x+x*.6,y:origin.y+y*.6});
    candidates.sort((a,b)=>distance(a,origin)-distance(b,origin));
    const p=candidates.find(p=>canStand(s,u,p));if(!p)return false;
    u.x=p.x;u.y=p.y;return true;
  }
  function inMelee(a,b) { const reach=bodyRadius(a)+(b.kind?bodyRadius(b):.5)+.12;return distance(a,b)<=reach; }
  function waitWithoutCollision(s,u,reason){u.waitingNonSolid=reason;u.workSpot=null;u.workKey=null;u.movingUntil=0;trackBody(s,u);}
  function restoreCollision(s,u){
    if(!u.waitingNonSolid)return true;
    if(!canStand(s,u,u))return false;
    u.waitingNonSolid=false;u.yieldGoal=null;u.yieldRequest=null;trackBody(s,u);return true;
  }
  function start(s) { if(s.result||s.phase!=='ready')return false;s.phase='running';return true; }
  function setBackgroundPaused(s,paused) { if(typeof paused!=='boolean'||s.result)return false;s.backgroundPaused=paused;return true; }
  function neighbors(id, diagonal = true) {
    const { x, y } = xy(id), out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || (!diagonal && dx && dy)) continue;
      if (x + dx >= 0 && x + dx < SIZE && y + dy >= 0 && y + dy < SIZE) out.push(index(x + dx, y + dy));
    }
    return out;
  }
  function rng(seed) {
    let n = seed >>> 0;
    return () => { n += 0x6D2B79F5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function log(s, text, kind = 'info') { s.events.push({ text, kind, time: s.time }); if (s.events.length > 40) s.events.shift(); }
  function addUnit(s, kind, id) {
    const p = xy(id), unit = { id: s.nextId, kind, x: p.x, y: p.y, hp: kind === 'soldier' ? 110 : 55, maxHp: kind === 'soldier' ? 110 : 55, attack: kind === 'soldier' ? 16 : 0, cooldown: 0, task: null, target: null, gather: 0 };
    if (kind === 'soldier' && hasNeighbor(s, id, 'blacksmith', false)) {
      unit.forged = true; unit.attack *= 1.2; unit.hp *= 1.2; unit.maxHp *= 1.2;
    }
    if(!placeBody(s,unit,p))return null;
    s.nextId++;s.units.push(unit);trackBody(s,unit);return unit;
  }
  function building(kind) { return { kind, hp: BUILDINGS[kind].hp, maxHp: BUILDINGS[kind].hp, train: [], cooldown: 0 }; }
  // Rearrange existing contents: no additional camps, treasure, or resource stock.
  function planRegions(s) {
    const random = rng(s.seed ^ 0x51ED270B);
    const shuffle = list => { for(let i=list.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[list[i],list[j]]=[list[j],list[i]];}return list; };
    const directions = [{x:0,y:-1,name:'北'},{x:1,y:0,name:'東'},{x:0,y:1,name:'南'},{x:-1,y:0,name:'西'}];
    const configurations=[];
    for(let omit=0;omit<4;omit++)for(const side of [-1,1])for(let mask=0;mask<8;mask++)configurations.push({omit,side,mask});
    let plan;
    for(const config of shuffle(configurations)) {
      const regions=directions.filter((_,i)=>i!==config.omit).map((dir,i)=>{
        const r=6+((config.mask>>i)&1),p={x:-dir.y*config.side,y:dir.x*config.side};
        const at=(d,v=0)=>index(10+dir.x*d+p.x*v,10+dir.y*d+p.y*v);
        const route=[s.keepId];
        for(const goal of [at(2),at(2,4),at(r,4),at(r,1)]) {
          let pos=xy(route.at(-1)),end=xy(goal);
          while(pos.x!==end.x||pos.y!==end.y){pos={x:pos.x+Math.sign(end.x-pos.x),y:pos.y+(pos.x===end.x?Math.sign(end.y-pos.y):0)};route.push(index(pos.x,pos.y));}
        }
        const candidates=[];
        for(let d=3;d<=r-2;d++)for(let v=-1;v<=1;v++)candidates.push(at(d,v));
        return {dir,r,center:at(r),route,candidates};
      });
      const protectedTiles=new Set(regions.flatMap(r=>r.route.flatMap(id=>[id,...neighbors(id)])));
      if(protectedTiles.has(s.dragonId)||regions.some(r=>!r.candidates.some(id=>!protectedTiles.has(id))))continue;
      plan={regions,protectedTiles};break;
    }
    if(!plan) return; // Defensive fallback retains the valid scattered map.
    const initial=id=>{const t=s.tiles[id];return Math.max(Math.abs(t.x-10),Math.abs(t.y-10))<=2;};
    const swapContents=(a,b)=>{for(const key of ['terrain','amount'])[a[key],b[key]]=[b[key],a[key]];};
    const moveCamp=(from,to)=>{swapContents(from,to);from.danger=0;to.danger=1;};
    for(const from of s.tiles.filter(t=>t.danger===1&&plan.protectedTiles.has(t.id))) {
      const choices=s.tiles.filter(t=>!initial(t.id)&&!plan.protectedTiles.has(t.id)&&t.danger===0&&t.id%3===from.id%3);
      const to=choices[Math.floor(random()*choices.length)];
      if(!to) throw new Error('No camp relocation slot');
      moveCamp(from,to);
    }
    const committed=new Set();
    for(const r of plan.regions) {
      for(const id of shuffle(r.candidates.filter(id=>!plan.protectedTiles.has(id)))) {
        const to=s.tiles[id];if(to.danger===3)continue;
        if(to.danger!==1) {
          const choices=s.tiles.filter(t=>t.danger===1&&!committed.has(t.id)&&t.id%3===id%3);
          if(!choices.length)continue;
          moveCamp(choices[Math.floor(random()*choices.length)],to);
        }
        committed.add(id);break;
      }
    }
    const kinds=shuffle(['forest','food','mine']);
    for(const [i,r] of plan.regions.entries()) {
      const center=s.tiles[r.center],kind=kinds[i];
      const cells=[r.center,...neighbors(r.center)];
      const targets=shuffle(cells.filter(id=>s.tiles[id].danger===0));
      let count=cells.filter(id=>s.tiles[id].danger===0&&s.tiles[id].terrain===kind).length;
      for(const id of targets) {
        if(count>=4)break;
        const to=s.tiles[id];if(to.terrain===kind)continue;
        const choices=s.tiles.filter(t=>t.danger===0&&!initial(t.id)&&!cells.includes(t.id)&&t.terrain===kind);
        if(!choices.length)break;
        swapContents(choices[Math.floor(random()*choices.length)],to);count++;
      }
      if(count>=4)s.regions.push({id:i,kind,direction:r.dir.name,x:center.x,y:center.y,radius:1});
    }
  }
  function create(seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, { structured = true, autoZero = true, enemyGrowth = true } = {}) {
    const random = rng(seed), s = { seed: seed >>> 0, time: 0, phase:'ready', backgroundPaused:false, result: null, resources: { wood: 100, food: 100, gold: 0 }, tiles: [], units: [], enemies: [], pendingSpawns:[], tasks: [], events: [], effects: [], nextId: 1, keepId: index(10, 10), rally: index(10, 10), workerFocus: null, dragonAwake: false, kills: 0 };
    s.enemyGrowth=enemyGrowth;s.autoZero=autoZero;s.upgrades = { farm: 0, soldier: 0, tower: 0 }; s.pendingRewards = [];
    s.towerSupport = { claimed: 0, available: 0, built: 0 };
    s.raids = { spawned: 0, ambushes: 0 };
    s.armyMode = 'pursue'; s.defenseRadius = 3;
    s.stats = { spent: { wood: 0, food: 0, gold: 0 }, trained: { worker: 0, soldier: 0 }, lost: { worker: 0, soldier: 0 } };
    for (let id = 0; id < SIZE * SIZE; id++) {
      const p = xy(id), safe = Math.max(Math.abs(p.x - 10), Math.abs(p.y - 10)) <= 2, r = random();
      const terrain = r < .2 ? 'forest' : r < .29 ? 'food' : r < .37 ? 'mine' : r < .41 ? 'chest' : 'grass';
      s.tiles.push({ id, ...p, terrain, danger: !safe && random() < .09 ? 1 : 0, clue: 0, revealed: Math.abs(p.x - 10) <= 1 && Math.abs(p.y - 10) <= 1, flag: false, nextRaidAt: RAID_RULES.first + id % RAID_RULES.spread, amount: terrain === 'forest' ? 180 : terrain === 'mine' ? 150 : 130, building: null });
    }
    const far = s.tiles.filter(t => Math.max(Math.abs(t.x - 10), Math.abs(t.y - 10)) >= 7);
    const dragon = far[Math.floor(random() * far.length)]; dragon.danger = 3; dragon.terrain = 'lair'; s.dragonId = dragon.id;
    for (const tile of s.tiles) tile.clue = neighbors(tile.id).reduce((sum, id) => sum + s.tiles[id].danger, 0);
    for (const [id, terrain] of [[index(9, 10), 'forest'], [index(11, 10), 'food'], [index(10, 9), 'mine']]) { s.tiles[id].terrain = terrain; s.tiles[id].amount = 220; }
    const keep = s.tiles[s.keepId]; keep.terrain = 'grass'; keep.building = building('keep');
    // Already-visible starting cells are not opened by exploration, so contain no unopened chests.
    for (const t of s.tiles) if (t.revealed && t.terrain === 'chest') t.terrain = 'grass';
    s.regions=[];s.mapVersion=structured?2:1;
    if(structured)planRegions(s);
    for(const tile of s.tiles)tile.clue=neighbors(tile.id).reduce((sum,id)=>sum+s.tiles[id].danger,0);
    for (let i = 0; i < 3; i++) addUnit(s, 'worker', s.keepId);
    if(s.autoZero)for(const tile of s.tiles)if(tile.revealed&&tile.clue===0)queueSafeNeighbors(s,tile.id,{automatic:true});
    log(s, '1:30以降、未封印拠点と誤った旗から定期出撃。数字で推理し、軍備と封印を急ごう。');
    return s;
  }
  function canPay(s, cost) { return Object.entries(cost).every(([k, n]) => s.resources[k] >= n); }
  function pay(s, cost, multiplier = 1) { for (const [k, n] of Object.entries(cost)) { s.resources[k] -= n * multiplier; s.stats.spent[k] += n * multiplier; } }
  function population(s) {
    const queued = s.tiles.reduce((n, t) => n + (t.building?.train.length || 0), 0);
    return { used: s.units.filter(u => u.hp > 0).length + queued, cap: 10 + s.tiles.filter(t => t.building?.kind === 'house').length * 5 };
  }
  function frontier(s, id) { return !s.tiles[id].revealed && neighbors(id, false).some(n => s.tiles[n].revealed); }
  function hasTask(s, id) { return s.tasks.some(t => t.tileId === id); }
  function setFlag(s, id) {
    const t = s.tiles[id]; if(s.result || !t || t.revealed) return false;
    t.flag = !t.flag;
    // A newly placed flag stops ordinary excavation, but never resets a raid clock.
    if(t.flag && s.tasks.some(q=>q.tileId===id&&q.kind==='explore'&&!q.assault)) cancelTask(s,id);
    return true;
  }
  function queueExplore(s, id, { assault = false, automatic = false } = {}) {
    const t = s.tiles[id]; if (s.result || !t || t.revealed || hasTask(s, id) || (t.flag && !assault) || (assault && !t.flag)) return false;
    if(automatic&&t.autoExploreSuppressed)return false;
    if(!automatic)t.autoExploreSuppressed=false;
    // Deep reservations wait until an adjacent tile becomes part of the territory.
    s.tasks.push({ id: s.nextId++, kind: 'explore', tileId: id, remaining: 3, workerId: null, assault, automatic }); return true;
  }
  function queueAssault(s,id) { return queueExplore(s,id,{assault:true}); }
  function setArmyMode(s, mode) {
    if (s.result || !['pursue', 'defend'].includes(mode)) return false;
    s.armyMode = mode; return true;
  }
  function preparationStatus(s, task) {
    if (!task.preparation) return '';
    const p = task.preparation;
    if (s.armyMode !== 'defend' || s.rally !== p.rally) return '予約時の集合地点で防衛にしてください';
    const soldiers = s.units.filter(u => u.kind === 'soldier' && u.hp > 0 && distance(u, s.tiles[p.rally]) <= s.defenseRadius);
    if (soldiers.length < p.count) return `集結待ち ${soldiers.length}/${p.count}体`;
    return '';
  }
  function queuePreparedExplore(s, id, count) {
    const t = s.tiles[id], rally = s.tiles[s.rally];
    if (!t || !t.flag || t.revealed || !Number.isInteger(count) || count < 1 || count > 10 ||
        s.armyMode !== 'defend' || !rally?.revealed || distance(t, rally) > s.defenseRadius || !queueAssault(s, id)) return false;
    s.tasks.at(-1).preparation = { rally: s.rally, count }; return true;
  }
  function queueSafeNeighbors(s, id, { automatic = false } = {}) {
    const t = s.tiles[id];
    if (s.result || !t?.revealed || t.clue !== 0) return 0;
    return neighbors(id).filter(n => !s.tiles[n].flag && queueExplore(s, n,{automatic})).length;
  }
  function queueAllZeroNeighbors(s) {
    if(s.result)return 0;
    let count=0;
    for(const tile of s.tiles)if(tile.revealed&&tile.clue===0)count+=queueSafeNeighbors(s,tile.id);
    return count;
  }
  function cancelAllExploration(s) {
    if(s.result)return 0;
    let count=0;
    for(const task of [...s.tasks])if(task.kind==='explore'&&cancelTask(s,task.tileId))count++;
    return count;
  }
  function buildCost(s, kind) { return kind==='tower'&&s.towerSupport.available>0?{}:BUILDINGS[kind]?.cost; }
  function queueBuild(s, id, kind) {
    const t = s.tiles[id], spec = BUILDINGS[kind];
    if (s.result || !t || !Object.hasOwn(BUILDINGS,kind) || kind === 'keep' || !t.revealed || t.building || t.terrain !== 'grass' || hasTask(s, id)) return { ok: false, reason: '建築は開拓済みの空き平地で行います。' };
    if (s.enemies.some(e => distance(e, t) < 1.5)) return { ok: false, reason: '敵が近くにいるため建築できません。' };
    const cost=buildCost(s,kind),supported=kind==='tower'&&s.towerSupport.available>0;
    if (!canPay(s, cost)) return { ok: false, reason: '建築資源が不足しています。' };
    pay(s, cost);if(supported)s.towerSupport.available--;
    s.tasks.push({ id: s.nextId++, kind: 'build', tileId: id, building: kind, remaining: spec.time, workerId: null, paidCost:{...cost}, supported });
    log(s, `${spec.name}を建築予約。${supported?'設営支援を確保（資源費用0）。':'資源を確保しました。'}`); return { ok: true };
  }
  function cancelTask(s, id) {
    const task = s.tasks.find(t => t.tileId === id); if (!task || s.result) return false;
    if(task.kind==='explore'&&s.autoZero)s.tiles[id].autoExploreSuppressed=true;
    if (task.kind === 'build') { pay(s, task.paidCost || BUILDINGS[task.building].cost, -1);if(task.supported)s.towerSupport.available++; }
    for (const u of s.units) if (u.task === task.id) u.task = null;
    s.tasks = s.tasks.filter(t => t !== task); return true;
  }
  function train(s, id, kind) {
    const b = s.tiles[id]?.building;
    if (s.result || !b || (kind === 'worker' ? b.kind !== 'keep' : b.kind !== 'barracks')) return { ok: false, reason: kind === 'worker' ? '王城を選択してください。' : '兵舎を選択してください。' };
    if (b.train.length >= 5) return { ok: false, reason: '育成予約は施設ごとに5体までです。' };
    if (population(s).used >= population(s).cap) return { ok: false, reason: '人口上限です。民家を建ててください。' };
    if (!canPay(s, UNIT_COST[kind])) return { ok: false, reason: '育成資源が不足しています。' };
    pay(s, UNIT_COST[kind]); b.train.push({ kind, remaining: kind === 'worker' ? 5 : 7 }); return { ok: true };
  }
  function spawn(s, kind, tile, count = 1, empowered = false, rewardCampId = null) {
    for (let i = 0; i < count; i++) {
      const boss = kind === 'dragon',mini=kind==='miniDragon',dragonLike=boss||mini;
      const multiplier = empowered ? RAID_RULES.ambushMultiplier : 1;
      const enemy={ id: s.nextId++, kind, x: tile.x, y: tile.y, hp: (boss ? 1200 : mini ? 300 : 48) * multiplier, maxHp: (boss ? 1200 : mini ? 300 : 48) * multiplier, attack: (boss ? 28 : mini ? 14 : 7) * multiplier, cooldown: 1.5, empowered };
      if(rewardCampId!==null)enemy.rewardCampId=rewardCampId;
      scaleEnemy(enemy,enemyMultiplier(s));
      const h=bodyRadius(enemy),origin=dragonLike?{x:Math.max(h-.5,Math.min(SIZE-.5-h,tile.x)),y:Math.max(h-.5,Math.min(SIZE-.5-h,tile.y))}:{x:tile.x,y:tile.y};
      if(dragonLike?canStand(s,enemy,origin):placeBody(s,enemy,tile)){
        if(dragonLike){enemy.x=origin.x;enemy.y=origin.y;s.effects.push({kind:'dragon-emerge',mini,...origin,life:.8});}
        s.enemies.push(enemy);trackBody(s,enemy);
      }else s.pendingSpawns.push({enemy,origin});
    }
  }
  function updateRaids(s) {
    let count=0;
    for(const tile of s.tiles) if(s.time + 1e-9 >= tile.nextRaidAt) {
      // Advance even inactive/sealed cells: toggling flags cannot postpone the schedule.
      tile.nextRaidAt += RAID_RULES.interval;
      if(!tile.revealed && ((tile.danger===1 && !tile.flag) || (tile.danger===0 && tile.flag))) {
        spawn(s,'goblin',tile);count++;
      }
    }
    if(count){s.raids.spawned+=count;log(s,`定期出撃：敵${count}体が侵攻。未封印拠点・誤った旗を見直そう。`,'danger');}
  }
  function reveal(s, id, { assault = false } = {}) {
    const tile = s.tiles[id]; if (s.result || !tile || tile.revealed) return;
    const prepared=assault&&tile.flag;
    tile.revealed = true; tile.flag = false;
    updateEnemyStrength(s);
    if (tile.danger === 3) { s.dragonAwake = true; spawn(s, 'dragon', tile); log(s, 'Dragonが目覚めた！軍を集結して王城を守れ。', 'danger'); }
    else if (tile.danger === 1) {
      const count=3+id%3;
      if(prepared)tile.campReward={total:count,claimed:false};
      tile.terrain = 'camp';spawn(s, 'goblin', tile, count, !prepared,prepared?id:null);
      if(!prepared)s.raids.ambushes++;
      log(s,prepared?'拠点攻略開始。通常部隊を迎撃！':'奇襲失敗！HP・攻撃2倍の強化部隊が出現！','danger');
    }
    else if (tile.terrain === 'chest') { s.resources.gold += 35; s.resources.wood += 20; s.resources.food += 20; tile.terrain = 'grass'; s.pendingRewards.push({ id: s.nextId++, tileId: id }); log(s, '宝箱発見！資源を獲得。3つの報酬から1つ選ぼう。', 'reward'); }
    if(prepared&&tile.danger===0){spawn(s,'miniDragon',tile);log(s,'誤旗を攻略！ミニドラゴン出現。領土倍率が適用され、倒しても拠点戦利品・勝利にはなりません。','danger');}
    s.effects.push({ kind: 'reveal', x: tile.x, y: tile.y, life: .8 });
    if(s.autoZero&&tile.clue===0)queueSafeNeighbors(s,id,{automatic:true});
  }
  function campRewardStatus(s,id){
    const record=s.tiles[id]?.campReward;if(!record)return null;
    const remaining=s.enemies.filter(e=>e.hp>0&&e.rewardCampId===id).length+s.pendingSpawns.filter(p=>p.enemy.hp>0&&p.enemy.rewardCampId===id).length;
    return {...record,remaining};
  }
  function settleCampRewards(s){
    for(const tile of s.tiles)if(tile.campReward&&!tile.campReward.claimed&&campRewardStatus(s,tile.id).remaining===0){
      tile.campReward.claimed=true;
      for(const [key,amount] of Object.entries(CAMP_REWARD))s.resources[key]+=amount;
      s.effects.push({kind:'conquest',x:tile.x,y:tile.y,life:.9});
      log(s,`拠点制圧 (${tile.x+1},${tile.y+1})！追加戦利品：Food +30・Wood +30・Gold +15。`,'reward');
    }
  }
  // Four-neighbour paths keep movement inside revealed territory.
  function path(s, from, goals, throughFog = false) {
    const start = index(Math.max(0, Math.min(19, Math.round(from.x))), Math.max(0, Math.min(19, Math.round(from.y))));
    const target = new Set(goals), queue = [start], previous = new Map([[start, null]]);
    if (target.has(start)) return [];
    for (let i = 0; i < queue.length; i++) for (const n of neighbors(queue[i], false)) {
      if ((!throughFog && !s.tiles[n].revealed) || previous.has(n)) continue;
      previous.set(n, queue[i]); queue.push(n);
      if (target.has(n)) { const route = []; let cur = n; while (cur !== start) { route.unshift(cur); cur = previous.get(cur); } return route; }
    }
    return null;
  }
  function trafficPriority(s,u) { return u.kind==='worker' ? (u.task?3:2) : (u.movingUntil>s.time?1:0); }
  function requestPassage(s,u,p,dest) {
    if(u.kind!=='worker'&&u.kind!=='soldier')return;
    if(u.yieldRequest?.until>s.time)return;
    for(const other of nearbyBodies(s,p)){
      if(other===u||other.hp<=0||(other.kind!=='worker'&&other.kind!=='soldier')||!overlaps({...u,...p},other))continue;
      if(u.kind==='soldier'&&other.kind==='soldier'&&other.movingUntil>s.time)continue;
      const priority=trafficPriority(s,u)-trafficPriority(s,other);
      if(priority<0||(priority===0&&u.id>other.id))continue;
      if(other.yieldRequest?.until>s.time&&other.yieldRequest.id!==u.id)continue;
      other.yieldRequest={id:u.id,until:s.time+1.8,dest:{x:dest.x,y:dest.y}};
    }
  }
  function move(s, u, goals, speed, dt, point = null, tolerance = null) {
    const route = path(s, u, goals, u.kind === 'goblin' || isDragon(u)); if (!route) return false;
    let dest = route.length ? s.tiles[route[0]] : point || s.tiles[goals.find(id => distance(s.tiles[id], u) < .8) ?? goals[0]];
    if (!dest) return false;
    const arrival=tolerance??(u.kind==='worker'?.72:.18);
    if((point&&distance(u,point)<=arrival)||(!route.length&&distance(u,dest)<=arrival)){u.detour=null;u.movingUntil=0;return true;}
    u.movingUntil=s.time+.3;
    const navKey=`${goals.join(',')}:${point?.x??''}:${point?.y??''}:${arrival}`;
    if(u.navKey!==navKey){u.navKey=navKey;u.detour=null;u.navTime=0;u.navDistance=Infinity;}
    const targets=point?[point]:goals.map(id=>s.tiles[id]),remaining=Math.min(...targets.map(t=>distance(u,t)));
    u.navTime=(u.navTime||0)+dt;
    if(u.navTime>=.75){
      if(u.navDistance-remaining<.15)u.detour=detourPath(s,u,targets,arrival);
      u.navDistance=remaining;u.navTime=0;
    }
    while(u.detour?.length&&distance(u,u.detour[0])<.13)u.detour.shift();
    if(u.detour?.length){if(canStand(s,u,u.detour[0]))dest=u.detour[0];else u.detour=null;}
    const d = distance(u, dest), step = Math.min(d, speed * dt);
    if(d>.001){
      const angle=Math.atan2(dest.y-u.y,dest.x-u.x),sign=u.id%2?1:-1;
      requestPassage(s,u,{x:u.x+Math.cos(angle)*step,y:u.y+Math.sin(angle)*step},dest);
      // Steering tries the forward direction first, then both sides. Each accepted
      // step is collision-free; characters never push each other through fog.
      let moved=false;
      for(const turn of [0,.45*sign,-.45*sign,.9*sign,-.9*sign,1.35*sign,-1.35*sign]){
        const p={x:u.x+Math.cos(angle+turn)*step,y:u.y+Math.sin(angle+turn)*step};
        if(canStand(s,u,p)||(isDragon(u)&&validGround(s,u,p)&&pushBodies(s,u,p))){u.x=p.x;u.y=p.y;trackBody(s,u);moved=true;break;}
      }
      u.blocked=moved?0:(u.blocked||0)+dt;
      if(!moved&&u.blocked>.6){
        for(const turn of [Math.PI/2*sign,-Math.PI/2*sign,Math.PI]){
          const p={x:u.x+Math.cos(angle+turn)*step,y:u.y+Math.sin(angle+turn)*step};
          if(canStand(s,u,p)){u.x=p.x;u.y=p.y;trackBody(s,u);break;}
        }
      }
    }
    return !route.length && targets.some(t=>distance(u,t)<=arrival);
  }
  function detourPath(s,u,targets,arrival) {
    // Local sub-tile A*: used only after progress stalls. No global teleport/push.
    const step=.3,start={x:u.x,y:u.y,g:0,key:'0,0',ix:0,iy:0},open=[start],seen=new Map([['0,0',0]]);
    const heuristic=p=>Math.min(...targets.map(t=>distance(p,t)));
    let closest=start,closestDistance=heuristic(start);
    const routeTo=last=>{const route=[];for(let n=last;n.parent;n=n.parent)route.unshift({x:n.x,y:n.y});return route;};
    start.f=heuristic(start);
    for(let expanded=0;open.length&&expanded<800;expanded++){
      let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;
      const cur=open.splice(best,1)[0];
      const h=heuristic(cur);if(h<closestDistance){closest=cur;closestDistance=h;}
      if(h<=arrival)return routeTo(cur);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
        const ix=cur.ix+dx,iy=cur.iy+dy;if(Math.abs(ix)>20||Math.abs(iy)>20)continue;
        const p={x:start.x+ix*step,y:start.y+iy*step},key=`${ix},${iy}`,g=cur.g+Math.hypot(dx,dy)*step;
        if(g>=(seen.get(key)??Infinity)||!canStand(s,u,p))continue;
        if(dx&&dy&&(!canStand(s,u,{x:p.x,y:cur.y})||!canStand(s,u,{x:cur.x,y:p.y})))continue;
        seen.set(key,g);open.push({...p,ix,iy,key,g,f:g+heuristic(p),parent:cur});
      }
    }
    // Long detours may not reach the final destination inside this local window.
    // Follow useful partial progress and replan from there rather than discard it.
    return closestDistance<heuristic(start)-.3?routeTo(closest):null;
  }
  function moveToRally(s,u,dt) {
    const origin=s.tiles[s.rally];
    if(u.rallyKey!==s.rally){u.rallyKey=s.rally;u.rallySpot=null;}
    u.rallyBlocked=u.rallySpot&&!canStand(s,u,u.rallySpot)?(u.rallyBlocked||0)+dt:0;
    if(!u.rallySpot||u.rallyBlocked>.8){
      const options=[];
      for(let ring=0;ring<=17;ring++){
        for(let y=-ring;y<=ring;y++)for(let x=-ring;x<=ring;x++)if(Math.max(Math.abs(x),Math.abs(y))===ring){
          const p={x:origin.x+x*1.2,y:origin.y+y*1.2};if(!canStand(s,u,p))continue;
          if(s.units.some(a=>a!==u&&a.hp>0&&a.rallyKey===s.rally&&a.rallySpot&&overlaps({...u,...p},{...a,...a.rallySpot})))continue;
          const id=index(Math.round(p.x),Math.round(p.y));if(path(s,u,[id])!==null)options.push(p);
        }
        if(options.length&&ring>=2)break;
      }
      options.sort((a,b)=>distance(a,origin)-distance(b,origin)||distance(u,a)-distance(u,b));
      u.rallySpot=options[0]||null;u.rallyBlocked=0;
    }
    if(!u.rallySpot)return false;
    const id=index(Math.round(u.rallySpot.x),Math.round(u.rallySpot.y));
    return move(s,u,[id],2.1,dt,u.rallySpot,.18);
  }
  function nearest(list, p) { return list.reduce((best, t) => !best || distance(t, p) < distance(best, p) ? t : best, null); }
  function yieldToWorker(s,u,dt) {
    const request=u.yieldRequest,requester=request&&s.units.find(a=>a.id===request.id&&a.hp>0);
    if(!requester||request.until<=s.time){u.yieldGoal=null;u.yieldRequest=null;return false;}
    if(!u.yieldGoal||!canStand(s,u,u.yieldGoal)){
      const dx=request.dest.x-requester.x,dy=request.dest.y-requester.y,len=Math.hypot(dx,dy)||1,options=[];
      for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)if(x||y){
        const p={x:u.x+x*.65,y:u.y+y*.65};
        if(!canStand(s,u,p)||s.units.some(a=>a!==u&&a.yieldGoal&&overlaps({...u,...p},{...a,...a.yieldGoal})))continue;
        const clearance=Math.abs(dx*(p.y-requester.y)-dy*(p.x-requester.x))/len;
        options.push({...p,score:clearance-.15*distance(p,u)+.1*distance(p,request.dest)});
      }
      options.sort((a,b)=>b.score-a.score);if(!options.length)return false;u.yieldGoal=options[0];
    }
    const id=index(Math.round(u.yieldGoal.x),Math.round(u.yieldGoal.y));
    // Hold the bay briefly after arrival; immediately returning recreates the jam.
    if(move(s,u,[id],u.kind==='worker'?1.8:2.1,dt,u.yieldGoal,.12)&&u.kind==='worker')waitWithoutCollision(s,u,'yield');
    return true;
  }
  function moveToWork(s,u,key,centers,dt) {
    const valid=p=>centers.some(c=>distance(p,c)<=1.36)&&s.tiles[index(Math.round(p.x),Math.round(p.y))]?.revealed;
    if(u.workKey!==key){u.workKey=key;u.workSpot=null;u.workBlocked=0;}
    if(u.workSpot&&!canStand(s,u,u.workSpot))u.workBlocked=(u.workBlocked||0)+dt;else u.workBlocked=0;
    if(!u.workSpot||!valid(u.workSpot)||u.workBlocked>.8){
      const options=[];
      for(const center of centers)for(const [dx,dy] of [[0,0],[.95,0],[-.95,0],[0,.95],[0,-.95],[.95,.95],[.95,-.95],[-.95,.95],[-.95,-.95],[1.25,0],[-1.25,0],[0,1.25],[0,-1.25]]){
        const p={x:center.x+dx,y:center.y+dy};if(!canStand(s,u,p)||!valid(p))continue;
        if(s.units.some(a=>a!==u&&a.hp>0&&a.workSpot&&overlaps({...u,...p},{...a,...a.workSpot})))continue;
        const id=index(Math.round(p.x),Math.round(p.y));if(path(s,u,[id])!==null)options.push(p);
      }
      options.sort((a,b)=>distance(u,a)-distance(u,b));u.workSpot=options[0]||null;u.workBlocked=0;
    }
    if(!u.workSpot){
      // Request access even when every currently usable work position is occupied.
      const target=nearest(centers,u);if(target)move(s,u,[index(target.x,target.y)],1.8,dt);
      return false;
    }
    const id=index(Math.round(u.workSpot.x),Math.round(u.workSpot.y));
    return move(s,u,[id],1.8,dt,u.workSpot,.18);
  }
  function taskGoals(s, task) { return task.kind === 'explore' ? neighbors(task.tileId, false).filter(id => s.tiles[id].revealed) : [task.tileId]; }
  function updateWorker(s, u, dt) {
    const threat = nearest(s.enemies.filter(e => e.hp > 0), u),inDanger=threat&&distance(threat,u)<2.2;
    if(u.waitingNonSolid){
      const request=u.yieldRequest;
      if(u.waitingNonSolid==='shelter'&&inDanger)return;
      if(u.waitingNonSolid==='yield'&&!inDanger&&request?.until>s.time&&s.units.some(a=>a.id===request.id&&a.hp>0))return;
      if(!restoreCollision(s,u))return; // Never move through another body on exit.
    }
    let task = s.tasks.find(t => t.id === u.task);
    if (task && preparationStatus(s, task)) { task.workerId = null; u.task = null; task = null; }
    if (inDanger) { if(move(s,u,[s.keepId],1.8,dt))waitWithoutCollision(s,u,'shelter');return; }
    if(yieldToWorker(s,u,dt))return;
    if (!task) {
      u.task = null;
      // Explicit player orders take precedence over expanding automatic zero jobs.
      task = [...s.tasks].sort((a,b)=>Number(Boolean(a.automatic))-Number(Boolean(b.automatic))).find(t => !t.workerId && !preparationStatus(s, t) && taskGoals(s, t).length && path(s, u, taskGoals(s, t)) !== null);
      if (task) { task.workerId = u.id; u.task = task.id; }
    }
    if (task) {
      if (moveToWork(s,u,`task:${task.id}`,taskGoals(s,task).map(id=>s.tiles[id]),dt)) {
        task.remaining -= dt;
        if (task.remaining <= 0) {
          if (task.kind === 'explore') reveal(s, task.tileId, {assault:task.assault});
          else { const tile = s.tiles[task.tileId]; tile.building = building(task.building); if(task.supported){tile.building.supported=true;s.towerSupport.built++;} s.effects.push({ kind: 'build', x: tile.x, y: tile.y, life: .8 }); log(s, `${BUILDINGS[task.building].name}が完成。`); }
          s.tasks = s.tasks.filter(t => t !== task); u.task = null;u.workSpot=null;u.workKey=null;
        }
      }
      return;
    }
    const resourceTiles = s.tiles.filter(t => t.revealed && t.amount > 0 && ['forest', 'food', 'mine'].includes(t.terrain));
    let options = resourceTiles;
    if (s.workerFocus) options = resourceTiles.filter(t => t.terrain === s.workerFocus);
    else { const kind = ['forest', 'food', 'mine'][(u.id - 1) % 3]; const preferred = resourceTiles.filter(t => t.terrain === kind); if (preferred.length) options = preferred; }
    const target = nearest(options, u); u.target = target?.id ?? null;
    if(!target){u.workSpot=null;u.workKey=null;}
    if (target && moveToWork(s,u,`gather:${target.id}`,[target],dt)) {
      const amount = Math.min(target.amount, 2 * dt), key = { forest: 'wood', food: 'food', mine: 'gold' }[target.terrain];
      target.amount -= amount; s.resources[key] += amount; u.gather += dt;
      if (u.gather >= 2) { u.gather -= 2; s.effects.push({ kind: 'gather', resource: key, x: target.x, y: target.y, life: .7 }); }
      if (target.amount <= .001) { target.amount = 0; target.terrain = 'grass'; log(s, '採集地点が平地になりました。'); }
    }
  }
  function hit(s, target, damage, source) { target.hp -= damage; if(source.kind==='soldier')source.lastCombatAt=s.time;if(target.kind==='soldier')target.lastCombatAt=s.time;s.effects.push({ kind: 'hit', source: source.kind || source.building?.kind, sourceId: source.id, targetId: target.id, damage, x: target.x, y: target.y, fromX: source.x, fromY: source.y, life: .3 }); }
  function enemyTarget(s,enemy){
    // Units win exact-distance ties; all candidates share the same local radius.
    const candidates=[...s.units.filter(u=>u.hp>0&&distance(u,enemy)<4),...s.tiles.filter(t=>t.building?.kind==='tower'&&t.building.hp>0&&distance(t,enemy)<4)];
    return nearest(candidates,enemy)||s.tiles[s.keepId];
  }
  function hitEnemyTarget(s,target,enemy){
    const building=target.building;
    hit(s,building||target,enemy.attack,enemy);
    if(!building)return;
    const effect=s.effects.at(-1);effect.x=target.x;effect.y=target.y;effect.targetId=target.id;effect.targetType='building';
    if(building.kind==='tower'&&building.hp<=0){
      target.building=null;
      s.effects.push({kind:'destroy',x:target.x,y:target.y,life:.8});
      log(s,`監視塔 (${target.x+1},${target.y+1}) が破壊されました。敵を遠ざければ跡地に再建できます。`,'danger');
    }
  }
  function updateSoldier(s, u, dt) {
    const rally = s.tiles[s.rally], defending = s.armyMode === 'defend';
    const candidates=s.enemies.filter(e=>e.hp>0&&(!defending||distance(e,rally)<=s.defenseRadius||inMelee(e,u)));
    u.targetRetry??={};
    for(const id of Object.keys(u.targetRetry))if(u.targetRetry[id]<=s.time||!s.enemies.some(e=>e.id===Number(id)&&e.hp>0))delete u.targetRetry[id];
    const reachable=e=>{
      const id=index(Math.round(e.x),Math.round(e.y));
      return s.tiles[id]?.revealed&&path(s,u,[id])!==null;
    };
    // Contact is actionable even during attack cooldown or a previous exclusion.
    let enemy=nearest(candidates.filter(e=>inMelee(u,e)),u);
    if(!enemy){
      const current=candidates.find(e=>e.id===u.combatTarget&&!u.targetRetry[e.id]&&reachable(e));
      enemy=current||[...candidates].sort((a,b)=>distance(a,u)-distance(b,u)||a.id-b.id).find(e=>!u.targetRetry[e.id]&&reachable(e));
    }
    if(enemy&&!inMelee(u,enemy)){
      const d=distance(u,enemy);
      if(u.targetProgress?.id!==enemy.id)u.targetProgress={id:enemy.id,bestDistance:d,lastProgressAt:s.time};
      else if(d<u.targetProgress.bestDistance-.1){u.targetProgress.bestDistance=d;u.targetProgress.lastProgressAt=s.time;}
      else if(s.time-u.targetProgress.lastProgressAt>=2){
        u.targetRetry[enemy.id]=s.time+3;u.targetProgress=null;u.detour=null;u.navKey=null;
        enemy=[...candidates].sort((a,b)=>distance(a,u)-distance(b,u)||a.id-b.id).find(e=>!u.targetRetry[e.id]&&reachable(e));
        if(enemy)u.targetProgress={id:enemy.id,bestDistance:distance(u,enemy),lastProgressAt:s.time};
      }
    }else u.targetProgress=null;
    u.combatTarget=enemy?.id??null;
    u.cooldown = Math.max(0, u.cooldown - dt);
    if(!enemy&&yieldToWorker(s,u,dt))return;
    if (defending && distance(u, rally) > s.defenseRadius && (!enemy || !inMelee(u,enemy))) { moveToRally(s,u,dt); return; }
    if (enemy) {
      if (inMelee(u,enemy)) { if (!u.cooldown) { hit(s, enemy, soldierAttack(s, u), u); u.cooldown = .8; } }
      else { const id = index(Math.round(enemy.x), Math.round(enemy.y)); if (s.tiles[id]?.revealed) move(s, u, [id], 2.1, dt); }
    } else moveToRally(s,u,dt);
  }
  function tick(s, dt) {
    if (s.result || s.phase!=='running' || s.backgroundPaused || dt <= 0) return;
    collisionContexts.set(s,{grid:new Map(),keys:new Map()});for(const u of bodies(s))trackBody(s,u);
    dt = Math.min(dt, .1); s.time += dt;
    updateEnemyStrength(s);
    // Modest Keep income ensures rebuilding remains possible after losses.
    s.resources.food += .3 * dt; s.resources.wood += .3 * dt;
    for (const t of s.tiles) if (t.building && t.building.hp > 0) {
      const b = t.building;
      if (b.kind === 'farm') s.resources.food += farmRate(s, t.id) * dt;
      if (b.train.length) { b.train[0].remaining=Math.max(0,b.train[0].remaining-dt); if (b.train[0].remaining <= 0) { const unit = addUnit(s,b.train[0].kind,t.id); if(unit){b.train.shift();s.stats.trained[unit.kind]++;log(s,`${unit.kind==='soldier'?'Soldier':'Worker'}が到着。`);} } }
      if (b.kind === 'tower' || b.kind === 'keep') { b.cooldown = Math.max(0, b.cooldown - dt); const target = nearest(s.enemies.filter(e => e.hp > 0 && distance(e, t) <= towerRange(s)), t); if (target && !b.cooldown) { hit(s, target, 14, t); b.cooldown = 1; } }
    }
    for (const u of s.units) {
      if (u.hp > 0) (u.kind === 'worker' ? updateWorker : updateSoldier)(s, u, dt);
    }
    updateRaids(s);
    s.pendingSpawns=s.pendingSpawns.filter(p=>{if(!(isDragon(p.enemy)?emergeDragon(s,p,dt):placeBody(s,p.enemy,p.origin)))return true;s.enemies.push(p.enemy);trackBody(s,p.enemy);return false;});
    for (const e of s.enemies) if (e.hp > 0) {
      e.cooldown = Math.max(0, e.cooldown - dt);
      const target=enemyTarget(s,e);
      if (inMelee(e,target)) {
        if (!e.cooldown) { hitEnemyTarget(s,target,e);e.cooldown=isDragon(e)?1.4:1.1; }
        if(isDragon(e)&&!target.building&&collisionEnabled(target))move(s,e,[index(Math.round(target.x),Math.round(target.y))],enemySpeed(e),dt,target,0);
      } else { const id = index(Math.max(0, Math.min(19, Math.round(target.x))), Math.max(0, Math.min(19, Math.round(target.y)))); move(s, e, [id], enemySpeed(e), dt); }
    }
    // Evaluate after enemy attacks: a Soldier cannot heal immediately before a hit.
    if(s.tiles[s.keepId].building.hp>0&&!s.enemies.some(e=>e.kind==='dragon'&&e.hp<=0))for(const u of s.units)if(u.kind==='soldier'&&u.hp>0&&!s.enemies.some(e=>e.hp>0&&inMelee(u,e))){
      const recoveryTime=Math.max(0,s.time-Math.max(s.time-dt,(u.lastCombatAt??-Infinity)+3));
      u.hp=Math.min(u.maxHp,u.hp+recoveryTime);
    }
    for (const e of s.enemies.filter(e => e.hp <= 0)) { s.kills++; s.resources.gold += e.kind === 'dragon' ? 150 : 6; if (e.kind === 'dragon') { s.result = 'victory'; log(s, 'Dragon討伐！王国に平和が戻った。', 'reward'); } }
    s.enemies = s.enemies.filter(e => e.hp > 0);
    settleCampRewards(s);
    for (const u of s.units.filter(u => u.hp <= 0)) { s.stats.lost[u.kind]++; if (u.task) { const task = s.tasks.find(t => t.id === u.task); if (task) task.workerId = null; } }
    s.units = s.units.filter(u => u.hp > 0);
    if (s.tiles[s.keepId].building.hp <= 0) { s.result = 'defeat'; log(s, '王城が陥落しました。', 'danger'); }
    s.effects = s.effects.filter(e => (e.life -= dt) > 0).slice(-100);
    collisionContexts.delete(s);
  }
  const api = { isDragon, CAMP_REWARD, campRewardStatus, enemyMultiplier, SIZE, UNIT_VISUALS, BODY_RADIUS, bodyRadius, collisionEnabled, circlesOverlap, overlaps, canStand, placeBody, inMelee, enemyTarget, start, setBackgroundPaused, RAID_RULES, BUILDINGS, UNIT_COST, UPGRADES, create, neighbors, index, xy, frontier, setFlag, queueExplore, queueAssault, queuePreparedExplore, queueSafeNeighbors, queueAllZeroNeighbors, cancelAllExploration, preparationStatus, setArmyMode, queueBuild, buildCost, cancelTask, train, tick, population, path, reveal, canPay, hasNeighbor, farmRate, towerRange, soldierAttack, chooseUpgrade, rewardOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KingdomEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
