/* Rendering and input deliberately do not mutate the simulation clock. */
(() => {
  'use strict';
  const E=SushiEngine, $=id=>document.getElementById(id), canvas=$('board'), ctx=canvas.getContext('2d');
  const SAVE='neko-sushi-factory-v1', PREF='neko-sushi-motion';
  let s=E.create(), loadError='', motion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {const raw=localStorage.getItem(SAVE);if(raw)s=E.restore(raw);motion=localStorage.getItem(PREF)==='1'||motion;} catch {loadError='保存データを読み込めませんでした。新しい工場を表示しています。';}
  let tool=null, category='transport', dir=0, selected=null, cursor={x:9,y:5}, scale=48, ox=0,oy=0, cw=0,ch=0, lastStage=-1, toastTimer, lastTime=0, accumulator=0, zoomed=false;
  let panel=null, saveIssue='';
  let relocation=null, intro=null, tunnelAnchor=null;
  const panels={build:'buildPanel',inspect:'inspector',order:'orderPanel',menu:'menuPanel'};
  const panelButtons={build:'buildToggle',order:'orderToggle',menu:'menuToggle'};
  const arrows=['→','↓','←','↑'];
  const names={belt:'寿司レーン',cat:'おてつだい猫',source:'入荷箱',counter:'客席',splitter:'分岐器',bridge:'立体交差',underground:'地下レーン'};
  const catalog={
    transport:[['belt','','▰','寿司レーン'],['cat','','🐈','おてつだい猫'],['counter','','🍵','客席'],['splitter','','⑂','分岐器'],['bridge','','╬','立体交差'],['underground','in','↘','地下入口'],['underground','out','↗','地下出口']],
    source:[['source','rice','🌾','米の入荷'],['source','tuna','🐟','まぐろの入荷'],['source','salmon','🐟','サーモンの入荷'],['source','cucumber','🥒','きゅうりの入荷'],['source','nori','▣','海苔の入荷']],
    machine:[['machine','cook','♨','炊飯釜'],['machine','prep','🔪','仕込み台'],['machine','grip','🍣','握り台'],['machine','makiRoll','🍥','巻き寿司台']]
  };
  function notify(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),4800);}
  function saveMessage(message,error=false){
    $('saveStatus').textContent=message;$('saveBadge').textContent=error?'保存エラー：☰で確認':'自動保存済み';
    $('saveBadge').classList.toggle('save-error',error);
    if(error&&saveIssue!==message)notify(message);
    saveIssue=error?message:'';
  }
  function persist(){if(loadError){saveMessage('保存エラー：元データを保護中。新しい工場でリセット可能',true);return;}try{localStorage.setItem(SAVE,E.save(s));saveMessage('自動保存済み・離席中は停止');}catch{saveMessage('保存できません。この画面を閉じると進行が失われます',true);}}
  function setPanel(next){
    panel=next;
    for(const [name,id] of Object.entries(panels))$(id).hidden=name!==next;
    for(const [name,id] of Object.entries(panelButtons))$(id).setAttribute('aria-expanded',String(name===next));
    document.querySelector('.workshop').classList.toggle('panel-open',!!next);
    $('buildToggle').classList.toggle('active',next==='build'||!!(tool&&tool!=='erase'));
  }
  function closePanel(){const previous=panel;setPanel(null);if(previous==='inspect'){selected=null;canvas.focus();}else if(panelButtons[previous])$(panelButtons[previous]).focus();}
  function setRunning(value){if(value&&relocation)return; s.running=value;accumulator=0;lastTime=performance.now();persist();refresh();}
  function toolName(){return tool==='erase'?'撤去':!tool?'画面移動・設備の確認':Object.values(catalog).flat().find(t=>t[0]===tool.type&&t[1]===tool.option)?.[3]||names[tool.type];}
  function palette(){
    $('palette').replaceChildren();
    for(const [type,option,icon,name] of catalog[category]){
      const b=document.createElement('button'), level=E.unlockLevel(type,option), locked=level>s.stage;
      b.className='tile'+(tool?.type===type&&tool?.option===option?' active':'');b.disabled=locked;
      b.innerHTML='<span class="icon">'+icon+'</span><span class="cost">'+(locked?'🔒':E.COST[type]+'円')+'</span><span class="name">'+name+'</span>';
      b.title=locked ? (level===1?'まぐろ':'サーモン')+'の注文達成で解放' : name+' '+E.COST[type]+'円';
      b.setAttribute('aria-label',b.title);b.onclick=()=>{tool={type,option};selected=null;setPanel(null);palette();refresh();canvas.focus();};$('palette').append(b);
    }
    $('hand').classList.toggle('active',!tool);$('erase').classList.toggle('active',tool==='erase');
    $('buildToggle').classList.toggle('active',panel==='build'||!!(tool&&tool!=='erase'));
    $('toolHint').textContent=tool?.type==='underground'?'入口・出口は同じ矢印方向。間の最大4マスを地下で通ります。各20円。':tool==='erase'?'撤去すると費用は全額返却。内部の食材は廃棄されます。':tool?.type==='belt'?'ドラッグで連続配置。移動したいときは「画面移動」に切り替え。':tool?.type==='cat'?'猫は食材の仕分け役。配置後に「仕分け」で材料を指定できます。':tool?.type==='machine'?'調理台は隣のレーンから材料を自動取得。矢印方向へ完成品を搬出します。':tool?.type==='source'?'入荷箱は矢印方向の隣のレーンへ食材を自動搬出します。':'建設費は撤去で全額返却。🔒は注文達成で解放されます。';
  }
  function refresh(){
    $('coins').textContent=s.coins.toLocaleString()+' 円';$('sold').innerHTML=Object.values(s.sold).reduce((a,b)=>a+b,0).toLocaleString()+' <em>皿</em>';
    $('play').textContent=s.running?'Ⅱ 一時停止':'▶ 稼働する';$('runLabel').textContent=s.running?'● 営業中':'● 停止中・建設できます';
    $('sizeLabel').textContent=s.width+' × '+s.height+' マス';$('modeLabel').textContent=toolName()+(tool&&tool!=='erase'?' '+arrows[dir]:'');$('rotate').textContent='向き '+arrows[dir];
    const g=E.GOALS[s.stage];$('orderLabel').textContent=g?'本日の注文 / 0'+(s.stage+1):'すべての注文を達成';
    $('goal').textContent=g?g.title:'猫たちと、もっと大きな工場へ';$('goalCount').textContent=g?Math.min(g.count,s.sold[g.item])+' / '+g.count:'自由建設';$('progress').value=g?Math.min(g.count,s.sold[g.item]):20;
    $('unlock').textContent=g?'解放：'+g.unlock+' ／ 報酬 '+g.reward+'円':'全設備が使えます。生産ラインを好きなだけ改良しよう。';
    if(lastStage!==s.stage){lastStage=s.stage;palette();}
    intro=E.introStep(s);
    const guide={
      connect:'1/3 「建設」→寿司レーン。向き→で点線をつなごう（5円）',
      repair:'1/3 点線だったマスには右向きの寿司レーンが必要です。設備を選んで出口を直そう。',
      start:'2/3 接続できました！上の「稼働する」で自動調理を始めよう。',
      produce:'3/3 米→シャリ、魚→ネタ→握り寿司。客席に最初の一皿が届くのを見よう。',
      complete:s.stage===0?'最初の一皿を提供！次はまぐろ20皿。設備をタップすると待ち時間や材料を確認できます。':'次は猫で仕分け。「建設」→おてつだい猫を置き、設備の「仕分け」で材料を指定しよう。',
      custom:'自由に改良できます。設備をタップして材料待ち・出口満杯を確認しよう。'
    };
    $('guide').textContent=tool?.type==='underground'?(tool.option==='in'?'地下入口を配置 '+arrows[dir]+' ／ 次に同じ向きの出口を設置':'地下出口を配置 '+arrows[dir]+' ／ 入口の前方1〜5マス、同じ向きに設置'):tool==='erase'?'撤去で建設費を全額返却。内部の食材は廃棄されます。'
      :intro==='connect'&&tool&&tool.type!=='belt'?toolName()+'を配置 ／ 最初の接続には「寿司レーン」を選びます。'
      :guide[intro] || (tool?toolName()+'を配置 '+arrows[dir]+' ／ 空きマスをタップ':'ドラッグで盤面を移動。設備をタップすると詳細を開きます。');
    inspect();refreshMove();
  }
  function beginMove(cells=null) {
    relocation={cells, start:null, end:null, dx:0, dy:0, turns:0, placed:false, pan:false};
    tool=null; selected=null; setPanel(null); setRunning(false); palette(); refresh(); canvas.focus();
  }
  function cancelMove() {
    relocation=null; refresh(); canvas.focus();
  }
  function chooseRange(a,b) {
    const cells=E.selectRect(s,a,b);
    if (!cells.length) {notify('選択範囲に設備がありません');relocation.start=null;relocation.end=null;refresh();return;}
    relocation.cells=cells;relocation.start=null;relocation.end=null;refresh();
  }
  function moveAction(c) {
    const m=relocation;
    if(m.pan)return;
    if(!m.cells) {
      if(!m.start){m.start=c;m.end=c;refresh();}
      else chooseRange(m.start,c);
    } else {
      m.dx=c.x-Math.min(...m.cells.map(p=>p.x));
      m.dy=c.y-Math.min(...m.cells.map(p=>p.y));
      m.placed=true;refresh();
    }
  }
  function refreshMove() {
    const m=relocation;
    $('normalTools').hidden=!!m; $('moveControls').hidden=!m;
    $('play').disabled=!!m; $('buildToggle').disabled=!!m;
    if(!m)return;
    $('moveRotate').disabled=!m.cells;
    const error=m.cells?E.validateMove(s,m.cells,m.dx,m.dy,m.turns):'';
    $('moveConfirm').disabled=!m.cells||!m.placed||!!error||(!m.dx&&!m.dy&&!m.turns);
    $('movePan').classList.toggle('active',m.pan);
    $('movePan').textContent=m.pan?'移設に戻る':'画面移動';
    $('modeLabel').textContent=m.cells?m.cells.length+'設備を移設・'+m.turns*90+'°（無料）':'移設する範囲を選択';
    $('moveStatus').textContent=m.pan?'ドラッグで画面移動。終わったら「移設に戻る」':!m.cells
      ?(m.start?'反対側の角をタップ':'範囲をドラッグ、または対角の2点をタップ')
      :!m.placed?'移動先の左上のマスをタップ':error||(!m.dx&&!m.dy&&!m.turns?'移動先を変更してください':'配置できます。「確定」で移設');
    $('guide').textContent='移設中は停止・中身は保持。確定前の配置は保存されません。';
  }
  $('rangeSelect').onclick=()=>beginMove();
  $('moveSelected').onclick=()=>{if(selected)beginMove([{...selected}]);};
  $('moveCancel').onclick=cancelMove;
  $('movePan').onclick=()=>{relocation.pan=!relocation.pan;refresh();};
  $('moveRotate').onclick=()=>{
    if(!relocation?.cells)return;
    relocation.turns=(relocation.turns+1)%4;relocation.placed=true;
    refresh();canvas.focus();
  };
  $('moveConfirm').onclick=()=>{
    const m=relocation;
    if(!m?.cells||!m.placed||(!m.dx&&!m.dy&&!m.turns))return;
    const error=E.moveEntities(s,m.cells,m.dx,m.dy,m.turns);
    if(error){notify(error);refresh();return;}
    const count=m.cells.length;relocation=null;persist();refresh();canvas.focus();
    notify(count+'設備を移設しました。「稼働する」で再開できます');
  };
  function inspect(){
    const e=selected&&E.at(s,selected.x,selected.y);$('editControls').hidden=!e;
    if(!e){$('detail').innerHTML=tool&&tool!=='erase'?'<strong>'+toolName()+'を配置 '+arrows[dir]+'</strong><br><small>空きマスをタップ。向きボタンで回転できます。</small>':intro==='connect'?'まずは点線のマスにレーンを1本置こう。<br><small>「レーン」を選ぶ → 光るマスをタップ → 稼働する</small>':'設備をタップすると、材料と詰まりの原因を確認できます。';return;}
    const name=e.type==='underground'?(e.option==='in'?'地下入口':'地下出口'):e.type==='machine'?E.MACHINES[e.option].name:e.type==='source'?E.ITEMS[e.option][0]+'の入荷':names[e.type];
    let extra='';if(e.type==='machine') extra=E.inputTypes(e.option,s.stage).map(i=>E.ITEMS[i][0]+' '+(e.inv[i]||0)+'/4').join(' ｜ ');
    if(e.type==='source'||e.type==='machine')extra+=(extra?' ｜ ':'')+'完成 '+e.out.length+'/4'+' ｜ 自動搬出 '+arrows[e.dir]+'（隣のレーンへ）';
    if(e.type==='machine')extra+=' ｜ 上下左右のレーンから材料を自動取得';
    if(e.type==='underground'){
      const partner=E.tunnelPartner(s,selected.x,selected.y);
      extra=partner?'接続先 ('+(partner.x+1)+','+(partner.y+1)+') ／ 地下 '+(partner.distance-1)+'マス ／ 方向 '+arrows[e.dir]:'未接続：同じ向きの'+(e.option==='in'?'出口を前方':'入口を後方')+'1〜5マスに設置';
    }
    $('moveTunnel').hidden=e.type!=='underground'||!E.tunnelPartner(s,selected.x,selected.y);
    if(e.type==='cat')extra='取る側 '+arrows[e.input]+' → 渡す側 '+arrows[e.dir];
    $('detail').replaceChildren();const title=document.createElement('strong');title.textContent=name+' ('+(selected.x+1)+','+(selected.y+1)+')';const line=document.createElement('div');line.textContent=E.status(e);const small=document.createElement('small');small.textContent=extra;$('detail').append(title,line,small);
    $('rotateSelected').hidden=!['belt','cat','splitter','source','machine','underground'].includes(e.type);$('rotateInput').hidden=e.type!=='cat';$('filterLabel').hidden=!['cat','splitter'].includes(e.type);
    if(document.activeElement!==$('filter'))$('filter').value=e.filter;
  }
  $('filter').add(new Option('指定なし',''));for(const [k,v] of Object.entries(E.ITEMS))$('filter').add(new Option(v[0],k));
  $('filter').onchange=()=>{const e=selected&&E.at(s,selected.x,selected.y);if(e){e.filter=$('filter').value;persist();}};
  $('play').onclick=()=>setRunning(!s.running);
  $('buildToggle').onclick=()=>{selected=null;setPanel(panel==='build'?null:'build');palette();refresh();};
  $('orderToggle').onclick=()=>setPanel(panel==='order'?null:'order');
  $('menuToggle').onclick=()=>setPanel(panel==='menu'?null:'menu');
  document.querySelectorAll('[data-close-panel]').forEach(b=>b.onclick=closePanel);
  $('hand').onclick=()=>{tool=null;selected=null;setPanel(null);palette();refresh();};$('erase').onclick=()=>{tool='erase';selected=null;setPanel(null);palette();refresh();};
  $('rotate').onclick=()=>{dir=(dir+1)%4;refresh();};
  $('moveTunnel').onclick=()=>{const partner=E.tunnelPartner(s,selected.x,selected.y);if(partner)beginMove([{...selected},{x:partner.x,y:partner.y}]);};
  $('rotateSelected').onclick=()=>{const e=E.at(s,selected.x,selected.y);if(e.type==='underground'){const error=E.rotate(s,selected.x,selected.y);if(error)notify(error);persist();refresh();return;}e.dir=(e.dir+1)%4;if(e.type==='cat'&&e.input===e.dir)e.input=(e.input+1)%4;persist();refresh();};
  $('rotateInput').onclick=()=>{const e=E.at(s,selected.x,selected.y);e.input=(e.input+1)%4;if(e.input===e.dir)e.input=(e.input+1)%4;persist();refresh();};
  $('deleteSelected').onclick=()=>{if(selected){const error=E.remove(s,selected.x,selected.y);if(error){notify(error);return;}selected=null;setPanel(null);persist();refresh();canvas.focus();}};
  document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x===b));palette();});
  $('help').onclick=()=>{setRunning(false);setPanel(null);$('helpDialog').showModal();};$('helpDone').onclick=()=>$('helpDialog').close();
  for(const id of ['helpDialog','resetDialog'])$(id).addEventListener('close',()=>$('menuToggle').focus());
  $('reduceMotion').checked=motion;$('reduceMotion').onchange=()=>{motion=$('reduceMotion').checked;try{localStorage.setItem(PREF,motion?'1':'0');}catch{}};
  $('newGame').onclick=()=>{setRunning(false);setPanel(null);$('resetDialog').showModal();};$('cancelReset').onclick=()=>$('resetDialog').close();
  $('confirmReset').onclick=()=>{relocation=null;s=E.create();loadError='';selected=null;tool=null;lastStage=-1;setPanel(null);defaultView();persist();palette();refresh();$('resetDialog').close();notify('新しい工場を準備しました');};
  function mapArea(includePanel=false){
    const base=canvas.getBoundingClientRect(),hud=$('hud').getBoundingClientRect(),dock=$('dock').getBoundingClientRect();
    let left=12,top=hud.bottom-base.top+12,right=cw-72,bottom=dock.top-base.top-48;
    if(cw>=540&&ch<=500)right=cw-12;
    if(includePanel&&panel){const r=$(panels[panel]).getBoundingClientRect();if(cw>760&&panel==='inspect')right=Math.min(right,r.left-base.left-12);else if(panel==='build'||panel==='inspect')bottom=Math.min(bottom,r.top-base.top-12);}
    return {left,top,width:Math.max(80,right-left),height:Math.max(80,bottom-top)};
  }
  function centerOn(x,y,includePanel=false){const a=mapArea(includePanel);ox=a.left+a.width/2-(x+.5)*scale;oy=a.top+a.height/2-(y+.5)*scale;}
  function fit(){const a=mapArea();scale=Math.min(62,a.width/s.width,a.height/s.height);ox=a.left+(a.width-s.width*scale)/2;oy=a.top+(a.height-s.height*scale)/2;zoomed=true;}
  function defaultView(){fit();if(scale<44){scale=44;centerOn(cw<600&&s.stage===0?8:(s.width-1)/2,(s.height-1)/2);}}
  function zoom(f,px,py){if(px===undefined){const a=mapArea();px=a.left+a.width/2;py=a.top+a.height/2;}const next=Math.max(18,Math.min(96,scale*f));ox=px-(px-ox)*next/scale;oy=py-(py-oy)*next/scale;scale=next;clampView();}
  function clampView(){const a=mapArea();ox=Math.max(a.left+44-s.width*scale,Math.min(a.left+a.width-44,ox));oy=Math.max(a.top+44-s.height*scale,Math.min(a.top+a.height-44,oy));}
  $('fit').onclick=fit;$('zoomIn').onclick=()=>zoom(1.25);$('zoomOut').onclick=()=>zoom(.8);
  function layoutBounds(){const r=canvas.getBoundingClientRect();document.documentElement.style.setProperty('--top-clear',($('hud').getBoundingClientRect().bottom-r.top+8)+'px');document.documentElement.style.setProperty('--bottom-clear',(r.bottom-$('dock').getBoundingClientRect().top+10)+'px');}
  const uiSize=new ResizeObserver(layoutBounds);uiSize.observe($('hud'));uiSize.observe($('dock'));
  new ResizeObserver(()=>{const r=canvas.getBoundingClientRect(),oldW=cw,oldH=ch;cw=r.width;ch=r.height;const d=devicePixelRatio||1;canvas.width=Math.round(cw*d);canvas.height=Math.round(ch*d);ctx.setTransform(d,0,0,d,0,0);layoutBounds();if(!zoomed)defaultView();else{ox+=(cw-oldW)/2;oy+=(ch-oldH)/2;clampView();}}).observe(canvas);
  const pointers=new Map();let gesture=null,pinch=0;
  function point(ev){const r=canvas.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function cell(p){return {x:Math.floor((p.x-ox)/scale),y:Math.floor((p.y-oy)/scale)};}
  function onBoard(ev){return document.elementFromPoint(ev.clientX,ev.clientY)===canvas;}
  function exposed(c){const r=canvas.getBoundingClientRect();return document.elementFromPoint(r.left+ox+(c.x+.5)*scale,r.top+oy+(c.y+.5)*scale)===canvas;}
  function act(c){
    cursor=c;if(relocation){moveAction(c);return false;}if(!tool){selected=E.at(s,c.x,c.y)?c:null;setPanel(selected?'inspect':null);refresh();if(selected)centerOn(c.x,c.y,true);return false;}
    if(tool==='erase'){const error=E.remove(s,c.x,c.y);if(error)notify(error);else{selected=null;persist();refresh();}return !error;}
    const error=E.place(s,c.x,c.y,tool.type,tool.option,dir);if(error){selected=E.at(s,c.x,c.y)?c:null;notify(error);}else{selected=c;if(tool.type==='underground'){if(tool.option==='in'){tunnelAnchor={...c};tool={type:'underground',option:'out'};notify('次に出口を同じ矢印方向で、前方1〜5マスに設置します');}else{tunnelAnchor=null;const partner=E.tunnelPartner(s,c.x,c.y);notify(partner?'地下レーンを接続しました（地下'+(partner.distance-1)+'マス）':'未接続です。入口を同じ矢印方向で後方1〜5マスに設置してください');}palette();}persist();}refresh();return !error;
  }
  canvas.addEventListener('pointerdown',ev=>{if(ev.button!==0||!onBoard(ev))return;canvas.setPointerCapture(ev.pointerId);const p=point(ev);pointers.set(ev.pointerId,p);if(pointers.size===2){pinch=distance();gesture=null;return;}gesture={start:p,last:p,moved:false,cell:cell(p),built:null};});
  function distance(){const a=[...pointers.values()];return Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}
  canvas.addEventListener('pointermove',ev=>{
    if(!pointers.has(ev.pointerId))return;if(!onBoard(ev)){if(gesture?.built)persist();gesture=null;pointers.delete(ev.pointerId);pinch=0;return;}const p=point(ev);pointers.set(ev.pointerId,p);
    if(pointers.size===2){const d=distance(),a=[...pointers.values()];if(pinch)zoom(d/pinch,(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2);pinch=d;return;}
    if(!gesture)return;const g=gesture;if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>6)g.moved=true;
    if(g.moved&&relocation&&!relocation.pan){if(!relocation.cells){relocation.end=cell(p);}g.last=p;return;}
    if(g.moved&&!tool){ox+=p.x-g.last.x;oy+=p.y-g.last.y;clampView();}
    if(g.moved&&tool?.type==='belt'){
      if(!g.built){if(act(g.cell))g.built={...g.cell};else{gesture=null;return;}}
      const c=cell(p);let safety=0;
      while(g.built&&(c.x!==g.built.x||c.y!==g.built.y)&&safety++<40){
        const prev=g.built,dx=Math.sign(c.x-prev.x),dy=dx?0:Math.sign(c.y-prev.y),d=dx===1?0:dx===-1?2:dy===1?1:3;
        const next={x:prev.x+dx,y:prev.y+dy};
        if(!exposed(next))break;
        const error=E.place(s,next.x,next.y,'belt','',d);
        if(error){notify(error);break;}
        E.at(s,prev.x,prev.y).dir=d;g.built=next;selected=next;dir=d;
      }refresh();
    }g.last=p;
  });
  function end(ev){
    if(relocation&&!relocation.pan&&gesture?.moved&&onBoard(ev)) {
      if(!relocation.cells)chooseRange(relocation.start||gesture.cell,cell(point(ev)));
      else moveAction(cell(point(ev)));
    }
    pointers.delete(ev.pointerId);if(gesture&&!gesture.moved&&onBoard(ev))act(cell(point(ev)));if(gesture?.built)persist();gesture=null;pinch=0;}
  canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',()=>{pointers.clear();gesture=null;pinch=0;persist();});
  canvas.addEventListener('wheel',ev=>{ev.preventDefault();const p=point(ev);zoom(ev.deltaY<0?1.1:1/1.1,p.x,p.y);},{passive:false});
  document.addEventListener('keydown',ev=>{if(document.querySelector('dialog[open]')||['SELECT','INPUT'].includes(document.activeElement?.tagName))return;if(ev.key==='Escape'){if(relocation){cancelMove();return;}if(panel)closePanel();else $('hand').click();return;}if(ev.key.toLowerCase()==='r'&&!ev.repeat){ev.preventDefault();$(relocation?'moveRotate':'rotate').click();}if(document.activeElement!==canvas)return;const dirs={ArrowRight:[1,0],ArrowDown:[0,1],ArrowLeft:[-1,0],ArrowUp:[0,-1]};if(dirs[ev.key]){ev.preventDefault();cursor.x=Math.max(0,Math.min(s.width-1,cursor.x+dirs[ev.key][0]));cursor.y=Math.max(0,Math.min(s.height-1,cursor.y+dirs[ev.key][1]));centerOn(cursor.x,cursor.y,true);}if(ev.key==='Enter'){ev.preventDefault();if(!exposed(cursor)){notify('パネルを閉じるか、盤面を移動してから操作してください');return;}act(cursor);}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)setRunning(false);});window.addEventListener('pagehide',()=>{s.running=false;persist();});setInterval(persist,5000);
  function round(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function label(text,x,y,size,color='#314739',align='center'){ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='middle';ctx.font='bold '+size+'px "Yu Gothic UI",sans-serif';ctx.fillText(text,x,y);}
  function cat(x,y,z,active,t){
    ctx.save();ctx.translate(x,y+(active&&!motion?Math.sin(t/100)*z*.025:0));
    ctx.fillStyle='#d49759';ctx.beginPath();ctx.ellipse(0,z*.16,z*.23,z*.22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#eabd84';ctx.beginPath();ctx.moveTo(-z*.24,-z*.08);ctx.lineTo(-z*.22,-z*.36);ctx.lineTo(-z*.06,-z*.23);ctx.lineTo(z*.1,-z*.23);ctx.lineTo(z*.24,-z*.36);ctx.lineTo(z*.25,-z*.06);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.ellipse(0,-z*.07,z*.27,z*.22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f4d8ab';ctx.beginPath();ctx.ellipse(0,z*.015,z*.15,z*.095,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#343a2a';for(const dx of [-.105,.105]){ctx.beginPath();ctx.arc(z*dx,-z*.085,z*.023,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#9e6249';ctx.beginPath();ctx.arc(0,-z*.025,z*.024,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#b3794a';ctx.lineWidth=z*.035;ctx.beginPath();ctx.moveTo(-z*.06,-z*.26);ctx.lineTo(-z*.035,-z*.17);ctx.moveTo(z*.06,-z*.26);ctx.lineTo(z*.035,-z*.17);ctx.stroke();
    round(-z*.17,z*.12,z*.34,z*.12,z*.035,'#5e8b7a');ctx.restore();
  }
  function food(type,x,y,z){
    const sushi=!!E.PRICE[type];ctx.save();ctx.translate(x,y);ctx.fillStyle='#0002';ctx.beginPath();ctx.ellipse(1,z*.17,z*.32,z*.14,0,0,Math.PI*2);ctx.fill();
    if(sushi){ctx.fillStyle='#e7f1e7';ctx.strokeStyle='#63928a';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,z*.08,z*.38,z*.24,0,0,Math.PI*2);ctx.fill();ctx.stroke();round(-z*.23,-z*.08,z*.46,z*.25,z*.08,'#fffaf0');}
    const color=E.ITEMS[type][2];round(-z*.25,-z*.2,z*.5,z*.24,z*.055,color);
    if(type==='maki'){round(-z*.23,-z*.2,z*.46,z*.26,z*.05,'#304d3b');round(-z*.14,-z*.17,z*.28,z*.18,z*.04,'#faf4dc');round(-z*.07,-z*.13,z*.14,z*.1,z*.02,'#81a553');}
    else if(/tuna|salmon/i.test(type)){ctx.strokeStyle='#ffe6d380';ctx.lineWidth=z*.035;for(let i=-1;i<2;i++){ctx.beginPath();ctx.moveTo(i*z*.12-z*.04,-z*.19);ctx.lineTo(i*z*.12+z*.08,z*.01);ctx.stroke();}}
    else if(scale>32)label(E.ITEMS[type][1],0,-z*.07,z*.18,type==='nori'?'#e7f1df':'#536648');ctx.restore();
  }
  function arrow(d,x,y,z,color){ctx.save();ctx.translate(x,y);ctx.rotate(d*Math.PI/2);ctx.strokeStyle=color;ctx.lineWidth=Math.max(1,z*.055);ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-z*.14,0);ctx.lineTo(z*.14,0);ctx.lineTo(z*.03,-z*.1);ctx.moveTo(z*.14,0);ctx.lineTo(z*.03,z*.1);ctx.stroke();ctx.restore();}
  function drawEquipment(e,px,py,z,t,inputs=null){
      ctx.save();ctx.translate(px,py);
      if(['belt','splitter','bridge'].includes(e.type)){
        const rail=(d,raised=false)=>{ctx.save();ctx.translate(z/2,z/2);ctx.rotate(d*Math.PI/2);round(-z/2,-z*.34,z,z*.68,3,raised?'#8c7152':'#ad875a');round(-z/2,-z*.25,z,z*.5,2,'#d4b17b');ctx.strokeStyle='#b08a59';ctx.lineWidth=1;const shift=s.running&&!motion?(t%500)/500*z*.25:0;for(let a=-z/2;a<z/2;a+=z*.25){ctx.beginPath();ctx.moveTo(a+shift,-z*.23);ctx.lineTo(a+shift,z*.23);ctx.stroke();}ctx.restore();};
        if(e.type==='belt'&&inputs?.some(side=>side!==(e.dir+2)%4)){
          const [dx,dy]=E.DIR[e.dir];
          for(const side of inputs){
            const [ix,iy]=E.DIR[side];
            for(const [width,color] of [[.68,'#ad875a'],[.5,'#d4b17b']]){
              ctx.strokeStyle=color;ctx.lineWidth=z*width;ctx.lineCap='butt';ctx.beginPath();
              ctx.moveTo(z*(.5+ix*.5),z*(.5+iy*.5));
              ctx.quadraticCurveTo(z*.5,z*.5,z*(.5+dx*.5),z*(.5+dy*.5));ctx.stroke();
            }
          }
        }else rail(e.type==='bridge'?0:e.dir);if(e.type==='bridge'){rail(1,true);label('橋',z*.8,z*.18,z*.19,'#fff8dd');}
        arrow(e.dir,z*.5,z*.5,z*.7,'#926e43');if(e.type==='splitter'){arrow((e.dir+3)%4,z*.5,z*.5,z*.9,'#456d58');round(z*.1,z*.08,z*.16,z*.16,2,'#5e8669');}
        if(e.packet)food(e.packet.type,z*.5,z*.48,z*.8);if(e.h)food(e.h.type,z*.35,z*.48,z*.65);if(e.v)food(e.v.type,z*.62,z*.5,z*.65);
      }else if(e.type==='underground'){
        round(z*.03,z*.12,z*.94,z*.76,z*.12,'#567c76');
        round(z*.12,z*.23,z*.76,z*.5,z*.09,'#203f3c');
        arrow(e.dir,z*.5,z*.47,z*.95,'#f3df9f');
        label(e.option==='in'?'入口':'出口',z*.5,z*.84,z*.18,'#fff8dc');
        if(e.packet)food(e.packet.type,z*.5,z*.45,z*.62);
        const count=e.tunnel?.filter(Boolean).length;
        if(count)label('地下'+count,z*.5,z*.14,z*.16,'#fff8dc');
      }else if(e.type==='cat'){
        round(z*.08,z*.1,z*.84,z*.8,z*.16,'#efe4c9');const [ix,iy]=E.DIR[e.input];round(z*(.46+ix*.37),z*(.46+iy*.37),z*.08,z*.08,z*.02,'#508f9c');cat(z*.5,z*.46,z*.82,e.progress>0,t);const [dx,dy]=E.DIR[e.dir];arrow(e.dir,z*(.5+dx*.35),z*(.5+dy*.35),z*.5,'#4a755b');
      }else if(e.type==='source'){
        round(z*.1,z*.16,z*.8,z*.73,z*.07,'#9b7852');round(z*.14,z*.12,z*.72,z*.63,z*.04,'#c6a477');round(z*.2,z*.18,z*.6,z*.43,z*.04,'#e6ce9b');food(e.option,z*.5,z*.42,z*.75);label('入荷',z*.5,z*.79,z*.17,'#fff4d8');
      }else if(e.type==='machine'){
        const blocked=E.status(e)==='搬出口が満杯';round(z*.06,z*.2,z*.88,z*.71,z*.09,'#a67b53');round(z*.06,z*.15,z*.88,z*.63,z*.09,'#efdbb5');
        cat(z*.68,z*.31,z*.56,e.progress>0,t);
        if(e.option==='cook'){round(z*.15,z*.35,z*.42,z*.29,z*.08,'#6f8c81');round(z*.12,z*.31,z*.48,z*.09,z*.03,'#abbca7');if(e.progress&&!motion)label('♨',z*.3,z*.19,z*.25,'#fff');}
        else {round(z*.12,z*.35,z*.45,z*.28,z*.03,'#bc975e');const sample=e.activeRecipe ? E.RECIPES[e.activeRecipe].output : e.out[0];if(sample)food(sample,z*.34,z*.48,z*.6);}
        round(z*.14,z*.81,z*.72,z*.055,2,'#967959');if(e.progress)round(z*.14,z*.81,z*.72*Math.min(1,e.progress/E.RECIPES[e.activeRecipe].time),z*.055,2,'#78a36a');
        ctx.fillStyle=blocked?'#d9784e':e.progress?'#68a16c':'#c8b97b';ctx.beginPath();ctx.arc(z*.84,z*.67,z*.045,0,Math.PI*2);ctx.fill();
      }else if(e.type==='counter'){
        const eating = e.mealTicks > 0;
        round(z*.04,z*.55,z*.92,z*.32,z*.05,'#a97951');
        cat(z*.5,z*.35,z*.88,eating && s.running,t);
        round(z*.04,z*.51,z*.92,z*.14,z*.04,'#dcc296');
        label(eating ? '食事中' : '客席',z*.5,z*.77,z*.18,'#fff3d7');
        if (eating) {
          round(z*.08,z*.89,z*.84,z*.06,z*.02,'#acb8a5');
          round(z*.08,z*.89,z*.84*e.mealTicks/E.MEAL_TICKS,z*.06,z*.02,'#38674f');
        }
      }
      if(e.type==='source'||e.type==='machine'){
        const [dx,dy]=E.DIR[e.dir];
        arrow(e.dir,z*(.5+dx*.4),z*(.5+dy*.4),z*.45,'#285d48');
      }
      if(e.out.length) {round(z*.69,z*.02,z*.28,z*.23,z*.07,'#fff9e9');label(e.out.length,z*.83,z*.14,z*.17);}
      ctx.restore();
  }
  function draw(t){
    ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#dce4cf';ctx.fillRect(0,0,cw,ch);
    // Soft floor tiles, timber rails, and individually drawn cats keep the scene readable at any zoom.
    for(let y=0;y<s.height;y++)for(let x=0;x<s.width;x++){
      const px=ox+x*scale,py=oy+y*scale,z=scale;if(px+z<0||py+z<0||px>cw||py>ch)continue;
      round(px+1,py+1,z-2,z-2,2,(x+y)%2?'#e8ebda':'#e3e7d5');const e=E.at(s,x,y);
      if(!e){if(x===9&&y===5&&intro==='connect'){ctx.strokeStyle='#d48842';ctx.lineWidth=2;ctx.setLineDash([4,3]);ctx.strokeRect(px+3,py+3,z-6,z-6);ctx.setLineDash([]);arrow(0,px+z/2,py+z/2,z,'#bc8858');}continue;}
      drawEquipment(e,px,py,z,t,E.beltInputs(s,x,y));
      if(e.type==='underground')round(px+z*.8,py+z*.04,z*.12,z*.12,z*.06,E.tunnelPartner(s,x,y)?'#7cce9b':'#eb9460');
      if(selected?.x===x&&selected?.y===y){ctx.strokeStyle='#eb9c47';ctx.lineWidth=3;ctx.strokeRect(px+2,py+2,z-4,z-4);}
    }
    if(relocation) {
      const m=relocation;
      const outline=(c,color)=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(ox+c.x*scale+2,oy+c.y*scale+2,scale-4,scale-4);};
      if(m.cells){
        for(const c of m.cells)outline(c,'#477d96');
        if(m.placed){
          const color=E.validateMove(s,m.cells,m.dx,m.dy,m.turns)?'#bd3636':'#23774c';
          const targets=E.moveTargets(m.cells,m.dx,m.dy,m.turns);
          const preview={...s,cells:{...s.cells}};
          for(const c of m.cells)delete preview.cells[E.key(c.x,c.y)];
          m.cells.forEach((c,i)=>preview.cells[E.key(targets[i].x,targets[i].y)]=E.rotatedEntity(E.at(s,c.x,c.y),m.turns));
          for(const [i,c] of m.cells.entries()){
            const dest=targets[i];
            ctx.save();ctx.globalAlpha=.65;
            drawEquipment(E.rotatedEntity(E.at(s,c.x,c.y),m.turns),ox+dest.x*scale,oy+dest.y*scale,scale,t,E.beltInputs(preview,dest.x,dest.y));
            ctx.restore();outline(dest,color);
          }
        }
      } else {
        const start=m.start||gesture?.cell,end=m.end||start;
        if(start&&end){
          ctx.fillStyle='#477d9633';ctx.strokeStyle='#477d96';ctx.lineWidth=2;
          const x=ox+Math.min(start.x,end.x)*scale,y=oy+Math.min(start.y,end.y)*scale;
          const w=(Math.abs(start.x-end.x)+1)*scale,h=(Math.abs(start.y-end.y)+1)*scale;
          ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
        }
      }
    }
    if(!relocation&&selected&&E.at(s,selected.x,selected.y)?.type==='underground'){
      const partner=E.tunnelPartner(s,selected.x,selected.y);
      if(partner){
        ctx.strokeStyle='#267e91';ctx.lineWidth=3;ctx.setLineDash([6,5]);ctx.beginPath();
        ctx.moveTo(ox+(selected.x+.5)*scale,oy+(selected.y+.5)*scale);
        ctx.lineTo(ox+(partner.x+.5)*scale,oy+(partner.y+.5)*scale);ctx.stroke();ctx.setLineDash([]);
        ctx.strokeRect(ox+partner.x*scale+2,oy+partner.y*scale+2,scale-4,scale-4);
      }
    }
    if(tool?.type==='underground'&&tool.option==='out'&&tunnelAnchor){
      const entry=E.at(s,tunnelAnchor.x,tunnelAnchor.y);
      if(entry?.type==='underground'&&entry.option==='in'&&entry.dir===dir){
        const [dx,dy]=E.DIR[dir];ctx.strokeStyle='#267e91';ctx.lineWidth=2;ctx.setLineDash([4,4]);
        for(let i=1;i<=E.TUNNEL_MAX_DISTANCE;i++){
          const x=tunnelAnchor.x+dx*i,y=tunnelAnchor.y+dy*i;
          if(x<0||y<0||x>=s.width||y>=s.height)break;
          if(!E.at(s,x,y))ctx.strokeRect(ox+x*scale+3,oy+y*scale+3,scale-6,scale-6);
          if(E.at(s,x,y)?.type==='underground'&&E.at(s,x,y).dir===dir)break;
        }
        ctx.setLineDash([]);
      }
    }
    if(document.activeElement===canvas){ctx.strokeStyle='#477d96';ctx.lineWidth=2;ctx.strokeRect(ox+cursor.x*scale+2,oy+cursor.y*scale+2,scale-4,scale-4);}
    if(intro==='connect'&&scale>28)label('ここをつなごう',ox+9.5*scale,oy+4.6*scale,Math.max(10,scale*.18),'#986238');
  }
  function frame(t){if(!lastTime)lastTime=t;const dt=Math.min(500,t-lastTime);lastTime=t;if(s.running){accumulator+=dt;let changed=false;while(accumulator>=E.STEP_MS){accumulator-=E.STEP_MS;E.step(s);changed=true;if(s.events.length){notify(s.events[0]);persist();}}if(changed)refresh();}draw(t);requestAnimationFrame(frame);}
  palette();refresh();requestAnimationFrame(frame);if(loadError)notify(loadError);
})();
