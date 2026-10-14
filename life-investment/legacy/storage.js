(function(root){
  'use strict';const KEY='life-investment-save-v1';let known=null;
  function read(){const raw=localStorage.getItem(KEY);known=raw;if(!raw)return null;const envelope=JSON.parse(raw);if(envelope.format!==1||!envelope.state)throw Error('対応していない保存形式です。新規開始前に保存内容をご確認ください');root.LifeEngine.assertState(envelope.state);return envelope.state;}
  function save(state){const raw=localStorage.getItem(KEY);if(raw!==known)throw Error('別のタブで保存が更新されました。この画面の進行を止めて再読み込みしてください');const token=state.gameId+':'+state.revision+':'+Date.now()+':'+Math.random(),next=JSON.stringify({format:1,token,state});localStorage.setItem(KEY,next);known=next;}
  root.LifeStorage={read,save,key:KEY};
})(globalThis);
