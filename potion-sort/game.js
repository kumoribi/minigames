const CAPACITY = 4;
let bottles, selected = null, history = [], moves = 0, stage = 1;
const bottlesEl = document.querySelector('#bottles');
const messageEl = document.querySelector('#message');
const movesEl = document.querySelector('#moves');
const stageEl = document.querySelector('#stage');
const undoButton = document.querySelector('#undo');
const dialog = document.querySelector('#result-dialog');

function cloneBottles(source) { return source.map(bottle => [...bottle]); }
function shuffled(items) { const result=[...items]; for(let i=result.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [result[i],result[j]]=[result[j],result[i]]; } return result; }
function colorCount() { return stage + 4; }
function colorFor(color) { return `hsl(${(color * 137.508 + 6) % 360} 76% 62%)`; }
function createPuzzle() { const count=colorCount(); const colors=shuffled(Array.from({length:count},(_,index)=>index)); const mixed=Array.from({length:count},(_,bottle)=>Array.from({length:CAPACITY},(_,layer)=>colors[(bottle+layer)%count])); return shuffled([...mixed, [], []]); }
function topRun(bottle) { if (!bottle.length) return 0; const top=bottle.at(-1); let amount=0; for(let i=bottle.length-1;i>=0 && bottle[i]===top;i--) amount++; return amount; }
function isFinished(bottle) { return bottle.length===CAPACITY && bottle.every(color=>color===bottle[0]); }
function canPour(from,to) { return !!from.length && to.length<CAPACITY && (!to.length || to.at(-1)===from.at(-1)); }
function updateStatus(text) { messageEl.textContent=text; movesEl.textContent=`${moves}手`; stageEl.textContent=`ステージ ${stage}`; undoButton.disabled=!history.length; }
function render() { bottlesEl.replaceChildren(); bottles.forEach((bottle,index)=>{ const button=document.createElement('button'); button.type='button'; button.className=`bottle${selected===index?' selected':''}${isFinished(bottle)?' finished':''}`; button.setAttribute('aria-label',`${index+1}本目のボトル、${bottle.length}層`); button.addEventListener('click',()=>selectBottle(index)); bottle.forEach(color=>{ const layer=document.createElement('span'); layer.className='layer'; layer.style.background=colorFor(color); button.append(layer); }); bottlesEl.append(button); }); }
function selectBottle(index) { const bottle=bottles[index]; if(selected===null) { if(!bottle.length) return updateStatus('ポーションが入ったボトルを選んでください'); selected=index; updateStatus('移動先のボトルを選んでください'); render(); return; } if(selected===index) { selected=null; updateStatus('選択を解除しました'); render(); return; } const source=bottles[selected], target=bottles[index]; if(!canPour(source,target)) { selected=null; updateStatus(target.length===CAPACITY?'そのボトルはいっぱいです':'上の色が同じボトルにだけ移せます'); render(); return; } history.push(cloneBottles(bottles)); const amount=Math.min(topRun(source),CAPACITY-target.length); for(let i=0;i<amount;i++) target.push(source.pop()); moves++; selected=null; updateStatus(`${amount}層のポーションを移しました`); render(); if(isCleared()) finish(); }
function isCleared() { return bottles.every(bottle=>!bottle.length || isFinished(bottle)); }
function undo() { if(!history.length) return; bottles=history.pop(); moves--; selected=null; dialog.hidden=true; updateStatus('1手戻しました'); render(); }
function restart() { bottles=createPuzzle(); selected=null; history=[]; moves=0; dialog.hidden=true; updateStatus('ボトルを選んでください'); render(); }
function finish() { updateStatus('すべての色がそろいました！'); document.querySelector('#result-text').textContent=`ステージ ${stage} を ${moves}手でクリアしました`; dialog.hidden=false; }
function nextStage() { stage++; restart(); }
document.querySelector('#undo').addEventListener('click',undo);
document.querySelector('#restart').addEventListener('click',restart);
document.querySelector('#play-again').addEventListener('click',nextStage);
restart();
