(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.LifeEngine;
  function choose(s,strategy='mixed') {
    const p=E.current(s),candidates=E.actions(s),remaining=25-s.round;
    const urgent=s.loans.find(l=>l.borrower===p.id&&l.emergency&&l.dueTurn<=p.turns);
    function score(a) {
      if(a.type==='start')return 200;
      if(a.type==='eventSkip')return 1;
      if(a.type==='eventSell')return remaining<8||s.pending.rate>0?90:0;
      if(a.type==='rescueSell')return 100;
      if(a.type==='rescueBorrow')return 10;
      if(a.type==='restructure')return 0;
      if(a.type==='repay')return urgent?.id===a.loan?180:s.round>19?55:0;
      if(a.type==='refinance')return urgent?.id===a.loan?170:65;
      if(urgent) {
        if(a.type==='sellStock')return 140;
        if(a.type==='borrow'&&a.offer!=='emergency')return 120;
        if(a.type==='end')return 10;
        return -20;
      }
      // Repeated trading is legal for humans. AI stops after a short batch and never churns buy/sell.
      if(a.type==='buyStock')return s.tradeCount>=3?0:s.round<15?(strategy==='stock'?95:45):0;
      if(a.type==='sellStock')return s.tradeCount>=3?0:s.round>17?70:0;
      if(a.type==='buyHappy')return strategy==='happy'?100:s.round>10?90:35;
      if(a.type==='buyProperty') {const prop=s.properties.find(p=>p.id===a.property);return strategy==='happy'?0:prop.occupied&&remaining*prop.rent>=prop.price?95:0;}
      if(a.type==='offer')return 30;
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
