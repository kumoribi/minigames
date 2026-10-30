/* Difficulty progress only; no map, resources or active game are saved. */
(function(root){
  'use strict';
  const KEY='kingdom-sweeper-progress-v1';
  function normalize(value){
    const highestCleared=value?.version===1&&Number.isSafeInteger(value.highestCleared)&&value.highestCleared>=0&&value.highestCleared<Number.MAX_SAFE_INTEGER-1?value.highestCleared:0;
    const selected=Number.isSafeInteger(value?.selected)&&value.selected>=1&&value.selected<=highestCleared+1?value.selected:1;
    return {version:1,highestCleared,selected};
  }
  function load(storage){
    let raw;try{raw=storage.getItem(KEY);}catch(_){return {progress:normalize(null),available:false};}
    try{return {progress:normalize(JSON.parse(raw)),available:true};}catch(_){return {progress:normalize(null),available:true};}
  }
  function save(storage,value){try{storage.setItem(KEY,JSON.stringify(normalize(value)));return true;}catch(_){return false;}}
  function select(value,level){const p=normalize(value);return Number.isSafeInteger(level)&&level>=1&&level<=p.highestCleared+1?{...p,selected:level}:p;}
  function complete(value,level,result){
    const p=normalize(value);
    if(result!=='victory'||!Number.isSafeInteger(level)||level<1||level>p.highestCleared+1)return p;
    return {...p,highestCleared:Math.max(p.highestCleared,level)};
  }
  const api={KEY,normalize,load,save,select,complete};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.KingdomProgress=api;
})(typeof globalThis!=='undefined'?globalThis:this);
