(function(root){
  'use strict';
  const config={
    rounds:24,cash:500,income:40,happinessBase:10,
    companies:[
  {
    "id": "sun",
    "name": "ひだまり食品",
    "sector": "食品・生活",
    "initial": 6,
    "dividend": 1,
    "swing": 2,
    "profile": "配当と安定性"
  },
  {
    "id": "wave",
    "name": "青海テクノロジー",
    "sector": "情報・技術",
    "initial": 10,
    "dividend": 0,
    "swing": 8,
    "profile": "無配・値上がり狙い"
  },
  {
    "id": "leaf",
    "name": "木もれび交通",
    "sector": "交通・物流",
    "initial": 14,
    "dividend": 1,
    "swing": 4,
    "profile": "配当と値動きの中間"
  },
  {
    "id": "light",
    "name": "あかつき電力",
    "sector": "エネルギー",
    "initial": 18,
    "dividend": 2,
    "swing": 3,
    "profile": "高配当・自社株買い重視"
  },
  {
    "id": "health",
    "name": "すこやか製薬",
    "sector": "医療・健康",
    "initial": 22,
    "dividend": 1,
    "swing": 12,
    "profile": "配当あり・大きな値動き"
  },
  {
    "id": "space",
    "name": "星めぐり産業",
    "sector": "宇宙・製造",
    "initial": 26,
    "dividend": 0,
    "swing": 18,
    "profile": "無配・最大の値動き"
  }
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
    events:[
  {
    "key": "earn",
    "kind": "earn",
    "name": "好決算",
    "copies": 2,
    "targets": [],
    "description": "ランダムな1社のNPC株を基準値幅分追加し、株価を上げます。"
  },
  {
    "key": "bad",
    "kind": "bad",
    "name": "業績悪化",
    "copies": 2,
    "targets": [],
    "description": "ランダムな1社のNPC株を基準値幅分まで取り除き、株価を下げます。"
  },
  {
    "key": "sell",
    "kind": "sell",
    "name": "大口売り",
    "copies": 2,
    "targets": [],
    "description": "ランダムな1社のNPC株を基準値幅の2倍まで取り除き、株価を下げます。"
  },
  {
    "key": "boom",
    "kind": "boom",
    "name": "好景気",
    "copies": 2,
    "targets": [],
    "description": "全6社のNPC株をそれぞれの基準値幅分追加し、各社の株価を上げます。"
  },
  {
    "key": "buyback-food-energy",
    "kind": "buyback",
    "name": "自社株買い：食品・電力",
    "copies": 2,
    "targets": [
      "sun",
      "light"
    ],
    "description": "ひだまり食品＋2万円、あかつき電力＋3万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "buyback-infrastructure",
    "kind": "buyback",
    "name": "自社株買い：食品・交通・電力",
    "copies": 1,
    "targets": [
      "sun",
      "leaf",
      "light"
    ],
    "description": "ひだまり食品＋2万円、木もれび交通＋4万円、あかつき電力＋3万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "buyback-life",
    "kind": "buyback",
    "name": "自社株買い：食品・製薬",
    "copies": 1,
    "targets": [
      "sun",
      "health"
    ],
    "description": "ひだまり食品＋2万円、すこやか製薬＋12万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "buyback-transport-energy",
    "kind": "buyback",
    "name": "自社株買い：交通・電力",
    "copies": 1,
    "targets": [
      "leaf",
      "light"
    ],
    "description": "木もれび交通＋4万円、あかつき電力＋3万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "buyback-transport-health",
    "kind": "buyback",
    "name": "自社株買い：交通・製薬",
    "copies": 1,
    "targets": [
      "leaf",
      "health"
    ],
    "description": "木もれび交通＋4万円、すこやか製薬＋12万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "buyback-tech-energy",
    "kind": "buyback",
    "name": "自社株買い：技術・電力",
    "copies": 1,
    "targets": [
      "wave",
      "light"
    ],
    "description": "青海テクノロジー＋8万円、あかつき電力＋3万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "buyback-space",
    "kind": "buyback",
    "name": "自社株買い：宇宙",
    "copies": 1,
    "targets": [
      "space"
    ],
    "description": "星めぐり産業＋18万円。記載された全社のNPC株を追加します。"
  },
  {
    "key": "recession",
    "kind": "recession",
    "name": "不景気",
    "copies": 2,
    "targets": [],
    "description": "NPC幸福を4枚追加し、幸福の購入価格を4万円上げます。プレイヤーの幸福は増えません。"
  },
  {
    "key": "ease",
    "kind": "ease",
    "name": "金融緩和",
    "copies": 1,
    "targets": [],
    "description": "元本500万円・金利3%／ラウンドの銀行融資カードを場に1枚追加します。"
  },
  {
    "key": "tight",
    "kind": "tight",
    "name": "金融引き締め",
    "copies": 1,
    "targets": [],
    "description": "場の未契約の銀行融資カードを並び順で先頭から1枚取り除きます。契約済みとプレイヤー融資は対象外です。"
  },
  {
    "key": "vacant",
    "kind": "vacant",
    "name": "住人の退去",
    "copies": 1,
    "targets": [],
    "description": "入居中からランダムに1物件を空室にします。所有者なしの物件も対象。空室は家賃が入りません。"
  },
  {
    "key": "tenant",
    "kind": "tenant",
    "name": "新規入居",
    "copies": 1,
    "targets": [],
    "description": "空室からランダムに1物件を入居中にします。所有者なしの物件も対象です。"
  },
  {
    "key": "salePlus",
    "kind": "salePlus",
    "name": "不動産売却 ＋20%",
    "copies": 2,
    "targets": [],
    "description": "ラウンド先手は所有不動産1件を取得額の120%で任意売却できます。1万円未満切り捨て。見送り可能。"
  },
  {
    "key": "saleMinus",
    "kind": "saleMinus",
    "name": "不動産売却 −20%",
    "copies": 2,
    "targets": [],
    "description": "ラウンド先手は所有不動産1件を取得額の80%で任意売却できます。1万円未満切り捨て。見送り可能。"
  }
]
  };
  if(typeof module==='object'&&module.exports)module.exports=config;else root.LifeCards=config;
})(typeof globalThis==='object'?globalThis:this);
