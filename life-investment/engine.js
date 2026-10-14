(function(root) {
  'use strict';
  const C = typeof module === 'object' && module.exports ? require('./cards.js') : root.LifeCards;
  const copy = value => JSON.parse(JSON.stringify(value));
  const player = (s,id) => s.players.find(p => p.id === id);
  const current = s => player(s,s.active);
  const alive = s => s.players.filter(p => !p.bankrupt);
  const uid = s => 'id' + s.nextId++;
  const fail = text => { throw Error(text); };
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  function ratio(n,basis,denominator=10000) {
    if(!integer(n) || !integer(basis)) fail('金額・割合が不正です');
    const result = Number(BigInt(n)*BigInt(basis)/BigInt(denominator));
    if(!integer(result)) fail('扱える整数の範囲を超えています');
    return result;
  }
  const money = (n,percent) => ratio(n,Math.round(percent*100));
  const interest = l => money(l.principal,l.rate);
  const stocks = (s,id) => s.companies.flatMap(c => c.stocks.filter(t => t.owner === id));
  const happiness = (s,id) => s.happiness.filter(h => h.owner === id).length;
  const dividends = (s,id) => s.companies.reduce((n,c)=>n+c.stocks.filter(t=>t.owner===id).length*c.dividend,0);
  const buybackCount = id => C.events.filter(e=>e.targets.includes(id)).reduce((n,e)=>n+e.copies,0);
  const happyPrice = s => s.config.happinessBase + s.happiness.length;
  const debt = (s,id) => s.loans.filter(l => l.borrower === id).reduce((n,l) => n+l.principal+(l.arrears||0),0) + s.claims.filter(l => l.borrower === id).reduce((n,l) => n+l.amount,0);
  const nextInterest = (s,id) => s.loans.filter(l => l.borrower === id).reduce((n,l) => n+interest(l),0);
  function stockValue(s,id) {
    return s.companies.reduce((sum,c) => {const k=c.stocks.filter(t=>t.owner===id).length;return sum+k*(c.stocks.length-1)-k*(k-1)/2;},0);
  }
  // Credit is an eligibility check, never an asset lock or spending reservation.
  const spendable = (s,id) => player(s,id).cash;
  function creditProfile(s,id) {
    const outstanding=debt(s,id);
    const stock=money(stockValue(s,id),50);
    const property=s.properties.filter(p=>p.owner===id).reduce((n,p)=>n+money(p.cost,50),0);
    // Exclude borrowed cash from cash valuation, then deduct existing debt from the credit limit.
    const ownCash=Math.max(0,player(s,id).cash-outstanding);
    const limit=stock+property+ownCash;
    return {stock,property,ownCash,limit,outstanding,remaining:Math.max(0,limit-outstanding)};
  }
  function random(s) {
    let t=s.rng=(s.rng+0x6D2B79F5)>>>0;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    return ((t^(t>>>14))>>>0)/4294967296;
  }
  function log(s,text) {s.log.push({round:s.round,text});if(s.log.length>100)s.log.shift();}
  function addStock(s,c,owner,cost) {c.stocks.push({id:uid(s),company:c.id,owner,cost,round:s.round});}
  function create(seed=Date.now()>>>0,controllers=['human','ai']) {
    if(controllers.length<2||controllers.length>4||controllers.some(x=>!['human','ai'].includes(x)))fail('人数は2～4人です');
    const s={schemaVersion:4,rulesVersion:5,config:copy(C),gameId:'life4-'+seed+'-'+Date.now(),seed:seed>>>0,rng:seed>>>0,nextId:1,revision:0,phase:'ready',round:1,active:0,leader:0,turnOrder:[],turnIndex:0,mainUsed:false,tradeCompany:null,tradeCount:0,financeUsed:false,
      players:controllers.map((controller,id)=>({id,name:controller==='ai'?'投資家AI '+id:'プレイヤー '+(id+1),controller,cash:C.cash,rehab:false,bankrupt:false,turns:0})),
      companies:C.companies.map(c=>({...c,stocks:[]})),properties:C.properties.map(p=>({...p,owner:null,occupied:true,cost:0})),happiness:[],loans:[],claims:[],offers:[],deck:[],event:null,pending:null,settlement:null,log:[],winners:[]};
    for(const c of s.companies)for(let i=0;i<c.initial;i++)addStock(s,c,'npc',null);
    for(const o of C.bankCards)s.offers.push({...o,id:uid(s),lender:'bank'});
    for(const e of C.events)for(let i=0;i<e.copies;i++)s.deck.push({id:uid(s),key:e.key,kind:e.kind,name:e.name,targets:[...e.targets]});
    for(let i=s.deck.length-1;i>0;i--){const j=Math.floor(random(s)*(i+1));[s.deck[i],s.deck[j]]=[s.deck[j],s.deck[i]];}
    s.leader=Math.floor(random(s)*s.players.length);s.active=s.leader;return s;
  }
  function pay(s,from,to,n,excluding=null) {
    if(!integer(n))fail('金額が不正です');
    const p=player(s,from);if(p&&spendable(s,from,excluding)<n)fail('使用可能な現金が'+(n-spendable(s,from,excluding))+'万円不足しています');
    if(p)p.cash-=n;const q=player(s,to);if(q)q.cash+=n;
  }
  function main(s,company=null) {
    if(s.phase!=='turn'||current(s).bankrupt)fail('通常の手番ではありません');
    if(s.mainUsed&&(!company||s.tradeCompany!==company))fail(s.tradeCompany?'この手番は'+s.companies.find(c=>c.id===s.tradeCompany).name+'だけ売買できます':'主行動は使用済みです');
  }
  function finance(s) {if(s.phase!=='turn'||current(s).bankrupt)fail('金融操作できません');if(s.financeUsed)fail('金融操作は使用済みです');}
  function newLoan(s,borrower,lender,principal,rate,creditAtIssue,emergency=false) {
    const l={id:uid(s),borrower,lender,principal,rate,creditAtIssue,emergency,round:s.round,interestPayments:0,arrears:0,dueTurn:emergency?player(s,borrower).turns+1:null};
    l.initialInterestDue=emergency?interest(l):0;
    s.loans.push(l);return l;
  }
  function emergency(s,id,n,forced=false) {
    if(!integer(n)||n<1)fail('融資元本は1万円以上の整数です');
    const existing=s.loans.find(l=>l.borrower===id&&l.emergency);
    if(existing&&!forced)fail('緊急融資の追加借入・借り直しはできません');
    if(player(s,id).bankrupt)fail('脱落者は借り入れできません');
    if(existing) {existing.principal+=n;existing.initialInterestDue+=money(n,20);log(s,player(s,id).name+'の強制調達 '+n+'万円を緊急融資へ追加。期限は延長しません');}
    else {newLoan(s,id,'bank',n,20,null,true);log(s,player(s,id).name+'が無担保の緊急融資 '+n+'万円・20%（次の自分の手番末が期限）');}
    pay(s,'bank',id,n);
  }
  function eligibleOffer(s,id,o) {
    if(o.lender===id||(o.lender!=='bank'&&player(s,o.lender).bankrupt)||player(s,id).rehab)return false;
    return creditProfile(s,id).remaining>=o.principal;
  }
  function ensureFunding(s,id,required,path) {
    const p=player(s,id);
    while(spendable(s,id)<required) {
      const options=s.offers.filter(o=>eligibleOffer(s,id,o)&&!path.includes(o.lender)).sort((a,b)=>a.rate-b.rate||a.order-b.order||a.id.localeCompare(b.id));
      if(!options.length) {emergency(s,id,required-spendable(s,id),true);break;}
      takeOffer(s,id,options[0].id,path);
    }
    if(p.bankrupt)fail('脱落者からは融資を受けられません');
  }
  function takeOffer(s,id,offerId,path=[]) {
    const o=s.offers.find(o=>o.id===offerId);
    if(!o||!eligibleOffer(s,id,o))fail('この融資は利用できません。追加融資枠と貸し手を確認してください');
    if(path.includes(id))fail('融資の循環を検出しました');
    const creditAtIssue=creditProfile(s,id);
    // Reserve the card and record the debt before recursion so the same credit cannot be used twice.
    s.offers=s.offers.filter(x=>x.id!==o.id);
    const contract=newLoan(s,id,o.lender,o.principal,o.rate,creditAtIssue);
    if(o.lender!=='bank')ensureFunding(s,o.lender,o.principal,[...path,id]);
    pay(s,o.lender,id,o.principal);
    log(s,player(s,id).name+'が'+(o.lender==='bank'?'銀行':player(s,o.lender).name)+'から'+o.principal+'万円・'+o.rate+'%で借入');
    return contract;
  }
  function repaymentTotal(l) {return l.principal+l.arrears+(l.emergency?l.initialInterestDue:0);}
  function repay(s,l) {
    const n=repaymentTotal(l);
    pay(s,l.borrower,s.settlement?'bank':l.lender,n,l.id);
    if(s.settlement)s.settlement.receipts.push({to:l.lender,n});
    s.loans=s.loans.filter(x=>x.id!==l.id);log(s,player(s,l.borrower).name+'が'+l.principal+'万円を完済。借入残高を更新');
  }
  function refinance(s,id,loanId,offerId) {
    const old=s.loans.find(l=>l.id===loanId&&l.borrower===id),o=s.offers.find(o=>o.id===offerId);
    if(!old||!o||o.lender===id||o.principal!==old.principal||o.rate>old.rate||(!old.emergency&&o.rate===old.rate))fail('同額元本で低金利のカードを選んでください（緊急融資は同金利も可）');
    const due=repaymentTotal(old)-old.principal;
    // Replace the old debt atomically. A failed funding chain rolls back the entire transaction.
    s.loans=s.loans.filter(l=>l.id!==old.id);
    if(!eligibleOffer(s,id,o))fail('借り換え先の信用枠が不足しています');
    const l=takeOffer(s,id,offerId);
    // A forced emergency to this borrower must never finance the old emergency's repayment.
    if(old.emergency&&s.loans.some(x=>x.borrower===id&&x.emergency))fail('緊急融資で緊急融資を返済できません');
    pay(s,id,old.lender,old.principal+due);
    log(s,player(s,id).name+'が'+old.rate+'%→'+l.rate+'%へ借り換え');
  }
  function startTurn(s,id) {s.active=id;player(s,id).turns++;s.mainUsed=false;s.tradeCompany=null;s.tradeCount=0;s.financeUsed=false;s.phase='turn';}
  function beginRound(s) {
    s.turnOrder=Array.from({length:s.players.length},(_,i)=>(s.leader+i)%s.players.length).filter(id=>!player(s,id).bankrupt);
    s.turnIndex=0;startTurn(s,s.turnOrder[0]);s.event=s.deck[s.round-1];runEvent(s);
  }
  function runEvent(s) {
    const e=s.event,choose=a=>a.length?a[Math.floor(random(s)*a.length)]:null;let detail='';
    const change=(c,delta)=>{
      const before=c.stocks.length;
      if(delta>0)for(let i=0;i<delta;i++)addStock(s,c,'npc',null);
      else {let remaining=-delta;c.stocks=c.stocks.filter(t=>t.owner!=='npc'||remaining--<=0);}
      return c.name+' '+before+'→'+c.stocks.length+'万円';
    };
    if(['earn','bad','sell'].includes(e.kind)) {
      const c=choose(s.companies);detail=change(c,c.swing*(e.kind==='earn'?1:e.kind==='sell'?-2:-1));
    } else if(e.kind==='buyback')detail=e.targets.map(id=>{const c=s.companies.find(c=>c.id===id);return change(c,c.swing);}).join(' ／ ');
    else if(e.kind==='recession') {for(let i=0;i<4;i++)s.happiness.push({id:uid(s),owner:'npc'});detail='NPC幸福4枚。幸福価格＋4万円';}
    else if(e.kind==='boom')detail=s.companies.map(c=>change(c,c.swing)).join(' ／ ');
    else if(e.kind==='ease') {s.offers.push({id:uid(s),lender:'bank',principal:500,rate:3,order:s.nextId});detail='低金利カード500万円・3%を追加';}
    else if(e.kind==='tight') {const o=s.offers.find(o=>o.lender==='bank');if(o)s.offers=s.offers.filter(x=>x.id!==o.id);detail=o?'未契約の銀行カードを1枚除去':'対象の銀行カードなし';}
    else if(e.kind==='vacant'||e.kind==='tenant') {const p=choose(s.properties.filter(p=>p.occupied===(e.kind==='vacant')));if(p){p.occupied=e.kind==='tenant';detail=p.name+(p.occupied?'が入居':'が空室');}else detail='対象の物件なし';}
    else {
      const rate=e.kind==='salePlus'?20:-20;
      detail=current(s).name+'に不動産売却機会 '+(rate>0?'＋':'')+rate+'%';
      if(s.properties.some(p=>p.owner===s.active)){s.phase='event';s.pending={owner:s.active,rate,eventId:e.id};}
      else detail+='（売却可能な所有物件なし）';
    }
    e.detail=detail;log(s,e.name+'：'+detail);
  }
  function sellStock(s,c,stockId) {
    const i=c.stocks.findIndex(t=>t.id===stockId&&t.owner===s.active);
    if(i<0)fail('自分の株を選んでください');
    const t=c.stocks[i];c.stocks.splice(i,1);pay(s,'bank',s.active,c.stocks.length);
    log(s,current(s).name+'が'+c.name+'を'+c.stocks.length+'万円で売却（損益'+(c.stocks.length-t.cost)+'万円）');
  }
  function distributeClaims(s,id) {
    const p=player(s,id),cs=s.claims.filter(c=>c.borrower===id),total=cs.reduce((n,c)=>n+c.amount,0);
    if(!total){p.rehab=false;return;}
    const amount=Math.min(p.cash,total),parts=cs.map(c=>Number(BigInt(amount)*BigInt(c.amount)/BigInt(total)));let rest=amount-parts.reduce((a,b)=>a+b,0);
    for(let i=0;rest>0;i=(i+1)%cs.length)if(parts[i]<cs[i].amount){parts[i]++;rest--;}
    for(let i=0;i<cs.length;i++) {
      p.cash-=parts[i];cs[i].amount-=parts[i];
      if(s.settlement)s.settlement.receipts.push({to:cs[i].lender,n:parts[i]});else pay(s,'bank',cs[i].lender,parts[i]);
    }
    s.claims=s.claims.filter(c=>c.amount>0);p.rehab=s.claims.some(c=>c.borrower===id);
  }
  function liquidate(s,id,bankrupt=false) {
    const p=player(s,id);
    s.offers=s.offers.filter(o=>o.lender!==id);
    for(const c of s.companies)for(const t of [...c.stocks].filter(t=>t.owner===id)) {c.stocks.splice(c.stocks.findIndex(x=>x.id===t.id),1);p.cash+=c.stocks.length;}
    for(const l of s.loans.filter(l=>l.borrower===id)) {
      const unpaid=s.settlement?(!s.settlement.processed.includes(l.id)?interest(l):0):(l.emergency?l.initialInterestDue:0);
      s.claims.push({id:uid(s),borrower:id,lender:l.lender,amount:l.principal+l.arrears+unpaid});
    }
    s.loans=s.loans.filter(l=>l.borrower!==id);p.rehab=true;p.bankrupt=bankrupt;distributeClaims(s,id);
    if(s.settlement)s.settlement.budget[id]=p.cash;
    log(s,p.name+(bankrupt?'は緊急融資を返済できず破産・脱落':'は資産整理。収入を残債返済へ'));
  }
  function checkSurvivors(s) {
    if(alive(s).length<=1) {s.phase='finished';s.pending=null;s.winners=alive(s).map(p=>p.id);log(s,s.winners.length?player(s,s.winners[0]).name+'が最後の生存者として勝利':'全員脱落。勝者なし');return true;}
    return false;
  }
  function closeTurn(s) {
    const id=s.active,p=current(s);
    // Due obligations auto-settle outside the finance action slot; new emergency loans do not reset a deadline.
    for(const l of [...s.loans].filter(l=>l.borrower===id&&l.emergency&&l.dueTurn<=p.turns)) {
      if(spendable(s,id,l.id)>=repaymentTotal(l))repay(s,l);else{liquidate(s,id,true);break;}
    }
    if(checkSurvivors(s))return;
    while(++s.turnIndex<s.turnOrder.length)if(!player(s,s.turnOrder[s.turnIndex]).bankrupt){startTurn(s,s.turnOrder[s.turnIndex]);return;}
    startSettlement(s);
  }
  function startSettlement(s) {
    s.phase='settle';
    for(const p of alive(s)) {const rent=s.properties.filter(x=>x.owner===p.id&&x.occupied).reduce((n,x)=>n+x.rent,0);const dividend=dividends(s,p.id);p.cash+=s.config.income+rent+dividend;log(s,p.name+'の収入＋'+(s.config.income+rent+dividend)+'万円（基礎'+s.config.income+'・家賃'+rent+'・配当'+dividend+'）');}
    s.settlement={index:0,budget:s.players.map(p=>spendable(s,p.id)),receipts:[],processed:[],emergency:false};
    for(const p of alive(s).filter(p=>p.rehab))distributeClaims(s,p.id);
    s.settlement.budget=s.players.map(p=>spendable(s,p.id));continueSettlement(s);
  }
  function continueSettlement(s) {
    const z=s.settlement;
    while(z.index<s.players.length) {
      const p=s.players[z.index];if(p.bankrupt){z.index++;continue;}
      const due=s.loans.filter(l=>l.borrower===p.id&&!z.processed.includes(l.id)),bill=due.reduce((n,l)=>n+interest(l),0);
      if(z.budget[p.id]<bill){s.phase='rescue';s.active=p.id;return;}
      for(const l of due) {const n=interest(l);p.cash-=n;z.budget[p.id]-=n;l.interestPayments++;l.initialInterestDue=0;z.receipts.push({to:l.lender,n});z.processed.push(l.id);}
      z.index++;z.emergency=false;
    }
    for(const r of z.receipts)pay(s,'bank',r.to,r.n);
    s.settlement=null;if(checkSurvivors(s))return;
    if(s.round===s.config.rounds){finish(s);return;}
    s.round++;do{s.leader=(s.leader+1)%s.players.length;}while(player(s,s.leader).bankrupt);beginRound(s);
  }
  function finish(s) {
    s.settlement={receipts:[],processed:s.loans.map(l=>l.id),budget:s.players.map(p=>spendable(s,p.id))};
    // A last-round emergency cannot evade repayment merely because the next turn never arrives.
    for(const p of alive(s))for(const l of [...s.loans].filter(l=>l.borrower===p.id&&l.emergency)) {
      if(spendable(s,p.id,l.id)>=repaymentTotal(l))repay(s,l);else{liquidate(s,p.id,true);break;}
    }
    for(const p of alive(s))liquidate(s,p.id,false);
    for(const r of s.settlement.receipts)pay(s,'bank',r.to,r.n);
    s.settlement=null;s.offers=[];s.phase='finished';
    const survivors=alive(s),best=survivors.length?Math.max(...survivors.map(p=>happiness(s,p.id))):null;
    s.winners=survivors.filter(p=>happiness(s,p.id)===best).map(p=>p.id);
    log(s,s.winners.length?'人生の決算。幸福'+best+'点で'+s.winners.map(id=>player(s,id).name).join('・')+'が勝利':'全員脱落。勝者なし');
  }
  function execute(s,a) {
    if(a.actor!==undefined&&a.actor!==s.active)fail('あなたの手番ではありません');
    const p=current(s),c=s.companies.find(c=>c.id===a.company),prop=s.properties.find(p=>p.id===a.property);
    if(a.type==='start'){if(s.phase!=='ready')fail('開始済みです');beginRound(s);return;}
    if(s.phase==='finished'||p.bankrupt)fail('終了・脱落後は操作できません');
    if(a.type==='eventSell'||a.type==='eventSkip') {
      if(s.phase!=='event'||!s.pending)fail('売却イベントが必要です');
      if(a.type==='eventSell') {
        if(!prop||prop.owner!==p.id)fail('自分の物件を選んでください');
        const n=money(prop.cost,100+s.pending.rate);pay(s,'bank',p.id,n);log(s,prop.name+'を'+n+'万円で売却');prop.owner=null;prop.cost=0;
      }
      s.pending=null;s.phase='turn';return;
    }
    if(a.type==='rescueSell') {
      if(s.phase!=='rescue'||!c)fail('救済中の保有株を選んでください');
      sellStock(s,c,a.stock);s.settlement.budget[p.id]=spendable(s,p.id);continueSettlement(s);return;
    }
    if(a.type==='rescueBorrow') {
      if(s.phase!=='rescue'||s.settlement.emergency)fail('救済借入は1回までです');
      const bill=s.loans.filter(l=>l.borrower===p.id&&!s.settlement.processed.includes(l.id)).reduce((n,l)=>n+interest(l),0);
      // Include the new loan's own 20% interest; ceiling is for principal sizing, not interest rounding.
      let n=Math.max(1,Math.ceil((bill-s.settlement.budget[p.id])/0.8));
      emergency(s,p.id,n);s.settlement.emergency=true;s.settlement.budget[p.id]=spendable(s,p.id);continueSettlement(s);return;
    }
    if(a.type==='restructure') {
      if(s.phase!=='rescue')fail('支払不足時のみ資産整理できます');
      liquidate(s,p.id,s.loans.some(l=>l.borrower===p.id&&l.emergency));continueSettlement(s);return;
    }
    if(a.type==='buyStock'||a.type==='sellStock') {
      if(!c)fail('会社が不正です');main(s,c.id);
      if(a.type==='buyStock'){
        const quantity=a.quantity===undefined?1:a.quantity;
        if(!Number.isSafeInteger(quantity)||quantity<1)fail('購入株数は1以上の整数で指定してください');
        const q=BigInt(quantity),total=q*BigInt(c.stocks.length)+q*(q+1n)/2n;
        if(total>BigInt(p.cash))fail('使用可能な現金が不足しています');
        // Keep each card, price, acquisition cost and log identical to sequential purchases.
        for(let i=0;i<quantity;i++){const n=c.stocks.length+1;pay(s,p.id,'bank',n);addStock(s,c,p.id,n);log(s,p.name+'が'+c.name+'を'+n+'万円で購入');}
        s.tradeCount+=quantity-1;
      }
      else sellStock(s,c,a.stock);
      s.mainUsed=true;s.tradeCompany=c.id;s.tradeCount++;return;
    }
    if(a.type==='buyHappy') {
      if(s.phase!=='turn')fail('幸福は自分の通常手番中に購入できます');
      const n=happyPrice(s);
      if(p.rehab)fail('残債完済まで幸福を購入できません');
      if(p.cash-n+stockValue(s,p.id)+s.properties.filter(x=>x.owner===p.id).reduce((n,x)=>n+money(x.cost,50),0)-debt(s,p.id)-nextInterest(s,p.id)<0)fail('購入後の純資産が次回利息を下回ります');
      pay(s,p.id,'bank',n);s.happiness.push({id:uid(s),owner:p.id});log(s,p.name+'が幸福を'+n+'万円で購入');return;
    }
    if(a.type==='buyProperty') {
      main(s);if(!prop||prop.owner!==null)fail('購入できる物件を選んでください');pay(s,p.id,'bank',prop.price);prop.owner=p.id;prop.cost=prop.price;s.mainUsed=true;log(s,p.name+'が'+prop.name+'を購入');return;
    }
    if(a.type==='borrow') {finance(s);if(p.rehab)fail('資産整理中は借り入れできません');if(a.offer==='emergency')emergency(s,p.id,a.principal??100);else takeOffer(s,p.id,a.offer);s.financeUsed=true;return;}
    if(a.type==='repay') {finance(s);const l=s.loans.find(l=>l.id===a.loan&&l.borrower===p.id);if(!l)fail('自分の契約を選んでください');repay(s,l);s.financeUsed=true;return;}
    if(a.type==='refinance') {finance(s);refinance(s,p.id,a.loan,a.offer);s.financeUsed=true;return;}
    if(a.type==='offer') {
      finance(s);if(p.rehab)fail('資産整理中は融資カードを置けません');
      const n=Number(a.principal),rate=Number(a.rate);
      if(!integer(n)||n<1)fail('元本は1万円以上の整数です');
      if(!Number.isFinite(rate)||rate<0||rate>20||Math.abs(rate*100-Math.round(rate*100))>1e-8)fail('金利は0～20%、小数第2位までです');
      s.offers.push({id:uid(s),lender:p.id,principal:n,rate,order:s.nextId});s.financeUsed=true;log(s,p.name+'が市場へ融資カード '+n+'万円・'+rate+'%を配置（資金確保なし）');return;
    }
    if(a.type==='cancelOffer') {
      if(s.phase!=='turn')fail('手番中のみ取消できます');const o=s.offers.find(o=>o.id===a.offer&&o.lender===p.id);if(!o)fail('自分のカードを選んでください');s.offers=s.offers.filter(x=>x.id!==o.id);log(s,'未契約の融資カードを取消。行動枠は戻りません');return;
    }
    if(a.type==='end'){if(s.phase!=='turn')fail('未完了の処理があります');closeTurn(s);return;}
    fail('不明な操作です');
  }
  function dispatch(state,action) {
    if(action.revision!==undefined&&action.revision!==state.revision)return {ok:false,error:'状態が変わりました。内容を再確認してください',state};
    const s=copy(state);try{execute(s,action);s.revision++;assertState(s);return {ok:true,state:s};}catch(e){return {ok:false,error:e.message,state};}
  }
  function assertState(s) {
    if(s.schemaVersion!==4||s.rulesVersion!==5)fail('旧ルールの保存です。旧版の入口から再開してください');
    if(JSON.stringify(s.config)!==JSON.stringify(C))fail('保存された設定が対応ルールと一致しません');
    if(!['ready','turn','event','rescue','finished'].includes(s.phase)||!integer(s.round)||s.round<1||s.round>24||!integer(s.revision)||!integer(s.nextId)||!integer(s.rng))fail('進行状態が不正です');
    if(!Array.isArray(s.players)||s.players.length<2||s.players.length>4||s.players.some((p,i)=>p.id!==i||!integer(p.cash)||!integer(p.turns)||!['human','ai'].includes(p.controller)||typeof p.bankrupt!=='boolean')||!player(s,s.active))fail('プレイヤー状態が不正です');
    const ids=new Set(),check=x=>{if(typeof x.id!=='string'||ids.has(x.id))fail('IDが重複・欠損しています');ids.add(x.id);};
    const lender=id=>id==='bank'||!!player(s,id);
    if(s.companies.length!==C.companies.length||new Set(s.companies.map(c=>c.id)).size!==C.companies.length)fail('会社数・IDが不正です');
    for(const c of s.companies) {
      const definition=C.companies.find(x=>x.id===c.id);
      if(!definition||Object.keys(definition).some(k=>c[k]!==definition[k]))fail('会社の配当・値幅・設定が不正です');
      for(const t of c.stocks){check(t);if(t.company!==c.id||(t.owner!=='npc'&&(!player(s,t.owner)||!integer(t.cost))))fail('株の所有権が不正です');}
    }
    for(const h of s.happiness){check(h);if(h.owner!=='npc'&&!player(s,h.owner))fail('幸福の所有者が不正です');}
    if(s.properties.length!==C.properties.length||new Set(s.properties.map(p=>p.id)).size!==C.properties.length)fail('物件数・IDが不正です');
    for(const p of s.properties)if(!C.properties.some(x=>x.id===p.id)||!integer(p.cost)||typeof p.occupied!=='boolean'||(p.owner!==null&&!player(s,p.owner)))fail('物件が不正です');
    if(s.deck.length!==C.events.reduce((n,e)=>n+e.copies,0))fail('山札が欠損しています');
    for(const e of s.deck){check(e);const d=C.events.find(x=>x.key===e.key);if(!d||e.kind!==d.kind||e.name!==d.name||JSON.stringify(e.targets)!==JSON.stringify(d.targets))fail('イベントが不正です');}
    for(const d of C.events)if(s.deck.filter(e=>e.key===d.key).length!==d.copies)fail('イベントの枚数が不正です');
    for(const o of [...s.offers,...s.loans]) {
      check(o);if(!lender(o.lender)||!integer(o.principal)||o.principal<1||!Number.isFinite(o.rate)||o.rate<0||o.rate>20)fail('融資カードが不正です');
    }
    for(const l of s.loans) {
      if(!player(s,l.borrower)||l.lender===l.borrower||!integer(l.arrears)||!integer(l.interestPayments)||!integer(l.initialInterestDue))fail('契約が不正です');
      if('collateral' in l)fail('資産拘束型の旧契約が混在しています');
      const credit=l.creditAtIssue;
      if(l.emergency) {
        if(credit!==null||!integer(l.dueTurn)||l.dueTurn<1||l.rate!==20)fail('緊急融資の条件が不正です');
      } else {
        if(!credit||['stock','property','ownCash','limit','outstanding','remaining'].some(k=>!integer(credit[k]))||credit.limit!==credit.stock+credit.property+credit.ownCash||credit.remaining!==Math.max(0,credit.limit-credit.outstanding)||credit.remaining<l.principal)fail('契約時の信用評価が不正です');
      }
    }
    for(const c of s.claims){check(c);if(!player(s,c.borrower)||!lender(c.lender)||!integer(c.amount)||c.amount<1)fail('残債が不正です');}
    for(const p of s.players)if(!integer(debt(s,p.id)))fail('債務が不正です');
    if(s.phase==='turn'&&current(s).bankrupt)fail('脱落者に手番があります');
    if(s.tradeCompany&&!s.companies.some(c=>c.id===s.tradeCompany))fail('売買銘柄が不正です');
    if(s.phase==='event'&&(!s.pending||s.pending.owner!==s.active))fail('イベント選択状態が不正です');
    if(s.phase==='rescue'&&(!s.settlement||s.settlement.index!==s.active))fail('精算状態が不正です');
    return true;
  }
  function upgradeState(state) {const s=copy(state);assertState(s);return s;}
  function actions(s) {
    const out=[],id=s.active;
    if(s.phase==='ready')return [{type:'start'}];
    if(s.phase==='event'){for(const p of s.properties.filter(p=>p.owner===id))out.push({type:'eventSell',property:p.id});out.push({type:'eventSkip'});return out;}
    if(s.phase==='rescue') {
      for(const c of s.companies)for(const t of c.stocks.filter(t=>t.owner===id))out.push({type:'rescueSell',company:c.id,stock:t.id});
      out.push({type:'rescueBorrow'},{type:'restructure'});return out;
    }
    if(s.phase!=='turn')return out;
    out.push({type:'buyHappy'});
    if(!s.mainUsed) {for(const p of s.properties.filter(p=>p.owner===null))out.push({type:'buyProperty',property:p.id});}
    for(const c of s.companies)if(!s.mainUsed||s.tradeCompany===c.id) {
      out.push({type:'buyStock',company:c.id});for(const t of c.stocks.filter(t=>t.owner===id))out.push({type:'sellStock',company:c.id,stock:t.id});
    }
    if(!s.financeUsed) {
      for(const o of s.offers.filter(o=>o.lender!==id))out.push({type:'borrow',offer:o.id});
      out.push({type:'borrow',offer:'emergency',principal:100});
      for(const l of s.loans.filter(l=>l.borrower===id)) {out.push({type:'repay',loan:l.id});for(const o of s.offers.filter(o=>o.lender!==id&&o.principal===l.principal))out.push({type:'refinance',loan:l.id,offer:o.id});}
      for(const target of alive(s).filter(p=>p.id!==id)) {
        const urgent=s.loans.find(l=>l.borrower===target.id&&l.emergency);
        if(urgent&&!s.offers.some(o=>o.lender===id&&o.principal===urgent.principal))out.push({type:'offer',principal:urgent.principal,rate:18});
      }
    }
    for(const o of s.offers.filter(o=>o.lender===id))out.push({type:'cancelOffer',offer:o.id});
    out.push({type:'end'});return out;
  }
  const E={create,dispatch,assertState,upgradeState,actions,player,current,alive,interest,repaymentTotal,debt,nextInterest,stocks,stockValue,dividends,buybackCount,happiness,happyPrice,money,spendable,creditProfile};
  if(typeof module==='object'&&module.exports)module.exports=E;else root.LifeEngine=E;
})(typeof globalThis==='object'?globalThis:this);
