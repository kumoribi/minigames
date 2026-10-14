(function(root){
  'use strict';const E=typeof module==='object'&&module.exports?require('./engine.js'):root.LifeEngine;
  function choose(s,strategy='mixed'){
    const legal=E.actions(s).filter(a=>E.dispatch(s,a).ok),id=s.active,remaining=25-s.round;
    if(!legal.length)return null;
    const score=a=>{
      if(a.type==='start')return 100;
      if(a.type==='eventSkip')return 1;
      if(a.type==='eventSell')return remaining<8||s.pending.rate>0?90:0;
      if(a.type==='rescueSell')return 90;
      if(a.type==='rescueBorrow')return 30;
      if(a.type==='restructure')return 1;
      if(a.type==='buyHappy')return strategy==='happy'?90:s.round>12?85:35;
      if(a.type==='buyProperty'){const p=s.properties.find(p=>p.id===a.property);return strategy==='happy'?2:(p.occupied&&remaining*p.rent>p.price?95:5);}
      if(a.type==='buyStock')return s.round<15?(strategy==='stock'?95:50):5;
      if(a.type==='sellStock'){const c=s.companies.find(c=>c.id===a.company),t=c.stocks.find(t=>t.id===a.stock);return s.round>13||c.stocks.length-1>t.cost?65:0;}
      if(a.type==='repay')return s.round>10?55:5;
      if(a.type==='refinance')return 70;
      if(a.type==='end')return 10;
      return -5; // AI does not acquire unneeded credit merely because it is available.
    };
    return legal.sort((a,b)=>score(b)-score(a))[0];
  }
  if(typeof module==='object'&&module.exports)module.exports={choose};else root.LifeAI={choose};
})(typeof globalThis==='object'?globalThis:this);
