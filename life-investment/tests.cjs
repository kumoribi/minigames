'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('./engine.js'),AI=require('./ai.js');
let count=0;const statementsOnly=process.argv.includes('--statements-only');
function test(name,fn){if(statementsOnly&&!name.startsWith('statement:'))return;fn();count++;console.log('PASS',name);}
function make(n=3){const s=E.create(71,Array(n).fill('human'));s.phase='turn';s.leader=0;s.active=0;s.turnOrder=Array.from({length:n},(_,i)=>i);s.turnIndex=0;s.players[0].turns=1;return s;}
function act(s,a){const r=E.dispatch(s,a);assert(r.ok,r.error);E.assertState(r.state);return r.state;}
function reject(s,a){const raw=JSON.stringify(s),r=E.dispatch(s,a);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),raw);return r.error;}
function own(s,id,k=10,cid='sun'){const c=s.companies.find(c=>c.id===cid);for(let i=0;i<k;i++)c.stocks.push({id:'id'+s.nextId++,company:cid,owner:id,cost:c.stocks.length+1,round:s.round});}
function offer(s,lender,principal,rate=10){const o={id:'id'+s.nextId++,lender,principal,rate,order:s.nextId};s.offers.push(o);return o;}
function ordinary(s,borrower,principal,rate=5,lender='bank') {const cash=s.players[borrower].cash;s.players[borrower].cash=Math.max(cash,principal);const o=offer(s,lender,principal,rate);const a=s.active;s.active=borrower;s.financeUsed=false;const r=E.dispatch(s,{type:'borrow',offer:o.id});assert(r.ok,r.error);r.state.active=a;return r.state;}

test('500 initial cash, six companies/properties, unchanged 10 happiness and integer currency',()=>{
 const s=E.create(1);assert.equal(s.players[0].cash,500);assert.equal(E.happyPrice(s),10);assert.equal(s.companies.length,6);assert.deepEqual(s.properties.map(p=>p.price),[400,1500,5000,10000,30000,100000]);assert.equal(s.phase,'ready');E.assertState(s);
});
test('same company can be traded without a count limit, other principal actions are locked',()=>{
 let s=make();s=act(s,{type:'buyStock',company:'sun'});s=act(s,{type:'buyStock',company:'sun'});const t=s.companies[0].stocks.find(t=>t.owner===0);s=act(s,{type:'sellStock',company:'sun',stock:t.id});assert.equal(s.tradeCount,3);assert.equal(s.tradeCompany,'sun');reject(s,{type:'buyStock',company:'wave'});s=act(s,{type:'buyHappy'});assert.equal(s.tradeCompany,'sun');assert.equal(s.mainUsed,true);reject(s,{type:'buyProperty',property:'apartment'});s=act(s,{type:'end'});assert.equal(s.tradeCompany,null);
});
test('middle sale preserves cost/owners; round trip cannot create cash',()=>{
 let s=make();s=act(s,{type:'buyStock',company:'sun'});const t=s.companies[0].stocks.at(-1);s=act(s,{type:'sellStock',company:'sun',stock:t.id});assert.equal(s.players[0].cash,499);own(s,0,1);own(s,1,1);const before=s.companies[0].stocks.at(-1);s=act(s,{type:'sellStock',company:'sun',stock:E.stocks(s,0)[0].id});assert.deepEqual(s.companies[0].stocks.at(-1),before);
});
test('zero price, NPC declines below initial and atomic illegal actions',()=>{
 let s=make();s.companies[0].stocks=[];s=act(s,{type:'buyStock',company:'sun'});assert.equal(s.players[0].cash,499);s=act(s,{type:'sellStock',company:'sun',stock:E.stocks(s,0)[0].id});assert.equal(s.players[0].cash,499);reject(s,{type:'sellStock',company:'sun',stock:'missing'});reject(s,{type:'end',revision:99});
});
test('bulk stock order equals sequential purchases including cards, costs, logs and trade count',()=>{
 for(const cid of ['sun','wave','space'])for(const quantity of [1,3,5,10]){
  const initial=make();let sequential=initial;
  for(let i=0;i<quantity;i++)sequential=act(sequential,{type:'buyStock',company:cid});
  const bulk=act(initial,{type:'buyStock',company:cid,quantity});
  sequential.revision=bulk.revision;assert.deepEqual(bulk,sequential);
  reject(bulk,{type:'buyStock',company:cid==='sun'?'wave':'sun',quantity:2});
 }
 let s=make();s.players[0].cash=24;s=act(s,{type:'buyStock',company:'sun',quantity:3});
 assert.equal(s.players[0].cash,0);assert.deepEqual(E.stocks(s,0).map(t=>t.cost),[7,8,9]);
 s=act(s,{type:'sellStock',company:'sun',stock:E.stocks(s,0)[1].id});assert.equal(s.players[0].cash,8);assert.deepEqual(E.stocks(s,0).map(t=>t.cost),[7,9]);
});
test('invalid or unaffordable bulk orders are atomic and revision guard prevents duplicate purchase',()=>{
 const s=make();s.players[0].cash=23;
 for(const quantity of [0,-1,1.5,NaN,Infinity,'3',null,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,3])reject(s,{type:'buyStock',company:'sun',quantity});
 const a={type:'buyStock',company:'sun',quantity:2,revision:s.revision};const next=act(s,a);reject(next,a);
 s.phase='ready';reject(s,{type:'buyStock',company:'sun',quantity:2});
});
test('event reference matches 26 cards, protected property sales, buyback counts and 25 shuffled decks',()=>{
 const C=require('./cards.js');assert.equal(C.events.reduce((n,e)=>n+e.copies,0),26);assert.equal(C.events.filter(e=>e.kind==='buyback').reduce((n,e)=>n+e.copies,0),8);
 assert.deepEqual(C.companies.map(c=>E.buybackCount(c.id)),[4,1,3,5,2,1]);
 for(const key of ['earn','bad','sell','boom','recession','salePlus','saleMinus'])assert.equal(C.events.find(e=>e.key===key).copies,2);
 for(const key of ['ease','tight','vacant','tenant'])assert.equal(C.events.find(e=>e.key===key).copies,1);
 for(let seed=0;seed<25;seed++){
  const s=E.create(seed);assert.equal(s.deck.length,26);
  for(const e of C.events){assert.equal(s.deck.filter(d=>d.key===e.key).length,e.copies);assert(e.description.length>15);}
 }
});

test('credit leaves all cash usable; borrowed cash does not create more credit',()=>{
 let s=make();assert.equal(E.creditProfile(s,0).remaining,500);
 s=act(s,{type:'borrow',offer:s.offers[0].id});assert.equal(s.players[0].cash,700);assert.equal(E.spendable(s,0),700);
 assert.deepEqual(E.creditProfile(s,0),{stock:0,property:0,ownCash:500,limit:500,outstanding:200,remaining:300});
 s.financeUsed=false;const o=offer(s,'bank',300);s=act(s,{type:'borrow',offer:o.id});assert.equal(E.spendable(s,0),1000);assert.equal(E.creditProfile(s,0).remaining,0);
 const bad=offer(s,'bank',1);s.financeUsed=false;reject(s,{type:'borrow',offer:bad.id});
});
test('no fixed total 50 or two contract cap',()=>{
 let s=make();for(let i=0;i<3;i++){const o=offer(s,'bank',100);s.financeUsed=false;s=act(s,{type:'borrow',offer:o.id});}assert.equal(s.loans.length,3);assert.equal(E.debt(s,0),300);
});
test('borrowed cash is spendable and repayment only reduces cash and debt',()=>{
 let s=make();s=act(s,{type:'borrow',offer:s.offers[0].id});s=act(s,{type:'buyStock',company:'sun'});assert.equal(s.players[0].cash,693);
 s.financeUsed=false;s=act(s,{type:'repay',loan:s.loans[0].id});assert.equal(s.players[0].cash,493);assert.equal(E.spendable(s,0),493);assert.equal(E.debt(s,0),0);
});
test('property counts at 50% in credit, remains sellable during a loan, and credit recalculates',()=>{
 let s=make();s=act(s,{type:'buyProperty',property:'apartment'});assert.equal(E.creditProfile(s,0).property,200);
 s=act(s,{type:'borrow',offer:s.offers[0].id});assert.equal(E.creditProfile(s,0).remaining,100);assert(!('collateral' in s.loans[0]));
 s.phase='event';s.pending={owner:0,rate:20,eventId:'x'};s=act(s,{type:'eventSell',property:'apartment'});assert.equal(s.players[0].cash,780);assert.equal(E.creditProfile(s,0).property,0);assert.equal(E.debt(s,0),200);
});
test('stock credit is half of total sequential proceeds and shares remain sellable',()=>{
 let s=make();own(s,0,10);const value=E.money(E.stockValue(s,0),50);assert.equal(E.creditProfile(s,0).stock,value);
 const id=E.stocks(s,0)[0].id;s=act(s,{type:'borrow',offer:offer(s,'bank',10).id});assert.equal(s.loans[0].creditAtIssue.stock,value);
 s=act(s,{type:'sellStock',company:'sun',stock:id});assert(!E.stocks(s,0).some(x=>x.id===id));assert.equal(E.debt(s,0),10);
});
test('existing loans consume credit once; falling credit does not liquidate existing debt',()=>{
 let s=make();s=act(s,{type:'borrow',offer:offer(s,'bank',200).id});s.financeUsed=false;s=act(s,{type:'borrow',offer:offer(s,'bank',200).id});assert.equal(E.creditProfile(s,0).remaining,100);
 s.players[0].cash=0;assert.equal(E.creditProfile(s,0).remaining,0);E.assertState(s);assert.equal(s.loans.length,2);s.financeUsed=false;reject(s,{type:'borrow',offer:offer(s,'bank',1).id});
 const invalid=structuredClone(s);invalid.loans[0].creditAtIssue.remaining=-1;assert.throws(()=>E.assertState(invalid));
 const old=structuredClone(s);old.loans[0].collateral={cash:0,stockIds:[],propertyIds:[],value:0};assert.throws(()=>E.assertState(old));
});
test('publishing freely priced cards does not reserve cash, persists and cannot be self-borrowed',()=>{
 let s=make();s=act(s,{type:'offer',principal:1000,rate:19.25});assert.equal(s.players[0].cash,500);const o=s.offers.at(-1);assert.equal(o.rate,19.25);s.financeUsed=false;reject(s,{type:'borrow',offer:o.id});s=act(s,{type:'end'});assert(s.offers.some(x=>x.id===o.id));
});
test('rates accept 0 through 20 and decimals; invalid rates/principal have no side effects',()=>{
 for(const rate of [-1,20.01,1.001,NaN])reject(make(),{type:'offer',principal:200,rate});reject(make(),{type:'offer',principal:0,rate:10});let s=act(make(),{type:'offer',principal:200,rate:0});assert.equal(E.interest(s.offers.at(-1)),0);s=act(make(),{type:'offer',principal:200,rate:20});assert.equal(E.interest(s.offers.at(-1)),40);
});
test('player loan transfers exactly once without prior reserve when cash exists',()=>{
 let s=make();const o=offer(s,1,100,18);s=act(s,{type:'borrow',offer:o.id});assert.equal(s.players[0].cash,600);assert.equal(s.players[1].cash,400);assert.equal(s.loans[0].lender,1);reject(s,{type:'borrow',offer:o.id});
});
test('cashless lender is forced into emergency finance even outside their own turn',()=>{
 let s=make();s.players[1].cash=0;s.offers=[];const o=offer(s,1,100,18);s=act(s,{type:'borrow',offer:o.id});assert.equal(s.players[0].cash,600);assert.equal(s.players[1].cash,0);const e=s.loans.find(l=>l.borrower===1);assert(e.emergency);assert.equal(e.rate,20);assert.equal(e.principal,100);assert.equal(e.dueTurn,1);assert.equal(s.financeUsed,true);
});
test('forced funding prefers cheapest eligible external card and preserves excess cash',()=>{
 let s=make();s.offers=[];s.players[1].cash=40;s.properties[0].owner=1;s.properties[0].cost=400;const cheap=offer(s,'bank',100,4);offer(s,'bank',100,15);const o=offer(s,1,100,18);s=act(s,{type:'borrow',offer:o.id});const l=s.loans.find(l=>l.borrower===1);assert.equal(l.rate,4);assert.equal(s.players[1].cash,40);assert(!s.offers.some(x=>x.id===cheap.id));assert(!s.loans.some(l=>l.emergency));
});
test('recursive player funding is finite and cannot cycle through the original borrower',()=>{
 let s=make();s.offers=[];s.players[1].cash=0;s.players[2].cash=0;for(const id of [1,2]){const p=s.properties[id-1];p.owner=id;p.cost=400;}
 offer(s,0,100,1);const b=offer(s,1,100,10);offer(s,2,100,5);s=act(s,{type:'borrow',offer:b.id});assert.equal(s.loans.length,3);assert(s.loans.some(l=>l.emergency&&l.borrower===2));assert(s.offers.some(o=>o.lender===0));assert.equal(s.players[0].cash,600);assert.equal(s.players[1].cash,0);assert.equal(s.players[2].cash,0);
});
test('emergency is unsecured at 20%, with next own turn deadline, not next global turn',()=>{
 let s=make();s.players[0].cash=0;s=act(s,{type:'borrow',offer:'emergency',principal:100});const l=s.loans[0];assert.equal(l.rate,20);assert.equal(l.dueTurn,2);assert.equal(l.creditAtIssue,null);assert.equal(E.repaymentTotal(l),120);s=act(s,{type:'end'});assert(!s.players[0].bankrupt);assert.equal(s.active,1);
});
test('emergency cannot be renewed and forced additions retain original deadline',()=>{
 let s=make();s=act(s,{type:'borrow',offer:'emergency',principal:100});s.financeUsed=false;reject(s,{type:'borrow',offer:'emergency',principal:100});s.offers=[];s.players[0].cash=0;const o=offer(s,0,50,15);s=act(s,{type:'end'});s=act(s,{type:'borrow',offer:o.id});const l=s.loans.find(l=>l.borrower===0&&l.emergency);assert.equal(l.principal,150);assert.equal(l.dueTurn,2);
});
test('due emergency is repaid at end without using finance slot',()=>{
 let s=make();s=act(s,{type:'borrow',offer:'emergency',principal:100});s.players[0].turns=2;s.financeUsed=true;s=act(s,{type:'end'});assert(!s.players[0].bankrupt);assert.equal(s.loans.filter(l=>l.borrower===0).length,0);assert.equal(s.players[0].cash,480);
});
test('overdue insolvency eliminates despite highest happiness, cancels offers and skips turns',()=>{
 let s=make();s=act(s,{type:'borrow',offer:'emergency',principal:100});s.players[0].cash=0;s.players[0].turns=2;s.happiness.push({id:'won',owner:0});offer(s,0,200,15);s=act(s,{type:'end'});assert(s.players[0].bankrupt);assert(!s.offers.some(o=>o.lender===0));assert.equal(s.active,1);s=act(s,{type:'end'});s=act(s,{type:'end'});assert.notEqual(s.active,0);assert(!s.winners.includes(0));
});
test('last surviving player wins immediately; all eliminated gives no winner',()=>{
 let s=make(2);s=act(s,{type:'borrow',offer:'emergency',principal:100});s.players[0].cash=0;s.players[0].turns=2;s=act(s,{type:'end'});assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[1]);
 s=make(2);s.players[1].bankrupt=true;s=act(s,{type:'borrow',offer:'emergency',principal:100});s.players[0].cash=0;s.players[0].turns=2;s=act(s,{type:'end'});assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[]);
});
test('player market can refinance emergency at 20%, and ordinary same-rate replacements are rejected',()=>{
 let s=make();s=act(s,{type:'borrow',offer:'emergency',principal:100});s.financeUsed=false;const o=offer(s,1,100,20);s=act(s,{type:'refinance',loan:s.loans[0].id,offer:o.id});assert(!s.loans.some(l=>l.emergency));assert.equal(s.loans[0].rate,20);assert.equal(s.players[0].cash,580);s.financeUsed=false;const again=offer(s,1,100,20);reject(s,{type:'refinance',loan:s.loans[0].id,offer:again.id});
});
test('refinancing failure rolls back old credit, card, cash and emergency chain',()=>{
 let s=make();s=act(s,{type:'borrow',offer:'emergency',principal:200});s.players[0].cash=0;s.financeUsed=false;const o=offer(s,1,200,10);reject(s,{type:'refinance',loan:s.loans[0].id,offer:o.id});assert(s.loans[0].emergency);
});
test('property event sale ±20% respects integer flooring and does not use main action',()=>{
 for(const [rate,expected] of [[20,480],[-20,320]]){let s=make();s.properties[0].owner=0;s.properties[0].cost=400;s.phase='event';s.pending={owner:0,rate,eventId:'x'};s=act(s,{type:'eventSell',property:'apartment'});assert.equal(s.players[0].cash,500+expected);assert.equal(s.mainUsed,false);reject(s,{type:'eventSell',property:'apartment'});}
});
test('per-contract interest floors without floating point currency errors',()=>{
 assert.equal(E.interest({principal:30,rate:5})*2,2);assert.equal(E.interest({principal:1000,rate:0.1}),1);assert.equal(E.interest({principal:10,rate:5}),0);assert.equal(E.money(50,85),42);
});
test('happiness keeps current price and counts NPC permanent cards correctly',()=>{
 let s=make();s.happiness=[{id:'h1',owner:'npc'},{id:'h2',owner:1}];s=act(s,{type:'buyHappy'});assert.equal(s.players[0].cash,488);assert.equal(E.happyPrice(s),13);assert.equal(E.happiness(s,0),1);assert.equal(s.mainUsed,false);s=act(s,{type:'buyStock',company:'sun'});s=act(s,{type:'buyHappy'});assert.equal(E.happiness(s,0),2);
});
test('final maturity cannot hide a last-round emergency and bankrupt is excluded from points',()=>{
 let s=make();s.round=24;s.turnIndex=2;s.active=2;s.players[2].turns=1;s=act(s,{type:'borrow',offer:'emergency',principal:1000});s.players[2].cash=0;s.happiness.push({id:'h',owner:2});s=act(s,{type:'end'});while(s.phase==='rescue')s=act(s,{type:'restructure'});assert.equal(s.phase,'finished');assert(s.players[2].bankrupt);assert(!s.winners.includes(2));
});
test('schema, owner, deadline and configuration validation reject corrupt restored data',()=>{
 const s=make();for(const mutate of [x=>x.schemaVersion=1,x=>x.config.cash=1,x=>x.companies[0].stocks[0].owner=99,x=>x.players[0].cash=-1]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>E.assertState(bad));}
 let withLoan=act(s,{type:'borrow',offer:'emergency',principal:100});withLoan.loans[0].dueTurn=null;assert.throws(()=>E.assertState(withLoan));
});
test('storage v4 preserves v1/v2/v3 byte-for-byte and detects other tabs',()=>{
 const disk=new Map([['life-investment-save-v1','OLD-V1-BYTES'],['life-investment-save-v2','OLD-V2-BYTES'],['life-investment-save-v3','OLD-V3-BYTES']]);
 const ctx={LifeEngine:E,localStorage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)}};ctx.globalThis=ctx;
 vm.runInNewContext(fs.readFileSync(__dirname+'/storage.js','utf8'),ctx);assert.equal(ctx.LifeStorage.read(),null);assert(ctx.LifeStorage.hasLegacy());assert.equal(ctx.LifeStorage.legacySaves().length,3);
 ctx.LifeStorage.save(make());assert.equal(disk.get('life-investment-save-v1'),'OLD-V1-BYTES');assert.equal(disk.get('life-investment-save-v2'),'OLD-V2-BYTES');assert.equal(disk.get('life-investment-save-v3'),'OLD-V3-BYTES');assert.equal(ctx.LifeStorage.read().schemaVersion,4);
 disk.set('life-investment-save-v4','other');assert.throws(()=>ctx.LifeStorage.save(make()));
});
test('legacy engine can still validate and play its own saved v1 configuration',()=>{
 const legacy=require('./legacy/engine.js'),s=legacy.create(19);assert.equal(s.schemaVersion,1);assert.equal(s.players[0].cash,60);assert(legacy.assertState(s));assert(legacy.dispatch(s,{type:'start'}).ok);
});

test('legacy v2 retains cash locks and can still validate and play its own save',()=>{
 const legacy=require('./legacy-v2/engine.js');let s=legacy.create(19,['human','human']);assert.equal(s.schemaVersion,2);assert.equal(s.players[0].cash,500);s.phase='turn';s.leader=0;s.active=0;s.turnOrder=[0,1];s.turnIndex=0;s.players[0].turns=1;
 const r=legacy.dispatch(s,{type:'borrow',offer:s.offers[0].id});assert(r.ok,r.error);s=r.state;assert(legacy.assertState(s));assert.equal(s.players[0].cash,700);assert.equal(legacy.spendable(s,0),500);
});

test('same seed and input reproduce future events without time-dependent rule changes',()=>{
 let a=make(),b=JSON.parse(JSON.stringify(a));for(const action of [{type:'buyStock',company:'sun'},{type:'buyStock',company:'sun'},{type:'end'},{type:'buyHappy'},{type:'end'},{type:'end'}]){a=act(a,action);b=act(b,action);}assert.deepEqual(a,b);
});

test('repeated happiness buys use 10, 11, 12 with no main/finance use or duplicate revision',()=>{
 let s=make();for(let i=0;i<3;i++)s=act(s,{type:'buyHappy'});
 assert.equal(s.players[0].cash,467);assert.equal(E.happiness(s,0),3);assert.equal(E.happyPrice(s),13);assert.equal(s.mainUsed,false);assert.equal(s.financeUsed,false);assert.equal(s.tradeCompany,null);
 const a={type:'buyHappy',revision:s.revision};s=act(s,a);reject(s,a);assert.equal(E.happiness(s,0),4);
});
test('happiness combines with property and finance, keeping both used slots unchanged',()=>{
 let s=make();s=act(s,{type:'buyProperty',property:'apartment'});s=act(s,{type:'borrow',offer:s.offers[0].id});
 s=act(s,{type:'buyHappy'});s=act(s,{type:'buyHappy'});assert.equal(s.players[0].cash,279);assert(s.mainUsed);assert(s.financeUsed);assert(E.actions(s).some(a=>a.type==='buyHappy'));
 reject(s,{type:'buyProperty',property:'house'});reject(s,{type:'borrow',offer:'emergency',principal:100});
});
test('repeat purchases still require own normal turn, money, net assets and no rehabilitation',()=>{
 for(const phase of ['ready','event','rescue','finished']){const s=make();s.phase=phase;reject(s,{type:'buyHappy'});}
 let s=make();s.players[0].cash=9;reject(s,{type:'buyHappy'});
 s=make();s.players[0].rehab=true;reject(s,{type:'buyHappy'});
 s=make();s=act(s,{type:'borrow',offer:'emergency',principal:500});s.players[0].cash=500;reject(s,{type:'buyHappy'});
 s=make();reject(s,{type:'buyHappy',actor:1});
});
test('AI can buy happiness repeatedly after both slots, then finishes when unaffordable',()=>{
 let s=make();s.mainUsed=true;s.financeUsed=true;s.players[0].cash=21;
 for(let i=0;i<2;i++){const a=AI.choose(s);assert.equal(a.type,'buyHappy');s=act(s,a);}
 assert.equal(s.players[0].cash,0);assert.equal(E.happiness(s,0),2);assert(s.mainUsed&&s.financeUsed);assert.equal(AI.choose(s).type,'end');
});
test('legacy v3 retains old companies, 24 cards, bulk buying and upgrades its historical rules',()=>{
 const L=require('./legacy-v3/engine.js');let old=L.create(71,['human','human']);old.phase='turn';old.active=0;old.leader=0;old.turnOrder=[0,1];old.turnIndex=0;old.players[0].turns=1;
 old=L.dispatch(old,{type:'buyStock',company:'sun',quantity:3}).state;old=L.dispatch(old,{type:'borrow',offer:'emergency',principal:100}).state;old.mainUsed=true;old.rulesVersion=3;
 const original=JSON.stringify(old),updated=L.upgradeState(old);assert.equal(JSON.stringify(old),original);assert.equal(updated.rulesVersion,4);assert.equal(updated.deck.length,24);assert.equal(updated.tradeCount,3);assert(!('dividend' in updated.companies[0]));assert.throws(()=>E.upgradeState(updated));
 const disk=new Map([['life-investment-save-v3',JSON.stringify({format:3,token:'old-credit',state:old})]]),ctx={LifeEngine:L,localStorage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)}};ctx.globalThis=ctx;
 vm.runInNewContext(fs.readFileSync(__dirname+'/legacy-v3/storage.js','utf8'),ctx);const before=disk.get('life-investment-save-v3');let saved=ctx.LifeStorage.read();assert.equal(disk.get('life-investment-save-v3'),before);
 const action=L.dispatch(saved,{type:'buyHappy'});assert(action.ok,action.error);saved=action.state;ctx.LifeStorage.save(saved);assert.equal(saved.loans[0].dueTurn,old.loans[0].dueTurn);assert(saved.mainUsed&&saved.financeUsed);
});

function forceEvent(s,key){const i=s.deck.findIndex(e=>e.key===key);assert(i>=0);[s.deck[0],s.deck[i]]=[s.deck[i],s.deck[0]];return s;}
test('company characteristics exactly match approved dividend and price swings',()=>{
 const s=E.create();assert.deepEqual(s.companies.map(c=>c.dividend),[1,0,1,2,1,0]);assert.deepEqual(s.companies.map(c=>c.swing),[2,8,4,3,12,18]);assert.equal(E.dividends(s,0),0);
});
test('random price events use each selected company swing, preserve owners/costs, and cap NPC removal',()=>{
 for(const key of ['earn','bad','sell']){
  const selected=new Set();
  for(let seed=0;seed<60;seed++){
   let s=forceEvent(E.create(seed,['human','human']),key);for(const c of s.companies)own(s,0,2,c.id);
   const owned=structuredClone(E.stocks(s,0)),before=s.companies.map(c=>c.stocks.length);s=act(s,{type:'start'});
   const changed=s.companies.filter((c,i)=>c.stocks.length!==before[i]);assert.equal(changed.length,1);const c=changed[0],index=s.companies.indexOf(c);selected.add(c.id);
   const delta=key==='earn'?c.swing:-Math.min(c.initial,c.swing*(key==='sell'?2:1));assert.equal(c.stocks.length-before[index],delta);assert.deepEqual(E.stocks(s,0),owned);
  }
  assert.equal(selected.size,6);
 }
 let s=forceEvent(E.create(8,['human','human']),'sell');for(const c of s.companies){c.stocks=[];own(s,0,1,c.id);}const owned=structuredClone(E.stocks(s,0));s=act(s,{type:'start'});assert.deepEqual(E.stocks(s,0),owned);assert(s.companies.every(c=>c.stocks.length===1));
});
test('each multi-company buyback affects all and only listed companies with individual swings',()=>{
 const C=require('./cards.js');for(const e of C.events.filter(e=>e.kind==='buyback')){
  let s=forceEvent(E.create(4,['human','human']),e.key);const before=s.companies.map(c=>c.stocks.length);s=act(s,{type:'start'});
  for(const [i,c] of s.companies.entries())assert.equal(c.stocks.length,before[i]+(e.targets.includes(c.id)?c.swing:0));
  for(const id of e.targets)assert(s.event.detail.includes(s.companies.find(c=>c.id===id).name));
 }
 let s=forceEvent(E.create(4),'boom');s=act(s,{type:'start'});assert(s.companies.every(c=>c.stocks.length===c.initial+c.swing));
});
test('dividends pay once at round end for held shares, include all players, and exclude NPC and nonpaying companies',()=>{
 let s=make(2);for(const c of s.companies)own(s,0,2,c.id);own(s,1,3,'light');assert.equal(E.dividends(s,0),10);assert.equal(E.dividends(s,1),6);
 s=act(s,{type:'end'});assert.equal(s.players[0].cash,500);s=act(s,{type:'end'});assert.equal(s.players[0].cash,550);assert.equal(s.players[1].cash,546);
 assert(s.log.some(l=>l.text.includes('配当10')));assert(s.log.some(l=>l.text.includes('配当6')));
 const restored=E.upgradeState(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored,s);assert.equal(E.dividends(restored,0),10);
});
test('bulk buys earn per-share dividends but shares sold before settlement do not',()=>{
 let s=make(2);s=act(s,{type:'buyStock',company:'sun',quantity:3});s=act(s,{type:'sellStock',company:'sun',stock:E.stocks(s,0)[1].id});assert.equal(E.dividends(s,0),2);assert.equal(s.players[0].cash,484);
 s=act(s,{type:'end'});s=act(s,{type:'end'});assert.equal(s.players[0].cash,526);
});
test('dividend income can pay round interest and never duplicates on rescue resume',()=>{
 let s=make(2);own(s,0,10,'light');s=ordinary(s,0,1000,5);s.players[0].cash=0;s=act(s,{type:'end'});s=act(s,{type:'end'});assert.equal(s.players[0].cash,10);assert.equal(s.loans[0].interestPayments,1);assert.notEqual(s.phase,'rescue');
 s=make(2);own(s,0,1,'light');s=ordinary(s,0,2000,10);s.players[0].cash=0;s=act(s,{type:'end'});s=act(s,{type:'end'});assert.equal(s.phase,'rescue');assert.equal(s.players[0].cash,42);assert.equal(s.players[1].cash,540);
 s=E.upgradeState(JSON.parse(JSON.stringify(s)));reject(s,{type:'buyHappy'});s=act(s,{type:'restructure'});assert.equal(s.players[1].cash,540);assert.equal(s.log.filter(l=>l.text.includes('の収入＋')).length,2);
});
test('bankrupt players receive no new dividend or income',()=>{
 let s=make(3);own(s,2,10,'light');s.players[2].bankrupt=true;s.turnOrder=[0,1];s=act(s,{type:'end'});s=act(s,{type:'end'});assert.equal(s.players[2].cash,500);assert(!s.log.some(l=>l.text.includes(s.players[2].name+'の収入')));
});
test('24 rounds draw exactly 24 of 26 shuffled cards without replacement',()=>{
 for(let seed=0;seed<25;seed++){
  let s=act(E.create(seed,['human','human']),{type:'start'}),seen=[s.event.id];
  while(s.phase!=='finished'){const round=s.round;s=act(s,{type:s.phase==='event'?'eventSkip':'end'});if(s.round!==round)seen.push(s.event.id);}
  assert.equal(seen.length,24);assert.equal(new Set(seen).size,24);assert.deepEqual(seen,s.deck.slice(0,24).map(e=>e.id));assert(s.deck.slice(24).every(e=>!seen.includes(e.id)));
 }
});
test('saved company values and event identities/counts cannot be tampered with',()=>{
 const s=make();for(const mutate of [s=>s.companies[0].dividend=99,s=>s.companies[0].swing=1,s=>s.deck.pop(),s=>s.deck[0].targets=['sun'],s=>s.deck[0].kind='invalid',s=>s.deck[0].key='invalid']){const bad=structuredClone(s);mutate(bad);assert.throws(()=>E.assertState(bad));}
});
test('AI compares company dividend return and buyback support instead of choosing the first ticker',()=>{
 let s=make();assert.equal(AI.choose(s,'stock').type,'buyStock');assert.equal(AI.choose(s,'stock').company,'light');
 for(let i=0;i<100;i++)s.companies.find(c=>c.id==='light').stocks.push({id:'id'+s.nextId++,company:'light',owner:'npc',cost:null,round:1});
 assert.equal(AI.choose(s,'stock').company,'sun');
});

function statementFixture(){
 let s=make();s=ordinary(s,0,100,5);s=ordinary(s,1,60,5,0);
 s.properties[0].owner=0;s.properties[0].cost=400;s.properties[1].owner=0;s.properties[1].cost=1500;s.properties[1].occupied=false;
 own(s,0,3,'light');own(s,0,2,'wave');return s;
}
function ledger(s,id=0){return s.cashReport.rows.find(r=>r.player===id);}
function finishRound(s){while(s.round===1&&s.phase==='turn')s=act(s,{type:'end'});return s;}
test('statement: forecast is pure and itemizes rent, vacant property, dividends, loan income and per-contract interest',()=>{
 const s=statementFixture(),raw=JSON.stringify(s),f=E.forecast(s,0),t=E.cashTotals(f);assert.equal(JSON.stringify(s),raw);assert.equal(t.income,69);assert.equal(t.paidInterest,5);
 assert.deepEqual(f.entries.filter(e=>e.category==='rent').map(e=>e.amount),[20,0]);assert.deepEqual(f.entries.filter(e=>e.category==='dividend').map(e=>e.amount),[0,6]);assert(f.entries.some(e=>e.label.includes('3株 × 2万円')));
});
test('statement: intermediate turn shows forecast without paying income and preserves that snapshot through later trades',()=>{
 let s=statementFixture();const before=s.players.map(p=>p.cash);s=act(s,{type:'end'});assert.equal(s.cashReport.kind,'turn');assert(s.cashReport.complete);assert.equal(s.cashReport.actor,0);assert.deepEqual(s.players.map(p=>p.cash),before);assert.equal(E.cashTotals(s.cashReport.forecast).income,69);assert.equal(E.cashTotals(ledger(s)).net,0);
 const report=JSON.stringify(s.cashReport);s=act(s,{type:'buyHappy'});assert.equal(JSON.stringify(s.cashReport),report);
});
test('statement: completed round balances every player and includes incoming player loan interest',()=>{
 let s=statementFixture(),before=s.players.map(p=>p.cash);s=finishRound(s);assert.equal(s.cashReport.kind,'round');assert(s.cashReport.complete);assert.equal(s.cashReport.round,1);
 const t=E.cashTotals(ledger(s));assert.equal(t.income,69);assert.equal(t.paidInterest,5);assert.equal(t.net,64);assert.equal(s.players[0].cash,before[0]+64);
 assert.equal(E.cashTotals(ledger(s,1)).paidInterest,3);for(const row of s.cashReport.rows)assert.equal(row.cashAfter-row.cashBefore,E.cashTotals(row).net);
 assert.deepEqual(E.upgradeState(JSON.parse(JSON.stringify(s))),s);
});
test('statement: automatic emergency repayment separates principal and unpaid interest from the unpaid forecast',()=>{
 let s=make();s=act(s,{type:'borrow',offer:'emergency',principal:100});s.players[0].turns=2;const before=s.players[0].cash;s=act(s,{type:'end'});
 const row=ledger(s),t=E.cashTotals(row);assert.equal(t.paidInterest,20);assert.equal(t.income,0);assert.equal(t.net,-120);assert.equal(row.cashAfter,before-120);assert.equal(row.entries.find(e=>e.category==='principal').amount,100);assert.equal(E.cashTotals(s.cashReport.forecast).paidInterest,0);
});
test('statement: rescue borrowing records exact borrowed cash and paid interest across save/resume without repeat income',()=>{
 let s=make(2);own(s,0,1,'light');s=ordinary(s,0,2000,10);s.players[0].cash=0;s=finishRound(s);assert.equal(s.phase,'rescue');assert(!s.cashReport.complete);assert.equal(E.cashTotals(ledger(s)).income,42);assert.equal(E.cashTotals(ledger(s)).paidInterest,0);assert.equal(ledger(s).unpaidInterest,200);
 s=E.upgradeState(JSON.parse(JSON.stringify(s)));s=act(s,{type:'rescueBorrow'});assert(s.cashReport.complete);const row=ledger(s),t=E.cashTotals(row);assert.equal(t.income,42);assert.equal(t.paidInterest,239);assert.equal(row.entries.find(e=>e.category==='funding').amount,198);assert.equal(t.net,1);assert.equal(row.cashAfter,1);assert.equal(row.unpaidInterest,0);
});
test('statement: repeated rescue sales balance actual proceeds and do not rewrite the dividend paid before rescue',()=>{
 let s=make(2);own(s,0,10);s=ordinary(s,0,2000,5);s.players[0].cash=0;s=finishRound(s);assert.equal(s.phase,'rescue');reject(s,{type:'rescueSell',company:'sun',stock:'missing'});
 let sales=0;while(s.phase==='rescue'){s=act(s,{type:'rescueSell',company:'sun',stock:E.stocks(s,0)[0].id});sales++;assert(sales<10);}
 const row=ledger(s),t=E.cashTotals(row);assert.equal(sales,4);assert.equal(t.income,50);assert.equal(t.paidInterest,100);assert.equal(row.entries.filter(e=>e.category==='stock').reduce((n,e)=>n+e.amount,0),54);assert.equal(t.net,4);assert.equal(row.cashAfter,4);
});
test('statement: restructuring shows unpaid interest transferred to debt, not a fictional cash interest payment',()=>{
 let s=make(2);own(s,0,1);s=ordinary(s,0,2000,10);s.players[0].cash=0;s=finishRound(s);s=act(s,{type:'restructure'});
 const row=ledger(s),t=E.cashTotals(row);assert.equal(t.income,41);assert.equal(t.paidInterest,0);assert.equal(row.transferredInterest,200);assert.equal(t.net,0);assert.equal(row.entries.find(e=>e.category==='claims').amount,47);assert.equal(row.cashAfter,0);
});
test('statement: final settlement includes dividends, stock sales and principal/debt receipts with exact final cash',()=>{
 let s=make(2);own(s,0,3);s=ordinary(s,1,100,5,0);s.round=24;s.active=1;s.turnIndex=1;s.players[1].turns=1;const before=s.players.map(p=>p.cash);s=act(s,{type:'end'});assert.equal(s.phase,'finished');
 const t=E.cashTotals(ledger(s));assert.equal(t.income,48);assert.equal(t.paidInterest,0);assert.equal(t.net,169);assert.equal(s.players[0].cash,before[0]+169);assert.equal(ledger(s).entries.filter(e=>e.category==='stock').reduce((n,e)=>n+e.amount,0),21);assert.equal(ledger(s).entries.find(e=>e.category==='claims').amount,100);
 for(const row of s.cashReport.rows)assert.equal(row.cashAfter-row.cashBefore,E.cashTotals(row).net);
});
test('statement: prior v4 saves continue, including a partially recorded old rescue with already received income',()=>{
 let old=make(2);assert(!('cashReport' in E.upgradeState(old)));old=ordinary(old,0,2000,10);old.players[0].cash=0;old=finishRound(old);delete old.cashReport;for(const receipt of old.settlement.receipts)delete receipt.reportParts;
 const raw=JSON.stringify(old);let s=E.upgradeState(old);assert.equal(JSON.stringify(old),raw);s=act(s,{type:'rescueBorrow'});assert(s.cashReport.partial);assert.equal(E.cashTotals(ledger(s)).income,0);assert.equal(ledger(s).cashBefore,40);assert.equal(ledger(s).cashAfter-ledger(s).cashBefore,E.cashTotals(ledger(s)).net);
});
test('statement: malformed totals, ledger fields and forecasts are rejected on restore',()=>{
 const s=act(make(),{type:'end'});for(const mutate of [s=>s.cashReport.rows[0].cashAfter++,s=>s.cashReport.rows[0].entries.push({category:'base',direction:'in',amount:1.5,label:'x'}),s=>s.cashReport.forecast.entries[0].category='bad',s=>s.cashReport.version=99]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>E.upgradeState(bad));}
});

test('500 deterministic games, 2-4 players, AI strategies, repeat trading and debt stress complete',()=>{
 for(let seed=0;seed<500;seed++){
  let s=E.create(seed,Array(2+seed%3).fill('ai')),steps=0;
  if(seed%5===0){s.phase='turn';s.leader=0;s.active=0;s.turnOrder=s.players.map(p=>p.id);s.players[0].turns=1;s=act(s,{type:'borrow',offer:'emergency',principal:seed%2?100:1000});s.players[0].cash=seed%2?200:0;}
  while(s.phase!=='finished'&&steps++<1500){const action=AI.choose(s,['mixed','stock','happy'][seed%3]);assert(action,'no legal action seed '+seed);s=act(s,action);}
  assert.equal(s.phase,'finished','seed '+seed+' exceeded finite progress bound');assert(s.winners.every(id=>!E.player(s,id).bankrupt));
  if((seed+1)%100===0)console.log('Completed',seed+1,'/ 500 seeded games');
 }
});
console.log('PASS',count,'scenarios'+(statementsOnly?' for cash statements':' including 500 seeded games'));
