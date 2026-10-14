(function(root){
  'use strict';
  const KEY='life-investment-save-v4';let known=null;
  function read(){const raw=localStorage.getItem(KEY);known=raw;if(!raw)return null;const e=JSON.parse(raw);if(e.format!==4||!e.state)throw Error('対応していない保存形式です');return root.LifeEngine.upgradeState(e.state);}
  function save(state){const raw=localStorage.getItem(KEY);if(raw!==known)throw Error('別のタブで進行が更新されました。再読み込みしてください');const next=JSON.stringify({format:4,token:state.gameId+':'+state.revision+':'+Date.now()+':'+Math.random(),state});localStorage.setItem(KEY,next);known=next;}
  function legacySaves(){return [{key:'life-investment-save-v3',path:'../legacy-v3/',label:'旧ルールv3（配当なし・24枚）'},{key:'life-investment-save-v2',path:'../legacy-v2/',label:'旧ルールv2（資産拘束あり）'},{key:'life-investment-save-v1',path:'../legacy/',label:'旧ルールv1'}].filter(x=>localStorage.getItem(x.key)!==null);}
  root.LifeStorage={read,save,hasLegacy:()=>legacySaves().length>0,legacySaves,key:KEY};
})(globalThis);
