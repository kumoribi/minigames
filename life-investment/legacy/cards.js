(function(root){
  'use strict';
  const config = {
    rounds:24, cash:60, income:4, happinessBase:10, maxDebt:50, maxLoans:2,
    companies:[{id:'sun',name:'ひだまり食品',sector:'暮らしを支える',initial:6},{id:'wave',name:'青海テクノロジー',sector:'未来をつくる',initial:10},{id:'leaf',name:'木もれび交通',sector:'街をつなぐ',initial:14}],
    properties:[{id:'apartment',name:'小さなアパート',price:40,rent:4},{id:'shop',name:'街角の店舗',price:50,rent:5},{id:'office',name:'駅前オフィス',price:60,rent:6}],
    events:[['earn','好決算'],['bad','業績悪化'],['sell','大口売り'],['buyback','自社株買い'],['recession','不景気'],['boom','好景気'],['ease','金融緩和'],['tight','金融引き締め'],['vacant','住人の退去'],['tenant','新規入居'],['salePlus','不動産売却 ＋20%'],['saleMinus','不動産売却 −20%']]
  };
  if(typeof module==='object'&&module.exports)module.exports=config; else root.LifeCards=config;
})(typeof globalThis==='object'?globalThis:this);
