'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('./engine.js'),AI=require('./ai.js');
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
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
 let s=make();s=act(s,{type:'buyStock',company:'sun'});s=act(s,{type:'buyStock',company:'sun'});const t=s.companies[0].stocks.find(t=>t.owner===0);s=act(s,{type:'sellStock',company:'sun',stock:t.id});assert.equal(s.tradeCount,3);assert.equal(s.tradeCompany,'sun');reject(s,{type:'buyStock',company:'wave'});reject(s,{type:'buyHappy'});reject(s,{type:'buyProperty',property:'apartment'});s=act(s,{type:'end'});assert.equal(s.tradeCompany,null);
});
test('middle sale preserves cost/owners; round trip cannot create cash',()=>{
 let s=make();s=act(s,{type:'buyStock',company:'sun'});const t=s.companies[0].stocks.at(-1);s=act(s,{type:'sellStock',company:'sun',stock:t.id});assert.equal(s.players[0].cash,499);own(s,0,1);own(s,1,1);const before=s.companies[0].stocks.at(-1);s=act(s,{type:'sellStock',company:'sun',stock:E.stocks(s,0)[0].id});assert.deepEqual(s.companies[0].stocks.at(-1),before);
});
test('zero price, NPC declines below initial and atomic illegal actions',()=>{
 let s=make();s.companies[0].stocks=[];s=act(s,{type:'buyStock',company:'sun'});assert.equal(s.players[0].cash,499);s=act(s,{type:'sellStock',company:'sun',stock:E.stocks(s,0)[0].id});assert.equal(s.players[0].cash,499);reject(s,{type:'sellStock',company:'sun',stock:'missing'});reject(s,{type:'end',revision:99});
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
 let s=make();s.happiness=[{id:'h1',owner:'npc'},{id:'h2',owner:1}];s=act(s,{type:'buyHappy'});assert.equal(s.players[0].cash,488);assert.equal(E.happyPrice(s),13);assert.equal(E.happiness(s,0),1);reject(s,{type:'buyStock',company:'sun'});
});
test('final maturity cannot hide a last-round emergency and bankrupt is excluded from points',()=>{
 let s=make();s.round=24;s.turnIndex=2;s.active=2;s.players[2].turns=1;s=act(s,{type:'borrow',offer:'emergency',principal:1000});s.players[2].cash=0;s.happiness.push({id:'h',owner:2});s=act(s,{type:'end'});while(s.phase==='rescue')s=act(s,{type:'restructure'});assert.equal(s.phase,'finished');assert(s.players[2].bankrupt);assert(!s.winners.includes(2));
});
test('schema, owner, deadline and configuration validation reject corrupt restored data',()=>{
 const s=make();for(const mutate of [x=>x.schemaVersion=1,x=>x.config.cash=1,x=>x.companies[0].stocks[0].owner=99,x=>x.players[0].cash=-1]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>E.assertState(bad));}
 let withLoan=act(s,{type:'borrow',offer:'emergency',principal:100});withLoan.loans[0].dueTurn=null;assert.throws(()=>E.assertState(withLoan));
});
test('storage v3 preserves both v1/v2 byte-for-byte and detects other tabs',()=>{
 const disk=new Map([['life-investment-save-v1','OLD-V1-BYTES'],['life-investment-save-v2','OLD-V2-BYTES']]);
 const ctx={LifeEngine:E,localStorage:{getItem:k=>disk.get(k)??null,setItem:(k,v)=>disk.set(k,v)}};ctx.globalThis=ctx;
 vm.runInNewContext(fs.readFileSync(__dirname+'/storage.js','utf8'),ctx);assert.equal(ctx.LifeStorage.read(),null);assert(ctx.LifeStorage.hasLegacy());assert.equal(ctx.LifeStorage.legacySaves().length,2);
 ctx.LifeStorage.save(make());assert.equal(disk.get('life-investment-save-v1'),'OLD-V1-BYTES');assert.equal(disk.get('life-investment-save-v2'),'OLD-V2-BYTES');assert.equal(ctx.LifeStorage.read().schemaVersion,3);
 disk.set('life-investment-save-v3','other');assert.throws(()=>ctx.LifeStorage.save(make()));
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
test('500 deterministic games, 2-4 players, AI strategies, repeat trading and debt stress complete',()=>{
 for(let seed=0;seed<500;seed++){
  let s=E.create(seed,Array(2+seed%3).fill('ai')),steps=0;
  if(seed%5===0){s.phase='turn';s.leader=0;s.active=0;s.turnOrder=s.players.map(p=>p.id);s.players[0].turns=1;s=act(s,{type:'borrow',offer:'emergency',principal:seed%2?100:1000});s.players[0].cash=seed%2?200:0;}
  while(s.phase!=='finished'&&steps++<1500){const action=AI.choose(s,['mixed','stock','happy'][seed%3]);assert(action,'no legal action seed '+seed);s=act(s,action);}
  assert.equal(s.phase,'finished','seed '+seed+' exceeded finite progress bound');assert(s.winners.every(id=>!E.player(s,id).bankrupt));
  if((seed+1)%100===0)console.log('Completed',seed+1,'/ 500 seeded games');
 }
});
console.log('PASS',count,'scenarios including 500 seeded games');
