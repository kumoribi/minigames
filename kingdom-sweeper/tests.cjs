'use strict';
const assert = require('node:assert/strict');
const Engine = require('./engine.js');
// Most historical fixtures exercise a running kingdom. Readiness is tested separately.
const E = {...Engine,create(...args){const s=Engine.create(...args);Engine.start(s);return s;}};
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS', name); }
function advance(s, seconds) { for (let t = 0; t < seconds; t += .05) E.tick(s, .05); }
test('100 seeds: 400 cells, safe start, exactly one dormant Dragon, correct clues', () => {
  for (let seed = 0; seed < 100; seed++) {
    const s = E.create(seed);
    assert.equal(s.tiles.length,400); assert.equal(s.tiles.filter(t=>t.danger===3).length,1);
    assert.equal(s.tiles.filter(t=>t.revealed).length,9); assert.equal(s.units.length,3);
    assert.deepEqual(s.resources,{wood:100,food:100,gold:0}); assert.equal(s.enemies.length,0);
    for (const t of s.tiles) {
      assert.equal(t.clue,E.neighbors(t.id).reduce((n,id)=>n+s.tiles[id].danger,0));
      if(Math.max(Math.abs(t.x-10),Math.abs(t.y-10))<=2)assert.equal(t.danger,0);
    }
  }
  assert.deepEqual(E.create(42).tiles,E.create(42).tiles);
});
test('Background suspension freezes time and permits reservations; foreground resumes',()=>{
  const s=E.create(2); E.setBackgroundPaused(s,true);
  assert(E.queueExplore(s,E.index(8,10)));assert(!E.queueExplore(s,E.index(8,10)));
  advance(s,10);assert.equal(s.time,0);assert(!s.tiles[E.index(8,10)].revealed);
  E.setBackgroundPaused(s,false);advance(s,10);assert(s.tiles[E.index(8,10)].revealed);
});
test('Deep reservations wait for a connected path',()=>{
  const s=E.create(3),deep=E.index(7,10);E.queueExplore(s,deep);advance(s,10);assert(!s.tiles[deep].revealed);
  E.queueExplore(s,E.index(8,10));advance(s,15);assert(s.tiles[deep].revealed);
});
test('Building payment, cancellation refund, completion and Farm production',()=>{
  const s=E.create(4),id=E.index(9,9);s.tiles[id].terrain='grass';E.setBackgroundPaused(s,true);
  assert(E.queueBuild(s,id,'farm').ok);assert.equal(s.resources.wood,70);
  assert(!E.queueBuild(s,id,'farm').ok);assert(E.cancelTask(s,id));assert.equal(s.resources.wood,100);
  E.queueBuild(s,id,'farm');E.setBackgroundPaused(s,false);advance(s,12);assert.equal(s.tiles[id].building.kind,'farm');
  const food=s.resources.food;s.workerFocus='mine';advance(s,5);assert(s.resources.food-food>=9);
});
test('Barracks trains soldiers; reserved population and costs enforced',()=>{
  const s=E.create(5),id=E.index(9,9);s.tiles[id].terrain='grass';E.queueBuild(s,id,'barracks');advance(s,15);
  s.tiles.forEach(t=>{if(Math.max(Math.abs(t.x-10),Math.abs(t.y-10))<=2)t.revealed=true;});
  s.resources={wood:1000,food:1000,gold:1000};
  for(let i=0;i<5;i++)assert(E.train(s,id,'soldier').ok);assert(!E.train(s,id,'soldier').ok);
  assert.equal(E.population(s).used,8);advance(s,40);assert.equal(s.units.filter(u=>u.kind==='soldier').length,5);
  assert(E.train(s,id,'soldier').ok);assert(E.train(s,id,'soldier').ok);assert(!E.train(s,id,'soldier').ok);
  assert(!E.train(s,s.keepId,'soldier').ok);
});
test('Camp produces 3–5 goblins; initial clues unchanged after defeat',()=>{
  const s=E.create(6),camp=s.tiles.find(t=>t.danger===1),clues=s.tiles.map(t=>t.clue);
  E.reveal(s,camp.id);assert.equal(s.enemies.length,3+camp.id%3);E.reveal(s,camp.id);assert.equal(s.enemies.length,3+camp.id%3);
  s.enemies.forEach(e=>e.hp=0);advance(s,.1);assert.equal(s.enemies.length,0);assert.deepEqual(s.tiles.map(t=>t.clue),clues);
});
test('Soldiers automatically defeat Dragon; result blocks further orders',()=>{
  const s=E.create(7),id=E.index(9,9);s.tiles.forEach(t=>t.revealed=true);s.tiles[id].terrain='grass';
  E.queueBuild(s,id,'barracks');advance(s,12);s.resources={wood:1000,food:1000,gold:1000};
  for(let i=0;i<5;i++)E.train(s,id,'soldier');advance(s,40);
  const dragon=s.tiles[s.dragonId],fighters=s.units.filter(u=>u.kind==='soldier');s.units=[];
  for(const u of fighters){assert(E.placeBody(s,u,{x:dragon.x,y:dragon.y}));s.units.push(u);}
  // Restore hidden boss, then awaken through the same reveal used by workers.
  dragon.revealed=false;E.reveal(s,dragon.id);assert(s.dragonAwake);assert.equal(s.enemies.length,1);
  advance(s,60);assert.equal(s.result,'victory');assert(!E.queueExplore(s,0));assert(!E.train(s,id,'soldier').ok);
});
test('Dragon attacks Keep; zero Keep HP produces defeat',()=>{
  const s=E.create(8);s.units=[];const t=s.tiles[s.dragonId];E.reveal(s,t.id);
  s.enemies[0].x=10;s.enemies[0].y=10;advance(s,60);assert.equal(s.result,'defeat');
});
test('Tower attacks only within 3 tiles',()=>{
  const s=E.create(9);s.units=[];s.tiles[E.index(9,9)].building={kind:'tower',hp:300,maxHp:300,train:[],cooldown:0};
  const enemy={id:99,kind:'goblin',x:9,y:7,hp:100,maxHp:100,attack:0,cooldown:100};s.enemies=[enemy];advance(s,.1);assert.equal(enemy.hp,86);
  enemy.x=0;enemy.y=0;const hp=enemy.hp;advance(s,2);assert.equal(enemy.hp,hp);
});
const fixtureBuilding = kind => ({kind,hp:E.BUILDINGS[kind].hp,maxHp:E.BUILDINGS[kind].hp,train:[],cooldown:0});
function chest(s,id) {s.tiles[id].revealed=false;s.tiles[id].danger=0;s.tiles[id].terrain='chest';E.reveal(s,id);return s.pendingRewards.at(-1).id;}
test('Windmill: eight neighbours, no stacking, destroyed/outside excluded',()=>{
  const s=E.create(10),id=E.index(10,10);s.tiles[id].building=fixtureBuilding('farm');
  assert.equal(E.farmRate(s,id),1.6);
  s.tiles[E.index(9,9)].building=fixtureBuilding('windmill');assert.equal(E.farmRate(s,id),2);
  s.tiles[E.index(11,10)].building=fixtureBuilding('windmill');assert.equal(E.farmRate(s,id),2);
  s.tiles[E.index(9,9)].building.hp=0;s.tiles[E.index(11,10)].building.hp=0;
  s.tiles[E.index(12,10)].building=fixtureBuilding('windmill');assert.equal(E.farmRate(s,id),1.6);
});
test('Blacksmith: orthogonal only, birth-time bonus, no retroactivity/stacking',()=>{
  const s=E.create(11),id=E.index(9,9);s.tiles[id].building=fixtureBuilding('barracks');s.resources={food:1000,wood:1000,gold:1000};
  s.tiles.forEach(t=>{if(Math.max(Math.abs(t.x-10),Math.abs(t.y-10))<=2)t.revealed=true;});
  E.train(s,id,'soldier');advance(s,8);const normal=s.units.find(u=>u.kind==='soldier');assert.equal(normal.attack,16);
  s.tiles[E.index(8,8)].building=fixtureBuilding('blacksmith');E.train(s,id,'soldier');advance(s,8);assert.equal(s.units.filter(u=>u.kind==='soldier').at(-1).attack,16);
  E.train(s,id,'soldier');s.tiles[E.index(9,8)].building=fixtureBuilding('blacksmith');s.tiles[E.index(8,9)].building=fixtureBuilding('blacksmith');advance(s,8);
  const forged=s.units.filter(u=>u.kind==='soldier').at(-1);assert.equal(forged.attack,19.2);assert.equal(forged.maxHp,132);assert.equal(normal.attack,16);
});
test('Treasure: simulation continues, selection is exact-once, multiple rewards queue',()=>{
  const s=E.create(12),id=E.index(8,10),before={...s.resources},reward=chest(s,id);
  assert.deepEqual(s.resources,{wood:before.wood+20,food:before.food+20,gold:before.gold+35});
  const time=s.time,hp=s.tiles[s.keepId].building.hp;advance(s,10);assert(s.time>time);assert.equal(s.tiles[s.keepId].building.hp,hp);
  const next=chest(s,E.index(8,9));assert(!E.chooseUpgrade(s,next,'farm'));assert(!E.chooseUpgrade(s,reward,'invalid'));
  assert(E.chooseUpgrade(s,reward,'farm'));assert(!E.chooseUpgrade(s,reward,'tower'));const runningTime=s.time;advance(s,2);assert(s.time>runningTime);
  assert(E.chooseUpgrade(s,next,'farm'));assert(Math.abs(E.farmRate(s,s.keepId)-2.4)<1e-9);advance(s,1);assert(s.time>time);
  E.reveal(s,id);assert.equal(s.pendingRewards.length,0);
});
test('Upgrade arithmetic: existing soldiers, forged soldiers, farm synergy, reset',()=>{
  const s=E.create(13),id=s.keepId;s.tiles[E.index(9,9)].building=fixtureBuilding('windmill');
  s.tiles[E.index(12,10)].building=fixtureBuilding('tower');
  const r=chest(s,0);E.chooseUpgrade(s,r,'farm');assert.equal(E.farmRate(s,id),2.5);
  for(let i=0;i<2;i++)E.chooseUpgrade(s,chest(s,1+i),'soldier');
  assert.equal(E.soldierAttack(s,{attack:16}),22.4);assert(Math.abs(E.soldierAttack(s,{attack:19.2})-26.88)<1e-9);
  E.chooseUpgrade(s,chest(s,3),'tower');assert(Math.abs(E.towerRange(s)-3.3)<1e-9);
  assert.deepEqual(E.create(13).upgrades,{farm:0,soldier:0,tower:0});
});
test('Tower upgraded range affects combat, Soldier upgrade affects existing combat',()=>{
  const s=E.create(14);s.units=[];const id=E.index(9,9);s.tiles[id].building=fixtureBuilding('tower');
  const enemy={id:99,kind:'goblin',x:9,y:5.8,hp:100,maxHp:100,attack:0,cooldown:100};s.enemies=[enemy];
  advance(s,.1);assert.equal(enemy.hp,100);E.chooseUpgrade(s,chest(s,0),'tower');advance(s,.1);assert.equal(enemy.hp,86);
  const towerHit=s.effects.find(e=>e.kind==='hit');assert.equal(towerHit.sourceId,id);assert.equal(towerHit.targetId,enemy.id);
  const u={id:111,kind:'soldier',x:enemy.x+.7,y:enemy.y,hp:110,maxHp:110,attack:16,cooldown:0};s.units=[u];
  E.chooseUpgrade(s,chest(s,1),'soldier');const hp=enemy.hp;advance(s,.05);assert(Math.abs(hp-enemy.hp-19.2)<1e-9);
  const soldierHit=s.effects.find(e=>e.sourceId===u.id);assert.equal(soldierHit.targetId,enemy.id);assert.equal(soldierHit.fromX,u.x);
});
const soldier = (s,x=10,y=10) => ({id:s.nextId++,kind:'soldier',x,y,hp:110,maxHp:110,attack:16,cooldown:0});
function addSoldier(s,x=10,y=10){const u=soldier(s,x,y);assert(E.placeBody(s,u,{x,y}));s.units.push(u);return u;}
const goblin = (s,x,y) => ({id:s.nextId++,kind:'goblin',x,y,hp:48,maxHp:48,attack:7,cooldown:1.5});
test('Defense holds rally against distant enemies; pursue retains previous behavior',()=>{
  const s=E.create(30);s.tiles.forEach(t=>t.revealed=true);s.units=[soldier(s)];s.enemies=[goblin(s,17,10)];
  assert(E.setArmyMode(s,'defend'));advance(s,1);assert.equal(s.units[0].x,10);
  assert(!E.setArmyMode(s,'invalid'));assert.equal(s.armyMode,'defend');
  E.setArmyMode(s,'pursue');advance(s,1);assert(s.units[0].x>10);
});
test('Defense engages inside radius, returns after combat, and permits close self-defense',()=>{
  const s=E.create(31);s.tiles.forEach(t=>t.revealed=true);const u=soldier(s);s.units=[u];s.enemies=[goblin(s,12,10)];E.setArmyMode(s,'defend');
  advance(s,4);assert.equal(s.enemies.length,0);advance(s,3);assert(Math.hypot(u.x-10,u.y-10)<.2);
  u.x=17;const e=goblin(s,17.7,10);s.enemies=[e];advance(s,.1);assert.equal(e.hp,32);
  s.enemies=[];advance(s,5);assert(Math.hypot(u.x-10,u.y-10)<.2);
});
test('Prepared exploration waits without holding Workers; gathers and resumes when assembled',()=>{
  const s=E.create(32),id=E.index(8,10);s.tiles[id].flag=true;E.setArmyMode(s,'defend');E.setBackgroundPaused(s,true);
  assert(E.queuePreparedExplore(s,id,1));assert(!E.queuePreparedExplore(s,id,1));
  advance(s,2);assert.equal(s.time,0);E.setBackgroundPaused(s,false);advance(s,2);
  assert(!s.tiles[id].revealed);assert(s.resources.gold>0);assert.equal(s.tasks[0].workerId,null);
  addSoldier(s);advance(s,8);assert(s.tiles[id].revealed);assert(!s.tiles[id].flag);
});
test('Preparation validates visible plan only, count, range, mode, cancellation and reset',()=>{
  const s=E.create(33),id=E.index(8,10);s.tiles[id].flag=true;
  assert(!E.queuePreparedExplore(s,id,1));E.setArmyMode(s,'defend');
  for(const n of [0,-1,1.5,11,NaN])assert(!E.queuePreparedExplore(s,id,n));
  const far=E.index(0,0);s.tiles[far].flag=true;assert(!E.queuePreparedExplore(s,far,1));
  assert(E.queuePreparedExplore(s,id,2));const q=s.tasks[0];
  addSoldier(s);addSoldier(s);assert.equal(E.preparationStatus(s,q),'');
  s.units.at(-1).hp=0;assert(E.preparationStatus(s,q));s.units.at(-1).hp=110;
  s.rally=E.index(11,11);assert(E.preparationStatus(s,q));assert(E.cancelTask(s,id));assert.equal(s.tasks.length,0);
  const fresh=E.create(33);assert.equal(fresh.armyMode,'pursue');assert.deepEqual(fresh.stats.lost,{worker:0,soldier:0});
});
test('Lost readiness interrupts assigned work, frees Worker, preserves remaining progress',()=>{
  const s=E.create(34),id=E.index(8,10);s.tiles[id].flag=true;E.setArmyMode(s,'defend');addSoldier(s);E.queuePreparedExplore(s,id,1);
  advance(s,.5);const q=s.tasks[0];assert(q.workerId);const remaining=q.remaining;
  E.setArmyMode(s,'pursue');s.enemies=[goblin(s,9,10)];advance(s,.2);assert.equal(q.workerId,null);assert.equal(q.remaining,remaining);assert(!s.tiles[id].revealed);s.enemies=[];
  E.setArmyMode(s,'defend');advance(s,8);assert(s.tiles[id].revealed);
});
test('Safe batch uses revealed zero clues, ignores flags and never duplicates reservations',()=>{
  const s=E.create(35),id=E.index(9,10),blocked=E.index(8,10);s.tiles[blocked].flag=true;
  assert.equal(E.queueSafeNeighbors(s,id),2);assert.equal(E.queueSafeNeighbors(s,id),0);
  assert(!s.tasks.some(q=>q.tileId===blocked));assert.equal(E.queueSafeNeighbors(s,blocked),0);
  s.tiles[id].clue=1;assert.equal(E.queueSafeNeighbors(s,id),0);
});
test('Spending accounts for refunds and queued training; losses counted once; result locks commands',()=>{
  const s=E.create(36),id=E.index(9,9);s.tiles[id].terrain='grass';E.queueBuild(s,id,'farm');assert.equal(s.stats.spent.wood,30);
  E.cancelTask(s,id);assert.equal(s.stats.spent.wood,0);assert(E.train(s,s.keepId,'worker').ok);assert.equal(s.stats.spent.food,25);
  advance(s,6);assert.equal(s.stats.trained.worker,1);s.units[0].hp=0;advance(s,1);assert.equal(s.stats.lost.worker,1);advance(s,1);assert.equal(s.stats.lost.worker,1);
  s.result='victory';assert(!E.setArmyMode(s,'defend'));assert.equal(E.queueSafeNeighbors(s,E.index(9,10)),0);
});
function zeroReach(s) {
  const seen=new Set([s.keepId]),queue=[s.keepId];
  for(let i=0;i<queue.length;i++)if(s.tiles[queue[i]].clue===0)for(const id of E.neighbors(queue[i]))if(!seen.has(id)){seen.add(id);queue.push(id);}
  return seen;
}
test('500 seeds: regional generator conserves camps, troop count, resources, chests, boss and safe start',()=>{
  const inventory=s=>s.tiles.map(t=>`${t.danger===0?'usable':'occupied'}:${t.terrain}:${t.amount}`).sort();
  const variants=new Set();
  for(let seed=0;seed<500;seed++) {
    const s=E.create(seed),before=E.create(seed,{structured:false});
    assert.equal(s.regions.length,3);assert.equal(s.dragonId,before.dragonId);
    assert.equal(s.tiles.filter(t=>t.danger===1).length,before.tiles.filter(t=>t.danger===1).length);
    assert.equal(s.tiles.filter(t=>t.danger===1).reduce((n,t)=>n+3+t.id%3,0),before.tiles.filter(t=>t.danger===1).reduce((n,t)=>n+3+t.id%3,0));
    assert.deepEqual(inventory(s),inventory(before));
    for(const t of s.tiles) {
      assert.equal(t.clue,E.neighbors(t.id).reduce((n,id)=>n+s.tiles[id].danger,0));
      if(Math.max(Math.abs(t.x-10),Math.abs(t.y-10))<=2)for(const key of ['terrain','amount','danger','revealed'])assert.equal(t[key],before.tiles[t.id][key]);
    }
    const reachable=zeroReach(s);assert([...reachable].every(id=>s.tiles[id].danger===0));
    for(const r of s.regions){
      const cells=s.tiles.filter(t=>Math.abs(t.x-r.x)<=1&&Math.abs(t.y-r.y)<=1);
      assert(cells.filter(t=>t.danger===0&&t.terrain===r.kind).length>=4);assert(cells.some(t=>reachable.has(t.id)&&t.terrain===r.kind));
      const dx=Math.sign(r.x-10),dy=Math.sign(r.y-10),radius=Math.abs(r.x-10)+Math.abs(r.y-10);
      const gates=[];for(let d=3;d<=radius-2;d++)for(let v=-1;v<=1;v++)gates.push(s.tiles[E.index(10+dx*d-dy*v,10+dy*d+dx*v)]);
      assert(gates.some(t=>t.danger===1),'A short approach has a camp');
    }
    variants.add(s.regions.map(r=>`${r.kind}:${r.x},${r.y}`).join('|'));
  }
  assert(variants.size>100);
});
test('Regional map reproduces from seed, survey exposes areas only, zero expansion does not wake enemies',()=>{
  const a=E.create(42),b=E.create(42);assert.deepEqual(a.tiles,b.tiles);assert.deepEqual(a.regions,b.regions);
  for(const r of a.regions)assert.deepEqual(Object.keys(r).sort(),['direction','id','kind','radius','x','y']);
  const reachable=zeroReach(a);for(const id of reachable){E.reveal(a,id);while(a.pendingRewards.length)E.chooseUpgrade(a,a.pendingRewards[0].id,'farm');}
  assert.equal(a.enemies.length,0);assert(!a.dragonAwake);assert.equal(a.result,null);
});
test('Treasure always offers three contextual choices; support cannot be obtained twice or bypassed',()=>{
  const s=E.create(60);assert.deepEqual(E.rewardOptions(s),['farm','soldier','outpost']);
  const reward=chest(s,0),before=JSON.stringify(s);assert(!E.chooseUpgrade(s,reward,'tower'));assert.equal(JSON.stringify(s),before);
  assert(E.chooseUpgrade(s,reward,'outpost'));assert.deepEqual(s.towerSupport,{claimed:1,available:1,built:0});assert.equal(s.upgrades.tower,0);
  const next=chest(s,1);assert.deepEqual(E.rewardOptions(s),['farm','soldier','tower']);assert(!E.chooseUpgrade(s,next,'outpost'));assert(!E.chooseUpgrade(s,reward,'outpost'));
  assert(E.chooseUpgrade(s,next,'tower'));assert(Math.abs(E.towerRange(s)-3.3)<1e-9);
  const t=E.create(61);t.tiles[t.keepId].building=fixtureBuilding('tower');assert.deepEqual(E.rewardOptions(t),['farm','soldier','tower']);
});
test('Support does not bypass terrain, visibility, enemy proximity, duplicates or finite stock',()=>{
  const s=E.create(62),id=E.index(9,9);E.chooseUpgrade(s,chest(s,0),'outpost');s.resources={food:0,wood:0,gold:0};s.tiles[id].terrain='grass';
  assert(!E.queueBuild(s,E.index(0,1),'tower').ok);assert(!E.queueBuild(s,s.keepId,'tower').ok);
  assert(!E.queueBuild(s,E.index(9,10),'tower').ok);s.enemies=[goblin(s,9,9)];assert(!E.queueBuild(s,id,'tower').ok);s.enemies=[];
  assert.equal(s.towerSupport.available,1);assert(E.queueBuild(s,id,'tower').ok);assert(!E.queueBuild(s,id,'tower').ok);assert.equal(s.towerSupport.available,0);
  s.tiles[E.index(11,11)].terrain='grass';assert(!E.queueBuild(s,E.index(11,11),'tower').ok);
  assert.deepEqual(s.resources,{food:0,wood:0,gold:0});assert.deepEqual(s.stats.spent,{food:0,wood:0,gold:0});
});
test('Repeated support cancellation refunds only the ticket, not Wood or Gold; paid tasks refund independently',()=>{
  const s=E.create(63),a=E.index(9,9),b=E.index(11,11);E.chooseUpgrade(s,chest(s,0),'outpost');s.tiles[a].terrain=s.tiles[b].terrain='grass';
  const money={...s.resources};
  for(let i=0;i<20;i++){assert(E.queueBuild(s,a,'tower').ok);assert(E.cancelTask(s,a));assert(!E.cancelTask(s,a));assert.deepEqual(s.resources,money);assert.equal(s.towerSupport.available,1);}
  assert(E.queueBuild(s,a,'tower').ok);assert(E.queueBuild(s,b,'tower').ok);assert.equal(s.stats.spent.wood,60);assert.equal(s.stats.spent.gold,15);
  assert(E.cancelTask(s,b));assert.deepEqual(s.resources,money);assert.equal(s.towerSupport.available,0);
  assert(E.cancelTask(s,a));assert.equal(s.towerSupport.available,1);assert.deepEqual(s.stats.spent,{food:0,wood:0,gold:0});
});
test('Previously paid tower reservation remains paid when support is acquired later',()=>{
  const s=E.create(64),id=E.index(9,9);s.tiles[id].terrain='grass';s.resources.gold=20;const before={...s.resources};assert(E.queueBuild(s,id,'tower').ok);
  E.chooseUpgrade(s,chest(s,0),'outpost');assert(E.cancelTask(s,id));assert.deepEqual(s.resources,{wood:before.wood+20,food:before.food+20,gold:before.gold+35});assert.equal(s.towerSupport.available,1);
});
test('Support tower requires Worker construction and unmodified stats; cancellation after progress restores stock',()=>{
  const s=E.create(65),id=E.index(9,9);E.chooseUpgrade(s,chest(s,0),'outpost');s.tiles[id].terrain='grass';E.setBackgroundPaused(s,true);E.queueBuild(s,id,'tower');advance(s,20);assert(!s.tiles[id].building);
  E.setBackgroundPaused(s,false);advance(s,3);assert(!s.tiles[id].building);assert(s.tasks[0].remaining<8);E.cancelTask(s,id);assert.equal(s.towerSupport.available,1);
  E.queueBuild(s,id,'tower');advance(s,12);const tower=s.tiles[id].building;assert.equal(tower.hp,300);assert(tower.supported);assert.equal(s.towerSupport.built,1);assert.equal(s.towerSupport.available,0);
  assert.equal(E.towerRange(s),3);assert.equal(E.BUILDINGS.tower.time,8);assert.equal(E.BUILDINGS.tower.cost.wood,60);assert.equal(s.stats.spent.wood,0);
});
test('Sequential treasure updates choices without freezing building; new run resets support',()=>{
  const s=E.create(66),first=chest(s,0),second=chest(s,1),id=E.index(9,9);s.tiles[id].terrain='grass';
  assert(!E.chooseUpgrade(s,second,'outpost'));assert(E.chooseUpgrade(s,first,'outpost'));assert(!E.chooseUpgrade(s,second,'outpost'));
  E.queueBuild(s,id,'tower');const time=s.time;advance(s,12);assert(s.time>time);assert(s.tiles[id].building);
  assert(E.chooseUpgrade(s,second,'soldier'));advance(s,12);assert(s.tiles[id].building);
  const fresh=E.create(66);assert.deepEqual(fresh.towerSupport,{claimed:0,available:0,built:0});assert.deepEqual(E.rewardOptions(fresh),['farm','soldier','outpost']);
  s.result='victory';assert(!E.chooseUpgrade(s,first,'outpost'));assert(!E.cancelTask(s,id));
});
function raidFixture() {
  const s=E.create(70);s.units=[];s.tiles[s.keepId].building.hp=100000;
  // These fixtures isolate raid scheduling, not defense combat.
  s.tiles[s.keepId].building.cooldown=Infinity;
  for(const t of s.tiles){t.danger=0;t.flag=false;t.terrain='grass';}
  return s;
}
test('Global raids: 100 seeds produce one raider per unsealed camp by 150s, without exploration',()=>{
  for(let seed=0;seed<100;seed++){
    const s=E.create(seed),clues=s.tiles.map(t=>t.clue),camps=s.tiles.filter(t=>t.danger===1).length;
    s.time=149.95;E.tick(s,.05);assert.equal(s.enemies.length+s.pendingSpawns.length+s.kills,camps);assert.equal(s.raids.spawned,camps);
    assert.equal(s.tiles.filter(t=>t.revealed).length,9);assert(!s.dragonAwake);assert.deepEqual(s.tiles.map(t=>t.clue),clues);
    const sealed=E.create(seed);for(const t of sealed.tiles)if(t.danger===1)E.setFlag(sealed,t.id);
    sealed.time=149.95;E.tick(sealed,.05);assert.equal(sealed.enemies.length,0);
  }
});
test('Raid grace, 60s recurrence, fog movement, no territory reveal and no passive Dragon',()=>{
  const s=raidFixture(),id=0;s.tiles[id].danger=1;
  advance(s,89.9);assert.equal(s.enemies.length,0);advance(s,.2);assert.equal(s.enemies.length,1);
  const e=s.enemies[0],distanceBefore=Math.hypot(e.x-10,e.y-10);advance(s,5);assert(Math.hypot(e.x-10,e.y-10)<distanceBefore);
  assert(!s.tiles[id].revealed);assert.equal(s.tiles.filter(t=>t.revealed).length,9);
  advance(s,54.8);assert.equal(s.raids.spawned,2);assert(s.tiles[s.keepId].building.hp<100000 || s.enemies.length>0);
  const dragon=raidFixture();dragon.tiles[0].danger=3;advance(dragon,160);assert.equal(dragon.enemies.length,0);assert(!dragon.dragonAwake);
});
test('Correct flags seal future waves only; removal and rapid toggling never reset due time',()=>{
  const s=raidFixture();s.tiles[0].danger=1;advance(s,90.1);const first=s.enemies[0];assert(first);
  E.setFlag(s,0);const due=s.tiles[0].nextRaidAt;advance(s,60);assert.equal(s.raids.spawned,1);assert(s.enemies.includes(first));
  assert.equal(s.tiles[0].nextRaidAt,due+60);E.setFlag(s,0);advance(s,59.7);
  const next=s.tiles[0].nextRaidAt;for(let i=0;i<20;i++){E.setFlag(s,0);E.setFlag(s,0);}assert.equal(s.tiles[0].nextRaidAt,next);
  advance(s,.4);assert.equal(s.raids.spawned,2);
});
test('False flags spawn real normal enemies, removal stops future waves, clues remain fixed',()=>{
  const s=raidFixture(),clues=s.tiles.map(t=>t.clue);E.setFlag(s,0);advance(s,90.1);
  assert.equal(s.raids.spawned,1);assert.equal(s.enemies[0].maxHp,48);assert.equal(s.enemies[0].attack,7);
  const first=s.enemies[0];E.setFlag(s,0);advance(s,60);assert.equal(s.raids.spawned,1);assert(s.enemies.includes(first));
  assert.deepEqual(s.tiles.map(t=>t.clue),clues);
  E.setFlag(s,0);E.reveal(s,0,{assault:true});advance(s,60);assert.equal(s.raids.spawned,1);assert(s.tiles[0].revealed);
});
test('Raids suspend only in background/results, not during reward selection; speed settings are ignored',()=>{
  const s=raidFixture();s.tiles[0].danger=1;s.time=89.95;E.setBackgroundPaused(s,true);const due=s.tiles[0].nextRaidAt;
  advance(s,10);assert.equal(s.time,89.95);assert.equal(s.enemies.length,0);assert.equal(s.tiles[0].nextRaidAt,due);
  E.setBackgroundPaused(s,false);s.speed=4;const reward=chest(s,1);E.tick(s,.05);assert.equal(s.enemies.length,1);assert.equal(s.time,90);
  const before=s.time;advance(s,1);assert(Math.abs(s.time-before-1)<1e-6);E.chooseUpgrade(s,reward,'farm');
  s.result='defeat';const time=s.time;advance(s,70);assert.equal(s.time,time);assert.equal(s.raids.spawned,1);assert(!E.setFlag(s,0));
});
test('Unflagged excavation has 2x HP/attack, same enemy count; flag alone is not an assault order',()=>{
  for(const flagged of [false,true]){
    const s=raidFixture();s.tiles[0].danger=1;if(flagged)E.setFlag(s,0);E.reveal(s,0);
    assert.equal(s.enemies.length,3);assert(s.enemies.every(e=>e.empowered&&e.maxHp===96&&e.hp===96&&e.attack===14));assert.equal(s.raids.ambushes,1);
    E.reveal(s,0);assert.equal(s.enemies.length,3);
  }
  const planned=raidFixture();planned.tiles[0].danger=1;E.setFlag(planned,0);E.reveal(planned,0,{assault:true});
  assert.equal(planned.enemies.length,3);assert(planned.enemies.every(e=>!e.empowered&&e.maxHp===48&&e.attack===7));assert.equal(planned.raids.ambushes,0);
});
test('Worker assault retains flag until completion; removing flag makes the actual opening an ambush',()=>{
  for(const remove of [false,true]){
    const s=E.create(71),id=E.index(8,10);s.tiles[id].danger=1;s.tiles[id].terrain='grass';
    assert(!E.queueAssault(s,id));E.setFlag(s,id);assert(!E.queueExplore(s,id));assert(E.queueAssault(s,id));assert(!E.queueAssault(s,id));
    advance(s,.5);assert(s.tiles[id].flag);assert(!s.tiles[id].revealed);if(remove)E.setFlag(s,id);
    advance(s,10);assert(s.tiles[id].revealed);assert(!s.tiles[id].flag);assert.equal(s.raids.ambushes,remove?1:0);
    assert(s.enemies.every(e=>e.maxHp===(remove?96:48)));
  }
});
test('Flag placement cancels ordinary excavation, frees Worker and does not expose correctness',()=>{
  for(const danger of [0,1]){
    const s=E.create(72),id=E.index(8,10);s.tiles[id].danger=danger;E.queueExplore(s,id);advance(s,.5);assert(s.tasks[0].workerId);
    const due=s.tiles[id].nextRaidAt,eventCount=s.events.length;assert(E.setFlag(s,id));assert.equal(s.tasks.length,0);assert(s.units.every(u=>u.task===null));
    assert.equal(s.tiles[id].nextRaidAt,due);assert.equal(s.events.length,eventCount);assert.equal(s.enemies.length,0);
    assert(!E.setFlag(s,s.keepId));assert(!E.setFlag(s,-1));
  }
});
test('Keep auto-defense respects radius, nearest target, single-target damage and one-second cooldown',()=>{
  const s=E.create(80);s.units=[];const near=goblin(s,12,10),far=goblin(s,13.1,10);near.hp=near.maxHp=1000;far.hp=far.maxHp=1000;s.enemies=[far,near];
  E.tick(s,.05);assert.equal(near.hp,986);assert.equal(far.hp,1000);assert.equal(s.effects.find(e=>e.kind==='hit').source,'keep');
  advance(s,.5);assert.equal(near.hp,986);advance(s,.55);assert.equal(near.hp,972);
  s.enemies=[far];s.tiles[s.keepId].building.cooldown=0;far.x=13.01;far.y=10;E.tick(s,.05);assert.equal(far.hp,1000);
  far.x=13;far.y=10;E.tick(s,.05);assert.equal(far.hp,986);
});
test('Keep shares tower range upgrades while remaining eligible for first standalone tower support',()=>{
  const s=E.create(81);s.units=[];assert.deepEqual(E.rewardOptions(s),['farm','soldier','outpost']);
  const support=chest(s,0);assert(E.chooseUpgrade(s,support,'outpost'));assert.equal(s.towerSupport.available,1);
  const enemy=goblin(s,13.2,10);enemy.hp=enemy.maxHp=1000;s.enemies=[enemy];E.tick(s,.05);assert.equal(enemy.hp,1000);
  const reward=chest(s,1);assert(E.chooseUpgrade(s,reward,'tower'));E.tick(s,.05);assert.equal(enemy.hp,986);
  assert(Math.abs(E.towerRange(s)-3.3)<1e-9);assert.equal(s.towerSupport.available,1);
  const fresh=E.create(81);assert.equal(E.towerRange(fresh),3);assert.equal(fresh.tiles[fresh.keepId].building.cooldown,0);
});
test('Keep and a standalone tower fire independently with separate source IDs and cooldowns',()=>{
  const s=E.create(82);s.units=[];const id=E.index(9,9);s.tiles[id].building=fixtureBuilding('tower');
  const e=goblin(s,10,9);e.hp=e.maxHp=1000;s.enemies=[e];E.tick(s,.05);assert.equal(e.hp,972);
  const hits=s.effects.filter(e=>e.kind==='hit');assert.deepEqual(new Set(hits.map(h=>h.source)),new Set(['keep','tower']));
  assert.deepEqual(new Set(hits.map(h=>h.sourceId)),new Set([s.keepId,id]));advance(s,.5);assert.equal(e.hp,972);
});
test('Keep defense preserves HP, income and training; treasure continues but background/destruction/result stop it',()=>{
  const s=E.create(83);s.units=[];const keep=s.tiles[s.keepId].building,e=goblin(s,12,10);e.hp=e.maxHp=1000;e.attack=0;s.enemies=[e];
  assert.equal(keep.hp,900);assert.equal(keep.maxHp,900);assert(E.train(s,s.keepId,'worker').ok);const food=s.resources.food,wood=s.resources.wood;
  E.setBackgroundPaused(s,true);advance(s,2);assert.equal(e.hp,1000);assert.equal(keep.train[0].remaining,5);
  E.setBackgroundPaused(s,false);const reward=chest(s,0);E.tick(s,.05);assert.equal(e.hp,986);assert(keep.train[0].remaining<5);E.chooseUpgrade(s,reward,'farm');
  assert(Math.abs(s.resources.food-(food+20+.015))<1e-9);assert(Math.abs(s.resources.wood-(wood+20+.015))<1e-9);
  s.enemies=[];advance(s,5.1);assert.equal(s.stats.trained.worker,1);assert.equal(s.units[0].kind,'worker');
  s.units=[];s.enemies=[e];keep.cooldown=0;keep.hp=0;const hp=e.hp;E.tick(s,.05);assert.equal(e.hp,hp);assert.equal(s.result,'defeat');
  keep.hp=900;advance(s,2);assert.equal(e.hp,hp);
});
function assertSeparated(s){
  const all=[...s.units,...s.enemies].filter(u=>u.hp>0);
  for(let i=0;i<all.length;i++){
    const a=all[i],h=E.bodyRadius(a);assert(Number.isFinite(a.x)&&Number.isFinite(a.y));
    assert(a.x>=h-.5-1e-7&&a.y>=h-.5-1e-7&&a.x<=19.5-h+1e-7&&a.y<=19.5-h+1e-7);
    for(let j=i+1;j<all.length;j++)if(E.collisionEnabled(a)&&E.collisionEnabled(all[j]))assert(Math.hypot(a.x-all[j].x,a.y-all[j].y)>=h+E.bodyRadius(all[j])-1e-7,`circle overlap ${a.id}/${all[j].id} at ${s.time}`);
  }
}
test('Ready phase starts once; no manual speed/pause state; only background suspension and results stop ticks',()=>{
  const s=Engine.create(90);assert.equal(s.phase,'ready');assert(!('speed'in s));advance(s,3);assert.equal(s.time,0);
  assert(E.start(s));assert(!E.start(s));s.speed=0;advance(s,1);assert(Math.abs(s.time-1)<1e-8);
  s.speed=4;advance(s,1);assert(Math.abs(s.time-2)<1e-8);E.setBackgroundPaused(s,true);advance(s,2);assert(Math.abs(s.time-2)<1e-8);
  E.setBackgroundPaused(s,false);advance(s,1);assert(Math.abs(s.time-3)<1e-8);s.result='defeat';assert(!E.start(s));advance(s,2);assert(Math.abs(s.time-3)<1e-8);
});
test('100 seeds: initial Workers and camp/Dragon births have nonoverlapping bodies inside map bounds',()=>{
  for(let seed=0;seed<100;seed++){
    const s=E.create(seed);assertSeparated(s);const camp=s.tiles.find(t=>t.danger===1);E.reveal(s,camp.id);assertSeparated(s);
    E.reveal(s,s.dragonId);assertSeparated(s);assert.equal(s.enemies.length+s.pendingSpawns.length,4+camp.id%3);
  }
});
test('Congested training waits at the exit without losing payment, queue population or unit IDs; expands to resume',()=>{
  const s=E.create(91);s.units=s.units.slice(0,1);s.units[0].x=10;s.units[0].y=10;
  for(const t of s.tiles){t.revealed=t.id===s.keepId;t.terrain='grass';t.danger=0;}
  s.tiles[s.keepId].building=fixtureBuilding('barracks');s.resources={food:1000,wood:1000,gold:1000};
  assert(E.train(s,s.keepId,'soldier').ok);const next=s.nextId;advance(s,10);assert.equal(s.units.length,1);assert.equal(s.nextId,next);assert.equal(s.tiles[s.keepId].building.train[0].remaining,0);assert.equal(E.population(s).used,2);assert.equal(s.stats.spent.food,30);assert.equal(s.stats.spent.wood,15);assertSeparated(s);
  for(const id of E.neighbors(s.keepId))s.tiles[id].revealed=true;
  advance(s,.1);assert.equal(s.units.length,2);assert.equal(s.stats.trained.soldier,1);assert.equal(s.tiles[s.keepId].building.train.length,0);assertSeparated(s);
});
test('Full enemy spawn area queues Dragon instead of overlapping; free space permits the pending birth',()=>{
  const s=E.create(92);s.units=[];s.enemies=[];s.tiles.forEach(t=>{t.revealed=true;t.danger=0;});
  for(let y=1;y<=19;y+=1.15)for(let x=1;x<=19;x+=1.15)s.enemies.push(goblin(s,x,y));
  const id=E.index(10,10);s.tiles[id].revealed=false;s.tiles[id].danger=3;E.reveal(s,id);assert.equal(s.pendingSpawns.length,1);assertSeparated(s);
  s.enemies=s.enemies.filter(e=>Math.hypot(e.x-10,e.y-10)>3.5);E.tick(s,.05);assert.equal(s.pendingSpawns.length,0);assert(s.enemies.some(e=>e.kind==='dragon'));assertSeparated(s);
});
test('Workers yield around active jobs; resource gathering and connected exploration continue without overlaps',()=>{
  for(const seed of [3,34,91]){
    const s=E.create(seed),id=E.index(8,10);s.tiles[id].danger=0;s.tiles[id].terrain='grass';E.queueExplore(s,id);
    const gold=s.resources.gold;
    for(let i=0;i<400;i++){E.tick(s,.05);assertSeparated(s);}
    assert(s.tiles[id].revealed);assert(s.resources.gold>gold);assert.equal(s.tasks.length,0);
  }
});
test('Ten soldiers form a dispersed defensive rally and meet the widened assembly condition',()=>{
  const s=E.create(93);s.tiles.forEach(t=>{t.revealed=true;t.danger=0;});s.units=[];E.setArmyMode(s,'defend');
  for(let i=0;i<10;i++)addSoldier(s,5,5);
  for(let i=0;i<1000;i++){E.tick(s,.05);assertSeparated(s);}
  assert.equal(s.units.filter(u=>Math.hypot(u.x-10,u.y-10)<=3).length,10);
  const id=E.index(12,10);s.tiles[id].revealed=false;E.setFlag(s,id);assert(E.queuePreparedExplore(s,id,10));assert.equal(E.preparationStatus(s,s.tasks[0]),'');
});
test('Contact combat against a large Dragon damages both sides without centre stacking',()=>{
  const s=E.create(94);s.tiles.forEach(t=>{t.revealed=true;t.danger=0;});s.units=[];s.tiles[s.keepId].building.cooldown=Infinity;
  for(let i=0;i<7;i++)addSoldier(s,10,10);
  const id=E.index(15,10);s.tiles[id].revealed=false;s.tiles[id].danger=3;s.dragonId=id;E.reveal(s,id);
  let soldierHit=false,dragonHit=false;
  for(let i=0;i<1200&&!s.result;i++){E.tick(s,.05);assertSeparated(s);soldierHit||=s.effects.some(e=>e.source==='soldier');dragonHit||=s.effects.some(e=>e.source==='dragon');}
  assert(soldierHit);assert(dragonHit);assert(s.kills||s.stats.lost.soldier);
});
test('Crowded mixed armies and raids retain separation on every simulation step',()=>{
  const s=E.create(95);s.tiles.forEach(t=>{t.revealed=true;t.danger=0;});s.units=[];s.enemies=[];
  for(let i=0;i<20;i++)addSoldier(s,7,10);
  for(let i=0;i<20;i++){const e=goblin(s,13,10);assert(E.placeBody(s,e,e));s.enemies.push(e);}
  for(let i=0;i<400&&!s.result;i++){E.tick(s,.05);assertSeparated(s);}
  assert(s.kills>0);assert(s.stats.lost.soldier>0||s.units.some(u=>u.hp<u.maxHp));
});
function trafficFixture(){
  const s=E.create(42);s.units=[];s.enemies=[];
  for(const t of s.tiles){t.revealed=true;t.danger=0;t.flag=false;t.amount=0;t.terrain='grass';}
  s.workerFocus='forest';return s;
}
function trafficWorker(s,x,y){const u={id:s.nextId++,kind:'worker',x,y,hp:55,maxHp:55,attack:0,cooldown:0,task:null,target:null,gather:0};assert(E.placeBody(s,u,u));s.units.push(u);return u;}
function simulateTraffic(s,seconds,observe=()=>{}){for(let i=0;i<seconds*20;i++){E.tick(s,.05);assertSeparated(s);observe();}}
test('Regression: a Soldier on the gathering destination cannot permanently stop a Worker',()=>{
  const s=trafficFixture(),w=trafficWorker(s,8,10);addSoldier(s,10,10);
  const t=s.tiles[E.index(10,10)];t.terrain='forest';t.amount=10000;
  simulateTraffic(s,60);assert(t.amount<9950);assert(w.workSpot);assert(Math.hypot(w.x-t.x,w.y-t.y)<=1.6);
});
test('Six Workers share one resource through separate work positions; every Worker makes progress',()=>{
  const s=trafficFixture(),workers=[];for(let i=0;i<6;i++)workers.push(trafficWorker(s,6,10));
  const t=s.tiles[E.index(10,10)];t.terrain='forest';t.amount=10000;
  const worked=new Set(),previous=new Map(workers.map(u=>[u.id,0]));
  simulateTraffic(s,45,()=>{for(const u of workers){if(u.gather!==previous.get(u.id))worked.add(u.id);previous.set(u.id,u.gather);}});
  assert.equal(worked.size,6);assert(t.amount<9800);
});
test('Construction can finish beside an occupied tile without displacing or overlapping its Soldier',()=>{
  const s=trafficFixture();trafficWorker(s,8,10);s.rally=E.index(12,10);addSoldier(s,12,10);
  assert(E.queueBuild(s,s.rally,'farm'));simulateTraffic(s,30);
  assert.equal(s.tiles[s.rally].building?.kind,'farm');assert.equal(s.tasks.length,0);
});
test('A narrow route with a passing bay allows a Worker past a waiting Soldier',()=>{
  const s=trafficFixture();for(const t of s.tiles)t.revealed=t.y===10&&t.x>=5&&t.x<=15||t.x>=9&&t.x<=11&&t.y>=9&&t.y<=11;
  trafficWorker(s,6,10);s.rally=E.index(10,10);addSoldier(s,10,10);
  const t=s.tiles[E.index(14,10)];t.terrain='forest';t.amount=10000;
  simulateTraffic(s,45);assert(t.amount<9970);
});
test('Opposing construction Workers finish both jobs instead of yielding forever',()=>{
  const s=trafficFixture();trafficWorker(s,7,10);trafficWorker(s,13,10);
  assert(E.queueBuild(s,E.index(12,10),'farm'));assert(E.queueBuild(s,E.index(8,10),'farm'));
  simulateTraffic(s,40);assert.equal(s.tasks.length,0);assert.equal(s.tiles[E.index(12,10)].building?.kind,'farm');assert.equal(s.tiles[E.index(8,10)].building?.kind,'farm');
});
test('Twenty Soldiers arrive around the rally without shared staging deadlock or overlapping bodies',()=>{
  const s=trafficFixture();E.setArmyMode(s,'defend');for(let i=0;i<20;i++)addSoldier(s,5,5);
  simulateTraffic(s,80);assert.equal(s.units.filter(u=>Math.hypot(u.x-10,u.y-10)<4.5).length,20);
  const spots=s.units.filter(u=>u.rallySpot).map(u=>`${u.rallySpot.x},${u.rallySpot.y}`);assert.equal(new Set(spots).size,20);
});
test('Circular bodies use visible PNG content size and allow diagonals outside the circle',()=>{
  const expected={worker:90*42/128,soldier:82*50/128,goblin:101*50/128,dragon:188*108/192};
  for(const [kind,diameter] of Object.entries(expected))assert(Math.abs(E.bodyRadius({kind})*112-diameter)<1e-10);
  const a={kind:'worker',hp:55,x:0,y:0},b={...a,x:.4,y:.4};assert(!E.overlaps(a,b));b.x=b.y=.35;assert(E.overlaps(a,b));
  b.x=E.bodyRadius(a)*2;b.y=0;assert(!E.overlaps(a,b));
});
function waitingFixture(){
  const s=trafficFixture(),requester=trafficWorker(s,8,10),worker=trafficWorker(s,10,10);
  worker.yieldGoal={x:10,y:10};worker.yieldRequest={id:requester.id,until:s.time+1.8,dest:{x:12,y:10}};
  return {s,worker,requester};
}
test('Only a Worker arriving at its yield position becomes non-solid; other units pass in the same tick',()=>{
  const {s,worker}=waitingFixture(),unit=addSoldier(s,10.65,10);E.tick(s,.05);
  assert.equal(worker.waitingNonSolid,'yield');assert(!E.collisionEnabled(worker));assert(E.collisionEnabled(unit));
  simulateTraffic(s,.5);assert(E.circlesOverlap(worker,unit));assert(!E.overlaps(worker,unit));
});
test('A yielding Worker stays solid while travelling and disables collision only after arrival',()=>{
  const {s,worker}=waitingFixture();worker.yieldGoal={x:10,y:11};E.tick(s,.05);
  assert(E.collisionEnabled(worker));assert(!worker.waitingNonSolid);
  simulateTraffic(s,1);assert.equal(worker.waitingNonSolid,'yield');
});
test('A waiting Worker restores collision before departure, but waits if another body occupies its position',()=>{
  const {s,worker}=waitingFixture();E.tick(s,.05);assert(!E.collisionEnabled(worker));
  const blocker=trafficWorker(s,worker.x,worker.y),pos={x:worker.x,y:worker.y};worker.yieldRequest.until=s.time;
  simulateTraffic(s,.2);assert(worker.waitingNonSolid);assert.equal(worker.x,pos.x);assert.equal(worker.y,pos.y);
  s.units=s.units.filter(u=>u!==blocker);E.tick(s,.05);assert(E.collisionEnabled(worker));assert(!worker.waitingNonSolid);assertSeparated(s);
});
test('Sheltering Workers remain vulnerable and return to solid state after the threat disappears',()=>{
  const s=trafficFixture(),worker=trafficWorker(s,10,10);s.tiles[s.keepId].building.cooldown=Infinity;
  const enemy=goblin(s,10.65,10);enemy.cooldown=0;s.enemies.push(enemy);E.tick(s,.05);
  assert.equal(worker.waitingNonSolid,'shelter');assert(worker.hp<55);assert(s.enemies.length);
  s.enemies=[];E.tick(s,.05);assert(E.collisionEnabled(worker));assert(!worker.waitingNonSolid);
  assert(E.create(42).units.every(u=>!u.waitingNonSolid));
});
test('Tower bonus is additive +10 percent, and Keep/Tower honor the upgraded boundary',()=>{
  assert.equal(E.UPGRADES.tower.step,.1);assert(E.UPGRADES.tower.description.includes('+10%'));
  for(const kind of ['keep','tower']){
    const s=trafficFixture(),id=s.keepId;s.tiles[id].building=fixtureBuilding(kind);s.towerSupport.claimed=1;
    assert.equal(E.towerRange(s),3);assert(E.chooseUpgrade(s,chest(s,0),'tower'));assert(Math.abs(E.towerRange(s)-3.3)<1e-10);
    const enemy=goblin(s,13.301,10);enemy.hp=enemy.maxHp=1000;enemy.attack=0;enemy.cooldown=1000;s.enemies=[enemy];
    // Just inside/outside avoids coordinate-subtraction floating-point noise.
    E.tick(s,.01);assert.equal(enemy.hp,1000);enemy.x=13.3-1e-7;E.tick(s,.01);assert.equal(enemy.hp,986);
    assert(E.chooseUpgrade(s,chest(s,1),'tower'));assert(Math.abs(E.towerRange(s)-3.6)<1e-10);
    assert(E.chooseUpgrade(s,chest(s,2),'tower'));assert(Math.abs(E.towerRange(s)-3.9)<1e-10);
    assert.equal(E.towerRange(E.create(42)),3);
  }
});
console.log(`${checks} scenarios passed.`);
