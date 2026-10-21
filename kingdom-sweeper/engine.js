/* Pure simulation: coordinates are tile centres, time is simulation seconds. */
(function (root) {
  'use strict';
  const SIZE = 20;
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
    tower: { name: '遠見の眼', description: 'すべての監視塔の射程 +30%', step: .3 },
    outpost: { name: '前線設営の支援', description: '監視塔1棟のWood60・Gold15を免除。Workerの建築8秒と通常の建築条件は必要', step: 0 }
  };
  function hasNeighbor(s, id, kind, diagonal) { return neighbors(id, diagonal).some(n => s.tiles[n].building?.kind === kind && s.tiles[n].building.hp > 0); }
  function farmRate(s, id) { return 1.6 * (1 + s.upgrades.farm * .25) * (hasNeighbor(s, id, 'windmill', true) ? 1.25 : 1); }
  function towerRange(s) { return 3 * (1 + s.upgrades.tower * .3); }
  function soldierAttack(s, unit) { return unit.attack * (1 + s.upgrades.soldier * .2); }
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
    const p = xy(id), unit = { id: s.nextId++, kind, x: p.x, y: p.y, hp: kind === 'soldier' ? 110 : 55, maxHp: kind === 'soldier' ? 110 : 55, attack: kind === 'soldier' ? 16 : 0, cooldown: 0, task: null, target: null, gather: 0 };
    if (kind === 'soldier' && hasNeighbor(s, id, 'blacksmith', false)) {
      unit.forged = true; unit.attack *= 1.2; unit.hp *= 1.2; unit.maxHp *= 1.2;
    }
    s.units.push(unit); return unit;
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
  function create(seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, { structured = true } = {}) {
    const random = rng(seed), s = { seed: seed >>> 0, time: 0, speed: 1, result: null, resources: { wood: 100, food: 100, gold: 0 }, tiles: [], units: [], enemies: [], tasks: [], events: [], effects: [], nextId: 1, keepId: index(10, 10), rally: index(10, 10), workerFocus: null, dragonAwake: false, kills: 0 };
    s.upgrades = { farm: 0, soldier: 0, tower: 0 }; s.pendingRewards = [];
    s.towerSupport = { claimed: 0, available: 0, built: 0 };
    s.armyMode = 'pursue'; s.defenseRadius = 3;
    s.stats = { spent: { wood: 0, food: 0, gold: 0 }, trained: { worker: 0, soldier: 0 }, lost: { worker: 0, soldier: 0 } };
    for (let id = 0; id < SIZE * SIZE; id++) {
      const p = xy(id), safe = Math.max(Math.abs(p.x - 10), Math.abs(p.y - 10)) <= 2, r = random();
      const terrain = r < .2 ? 'forest' : r < .29 ? 'food' : r < .37 ? 'mine' : r < .41 ? 'chest' : 'grass';
      s.tiles.push({ id, ...p, terrain, danger: !safe && random() < .09 ? 1 : 0, clue: 0, revealed: Math.abs(p.x - 10) <= 1 && Math.abs(p.y - 10) <= 1, flag: false, amount: terrain === 'forest' ? 180 : terrain === 'mine' ? 150 : 130, building: null });
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
    log(s, '王城を守り、数字から敵を推測。まず農場と兵舎を建てよう。');
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
  function queueExplore(s, id) {
    const t = s.tiles[id]; if (s.result || !t || t.revealed || hasTask(s, id)) return false;
    // Deep reservations wait until an adjacent tile becomes part of the territory.
    s.tasks.push({ id: s.nextId++, kind: 'explore', tileId: id, remaining: 3, workerId: null }); return true;
  }
  function setArmyMode(s, mode) {
    if (s.result || !['pursue', 'defend'].includes(mode)) return false;
    s.armyMode = mode; return true;
  }
  function preparationStatus(s, task) {
    if (!task.preparation) return '';
    const p = task.preparation;
    if (s.armyMode !== 'defend' || s.rally !== p.rally) return '予約時の集合地点で防衛にしてください';
    const soldiers = s.units.filter(u => u.kind === 'soldier' && u.hp > 0 && distance(u, s.tiles[p.rally]) <= 1);
    if (soldiers.length < p.count) return `集結待ち ${soldiers.length}/${p.count}体`;
    return '';
  }
  function queuePreparedExplore(s, id, count) {
    const t = s.tiles[id], rally = s.tiles[s.rally];
    if (!t || !t.flag || t.revealed || !Number.isInteger(count) || count < 1 || count > 10 ||
        s.armyMode !== 'defend' || !rally?.revealed || distance(t, rally) > s.defenseRadius || !queueExplore(s, id)) return false;
    s.tasks.at(-1).preparation = { rally: s.rally, count }; return true;
  }
  function queueSafeNeighbors(s, id) {
    const t = s.tiles[id];
    if (s.result || !t?.revealed || t.clue !== 0) return 0;
    return neighbors(id).filter(n => !s.tiles[n].flag && queueExplore(s, n)).length;
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
  function spawn(s, kind, tile, count = 1) {
    for (let i = 0; i < count; i++) {
      const a = i * Math.PI * 2 / count, boss = kind === 'dragon';
      s.enemies.push({ id: s.nextId++, kind, x: tile.x + Math.cos(a) * .12, y: tile.y + Math.sin(a) * .12, hp: boss ? 1200 : 48, maxHp: boss ? 1200 : 48, attack: boss ? 28 : 7, cooldown: 1.5 });
    }
  }
  function reveal(s, id) {
    const tile = s.tiles[id]; if (tile.revealed) return;
    tile.revealed = true; tile.flag = false;
    if (tile.danger === 3) { s.dragonAwake = true; spawn(s, 'dragon', tile); log(s, 'Dragonが目覚めた！軍を集結して王城を守れ。', 'danger'); }
    else if (tile.danger === 1) { tile.terrain = 'camp'; spawn(s, 'goblin', tile, 3 + id % 3); log(s, 'Goblin Campを開拓。迎撃開始！', 'danger'); }
    else if (tile.terrain === 'chest') { s.resources.gold += 35; s.resources.wood += 20; s.resources.food += 20; tile.terrain = 'grass'; s.pendingRewards.push({ id: s.nextId++, tileId: id }); log(s, '宝箱発見！資源を獲得。3つの報酬から1つ選ぼう。', 'reward'); }
    s.effects.push({ kind: 'reveal', x: tile.x, y: tile.y, life: .8 });
  }
  // Four-neighbour paths keep movement inside revealed territory.
  function path(s, from, goals) {
    const start = index(Math.max(0, Math.min(19, Math.round(from.x))), Math.max(0, Math.min(19, Math.round(from.y))));
    const target = new Set(goals), queue = [start], previous = new Map([[start, null]]);
    if (target.has(start)) return [];
    for (let i = 0; i < queue.length; i++) for (const n of neighbors(queue[i], false)) {
      if (!s.tiles[n].revealed || previous.has(n)) continue;
      previous.set(n, queue[i]); queue.push(n);
      if (target.has(n)) { const route = []; let cur = n; while (cur !== start) { route.unshift(cur); cur = previous.get(cur); } return route; }
    }
    return null;
  }
  function move(s, u, goals, speed, dt) {
    const route = path(s, u, goals); if (!route) return false;
    const dest = route.length ? s.tiles[route[0]] : s.tiles[goals.find(id => distance(s.tiles[id], u) < .8) ?? goals[0]];
    if (!dest) return false;
    const d = distance(u, dest), step = Math.min(d, speed * dt);
    if (d > .001) { u.x += (dest.x - u.x) / d * step; u.y += (dest.y - u.y) / d * step; }
    return !route.length && distance(u, dest) < .15;
  }
  function nearest(list, p) { return list.reduce((best, t) => !best || distance(t, p) < distance(best, p) ? t : best, null); }
  function taskGoals(s, task) { return task.kind === 'explore' ? neighbors(task.tileId, false).filter(id => s.tiles[id].revealed) : [task.tileId]; }
  function updateWorker(s, u, dt) {
    let task = s.tasks.find(t => t.id === u.task);
    if (task && preparationStatus(s, task)) { task.workerId = null; u.task = null; task = null; }
    const threat = nearest(s.enemies.filter(e => e.hp > 0), u);
    if (threat && distance(threat, u) < 2.2) { move(s, u, [s.keepId], 1.8, dt); return; }
    if (!task) {
      u.task = null;
      task = s.tasks.find(t => !t.workerId && !preparationStatus(s, t) && taskGoals(s, t).length && path(s, u, taskGoals(s, t)) !== null);
      if (task) { task.workerId = u.id; u.task = task.id; }
    }
    if (task) {
      if (move(s, u, taskGoals(s, task), 1.8, dt)) {
        task.remaining -= dt;
        if (task.remaining <= 0) {
          if (task.kind === 'explore') reveal(s, task.tileId);
          else { const tile = s.tiles[task.tileId]; tile.building = building(task.building); if(task.supported){tile.building.supported=true;s.towerSupport.built++;} s.effects.push({ kind: 'build', x: tile.x, y: tile.y, life: .8 }); log(s, `${BUILDINGS[task.building].name}が完成。`); }
          s.tasks = s.tasks.filter(t => t !== task); u.task = null;
        }
      }
      return;
    }
    const resourceTiles = s.tiles.filter(t => t.revealed && t.amount > 0 && ['forest', 'food', 'mine'].includes(t.terrain));
    let options = resourceTiles;
    if (s.workerFocus) options = resourceTiles.filter(t => t.terrain === s.workerFocus);
    else { const kind = ['forest', 'food', 'mine'][(u.id - 1) % 3]; const preferred = resourceTiles.filter(t => t.terrain === kind); if (preferred.length) options = preferred; }
    const target = nearest(options, u); u.target = target?.id ?? null;
    if (target && move(s, u, [target.id], 1.8, dt)) {
      const amount = Math.min(target.amount, 2 * dt), key = { forest: 'wood', food: 'food', mine: 'gold' }[target.terrain];
      target.amount -= amount; s.resources[key] += amount; u.gather += dt;
      if (u.gather >= 2) { u.gather -= 2; s.effects.push({ kind: 'gather', resource: key, x: target.x, y: target.y, life: .7 }); }
      if (target.amount <= .001) { target.amount = 0; target.terrain = 'grass'; log(s, '採集地点が平地になりました。'); }
    }
  }
  function hit(s, target, damage, source) { target.hp -= damage; s.effects.push({ kind: 'hit', source: source.kind || source.building?.kind, sourceId: source.id, targetId: target.id, damage, x: target.x, y: target.y, fromX: source.x, fromY: source.y, life: .3 }); }
  function updateSoldier(s, u, dt) {
    const rally = s.tiles[s.rally], defending = s.armyMode === 'defend';
    const enemy = nearest(s.enemies.filter(e => e.hp > 0 && (!defending || distance(e, rally) <= s.defenseRadius || distance(e, u) <= .95)), u);
    u.cooldown = Math.max(0, u.cooldown - dt);
    if (defending && distance(u, rally) > s.defenseRadius && (!enemy || distance(u, enemy) > .95)) { move(s, u, [s.rally], 2.1, dt); return; }
    if (enemy) {
      if (distance(u, enemy) <= .95) { if (!u.cooldown) { hit(s, enemy, soldierAttack(s, u), u); u.cooldown = .8; } }
      else { const id = index(Math.round(enemy.x), Math.round(enemy.y)); if (s.tiles[id]?.revealed) move(s, u, [id], 2.1, dt); }
    } else move(s, u, [s.rally], 2.1, dt);
  }
  function tick(s, dt) {
    if (s.result || s.speed === 0 || s.pendingRewards.length || dt <= 0) return;
    dt = Math.min(dt, .1); s.time += dt;
    // Modest Keep income ensures rebuilding remains possible after losses.
    s.resources.food += .3 * dt; s.resources.wood += .3 * dt;
    for (const t of s.tiles) if (t.building && t.building.hp > 0) {
      const b = t.building;
      if (b.kind === 'farm') s.resources.food += farmRate(s, t.id) * dt;
      if (b.train.length) { b.train[0].remaining -= dt; if (b.train[0].remaining <= 0) { const unit = addUnit(s, b.train.shift().kind, t.id); s.stats.trained[unit.kind]++; log(s, `${unit.kind === 'soldier' ? 'Soldier' : 'Worker'}が到着。`); } }
      if (b.kind === 'tower') { b.cooldown = Math.max(0, b.cooldown - dt); const target = nearest(s.enemies.filter(e => e.hp > 0 && distance(e, t) <= towerRange(s)), t); if (target && !b.cooldown) { hit(s, target, 14, t); b.cooldown = 1; } }
    }
    for (const u of s.units) {
      if (u.hp > 0) (u.kind === 'worker' ? updateWorker : updateSoldier)(s, u, dt);
      if (s.pendingRewards.length) return; // Pause immediately before any further movement or combat.
    }
    for (const e of s.enemies) if (e.hp > 0) {
      e.cooldown = Math.max(0, e.cooldown - dt);
      const nearby = nearest(s.units.filter(u => u.hp > 0 && distance(u, e) < 4), e), target = nearby || s.tiles[s.keepId];
      const d = distance(e, target);
      if (d <= (e.kind === 'dragon' ? 1.1 : .85)) {
        if (!e.cooldown) { hit(s, nearby || target.building, e.attack, e); if (!nearby) { const effect = s.effects.at(-1); effect.x = target.x; effect.y = target.y; } e.cooldown = e.kind === 'dragon' ? 1.4 : 1.1; }
      } else { const id = index(Math.max(0, Math.min(19, Math.round(target.x))), Math.max(0, Math.min(19, Math.round(target.y)))); move(s, e, [id], e.kind === 'dragon' ? 1 : 1.35, dt); }
    }
    for (const e of s.enemies.filter(e => e.hp <= 0)) { s.kills++; s.resources.gold += e.kind === 'dragon' ? 150 : 6; if (e.kind === 'dragon') { s.result = 'victory'; log(s, 'Dragon討伐！王国に平和が戻った。', 'reward'); } }
    s.enemies = s.enemies.filter(e => e.hp > 0);
    for (const u of s.units.filter(u => u.hp <= 0)) { s.stats.lost[u.kind]++; if (u.task) { const task = s.tasks.find(t => t.id === u.task); if (task) task.workerId = null; } }
    s.units = s.units.filter(u => u.hp > 0);
    if (s.tiles[s.keepId].building.hp <= 0) { s.result = 'defeat'; log(s, '王城が陥落しました。', 'danger'); }
    s.effects = s.effects.filter(e => (e.life -= dt) > 0).slice(-100);
  }
  const api = { SIZE, BUILDINGS, UNIT_COST, UPGRADES, create, neighbors, index, xy, frontier, queueExplore, queuePreparedExplore, queueSafeNeighbors, preparationStatus, setArmyMode, queueBuild, buildCost, cancelTask, train, tick, population, path, reveal, canPay, hasNeighbor, farmRate, towerRange, soldierAttack, chooseUpgrade, rewardOptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KingdomEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
