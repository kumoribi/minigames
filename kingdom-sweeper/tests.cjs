'use strict';
const assert = require('node:assert/strict');
const E = require('./engine.js');
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
test('Pause freezes time, gathering, exploration; permits reservations',()=>{
  const s=E.create(2); s.speed=0;
  assert(E.queueExplore(s,E.index(8,10)));assert(!E.queueExplore(s,E.index(8,10)));
  advance(s,10);assert.equal(s.time,0);assert(!s.tiles[E.index(8,10)].revealed);
  s.speed=1;advance(s,10);assert(s.tiles[E.index(8,10)].revealed);
});
test('Deep reservations wait for a connected path',()=>{
  const s=E.create(3),deep=E.index(7,10);E.queueExplore(s,deep);advance(s,10);assert(!s.tiles[deep].revealed);
  E.queueExplore(s,E.index(8,10));advance(s,15);assert(s.tiles[deep].revealed);
});
test('Building payment, cancellation refund, completion and Farm production',()=>{
  const s=E.create(4),id=E.index(9,9);s.tiles[id].terrain='grass';s.speed=0;
  assert(E.queueBuild(s,id,'farm').ok);assert.equal(s.resources.wood,70);
  assert(!E.queueBuild(s,id,'farm').ok);assert(E.cancelTask(s,id));assert.equal(s.resources.wood,100);
  E.queueBuild(s,id,'farm');s.speed=1;advance(s,12);assert.equal(s.tiles[id].building.kind,'farm');
  const food=s.resources.food;s.workerFocus='mine';advance(s,5);assert(s.resources.food-food>=9);
});
test('Barracks trains soldiers; reserved population and costs enforced',()=>{
  const s=E.create(5),id=E.index(9,9);s.tiles[id].terrain='grass';E.queueBuild(s,id,'barracks');advance(s,15);
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
  const dragon=s.tiles[s.dragonId];s.units.filter(u=>u.kind==='soldier').forEach(u=>{u.x=dragon.x;u.y=dragon.y;});
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
  E.train(s,id,'soldier');advance(s,8);const normal=s.units.find(u=>u.kind==='soldier');assert.equal(normal.attack,16);
  s.tiles[E.index(8,8)].building=fixtureBuilding('blacksmith');E.train(s,id,'soldier');advance(s,8);assert.equal(s.units.filter(u=>u.kind==='soldier').at(-1).attack,16);
  E.train(s,id,'soldier');s.tiles[E.index(9,8)].building=fixtureBuilding('blacksmith');s.tiles[E.index(8,9)].building=fixtureBuilding('blacksmith');advance(s,8);
  const forged=s.units.filter(u=>u.kind==='soldier').at(-1);assert.equal(forged.attack,19.2);assert.equal(forged.maxHp,132);assert.equal(normal.attack,16);
});
test('Treasure: freezes simulation, exact-once selection, queues multiple rewards',()=>{
  const s=E.create(12),id=E.index(8,10),before={...s.resources},reward=chest(s,id);
  assert.deepEqual(s.resources,{wood:before.wood+20,food:before.food+20,gold:before.gold+35});
  const time=s.time,hp=s.tiles[s.keepId].building.hp;advance(s,10);assert.equal(s.time,time);assert.equal(s.tiles[s.keepId].building.hp,hp);
  const next=chest(s,E.index(8,9));assert(!E.chooseUpgrade(s,next,'farm'));assert(!E.chooseUpgrade(s,reward,'invalid'));
  assert(E.chooseUpgrade(s,reward,'farm'));assert(!E.chooseUpgrade(s,reward,'tower'));advance(s,2);assert.equal(s.time,time);
  assert(E.chooseUpgrade(s,next,'farm'));assert(Math.abs(E.farmRate(s,s.keepId)-2.4)<1e-9);advance(s,1);assert(s.time>time);
  E.reveal(s,id);assert.equal(s.pendingRewards.length,0);
});
test('Upgrade arithmetic: existing soldiers, forged soldiers, farm synergy, reset',()=>{
  const s=E.create(13),id=s.keepId;s.tiles[E.index(9,9)].building=fixtureBuilding('windmill');
  const r=chest(s,0);E.chooseUpgrade(s,r,'farm');assert.equal(E.farmRate(s,id),2.5);
  for(let i=0;i<2;i++)E.chooseUpgrade(s,chest(s,1+i),'soldier');
  assert.equal(E.soldierAttack(s,{attack:16}),22.4);assert(Math.abs(E.soldierAttack(s,{attack:19.2})-26.88)<1e-9);
  E.chooseUpgrade(s,chest(s,3),'tower');assert(Math.abs(E.towerRange(s)-3.9)<1e-9);
  assert.deepEqual(E.create(13).upgrades,{farm:0,soldier:0,tower:0});
});
test('Tower upgraded range affects combat, Soldier upgrade affects existing combat',()=>{
  const s=E.create(14);s.units=[];const id=E.index(9,9);s.tiles[id].building=fixtureBuilding('tower');
  const enemy={id:99,kind:'goblin',x:9,y:5.5,hp:100,maxHp:100,attack:0,cooldown:100};s.enemies=[enemy];
  advance(s,.1);assert.equal(enemy.hp,100);E.chooseUpgrade(s,chest(s,0),'tower');advance(s,.1);assert.equal(enemy.hp,86);
  const u={id:111,kind:'soldier',x:9,y:5.5,hp:110,maxHp:110,attack:16,cooldown:0};s.units=[u];
  E.chooseUpgrade(s,chest(s,1),'soldier');const hp=enemy.hp;advance(s,.05);assert(Math.abs(hp-enemy.hp-19.2)<1e-9);
});
console.log(`${checks} scenarios passed.`);
