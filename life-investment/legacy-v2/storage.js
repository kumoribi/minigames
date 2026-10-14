(function(root){
  'use strict';
  const KEY='life-investment-save-v2',LEGACY='life-investment-save-v1';let known=null;
  function read(){const raw=localStorage.getItem(KEY);known=raw;if(!raw)return null;const e=JSON.parse(raw);if(e.format!==2||!e.state)throw Error('対応していない保存形式です');root.LifeEngine.assertState(e.state);return e.state;}
  function save(state){const raw=localStorage.getItem(KEY);if(raw!==known)throw Error('別のタブで進行が更新されました。再読み込みしてください');const next=JSON.stringify({format:2,token:state.gameId+':'+state.revision+':'+Date.now()+':'+Math.random(),state});localStorage.setItem(KEY,next);known=next;}
  function hasLegacy(){return localStorage.getItem(LEGACY)!==null;}
  root.LifeStorage={read,save,hasLegacy,key:KEY};
})(globalThis);
