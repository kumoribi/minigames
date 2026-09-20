const PRESETS=[
  {size:8,ships:[3,2,2],sonars:8,charges:16},
  {size:9,ships:[4,3,2,2],sonars:7,charges:19},
  {size:10,ships:[4,3,3,2],sonars:6,charges:20}
];
let stage=1,score=0,best=Number(localStorage.getItem('sonar-best')||0),mode='sonar';
let cfg,fleet,cells,sonars,charges,seconds=0,timer,started=false,ended=false;
const board=document.querySelector('#board'),message=document.querySelector('#message');

function stageConfig(){
  if(stage<=PRESETS.length)return {...PRESETS[stage-1]};
  return {size:10,ships:[4,4,3,3,2],sonars:Math.max(3,9-stage),charges:24};
}
function shuffled(items){const a=[...items];for(let i=a.length-1;i;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function key(r,c){return `${r}/${c}`}
function makeFleet(){
  const ships=[];
  for(const length of cfg.ships){
    let placed=false;
    for(let attempt=0;attempt<1200&&!placed;attempt++){
      const horizontal=Math.random()<.5;
      const r=Math.floor(Math.random()*(cfg.size-(horizontal?0:length-1)));
      const c=Math.floor(Math.random()*(cfg.size-(horizontal?length-1:0)));
      const spots=Array.from({length},(_,i)=>({r:r+(horizontal?0:i),c:c+(horizontal?i:0)}));
      const touches=spots.some(p=>ships.some(ship=>ship.cells.some(q=>Math.abs(p.r-q.r)<=1&&Math.abs(p.c-q.c)<=1)));
      if(!touches){ships.push({id:ships.length,cells:spots,hits:new Set(),sunk:false});placed=true}
    }
    if(!placed)return makeFleet();
  }
  return ships;
}
function startClock(){if(started)return;started=true;timer=setInterval(()=>{seconds++;showStatus()},1000)}
function distanceToFleet(r,c){return Math.min(...fleet.flatMap(ship=>ship.cells.map(p=>Math.abs(r-p.r)+Math.abs(c-p.c))))}
function shipAt(r,c){return fleet.find(ship=>ship.cells.some(p=>p.r===r&&p.c===c))}
function cellLabel(cell,i){
  const r=Math.floor(i/cfg.size)+1,c=i%cfg.size+1,parts=[`${r}行${c}列`];
  if(cell.sonar!==null)parts.push(`ソナー距離${cell.sonar}`);
  if(cell.shot==='hit')parts.push('命中');
  if(cell.shot==='miss')parts.push('外れ');
  return parts.join('、');
}
function render(){
  board.style.setProperty('--size',cfg.size);board.replaceChildren();
  cells.forEach((cell,i)=>{
    const r=Math.floor(i/cfg.size),c=i%cfg.size,b=document.createElement('button');
    b.type='button';b.className='cell';b.dataset.index=i;b.setAttribute('role','gridcell');b.setAttribute('aria-label',cellLabel(cell,i));
    if(cell.sonar!==null){b.classList.add('sonar');b.textContent=cell.sonar;if(cell.sonar===0)b.classList.add('hot');else if(cell.sonar===1)b.classList.add('near')}
    if(cell.shot)b.classList.add(cell.shot);
    if(ended&&cell.shot!=='hit'&&shipAt(r,c))b.classList.add('reveal');
    b.onclick=()=>act(i,b);board.append(b);
  });
  showStatus();showMode();
}
function showStatus(){
  document.querySelector('#stage').textContent=stage;document.querySelector('#score').textContent=score;
  document.querySelector('#best').textContent=best;document.querySelector('#sonars').textContent=sonars;
  document.querySelector('#charges').textContent=charges;document.querySelector('#ships').textContent=fleet.filter(s=>!s.sunk).length;
  document.querySelector('#time').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
function showMode(){
  const sonarButton=document.querySelector('#sonar-mode'),chargeButton=document.querySelector('#charge-mode');
  sonarButton.classList.toggle('active',mode==='sonar');chargeButton.classList.toggle('active',mode==='charge');
  sonarButton.setAttribute('aria-pressed',mode==='sonar');chargeButton.setAttribute('aria-pressed',mode==='charge');
  sonarButton.disabled=sonars===0||ended;chargeButton.disabled=charges===0||ended;
}
function act(i){
  if(ended)return;startClock();const cell=cells[i],r=Math.floor(i/cfg.size),c=i%cfg.size;
  if(mode==='sonar'){
    if(cell.sonar!==null){message.textContent='この海域はすでに調査済みです';return}
    if(!sonars){setMode('charge');return}
    cell.sonar=distanceToFleet(r,c);sonars--;
    message.textContent=cell.sonar===0?'強烈な反応！ この真下です':cell.sonar===1?'至近距離に反応があります':`最も近い反応まで ${cell.sonar} マス`;
    if(!sonars)mode='charge';render();board.querySelector(`[data-index="${i}"]`).classList.add('ping');return;
  }
  if(cell.shot!==null){message.textContent='この海域にはすでに爆雷を投下しました';return}
  if(!charges)return;charges--;const ship=shipAt(r,c);cell.shot=ship?'hit':'miss';
  if(ship){ship.hits.add(key(r,c));score+=150;message.textContent='命中！';if(ship.hits.size===ship.cells.length){ship.sunk=true;score+=ship.cells.length*100;message.textContent=`潜水艦を撃沈！ 残り ${fleet.filter(s=>!s.sunk).length} 隻`}}
  else message.textContent='反応なし…';
  render();board.querySelector(`[data-index="${i}"]`).classList.add('blast');
  if(fleet.every(s=>s.sunk))setTimeout(()=>finish(true),460);else if(charges===0)setTimeout(()=>finish(false),460);
}
function setMode(next){if(ended)return;if(next==='sonar'&&!sonars){message.textContent='ソナーを使い切りました';return}mode=next;message.textContent=mode==='sonar'?'調査する海域を選んでください':'爆雷を投下する海域を選んでください';showMode()}
function finish(success){
  ended=true;clearInterval(timer);
  const label=document.querySelector('#result-label'),title=document.querySelector('#result-title'),text=document.querySelector('#result-text'),next=document.querySelector('#next');
  if(success){const bonus=sonars*80+charges*100+Math.max(0,1200-seconds*5)+stage*250;score+=bonus;best=Math.max(best,score);localStorage.setItem('sonar-best',best);label.textContent='MISSION COMPLETE';title.textContent='海域を制圧！';text.textContent=`${seconds}秒・ボーナス ${bonus}・合計 ${score}点`;next.hidden=false}
  else{label.textContent='MISSION FAILED';title.textContent='爆雷が尽きました';text.textContent=`発見できなかった潜水艦は ${fleet.filter(s=>!s.sunk).length}隻です`;next.hidden=true}
  render();document.querySelector('#dialog').hidden=false;
}
function startStage(resetProgress=false){
  clearInterval(timer);if(resetProgress){stage=1;score=0}cfg=stageConfig();fleet=makeFleet();cells=Array.from({length:cfg.size*cfg.size},()=>({sonar:null,shot:null}));
  sonars=cfg.sonars;charges=cfg.charges;seconds=0;started=ended=false;mode='sonar';document.querySelector('#dialog').hidden=true;
  message.textContent='海域を選んでソナーを発射してください';render();
}
document.querySelector('#sonar-mode').onclick=()=>setMode('sonar');
document.querySelector('#charge-mode').onclick=()=>setMode('charge');
document.querySelector('#restart').onclick=()=>startStage(true);
document.querySelector('#again').onclick=()=>startStage(true);
document.querySelector('#next').onclick=()=>{stage++;startStage()};
startStage(true);
