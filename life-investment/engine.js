(function(root){
  'use strict';
  const C=typeof module==='object'&&module.exports?require('./cards.js'):root.LifeCards;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const money=(n,rate)=>Math.floor(n*rate/100);
  const player=(s,id)=>s.players.find(p=>p.id===id);
  const current=s=>player(s,s.active);
  const interest=l=>money(l.principal,l.rate);
  const debt=(s,id)=>s.loans.filter(l=>l.borrower===id).reduce((n,l)=>n+l.principal,0)+s.claims.filter(l=>l.borrower===id).reduce((n,l)=>n+l.amount,0);
  const nextInterest=(s,id)=>s.loans.filter(l=>l.borrower===id).reduce((n,l)=>n+interest(l),0);
  const stocks=(s,id)=>s.companies.flatMap(c=>c.stocks.filter(t=>t.owner===id));
  function stockValue(s,id){return s.companies.reduce((sum,c)=>{const k=c.stocks.filter(t=>t.owner===id).length;return sum+k*(c.stocks.length-1)-k*(k-1)/2;},0);}
  const happiness=(s,id)=>s.happiness.filter(h=>h.owner===id).length;
  const happyPrice=s=>s.config.happinessBase+s.happiness.length;
  function random(s){let t=s.rng=(s.rng+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  const uid=s=>'id'+s.nextId++;
  function log(s,text){s.log.push({round:s.round,text});if(s.log.length>100)s.log.shift();}
  function addStock(s,c,owner,cost){c.stocks.push({id:uid(s),company:c.id,owner,cost,round:s.round});}
  function create(seed=Date.now()>>>0,controllers=['human','ai']){
    if(controllers.length<2||controllers.length>4||controllers.some(x=>!['human','ai'].includes(x)))throw Error('人数は2～4人です');
    const s={schemaVersion:1,rulesVersion:1,config:copy(C),gameId:'life-'+seed+'-'+Date.now(),seed:seed>>>0,rng:seed>>>0,nextId:1,revision:0,phase:'ready',round:1,active:0,leader:0,turn:0,mainUsed:false,financeUsed:false,players:controllers.map((controller,id)=>({id,name:controller==='ai'?'投資家AI '+id:'プレイヤー '+(id+1),controller,cash:C.cash,rehab:false})),companies:C.companies.map(c=>({...c,stocks:[]})),properties:C.properties.map(p=>({...p,owner:null,occupied:true,cost:0})),happiness:[],loans:[],claims:[],offers:[],bankOffers:[],deck:[],event:null,pending:null,settlement:null,log:[],winners:[]};
    for(const c of s.companies)for(let i=0;i<c.initial;i++)addStock(s,c,'npc',null);
    for(let i=0;i<2;i++)s.bankOffers.push({id:uid(s),principal:20,rate:5});
    for(const [kind,name] of C.events)for(let i=0;i<2;i++)s.deck.push({id:uid(s),kind,name});
    for(let i=s.deck.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[s.deck[i],s.deck[j]]=[s.deck[j],s.deck[i]];}
    s.leader=Math.floor(random(s)*s.players.length);s.active=s.leader;return s;
  }
  function fail(message){throw Error(message);}
  function pay(s,from,to,n){if(!Number.isInteger(n)||n<0)fail('金額が不正です');const p=player(s,from);if(p&&p.cash<n)fail('現金が'+(n-p.cash)+'万円不足しています');if(p)p.cash-=n;const q=player(s,to);if(q)q.cash+=n;}
  function main(s){if(s.phase!=='turn')fail('現在は通常の手番ではありません');if(s.mainUsed)fail('主行動は使用済みです');}
  function finance(s){if(s.phase!=='turn')fail('現在は金融操作できません');if(s.financeUsed)fail('金融操作は使用済みです');}
  function lendingAllowed(s,id,amount,replacing=null){
    const p=player(s,id),list=s.loans.filter(l=>l.borrower===id&&l.id!==replacing);
    if(p.rehab)fail('資産整理中は借り入れできません');
    if(list.length>=s.config.maxLoans)fail('契約数の上限です');
    const total=list.reduce((n,l)=>n+l.principal,0)+amount;
    if(total>s.config.maxDebt)fail('借入上限50万円を超えます');
    if(total>Math.floor(stockValue(s,id)/2))fail('株の担保評価が不足しています');
  }
  function beginRound(s){s.turn=0;s.active=s.leader;s.mainUsed=false;s.financeUsed=false;s.phase='turn';s.event=s.deck[s.round-1];runEvent(s);}
  function runEvent(s){
    const e=s.event,kind=e.kind;let detail='';
    const choose=a=>a.length?a[Math.floor(random(s)*a.length)]:null;
    if(['earn','bad','sell','buyback'].includes(kind)){
      const c=choose(s.companies),before=c.stocks.length;
      if(kind==='earn'||kind==='buyback')for(let i=0;i<2;i++)addStock(s,c,'npc',null);
      else{let n=kind==='sell'?3:2;c.stocks=c.stocks.filter(t=>t.owner!=='npc'||n--<=0);}
      detail=c.name+' '+before+'→'+c.stocks.length+'万円';
    }else if(kind==='recession'){for(let i=0;i<4;i++)s.happiness.push({id:uid(s),owner:'npc'});detail='NPCが幸福4枚を購入。幸福価格＋4万円';}
    else if(kind==='boom'){for(const c of s.companies)addStock(s,c,'npc',null);detail='全社の株価＋1万円';}
    else if(kind==='ease'){s.bankOffers.push({id:uid(s),principal:10,rate:5});detail='銀行融資10万円・5%を追加。切り捨てにより利息0万円（緊急融資の借り換え先）';}
    else if(kind==='tight'){const l=s.bankOffers.shift();detail=l?'未契約の銀行融資を1枚除去':'対象の融資なし';}
    else if(kind==='vacant'||kind==='tenant'){const p=choose(s.properties.filter(p=>p.occupied===(kind==='vacant')));if(p){p.occupied=kind==='tenant';detail=p.name+(p.occupied?'が入居':'が空室');}else detail='対象の物件なし';}
    else if(kind==='salePlus'||kind==='saleMinus'){
      const rate=kind==='salePlus'?20:-20;detail=player(s,s.leader).name+'に購入額'+(rate>0?'＋':'')+rate+'%の売却機会';
      if(s.properties.some(p=>p.owner===s.leader)){s.phase='event';s.pending={owner:s.leader,rate,eventId:e.id};}
      else detail+='（所有物件なし）';
    }
    e.detail=detail;log(s,e.name+'：'+detail);
  }
  function sell(s,c,t){const i=c.stocks.findIndex(x=>x.id===t);if(i<0||c.stocks[i].owner!==s.active)fail('自分の株を選んでください');const stock=c.stocks[i];c.stocks.splice(i,1);const n=c.stocks.length;pay(s,'bank',s.active,n);log(s,current(s).name+'が'+c.name+'を'+n+'万円で売却（損益'+(n-stock.cost)+'万円）');}
  function releaseOffer(s,o){pay(s,'escrow',o.lender,o.principal);s.offers=s.offers.filter(x=>x.id!==o.id);}
  function startSettlement(s){
    s.phase='settle';
    for(const p of s.players){const rent=s.properties.filter(x=>x.owner===p.id&&x.occupied).reduce((n,x)=>n+x.rent,0);p.cash+=s.config.income+rent;log(s,p.name+'の収入＋'+(s.config.income+rent)+'万円');}
    // Received interest is not reusable in the same settlement.
    s.settlement={index:0,budget:s.players.map(p=>p.cash),receipts:[],processed:[],emergency:false};
    for(const p of s.players.filter(p=>p.rehab))repayClaims(s,p.id);
    for(const p of s.players)s.settlement.budget[p.id]=p.cash;
    continueSettlement(s);
  }
  function repayClaims(s,id){
    const p=player(s,id),cs=s.claims.filter(c=>c.borrower===id),total=cs.reduce((n,c)=>n+c.amount,0);if(!total){p.rehab=false;return;}
    const amount=Math.min(p.cash,total),parts=cs.map(c=>Math.floor(amount*c.amount/total));let rest=amount-parts.reduce((a,b)=>a+b,0);
    for(let i=0;rest>0;i=(i+1)%cs.length)if(parts[i]<cs[i].amount){parts[i]++;rest--;}
    for(let i=0;i<cs.length;i++){cs[i].amount-=parts[i];p.cash-=parts[i];if(s.settlement)s.settlement.receipts.push({to:cs[i].lender,n:parts[i]});else pay(s,'bank',cs[i].lender,parts[i]);}
    s.claims=s.claims.filter(c=>c.amount>0);p.rehab=s.claims.some(c=>c.borrower===id);
  }
  function restructure(s,id){
    const p=player(s,id);log(s,p.name+'が資産整理。幸福と不動産は保持');
    for(const o of [...s.offers].filter(o=>o.lender===id))releaseOffer(s,o);
    for(const c of s.companies)for(const t of [...c.stocks].filter(t=>t.owner===id)){c.stocks.splice(c.stocks.findIndex(x=>x.id===t.id),1);p.cash+=c.stocks.length;}
    for(const l of s.loans.filter(l=>l.borrower===id))s.claims.push({id:uid(s),borrower:id,lender:l.lender,amount:l.principal+(s.settlement&&!s.settlement.processed.includes(l.id)?interest(l):0)});
    s.loans=s.loans.filter(l=>l.borrower!==id);p.rehab=true;repayClaims(s,id);if(s.settlement)s.settlement.budget[id]=p.cash;
  }
  function continueSettlement(s){
    const z=s.settlement;
    while(z.index<s.players.length){const p=s.players[z.index],due=s.loans.filter(l=>l.borrower===p.id&&!z.processed.includes(l.id)),bill=due.reduce((n,l)=>n+interest(l),0);
      if(z.budget[p.id]<bill){s.phase='rescue';s.active=p.id;return;}
      for(const l of due){const n=interest(l);p.cash-=n;z.budget[p.id]-=n;z.receipts.push({to:l.lender,n});z.processed.push(l.id);}
      z.index++;z.emergency=false;
    }
    for(const r of z.receipts)pay(s,'bank',r.to,r.n);
    s.settlement=null;
    if(s.round===s.config.rounds){finish(s);return;}
    s.round++;s.leader=(s.leader+1)%s.players.length;beginRound(s);
  }
  function finish(s){
    for(const o of [...s.offers])releaseOffer(s,o);
    // Principal claims mature together; incoming repayments cannot create a chain of defaults.
    for(const l of s.loans)s.claims.push({id:uid(s),borrower:l.borrower,lender:l.lender,amount:l.principal});s.loans=[];
    const receipts=[];s.settlement={receipts};
    for(const p of s.players){for(const c of s.companies)for(const t of [...c.stocks].filter(t=>t.owner===p.id)){c.stocks.splice(c.stocks.findIndex(x=>x.id===t.id),1);p.cash+=c.stocks.length;}repayClaims(s,p.id);}
    for(const r of receipts)pay(s,'bank',r.to,r.n);s.settlement=null;
    s.phase='finished';const best=Math.max(...s.players.map(p=>happiness(s,p.id)));s.winners=s.players.filter(p=>happiness(s,p.id)===best).map(p=>p.id);log(s,'人生の決算。幸福'+best+'点で'+s.winners.map(id=>player(s,id).name).join('・')+'が勝利');
  }
  function execute(s,a){
    if(a.actor!==undefined&&a.actor!==s.active)fail('あなたの手番ではありません');
    const p=current(s),c=s.companies.find(c=>c.id===a.company),prop=s.properties.find(p=>p.id===a.property);
    if(a.type==='start'){if(s.phase!=='ready')fail('開始済みです');beginRound(s);return;}
    if(a.type==='eventSell'||a.type==='eventSkip'){
      if(s.phase!=='event'||!s.pending)fail('売却イベントが必要です');
      if(a.type==='eventSell'){if(!prop||prop.owner!==s.pending.owner)fail('自分の物件を選んでください');const n=money(prop.cost,100+s.pending.rate);pay(s,'bank',prop.owner,n);log(s,prop.name+'を'+n+'万円で売却');prop.owner=null;prop.cost=0;}
      s.pending=null;s.phase='turn';return;
    }
    if(a.type==='rescueSell'){if(s.phase!=='rescue'||!c)fail('救済中の株を選んでください');const before=p.cash;sell(s,c,a.stock);s.settlement.budget[p.id]+=p.cash-before;continueSettlement(s);return;}
    if(a.type==='restructure'){if(s.phase!=='rescue')fail('資産整理は支払不足時のみです');restructure(s,p.id);continueSettlement(s);return;}
    if(a.type==='rescueBorrow'){
      if(s.phase!=='rescue'||s.settlement.emergency)fail('救済借入は1回までです');lendingAllowed(s,p.id,10);pay(s,'bank',p.id,10);s.loans.push({id:uid(s),borrower:p.id,lender:'bank',principal:10,rate:10,round:s.round});s.settlement.budget[p.id]+=10;s.settlement.emergency=true;continueSettlement(s);return;
    }
    if(a.type==='buyStock'){main(s);if(!c)fail('会社が不正です');const n=c.stocks.length+1;pay(s,p.id,'bank',n);addStock(s,c,p.id,n);s.mainUsed=true;log(s,p.name+'が'+c.name+'を'+n+'万円で購入');}
    else if(a.type==='sellStock'){main(s);if(!c)fail('会社が不正です');sell(s,c,a.stock);s.mainUsed=true;}
    else if(a.type==='buyHappy'){main(s);const n=happyPrice(s);if(p.rehab)fail('残債完済まで幸福を購入できません');if(p.cash-n+stockValue(s,p.id)-debt(s,p.id)-nextInterest(s,p.id)<0)fail('購入後の純資産が次回利息を下回ります');pay(s,p.id,'bank',n);s.happiness.push({id:uid(s),owner:p.id});s.mainUsed=true;log(s,p.name+'が幸福を'+n+'万円で購入');}
    else if(a.type==='buyProperty'){main(s);if(!prop||prop.owner!==null)fail('購入できる物件を選んでください');pay(s,p.id,'bank',prop.price);prop.owner=p.id;prop.cost=prop.price;s.mainUsed=true;log(s,p.name+'が'+prop.name+'を購入');}
    else if(a.type==='borrow'){
      finance(s);const offer=a.offer==='emergency'?{principal:10,rate:10}:s.bankOffers.find(l=>l.id===a.offer);if(!offer)fail('融資カードがありません');lendingAllowed(s,p.id,offer.principal);pay(s,'bank',p.id,offer.principal);s.loans.push({id:uid(s),borrower:p.id,lender:'bank',principal:offer.principal,rate:offer.rate,round:s.round});s.bankOffers=s.bankOffers.filter(l=>l.id!==a.offer);s.financeUsed=true;log(s,p.name+'が'+offer.principal+'万円を借入');
    }else if(a.type==='repay'){
      finance(s);const l=s.loans.find(l=>l.id===a.loan&&l.borrower===p.id);if(!l)fail('自分の契約を選んでください');pay(s,p.id,l.lender,l.principal);s.loans=s.loans.filter(x=>x.id!==l.id);s.financeUsed=true;log(s,p.name+'が元本'+l.principal+'万円を完済');
    }else if(a.type==='refinance'){
      finance(s);const l=s.loans.find(l=>l.id===a.loan&&l.borrower===p.id),o=s.bankOffers.find(o=>o.id===a.offer);if(!l||!o||o.principal!==l.principal||o.rate>=l.rate)fail('同額元本・低金利の融資が必要です');lendingAllowed(s,p.id,o.principal,l.id);pay(s,'bank',l.lender,l.principal);s.loans=s.loans.filter(x=>x.id!==l.id);s.loans.push({id:uid(s),borrower:p.id,lender:'bank',principal:o.principal,rate:o.rate,round:s.round});s.bankOffers=s.bankOffers.filter(x=>x.id!==o.id);s.financeUsed=true;log(s,p.name+'が'+l.rate+'%→'+o.rate+'%へ借り換え');
    }else if(a.type==='offer'){
      finance(s);if(p.rehab)fail('資産整理中は貸付提案できません');if(s.offers.some(o=>o.lender===p.id))fail('提案は1件までです');if(!player(s,a.borrower)||a.borrower===p.id)fail('相手を選んでください');pay(s,p.id,'escrow',20);s.offers.push({id:uid(s),lender:p.id,borrower:a.borrower,principal:20,rate:5});s.financeUsed=true;log(s,p.name+'が20万円・5%の貸付を提案');
    }else if(a.type==='accept'){
      finance(s);const o=s.offers.find(o=>o.id===a.offer&&o.borrower===p.id);if(!o)fail('受諾可能な提案がありません');lendingAllowed(s,p.id,o.principal);pay(s,'escrow',p.id,o.principal);s.loans.push({id:uid(s),borrower:p.id,lender:o.lender,principal:o.principal,rate:o.rate,round:s.round});s.offers=s.offers.filter(x=>x.id!==o.id);s.financeUsed=true;log(s,p.name+'が貸付提案を受諾');
    }else if(a.type==='cancelOffer'){
      if(s.phase!=='turn')fail('手番中のみ取消できます');const o=s.offers.find(o=>o.id===a.offer&&o.lender===p.id);if(!o)fail('自分の提案を選んでください');releaseOffer(s,o);log(s,'貸付提案を取消。行動枠は戻りません');
    }else if(a.type==='end'){
      if(s.phase!=='turn')fail('未完了の処理があります');for(const o of [...s.offers].filter(o=>o.borrower===p.id))releaseOffer(s,o);
      s.turn++;if(s.turn===s.players.length)startSettlement(s);else{s.active=(s.leader+s.turn)%s.players.length;s.mainUsed=false;s.financeUsed=false;}
    }else fail('不明な操作です');
  }
  function dispatch(state,action){
    if(action.revision!==undefined&&action.revision!==state.revision)return {ok:false,error:'状態が変わりました。内容を再確認してください',state};
    const s=copy(state);try{execute(s,action);s.revision++;assertState(s);return {ok:true,state:s};}catch(e){return {ok:false,error:e.message,state};}
  }
  function assertState(s){
    if(s.schemaVersion!==1||s.rulesVersion!==1)fail('対応していない保存形式です');
    if(!['ready','turn','event','rescue','finished'].includes(s.phase)||!Number.isInteger(s.round)||s.round<1||s.round>24)fail('進行状態が不正です');
    if(s.players.length<2||s.players.length>4||!player(s,s.active)||!Number.isInteger(s.revision)||s.revision<0)fail('プレイヤー状態が不正です');
    if(JSON.stringify(s.config)!==JSON.stringify(C))fail('ルール設定が保存版と一致しません');
    if(!Number.isInteger(s.nextId)||s.nextId<1||!Number.isInteger(s.rng))fail('乱数・ID状態が不正です');
    if(s.players.some((p,i)=>p.id!==i)||new Set(s.companies.map(c=>c.id)).size!==3)fail('プレイヤー・会社IDが不正です');
    const ids=new Set();const check=x=>{if(typeof x.id!=='string'||ids.has(x.id))fail('IDが重複・欠損しています');ids.add(x.id);};
    const valid=id=>id==='npc'||id==='bank'||!!player(s,id);
    for(const p of s.players)if(!Number.isInteger(p.cash)||p.cash<0||!['human','ai'].includes(p.controller))fail('現金・操作種別が不正です');
    for(const c of s.companies){if(!C.companies.some(x=>x.id===c.id))fail('会社が不正です');for(const t of c.stocks){check(t);if(!valid(t.owner)||t.owner==='bank'||t.company!==c.id||(t.owner!=='npc'&&(!Number.isInteger(t.cost)||t.cost<0)))fail('株の所有権が不正です');}}
    for(const h of s.happiness){check(h);if(!valid(h.owner)||h.owner==='bank')fail('幸福の所有者が不正です');}
    for(const p of s.properties){if(!C.properties.some(x=>x.id===p.id)||!Number.isInteger(p.cost)||p.cost<0||typeof p.occupied!=='boolean'||(p.owner!==null&&!player(s,p.owner)))fail('不動産の状態が不正です');}
    if(new Set(s.properties.map(p=>p.id)).size!==3)fail('物件IDが重複しています');
    for(const e of s.deck){check(e);if(!C.events.some(x=>x[0]===e.kind))fail('イベントが不正です');}
    for(const o of s.bankOffers){check(o);if(!Number.isInteger(o.principal)||o.principal<=0||!Number.isInteger(o.rate)||o.rate<0)fail('銀行融資が不正です');}
    for(const l of [...s.loans,...s.offers]){check(l);if(!player(s,l.borrower)||!valid(l.lender)||l.borrower===l.lender||!Number.isInteger(l.principal)||l.principal<=0||!Number.isInteger(l.rate)||l.rate<0)fail('融資が不正です');}
    for(const c of s.claims){check(c);if(!player(s,c.borrower)||!valid(c.lender)||!Number.isInteger(c.amount)||c.amount<=0)fail('残債が不正です');}
    if(s.deck.length!==24||s.companies.length!==3||s.properties.length!==3)fail('保存データが欠損しています');
    if(s.phase==='event'&&(!s.pending||s.pending.owner!==s.active))fail('イベント選択状態が不正です');
    if(s.phase==='rescue'&&(!s.settlement||s.settlement.index!==s.active))fail('精算状態が不正です');
    return true;
  }
  function actions(s){
    const id=s.active,out=[];
    if(s.phase==='ready')out.push({type:'start'});
    if(s.phase==='event'){for(const p of s.properties.filter(p=>p.owner===id))out.push({type:'eventSell',property:p.id});out.push({type:'eventSkip'});}
    if(s.phase==='rescue'){for(const c of s.companies)for(const t of c.stocks.filter(t=>t.owner===id))out.push({type:'rescueSell',company:c.id,stock:t.id});out.push({type:'rescueBorrow'},{type:'restructure'});}
    if(s.phase==='turn'){
      if(!s.mainUsed){out.push({type:'buyHappy'});for(const c of s.companies){out.push({type:'buyStock',company:c.id});for(const t of c.stocks.filter(t=>t.owner===id))out.push({type:'sellStock',company:c.id,stock:t.id});}for(const p of s.properties.filter(p=>p.owner===null))out.push({type:'buyProperty',property:p.id});}
      if(!s.financeUsed){for(const o of [...s.bankOffers,{id:'emergency'}])out.push({type:'borrow',offer:o.id});for(const l of s.loans.filter(l=>l.borrower===id)){out.push({type:'repay',loan:l.id});for(const o of s.bankOffers)out.push({type:'refinance',loan:l.id,offer:o.id});}for(const p of s.players.filter(p=>p.id!==id))out.push({type:'offer',borrower:p.id});for(const o of s.offers.filter(o=>o.borrower===id))out.push({type:'accept',offer:o.id});}
      for(const o of s.offers.filter(o=>o.lender===id))out.push({type:'cancelOffer',offer:o.id});out.push({type:'end'});
    }
    return out;
  }
  const E={create,dispatch,assertState,actions,player,current,interest,debt,nextInterest,stocks,stockValue,happiness,happyPrice,money};
  if(typeof module==='object'&&module.exports)module.exports=E;else root.LifeEngine=E;
})(typeof globalThis==='object'?globalThis:this);
