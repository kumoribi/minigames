(function (root) {
  'use strict';
  const STEP_MS = 250;
  const MEAL_TICKS = 3000 / STEP_MS;
  const DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const ITEMS = {
    rice: ['米', '米', '#eee5cc'], shari: ['シャリ', '飯', '#fff9e9'],
    tuna: ['まぐろ', '鮪', '#e75e64'], tunaCut: ['まぐろのネタ', '鮪', '#ee7980'],
    salmon: ['サーモン', '鮭', '#f39a58'], salmonCut: ['サーモンのネタ', '鮭', '#ffb078'],
    cucumber: ['きゅうり', '瓜', '#68a96e'], cucumberCut: ['切ったきゅうり', '瓜', '#89bf72'],
    nori: ['海苔', '苔', '#34594b'], tunaSushi: ['まぐろ寿司', '鮪', '#ee7980'],
    salmonSushi: ['サーモン寿司', '鮭', '#ffb078'], maki: ['かっぱ巻き', '巻', '#89bf72']
  };
  const RECIPES = {
    cook: {name: '炊飯釜', inputs: {rice: 1}, output: 'shari', time: 6},
    tunaPrep: {name: 'まぐろ仕込み台', inputs: {tuna: 1}, output: 'tunaCut', time: 4},
    salmonPrep: {name: 'サーモン仕込み台', inputs: {salmon: 1}, output: 'salmonCut', time: 4},
    cucumberPrep: {name: 'きゅうり仕込み台', inputs: {cucumber: 1}, output: 'cucumberCut', time: 4},
    tunaGrip: {name: 'まぐろ握り台', inputs: {shari: 1, tunaCut: 1}, output: 'tunaSushi', time: 8},
    salmonGrip: {name: 'サーモン握り台', inputs: {shari: 1, salmonCut: 1}, output: 'salmonSushi', time: 8},
    makiRoll: {name: '巻き寿司台', inputs: {shari: 1, cucumberCut: 1, nori: 1}, output: 'maki', time: 10}
  };
  const MACHINES = {
    cook: {name: '炊飯釜', recipes: ['cook']},
    prep: {name: '仕込み台', recipes: ['tunaPrep', 'salmonPrep', 'cucumberPrep']},
    grip: {name: '握り台', recipes: ['tunaGrip', 'salmonGrip']},
    makiRoll: {name: '巻き寿司台', recipes: ['makiRoll']}
  };
  const machineForRecipe = Object.fromEntries(Object.entries(MACHINES)
    .flatMap(([machine, spec]) => spec.recipes.map(recipe => [recipe, machine])));
  function inputTypes(machine, stage = 3) {
    const recipes = MACHINES[machine].recipes.filter(id => unlockLevel('machine', id) <= stage);
    return [...new Set(recipes.flatMap(id => Object.keys(RECIPES[id].inputs)))];
  }
  function processMachine(e) {
    if (e.out.length >= 4) return;
    if (e.progress) {
      const recipe = RECIPES[e.activeRecipe];
      if (++e.progress > recipe.time) {
        e.out.push(recipe.output);
        e.progress = 0;
        e.activeRecipe = '';
      }
      return;
    }
    const choices = MACHINES[e.option].recipes;
    for (let i = 0; i < choices.length; i++) {
      const index = (e.turn + i) % choices.length;
      const id = choices[index];
      const inputs = Object.entries(RECIPES[id].inputs);
      if (!inputs.every(([item, n]) => (e.inv[item] || 0) >= n)) continue;
      for (const [item, n] of inputs) e.inv[item] -= n;
      e.activeRecipe = id;
      e.progress = 1;
      e.turn = (index + 1) % choices.length;
      return;
    }
  }
  const COST = {belt: 5, cat: 20, source: 40, machine: 60, counter: 30, splitter: 25, bridge: 35, underground:20};
  const TUNNEL_MAX_DISTANCE = 5; // Up to four ground cells between the portals.
  const PRICE = {tunaSushi: 12, salmonSushi: 16, maki: 22};
  const GOALS = [
    {item: 'tunaSushi', count: 20, reward: 350, title: 'まぐろ寿司を20皿提供', unlock: 'サーモン・分岐器・敷地20×14'},
    {item: 'salmonSushi', count: 20, reward: 500, title: 'サーモン寿司を20皿提供', unlock: 'かっぱ巻き・立体交差・敷地24×18'},
    {item: 'maki', count: 20, reward: 700, title: 'かっぱ巻きを20皿提供', unlock: '自由建設・敷地28×20'}
  ];
  const SIZE = [[14, 10], [20, 14], [24, 18], [28, 20]];
  const key = (x, y) => x + ',' + y;
  const at = (s, x, y) => s.cells[key(x, y)];
  function tunnelPartner(s,x,y) {
    const e=at(s,x,y);
    if(e?.type!=='underground')return null;
    const sign=e.option==='in'?1:-1, [dx,dy]=DIR[e.dir];
    for(let distance=1;distance<=TUNNEL_MAX_DISTANCE;distance++){
      const tx=x+dx*distance*sign,ty=y+dy*distance*sign,other=at(s,tx,ty);
      if(other?.type!=='underground'||other.dir!==e.dir)continue;
      // The nearest portal of this direction blocks more distant connections.
      return other.option!==e.option?{x:tx,y:ty,distance}:null;
    }
    return null;
  }
  function surfaceLane(e) {
    return e && (['belt','splitter','bridge'].includes(e.type) || (e.type==='underground'&&e.option==='out'));
  }
  function tunnelBusy(e){return e?.type==='underground'&&e.option==='in'&&e.tunnel?.some(Boolean);}
  function preserveTunnels(s,next,mapping={}) {
    for(const [k,e] of Object.entries(s.cells)){
      if(!tunnelBusy(e))continue;
      const [x,y]=k.split(',').map(Number),before=tunnelPartner(s,x,y);
      const dest=mapping[k]||{x,y},after=tunnelPartner(next,dest.x,dest.y);
      const expected=before&&(mapping[key(before.x,before.y)]||before);
      if(!next.cells[key(dest.x,dest.y)] || !after || !expected || after.x!==expected.x || after.y!==expected.y || after.distance!==before.distance)
        return '地下に食材があります。入口と出口を一緒に移設するか、搬送を終えてから変更してください';
    }
    return '';
  }
  function rotate(s,x,y){
    const e=at(s,x,y);if(!e)return '設備がありません';
    const rotated=rotatedEntity(e,1),next={...s,cells:{...s.cells,[key(x,y)]:rotated}};
    const error=preserveTunnels(s,next);if(error)return error;
    s.cells=next.cells;return '';
  }
  // Rendering-only topology: no change to existing lane acceptance/merge rules.
  function beltInputs(s,x,y){
    const e=at(s,x,y);if(e?.type!=='belt')return [];
    const inputs=[];
    for(let side=0;side<4;side++){
      if(side===e.dir)continue;
      const [dx,dy]=DIR[side],other=at(s,x+dx,y+dy),toward=(side+2)%4;
      if(!other)continue;
      if(other.type==='bridge' || (['belt','cat','source','machine','splitter'].includes(other.type)||other.type==='underground'&&other.option==='out')&&other.dir===toward
        || other.type==='splitter'&&(other.dir+3)%4===toward)inputs.push(side);
    }
    return inputs.length?inputs:[(e.dir+2)%4];
  }
  function unlockLevel(type, option) {
    if (type === 'bridge' || ['cucumber', 'nori', 'cucumberPrep', 'makiRoll'].includes(option)) return 2;
    if (type === 'splitter' || ['salmon', 'salmonPrep', 'salmonGrip'].includes(option)) return 1;
    return 0;
  }
  function entity(type, option, dir = 0) {
    return {type, option: option || '', dir, input: (dir + 2) % 4, filter: '', inv: {}, out: [], packet: null, h: null, v: null, progress: 0, activeRecipe: '', turn: 0, cost: COST[type]};
  }
  function create() {
    const s = {version: 2, tutorial: 'auto-v1', width: 14, height: 10, cells: {}, coins: 500, stage: 0, sold: {tunaSushi: 0, salmonSushi: 0, maki: 0}, ticks: 0, running: false, events: []};
    const add = (x, y, t, o, d) => s.cells[key(x, y)] = entity(t, o, d);
    for (const [y, raw, recipe] of [[2, 'rice', 'cook'], [7, 'tuna', 'prep']]) {
      add(1,y,'source',raw); add(2,y,'belt'); add(3,y,'machine',recipe); add(4,y,'belt'); add(5,y,'belt');
    }
    add(6,2,'belt','',1); add(6,3,'belt','',1); add(6,4,'belt','',1);
    add(6,7,'belt','',3); add(6,6,'belt','',3); add(6,5,'machine','grip');
    add(7,5,'belt'); add(8,5,'belt'); /* (9,5) is the tutorial gap */
    add(10,5,'belt'); add(11,5,'belt'); add(11,4,'counter');
    return s;
  }
  function introStep(s) {
    if(s.tutorial!=='auto-v1')return null;
    if(s.stage>0 || Object.values(s.sold).some(n=>n>0))return 'complete';
    // Only direct players to the fixed gap while the starter route still exists.
    const starter=create();
    for(const [k,expected] of Object.entries(starter.cells)) {
      const actual=s.cells[k];
      if(!actual || ['type','option','dir'].some(field=>actual[field]!==expected[field]))return 'custom';
    }
    if(Object.keys(s.cells).some(k=>!starter.cells[k] && k!=='9,5'))return 'custom';
    const gap=at(s,9,5);
    if(!gap)return 'connect';
    if(gap.type!=='belt'||gap.dir!==0)return 'repair';
    return s.running?'produce':'start';
  }
  function validatePlacement(s, x, y, type, option) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= s.width || y >= s.height) return '敷地の外には置けません';
    if (at(s,x,y)) return 'ここには設備があります。移設する場合は先に撤去してください';
    if (!COST[type]) return '設備を選んでください';
    if(type==='underground'&&!['in','out'].includes(option))return '地下の入口か出口を選んでください';
    if (type === 'source' && !['rice','tuna','salmon','cucumber','nori'].includes(option)) return '食材を選んでください';
    if (type === 'machine' && !Object.hasOwn(MACHINES,option)) return '調理台を選んでください';
    if (unlockLevel(type,option) > s.stage) return '注文を達成すると使えるようになります';
    if (s.coins < COST[type]) return '資金が足りません。寿司を提供するか、設備を撤去して費用を回収してください';
    return '';
  }
  function place(s,x,y,type,option='',dir=0) {
    const error = validatePlacement(s,x,y,type,option); if (error) return error;
    const next={...s,cells:{...s.cells,[key(x,y)]:entity(type,option,dir)}};
    const connectionError=preserveTunnels(s,next);if(connectionError)return connectionError;
    s.cells=next.cells;s.coins -= COST[type]; return '';
  }
  function remove(s,x,y) {
    const e = at(s,x,y); if (!e) return 'ここには設備がありません';
    const next={...s,cells:{...s.cells}};delete next.cells[key(x,y)];
    if(tunnelBusy(e))return '地下に食材があります。搬送を終えてから撤去してください';
    const error=preserveTunnels(s,next);if(error)return error;
    s.coins += e.cost;s.cells=next.cells;return '';
  }
  function accepts(e, item, dir, viaCat) {
    if (!e) return false;
    if(e.type==='underground')return e.option==='in'&&dir===e.dir&&!e.packet;
    if (e.type === 'belt' || e.type === 'splitter') return !e.packet;
    if (e.type === 'bridge') return !e[dir % 2 ? 'v' : 'h'];
    if (e.type === 'machine') return viaCat && inputTypes(e.option).includes(item) && (e.inv[item] || 0) < 4;
    return e.type === 'counter' && viaCat && !e.mealTicks && !!PRICE[item];
  }
  function put(s,e,item,dir) {
    if (e.type === 'belt' || e.type === 'splitter' || e.type==='underground') e.packet = {type: item, dir};
    else if (e.type === 'bridge') e[dir % 2 ? 'v' : 'h'] = {type:item, dir};
    else if (e.type === 'machine') e.inv[item] = (e.inv[item] || 0) + 1;
    else if (e.type === 'counter') { s.sold[item]++; s.coins += PRICE[item]; e.mealTicks = MEAL_TICKS; }
  }
  function peek(e, axis, filter) {
    if (!e || e.type==='underground'&&e.option==='in') return null;
    const p = e.type === 'bridge' ? e[axis % 2 ? 'v' : 'h'] : e.packet;
    const item = p?.type || e.out[0];
    return item && (!filter || filter === item) ? item : null;
  }
  function take(e,axis) {
    if(e.type === 'bridge') e[axis % 2 ? 'v' : 'h'] = null;
    else if(e.packet) e.packet = null;
    else e.out.shift();
  }
  function step(s) {
    if (!s.running) return;
    s.ticks++; s.events = [];
    // A snapshot prevents a new item moving twice within a simulation step.
    const entries = Object.entries(s.cells);
    const snapshot = new Map(entries.map(([k,e]) => [k, {packet:e.packet, h:e.h, v:e.v, out:e.out[0]}]));
    // Rotate priority so busy merges and multiple cats share transport fairly.
    const offset = s.ticks % Math.max(1,entries.length);
    const ordered = entries.slice(offset).concat(entries.slice(0,offset));
    // Guests take a plate already beside them before its lane advances.
    // Removing the packet here also prevents a second guest or cat claiming it.
    for (const [k, seat] of ordered) {
      if (seat.type !== 'counter') continue;
      // Age the previous meal before either a guest or a cat can claim a plate.
      if (seat.mealTicks > 0) seat.mealTicks--;
      if (seat.mealTicks > 0) continue;
      const [x, y] = k.split(',').map(Number);
      for (let i = 0; i < DIR.length; i++) {
        const side = (seat.turn + i) % DIR.length;
        const [dx, dy] = DIR[side];
        const lane = at(s, x + dx, y + dy);
        if (!surfaceLane(lane)) continue;
        const slot = lane.type === 'bridge' ? (side % 2 ? 'v' : 'h') : 'packet';
        const plate = lane[slot];
        if (!plate || !PRICE[plate.type]) continue;
        lane[slot] = null;
        put(s, seat, plate.type, side);
        seat.turn = (side + 1) % DIR.length;
        break;
      }
    }
    const touched = new Set();
    // Stations collect only packets present at the start of this step.
    // Intake direction rotates independently of recipe selection.
    for (const [k, machine] of ordered) {
      if (machine.type !== 'machine') continue;
      const [x,y] = k.split(',').map(Number);
      for (let i=0;i<DIR.length;i++) {
        const side=(s.ticks+i)%DIR.length, [dx,dy]=DIR[side];
        const sourceKey=key(x+dx,y+dy), lane=at(s,x+dx,y+dy);
        if (!surfaceLane(lane)) continue;
        const slot=lane.type==='bridge' ? (side%2?'v':'h') : 'packet';
        const packet=snapshot.get(sourceKey)?.[slot];
        if (!packet || lane[slot]!==packet || touched.has(sourceKey+':'+slot)) continue;
        if (!accepts(machine,packet.type,side,true)) continue;
        lane[slot]=null;
        touched.add(sourceKey+':'+slot);
        put(s,machine,packet.type,side);
        break;
      }
    }
    for (const [k,e] of ordered) {
      const [x,y] = k.split(',').map(Number);
      if (e.type === 'belt' || e.type === 'splitter' || e.type === 'bridge' || e.type==='underground'&&e.option==='out') {
        const slots = e.type === 'bridge' ? ['h','v'] : ['packet'];
        for (const slot of slots) {
          const p = snapshot.get(k)[slot]; if (!p || e[slot] !== p || touched.has(k+':'+slot)) continue;
          let dirs = [e.type === 'bridge' ? p.dir : e.dir];
          if (e.type === 'splitter') dirs = e.filter ? [p.type === e.filter ? (e.dir+3)%4 : e.dir] : (e.turn % 2 ? [(e.dir+3)%4,e.dir] : [e.dir,(e.dir+3)%4]);
          for (const d of dirs) {
            const [dx,dy]=DIR[d], target=at(s,x+dx,y+dy);
            if(accepts(target,p.type,d,false)) { put(s,target,p.type,d); e[slot]=null; e.turn++; break; }
          }
        }
      } else if (e.type === 'source' || e.type === 'machine') {
        const item=snapshot.get(k).out;
        const [dx,dy]=DIR[e.dir], target=at(s,x+dx,y+dy);
        if (item && e.out[0]===item && !touched.has(k+':out')
          && target && ['belt','splitter','bridge','underground'].includes(target.type)
          && accepts(target,item,e.dir,false)) {
          e.out.shift();
          touched.add(k+':out');
          put(s,target,item,e.dir);
        }
      } else if (e.type === 'cat') {
        const [ix,iy]=DIR[e.input], [ox,oy]=DIR[e.dir];
        const sk=key(x+ix,y+iy), source=at(s,x+ix,y+iy), target=at(s,x+ox,y+oy);
        const item=peek(source,e.input,e.filter), old=snapshot.get(sk);
        const slot=source?.type === 'bridge' ? (e.input%2?'v':'h') : source?.packet ? 'packet' : 'out';
        const was=old && (slot==='out' ? old.out===item : old[slot] && source[slot]===old[slot]);
        if(item && was && !touched.has(sk+':'+slot) && accepts(target,item,e.dir,true)) {
          take(source,e.input); touched.add(sk+':'+slot); put(s,target,item,e.dir); e.progress=2;
        } else e.progress=0;
      }
    }
    // Advance hidden cells after surface transport: fresh packets cannot move twice.
    for(const [k,e] of entries){
      if(e.type!=='underground'||e.option!=='in')continue;
      const [x,y]=k.split(',').map(Number),partner=tunnelPartner(s,x,y);
      if(!partner)continue;
      const exit=at(s,partner.x,partner.y),length=partner.distance-1;
      if(!e.tunnel?.some(Boolean) && e.tunnel?.length!==length)e.tunnel=Array(length).fill(null);
      const queue=e.tunnel;
      if(length && queue[length-1] && !exit.packet){exit.packet=queue[length-1];queue[length-1]=null;}
      for(let i=length-2;i>=0;i--)if(queue[i]&&!queue[i+1]){queue[i+1]=queue[i];queue[i]=null;}
      const packet=snapshot.get(k).packet;
      if(packet && e.packet===packet){
        if(!length&&!exit.packet){exit.packet=packet;e.packet=null;}
        else if(length&&!queue[0]){queue[0]=packet;e.packet=null;}
      }
    }
    for (const [,e] of entries) {
      if (e.type === 'source') {
        if(e.out.length < 4 && ++e.progress >= 6) {e.out.push(e.option); e.progress=0;}
      } else if(e.type === 'machine') {
        processMachine(e);
      }
    }
    const g=GOALS[s.stage];
    if(g && s.sold[g.item]>=g.count) {
      s.coins+=g.reward; s.stage++; [s.width,s.height]=SIZE[s.stage];
      s.events.push('注文達成！ '+g.unlock+'を解放。資金 +'+g.reward);
    }
  }
  function status(e) {
    if(e.type==='underground')return e.option==='in'?'地下入口：'+(e.tunnel?.filter(Boolean).length||0)+'個を地下で搬送中':'地下出口：'+(e.packet?'出口に食材があります':'食材待ち');
    if(e.type==='machine') {
      if(e.out.length>=4) return '搬出口が満杯';
      if(e.progress) return ITEMS[RECIPES[e.activeRecipe].output][0]+'を調理中';
      const choices=MACHINES[e.option].recipes;
      if(choices.some(id=>Object.entries(RECIPES[id].inputs).every(([item,n])=>e.inv[item]>=n))) return '準備完了';
      if(e.option==='grip') return e.inv.shari ? '魚のネタ待ち' : 'シャリ待ち';
      if(e.option==='prep') return '仕込む食材待ち';
      return Object.keys(RECIPES[choices[0]].inputs).filter(i=>!e.inv[i]).map(i=>ITEMS[i][0]).join('・')+'待ち';
    }
    if(e.type==='source') return e.out.length>=4 ? '搬出口が満杯' : '入荷中（無料）';
    if(e.type==='cat') return e.progress ? '受け渡し中' : '食材・受け渡し先を確認';
    if(e.type==='counter') {
      if (e.mealTicks) return '食事中（残り' + Math.ceil(e.mealTicks * STEP_MS / 1000) + '秒）';
      return '寿司待ち：上下左右のレーンから完成皿を取ります';
    }
    return (e.packet || e.h || e.v) ? '搬送中・前が埋まると停止' : '食材を待っています';
  }
  function save(s) { return JSON.stringify({...s,running:false,events:[]}); }
  function restore(json) {
    const v=JSON.parse(json);
    const int=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max;
    if(!v || ![1,2].includes(v.version) || !int(v.stage,3) || !int(v.coins,1e12) || !int(v.ticks,1e12) || !v.cells || typeof v.cells!=='object' || !v.sold) throw Error('保存データの形式が違います');
    if(Object.keys(PRICE).some(i=>!int(v.sold[i],1e12))) throw Error('提供数が不正です');
    const [w,h]=SIZE[v.stage]; if(v.width!==w || v.height!==h) throw Error('敷地サイズが不正です');
    for(const [k,e] of Object.entries(v.cells)) {
      const [x,y]=k.split(',').map(Number);
      if(key(x,y)!==k || !int(x,w-1) || !int(y,h-1) || !e || !COST[e.type] || e.cost!==COST[e.type] || !int(e.dir,3) || !int(e.input,3) || !int(e.progress,100) || !int(e.turn,1e12) || !e.inv || !Array.isArray(e.out) || e.out.length>4 || e.out.some(i=>!ITEMS[i]) || (e.filter && !ITEMS[e.filter])) throw Error('設備データが不正です');
      if (e.type === 'counter' && e.mealTicks !== undefined && !int(e.mealTicks, MEAL_TICKS))
        throw Error('客席の食事時間が不正です');
      if(v.version===1 && e.type==='machine') {
        const old=e.option;
        if(!Object.hasOwn(machineForRecipe,old) || unlockLevel('machine',old)>v.stage) throw Error('旧設備の種類が不正です');
        e.option=machineForRecipe[old];
        e.activeRecipe=e.progress ? old : '';
      }
      if(e.type==='machine' && e.progress && (!MACHINES[e.option]?.recipes.includes(e.activeRecipe) || e.progress>RECIPES[e.activeRecipe].time)) throw Error('調理途中のデータが不正です');
      if(unlockLevel(e.type,e.option)>v.stage || (e.type==='machine' && !Object.hasOwn(MACHINES,e.option)) || (e.type==='source' && !['rice','tuna','salmon','cucumber','nori'].includes(e.option))) throw Error('設備の種類が不正です');
      for(const [i,n] of Object.entries(e.inv)) if(!ITEMS[i] || !int(n,4)) throw Error('材料数が不正です');
      for(const slot of ['packet','h','v']) if(e[slot] && (!ITEMS[e[slot].type] || !int(e[slot].dir,3))) throw Error('搬送データが不正です');
    }
    for(const [k,e] of Object.entries(v.cells)){
      if(e.type!=='underground')continue;
      if(!['in','out'].includes(e.option) || (e.tunnel!==undefined&&(!Array.isArray(e.tunnel)||e.tunnel.length>4)))throw Error('地下設備が不正です');
      if(e.option==='out'&&e.tunnel?.length)throw Error('地下出口の保存が不正です');
      if(e.tunnel?.some(p=>p&&(!ITEMS[p.type]||p.dir!==e.dir)))throw Error('地下の食材が不正です');
      if(tunnelBusy(e)){
        const [x,y]=k.split(',').map(Number),partner=tunnelPartner(v,x,y);
        if(!partner||e.tunnel.length!==partner.distance-1)throw Error('地下の接続が不正です');
      }
    }
    v.version=2;v.running=false;v.events=[];return v;
  }
  function selectRect(s, a, b) {
    return Object.keys(s.cells).map(k => {
      const [x,y] = k.split(',').map(Number); return {x,y};
    }).filter(c => c.x >= Math.min(a.x,b.x) && c.x <= Math.max(a.x,b.x)
      && c.y >= Math.min(a.y,b.y) && c.y <= Math.max(a.y,b.y));
  }
  // Keep the selection's bounding-box top left fixed while rotating its contents.
  function moveTargets(cells, dx, dy, turns=0) {
    const left=Math.min(...cells.map(c=>c.x)), top=Math.min(...cells.map(c=>c.y));
    const width=Math.max(...cells.map(c=>c.x))-left+1;
    const height=Math.max(...cells.map(c=>c.y))-top+1;
    return cells.map(c=>{
      let x=c.x-left, y=c.y-top, w=width, h=height;
      for(let i=0;i<turns;i++) { [x,y]=[h-1-y,x]; [w,h]=[h,w]; }
      return {x:left+dx+x,y:top+dy+y};
    });
  }
  function rotatedEntity(e, turns=0) {
    if(!turns)return e;
    const result={...e,dir:(e.dir+turns)%4,input:(e.input+turns)%4};
    for(const slot of ['packet','h','v']) {
      result[slot]=e[slot]?{...e[slot],dir:(e[slot].dir+turns)%4}:null;
    }
    if(e.tunnel)result.tunnel=e.tunnel.map(p=>p?{...p,dir:(p.dir+turns)%4}:null);
    if(turns%2) [result.h,result.v]=[result.v,result.h];
    return result;
  }
  function validateMove(s, cells, dx, dy, turns=0) {
    if (s.running) return '移設する前に工場を停止してください';
    if (!Array.isArray(cells) || !cells.length) return '設備を選択してください';
    if (!Number.isInteger(dx) || !Number.isInteger(dy)) return '移動先が不正です';
    if (!Number.isInteger(turns) || turns<0 || turns>3) return '回転角度が不正です';
    const sources = new Set();
    for (const c of cells) {
      if (!c || !Number.isInteger(c.x) || !Number.isInteger(c.y) || !at(s,c.x,c.y)) return '選択した設備がありません';
      const k = key(c.x,c.y);
      if (sources.has(k)) return '同じ設備が重複しています';
      sources.add(k);
    }
    for (const {x,y} of moveTargets(cells,dx,dy,turns)) {
      if (x<0 || y<0 || x>=s.width || y>=s.height) return '敷地の外には移設できません';
      if (at(s,x,y) && !sources.has(key(x,y))) return '移動先に別の設備があります';
    }
    const targets=moveTargets(cells,dx,dy,turns),mapping={},next={...s,cells:{...s.cells}};
    for(const c of cells)delete next.cells[key(c.x,c.y)];
    cells.forEach((c,i)=>{mapping[key(c.x,c.y)]=targets[i];next.cells[key(targets[i].x,targets[i].y)]=rotatedEntity(at(s,c.x,c.y),turns);});
    return preserveTunnels(s,next,mapping);
  }
  function moveEntities(s, cells, dx, dy, turns=0) {
    const error = validateMove(s,cells,dx,dy,turns);
    if (error) return error;
    const next = {...s.cells};
    for (const c of cells) delete next[key(c.x,c.y)];
    const targets=moveTargets(cells,dx,dy,turns);
    cells.forEach((c,i)=>{next[key(targets[i].x,targets[i].y)]=rotatedEntity(at(s,c.x,c.y),turns);});
    s.cells = next;
    return '';
  }
  const api={TUNNEL_MAX_DISTANCE,tunnelPartner,tunnelBusy,beltInputs,rotate,introStep,moveTargets,rotatedEntity,selectRect,validateMove,moveEntities,STEP_MS,MEAL_TICKS,DIR,ITEMS,RECIPES,MACHINES,inputTypes,COST,PRICE,GOALS,SIZE,key,at,entity,create,place,remove,step,status,save,restore,unlockLevel,accepts};
  if(typeof module!=='undefined') module.exports=api; else root.SushiEngine=api;
})(typeof window!=='undefined'?window:globalThis);
