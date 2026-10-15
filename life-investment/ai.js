(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.LifeEngine;
  function choose(s,strategy='mixed') {
    const p=E.current(s),candidates=E.actions(s),remaining=25-s.round;
    const urgent=s.loans.find(l=>l.borrower===p.id&&l.emergency&&l.dueTurn<=p.turns);
    const rent=s.properties.filter(x=>x.owner===p.id&&x.occupied).reduce((n,x)=>n+x.rent,0);
    const recurring=s.config.income+rent+E.dividends(s,p.id),interest=E.nextInterest(s,p.id);
    const emergencyReserve=s.loans.filter(l=>l.borrower===p.id&&l.emergency).reduce((n,l)=>n+E.repaymentTotal(l),0);
    // Plan from public prices and recurring cash only. Never inspect the shuffled deck.
    const propertyPlan=strategy==='mixed'&&!s.mainUsed&&!p.rehab&&!emergencyReserve?s.properties.filter(x=>x.owner===null&&x.occupied&&remaining*x.rent+x.price/2>x.price).sort((a,b)=>a.price-b.price)[0]:null;
    const funding=propertyPlan&&p.cash<propertyPlan.price&&!s.financeUsed?s.offers.filter(o=>o.lender!==p.id&&o.principal>=propertyPlan.price-p.cash&&o.principal<=E.creditProfile(s,p.id).remaining&&o.rate<20&&o.lender==='bank'&&recurring+propertyPlan.rent>interest+E.interest(o)&&remaining*(propertyPlan.rent-E.interest(o))+propertyPlan.price/2>propertyPlan.price).sort((a,b)=>E.interest(a)-E.interest(b))[0]:null;
    const saving=propertyPlan&&s.round<5&&p.cash<propertyPlan.price&&propertyPlan.price-p.cash<=200;
    function score(a) {
      if(a.type==='start')return 200;
      if(a.type==='eventSkip')return 1;
      if(a.type==='eventSell')return remaining<8||s.pending.rate>0?90:0;
      if(a.type==='rescueSell')return 100;
      if(a.type==='rescueBorrow')return 10;
      if(a.type==='restructure')return 0;
      if(a.type==='repay'){const l=s.loans.find(l=>l.id===a.loan);return urgent?.id===a.loan?180:l?.emergency?165:p.cash-E.repaymentTotal(l)>=E.happyPrice(s)&&interest>recurring/3?80:s.round>19?55:0;}
      if(a.type==='refinance')return urgent?.id===a.loan?170:65;
      if(urgent) {
        if(a.type==='sellStock')return 140;
        if(a.type==='borrow'&&a.offer!=='emergency')return 120;
        if(a.type==='end')return 10;
        return -20;
      }
      if(a.type==='borrow')return funding?.id===a.offer?110:-10;
      // Repeated trading is legal for humans. AI stops after a short batch and never churns buy/sell.
      if(a.type==='buyStock') {
        if(s.tradeCount>=3||s.round>=15||saving||funding||p.cash-(s.companies.find(c=>c.id===a.company).stocks.length+1)<emergencyReserve+interest)return 0;
        const c=s.companies.find(c=>c.id===a.company),price=c.stocks.length+1;
        const income=remaining*c.dividend,returnScore=Math.min(20,income/price*10);
        return (strategy==='stock'?85:45)+returnScore+E.buybackCount(c.id)+Math.min(5,c.swing/price*3);
      }
      if(a.type==='sellStock'){const c=s.companies.find(c=>c.id===a.company);return s.tradeCount>=3?0:s.round>17?70-Math.min(20,remaining*c.dividend):0;}
      // Happiness uses no action slot; repeat while affordable under the same human rules.
      if(a.type==='buyHappy')return saving||funding||p.cash-E.happyPrice(s)<emergencyReserve+Math.max(0,interest-recurring)?0:strategy==='happy'?100:s.round>10?90:35;
      if(a.type==='buyProperty') {const prop=s.properties.find(p=>p.id===a.property);return strategy!=='mixed'?0:propertyPlan?.id===prop.id&&recurring+prop.rent>interest?105:0;}
      if(a.type==='offer')return p.cash>=a.principal&&recurring>=interest?30:0;
      if(a.type==='end')return 10;
      return -10;
    }
    candidates.sort((a,b)=>score(b)-score(a));
    // Evaluate legality in preference order; do not simulate every low-priority trade.
    for(const action of candidates)if(E.dispatch(s,action).ok)return action;
    return null;
  }
  if(typeof module==='object'&&module.exports)module.exports={choose};else root.LifeAI={choose};
})(typeof globalThis==='object'?globalThis:this);
