'use strict';
const assert=require('node:assert/strict');
const E=require('./engine.js'),AI=require('./ai.js');
let checks=0;
const test=(name,fn)=>{fn();checks++;console.log('PASS',name);};
const make=()=>{const s=E.create(17,['human','human']);s.phase='turn';s.active=0;s.leader=0;s.turn=0;return s;};
const apply=(s,a)=>{const r=E.dispatch(s,a);assert.equal(r.ok,true,r.error);return r.state;};
const reject=(s,a)=>{const snapshot=JSON.stringify(s),r=E.dispatch(s,a);assert.equal(r.ok,false);assert.equal(r.state,s);assert.equal(JSON.stringify(s),snapshot);return r.error;};
function give(s,id,count,company='sun'){const c=s.companies.find(c=>c.id===company);for(let i=0;i<count;i++)c.stocks.push({id:'id'+s.nextId++,company,owner:id,cost:c.stocks.length+1,round:1});}

test('initial NPC cards form the entire stock price, with no fixed base',()=>{
 const s=E.create(3);assert.deepEqual(s.companies.map(c=>c.stocks.length),[6,10,14]);assert.equal(s.deck.length,24);assert.equal(s.phase,'ready');assert.equal(E.happyPrice(s),10);E.assertState(s);
});
test('buy after addition, sell after removal, fixed cost and losing round trip',()=>{
 let s=make();s=apply(s,{type:'buyStock',company:'sun'});const t=s.companies[0].stocks.at(-1);assert.equal(t.cost,7);assert.equal(s.players[0].cash,53);s.mainUsed=false;s=apply(s,{type:'sellStock',company:'sun',stock:t.id});assert.equal(s.players[0].cash,59);assert.equal(s.companies[0].stocks.length,6);
});
test('middle sale preserves the other card IDs, order and original costs',()=>{
 let s=make();give(s,0,1);give(s,1,1);give(s,0,1);const c=s.companies[0],t=c.stocks[6],remaining=c.stocks.filter(x=>x.id!==t.id);s=apply(s,{type:'sellStock',company:c.id,stock:t.id});assert.deepEqual(s.companies[0].stocks,remaining);assert.equal(s.players[0].cash,68);
});
test('zero stock price, last-card zero proceeds, and first purchase for one',()=>{
 let s=make();s.companies[0].stocks=[];s=apply(s,{type:'buyStock',company:'sun'});assert.equal(s.players[0].cash,59);s.mainUsed=false;s=apply(s,{type:'sellStock',company:'sun',stock:s.companies[0].stocks[0].id});assert.equal(s.players[0].cash,59);assert.equal(s.companies[0].stocks.length,0);
});
test('illegal owner, duplicate revision and insufficient cash are atomic',()=>{
 const s=make();reject(s,{type:'sellStock',company:'sun',stock:s.companies[0].stocks[0].id});reject(s,{type:'end',revision:99});s.players[0].cash=0;reject(s,{type:'buyStock',company:'sun'});assert.equal(s.mainUsed,false);
});
test('liquidation values each own share sequentially',()=>{
 const s=make();s.companies[0].stocks=s.companies[0].stocks.slice(0,3);give(s,0,2);assert.equal(E.stockValue(s,0),7);
});
test('happiness uses current price, NPC price rises have no player points',()=>{
 let s=make();s.happiness=[{id:'h1',owner:'npc'},{id:'h2',owner:1},{id:'h3',owner:'npc'}];s=apply(s,{type:'buyHappy'});assert.equal(s.players[0].cash,47);assert.equal(E.happyPrice(s),14);assert.equal(E.happiness(s,0),1);reject(s,{type:'buyHappy'});
});
test('happiness net assets boundary and rehabilitation restriction',()=>{
 let s=make();s.players[0].cash=10;s=apply(s,{type:'buyHappy'});assert.equal(s.players[0].cash,0);s=make();s.players[0].rehab=true;reject(s,{type:'buyHappy'});s=make();s.loans.push({id:'loan',borrower:0,lender:'bank',principal:50,rate:10,round:1});reject(s,{type:'buyHappy'});
});
test('property ownership, rent, event-only sale and integer floor',()=>{
 let s=make();s=apply(s,{type:'buyProperty',property:'shop'});assert.equal(s.players[0].cash,10);reject(s,{type:'eventSell',property:'shop'});s.phase='event';s.pending={owner:0,rate:15,eventId:'x'};s=apply(s,{type:'eventSell',property:'shop'});assert.equal(s.players[0].cash,67);assert.equal(s.properties[1].owner,null);assert.equal(s.properties[1].price,50);assert.equal(s.mainUsed,true);
 s=make();s.properties[1].owner=0;s.properties[1].cost=50;s.phase='event';s.pending={owner:0,rate:-15,eventId:'x'};s=apply(s,{type:'eventSell',property:'shop'});assert.equal(s.players[0].cash,102);
});
test('interest floors per contract, including zero',()=>{
 assert.equal(E.interest({principal:20,rate:5}),1);assert.equal(E.interest({principal:10,rate:5}),0);assert.equal(E.interest({principal:30,rate:5})*2,2);assert.equal(E.money(50,85),42);
});
test('loans require actual stock collateral, limit count, and disallow money loops',()=>{
 let s=make();reject(s,{type:'borrow',offer:s.bankOffers[0].id});s.players[0].cash=999;reject(s,{type:'borrow',offer:'emergency'});give(s,0,8);s=apply(s,{type:'borrow',offer:s.bankOffers[0].id});assert.equal(E.debt(s,0),20);assert.equal(s.players[0].cash,1019);reject(s,{type:'borrow',offer:'emergency'});s.financeUsed=false;s=apply(s,{type:'borrow',offer:'emergency'});s.financeUsed=false;reject(s,{type:'borrow',offer:'emergency'});
});
test('repayment returns the entire principal without another interest charge',()=>{
 let s=make();give(s,0,8);s=apply(s,{type:'borrow',offer:s.bankOffers[0].id});s.financeUsed=false;s=apply(s,{type:'repay',loan:s.loans[0].id});assert.equal(s.players[0].cash,60);assert.equal(E.nextInterest(s,0),0);assert.equal(E.debt(s,0),0);
});
test('refinancing is atomic and same principal at a lower rate only',()=>{
 let s=make();give(s,0,8);s.loans.push({id:'loan',borrower:0,lender:1,principal:20,rate:10,round:1});reject(s,{type:'refinance',loan:'loan',offer:'missing'});const cash=s.players[0].cash;s=apply(s,{type:'refinance',loan:'loan',offer:s.bankOffers[0].id});assert.equal(s.players[0].cash,cash);assert.equal(s.players[1].cash,80);assert.equal(E.nextInterest(s,0),1);
});
test('lending reserves funds, acceptance transfers once and cancellation keeps slot used',()=>{
 let s=make();give(s,1,8);s=apply(s,{type:'offer',borrower:1});assert.equal(s.players[0].cash,40);const id=s.offers[0].id;s=apply(s,{type:'end'});s=apply(s,{type:'accept',offer:id});assert.equal(s.players[1].cash,80);assert.equal(s.players[0].cash,40);assert.equal(s.loans[0].lender,0);reject(s,{type:'accept',offer:id});
 s=make();s=apply(s,{type:'offer',borrower:1});s=apply(s,{type:'cancelOffer',offer:s.offers[0].id});assert.equal(s.players[0].cash,60);assert.equal(s.financeUsed,true);
});
test('unaccepted offer expires at borrower next turn end with funds returned',()=>{
 let s=make();s=apply(s,{type:'offer',borrower:1});s=apply(s,{type:'end'});s=apply(s,{type:'end'});assert.equal(s.offers.length,0);assert.equal(s.players[0].cash,64);
});
test('new loan interest and rent apply in the same round once',()=>{
 let s=make();give(s,0,8);s.properties[0].owner=0;s.properties[0].cost=40;s=apply(s,{type:'borrow',offer:s.bankOffers[0].id});s=apply(s,{type:'end'});s=apply(s,{type:'end'});assert.equal(s.players[0].cash,87);assert.equal(s.round,2);
});
test('rescue preserves happiness/property and principal survives default',()=>{
 let s=make();s.players[0].cash=0;s.loans.push({id:'big',borrower:0,lender:1,principal:50,rate:20,round:1});s.happiness.push({id:'happy',owner:0});s.properties[0].owner=0;s.properties[0].occupied=false;s.properties[0].cost=40;s=apply(s,{type:'end'});s=apply(s,{type:'end'});assert.equal(s.phase,'rescue');s=apply(s,{type:'restructure'});assert.equal(E.debt(s,0),56);assert.equal(s.players[0].rehab,true);assert.equal(E.happiness(s,0),1);assert.equal(s.properties[0].owner,0);assert.equal(s.loans.length,0);assert.equal(s.players[1].cash,68);
});
test('NPC declines can cross initial price and never erase player shares',()=>{
 let s=make();s.phase='ready';s.deck[0].kind='sell';s.deck[0].name='大口売り';for(const c of s.companies)c.stocks=c.stocks.slice(0,1);give(s,0,1);s=apply(s,{type:'start'});assert.equal(E.stocks(s,0).length,1);assert(s.companies.some(c=>c.stocks.length<c.initial));
});
test('serialization keeps future events deterministic and rejects bad save state',()=>{
 const s=make();assert.deepEqual(E.dispatch(s,{type:'end'}).state,E.dispatch(JSON.parse(JSON.stringify(s)),{type:'end'}).state);const bad=structuredClone(s);bad.companies[0].stocks[0].owner=99;assert.throws(()=>E.assertState(bad));bad.schemaVersion=2;assert.throws(()=>E.assertState(bad));
});
test('winner determined solely by happiness, ties shared and final debt matures',()=>{
 let s=make();s.round=24;s.turn=1;s.active=1;s.happiness=[{id:'win',owner:0}];s.players[0].cash=0;s.players[1].cash=999;s=apply(s,{type:'end'});assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[0]);reject(s,{type:'buyHappy'});
 s=make();s.round=24;s.turn=1;s.active=1;s=apply(s,{type:'end'});assert.deepEqual(s.winners,[0,1]);
});
test('emergency rescue used at most once, insolvency survives JSON round trip',()=>{
 let s=make();give(s,0,8);s.players[0].cash=0;s.loans.push({id:'big',borrower:0,lender:'bank',principal:20,rate:150,round:1});s=apply(s,{type:'end'});s=apply(s,{type:'end'});assert.equal(s.phase,'rescue');const snapshot=JSON.parse(JSON.stringify(s));E.assertState(snapshot);s=apply(snapshot,{type:'rescueBorrow'});assert.equal(s.phase,'rescue');reject(s,{type:'rescueBorrow'});s=apply(s,{type:'rescueSell',company:'sun',stock:E.stocks(s,0)[0].id});assert.equal(s.phase,'rescue');s=apply(s,{type:'restructure'});assert.notEqual(s.phase,'rescue');
});
test('relief offers a same-principal refinance, retaining rounded zero interest',()=>{
 let s=make();s.phase='ready';s.deck[0].kind='ease';s.deck[0].name='金融緩和';give(s,0,8);s.loans.push({id:'old',borrower:s.leader,lender:'bank',principal:10,rate:10,round:1});s=apply(s,{type:'start'});const offer=s.bankOffers.find(o=>o.principal===10&&o.rate===5);assert(offer);s=apply(s,{type:'refinance',loan:'old',offer:offer.id});assert.equal(E.nextInterest(s,0),0);assert.equal(E.debt(s,0),10);
});
test('event sale opportunity belongs to the rotating leader and cannot repeat',()=>{
 let s=make();s.phase='ready';s.properties[0].owner=0;s.properties[0].cost=40;s.deck[0].kind='salePlus';s.deck[0].name='不動産売却';s=apply(s,{type:'start'});assert.equal(s.phase,'event');reject(s,{type:'eventSell',property:'shop'});s=apply(s,{type:'eventSell',property:'apartment'});assert.equal(s.players[0].cash,108);assert.equal(s.phase,'turn');assert.equal(s.mainUsed,false);reject(s,{type:'eventSell',property:'apartment'});
});
test('simultaneous incoming interest cannot fund an outgoing payment in that settlement',()=>{
 let s=make();s.players[0].cash=0;s.players[1].cash=0;s.loans=[{id:'a',borrower:0,lender:1,principal:20,rate:25,round:1},{id:'b',borrower:1,lender:0,principal:20,rate:25,round:1}];s=apply(s,{type:'end'});s=apply(s,{type:'end'});assert.equal(s.phase,'rescue');s=apply(s,{type:'restructure'});assert.equal(s.phase,'rescue');assert.equal(s.active,1);s=apply(s,{type:'restructure'});assert.equal(s.round,2);assert(E.debt(s,0)>0&&E.debt(s,1)>0);
});
test('all supplied stock cards have legal IDs and malformed config/decks fail restoration',()=>{
 const s=make();let bad=structuredClone(s);bad.config.cash=999;assert.throws(()=>E.assertState(bad));bad=structuredClone(s);bad.deck[0].kind='unknown';assert.throws(()=>E.assertState(bad));bad=structuredClone(s);bad.companies[0].stocks.push({...bad.companies[0].stocks[0]});assert.throws(()=>E.assertState(bad));
});
test('500 seeded games complete; all actions validate; strategies and seat counts vary',()=>{
 for(let seed=0;seed<500;seed++){
  let s=E.create(seed,Array.from({length:2+seed%3},()=> 'ai')),steps=0;const strategy=['mixed','happy','stock'][seed%3];
  while(s.phase!=='finished'&&steps++<600){const a=AI.choose(s,strategy);assert(a,'no legal action at '+seed);s=apply(s,a);E.assertState(s);}
  assert.equal(s.phase,'finished','seed '+seed+' stuck after '+steps);assert(s.winners.length>0);assert.equal(s.round,24);
 }
});
console.log('PASS',checks,'scenarios; 500 complete games');
