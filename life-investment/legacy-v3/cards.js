(function(root){
  'use strict';
  const config={
    rounds:24,cash:500,income:40,happinessBase:10,
    companies:[
      {id:'sun',name:'ひだまり食品',sector:'食品・生活',initial:6},
      {id:'wave',name:'青海テクノロジー',sector:'情報・技術',initial:10},
      {id:'leaf',name:'木もれび交通',sector:'交通・物流',initial:14},
      {id:'light',name:'あかつき電力',sector:'エネルギー',initial:18},
      {id:'health',name:'すこやか製薬',sector:'医療・健康',initial:22},
      {id:'space',name:'星めぐり産業',sector:'宇宙・製造',initial:26}
    ],
    properties:[
      {id:'apartment',name:'郊外のワンルーム',price:400,rent:20},
      {id:'house',name:'街角の一戸建て',price:1500,rent:75},
      {id:'shop',name:'駅前の店舗',price:5000,rent:250},
      {id:'office',name:'オフィスビル',price:10000,rent:500},
      {id:'mall',name:'ショッピングモール',price:30000,rent:1500},
      {id:'tower',name:'複合タワー',price:100000,rent:5000}
    ],
    bankCards:[{principal:200,rate:5,order:0},{principal:500,rate:7,order:1},{principal:1500,rate:10,order:2}],
    events:[['earn','好決算'],['bad','業績悪化'],['sell','大口売り'],['buyback','自社株買い'],['recession','不景気'],['boom','好景気'],['ease','金融緩和'],['tight','金融引き締め'],['vacant','住人の退去'],['tenant','新規入居'],['salePlus','不動産売却 ＋20%'],['saleMinus','不動産売却 −20%']]
  };
  // Reference metadata is excluded from serialized game rules to preserve existing saves.
  Object.defineProperties(config,{eventCopies:{value:2},eventDescriptions:{value:{"earn": "ランダムな1社にNPC株を2枚追加し、株価を2万円上げます。", "bad": "ランダムな1社のNPC株を最大2枚取り除きます。プレイヤーの株は減りません。", "sell": "ランダムな1社のNPC株を最大3枚取り除きます。プレイヤーの株は減りません。", "buyback": "ランダムな1社にNPC株を2枚追加し、株価を2万円上げます。", "recession": "NPC幸福カードを4枚追加し、幸福の購入価格を4万円上げます。プレイヤーの幸福は増えません。", "boom": "全6社にNPC株を1枚ずつ追加し、それぞれの株価を1万円上げます。", "ease": "元本500万円・金利3%／ラウンドの銀行融資カードを場に1枚追加します。", "tight": "場にある未契約の銀行融資カードを並び順で先頭から1枚取り除きます。プレイヤー融資や契約済みの借入は対象外です。", "vacant": "入居中の物件からランダムに1件を空室にします。所有者がいない物件も対象です。空室は家賃が入りません。", "tenant": "空室の物件からランダムに1件を入居中にします。所有者がいない物件も対象です。", "salePlus": "ラウンド先手のプレイヤーは、所有不動産1件を取得額の120%で任意売却できます。1万円未満切り捨て。見送りも可能です。", "saleMinus": "ラウンド先手のプレイヤーは、所有不動産1件を取得額の80%で任意売却できます。1万円未満切り捨て。見送りも可能です。"}}});
  if(typeof module==='object'&&module.exports)module.exports=config;else root.LifeCards=config;
})(typeof globalThis==='object'?globalThis:this);
