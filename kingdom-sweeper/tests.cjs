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
console.log(`${checks} scenarios passed.`);
