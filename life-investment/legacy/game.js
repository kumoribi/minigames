(function(){
  'use strict';const E=LifeEngine,$=id=>document.getElementById(id),esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state=E.create(),tab='stocks',paused=false,blocked=false,pending=null,timer=null,lastResult=false;
  $('motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const amount=n=>n+'万円',name=id=>id==='bank'?'銀行':id==='npc'?'NPC':E.player(state,id)?.name||'不明';
  function button(label,action,extra=''){const r=E.dispatch(state,action);return '<button data-action="'+esc(JSON.stringify(action))+'" '+extra+(r.ok?'':' title="'+esc(r.error)+'"')+'>'+esc(label)+'</button>';}
  function feedback(text){$('status').textContent=text;}
  function save(){try{LifeStorage.save(state);$('save').textContent='自動保存済み · このブラウザで再開できます';}catch(e){blocked=true;paused=true;$('save').textContent='保存できません：'+e.message;feedback(e.message);}}
  function sound(){if(!$('sound').checked||document.hidden)return;try{const a=new AudioContext(),o=a.createOscillator(),g=a.createGain();o.frequency.value=620;g.gain.setValueAtTime(.03,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.14);o.onended=()=>a.close();}catch(_){} }
  function commit(a){const r=E.dispatch(state,{...a,revision:a.revision??state.revision});if(!r.ok){feedback(r.error);return;}state=r.state;feedback('');sound();save();render();}
  function request(a){
    if(paused||blocked){feedback('再開ボタンで進行を再開してください');return;}
    if(E.current(state).controller==='ai'&&state.phase!=='ready'){feedback('対戦AIの手番です');return;}
    const r=E.dispatch(state,a);if(!r.ok){feedback(r.error);return;}
    if(a.type==='end'||a.type==='start'||a.type==='eventSkip'){commit(a);return;}
    pending={...a,revision:state.revision};const before=E.current(state),after=E.player(r.state,before.id),c=state.companies.find(c=>c.id===a.company),next=r.state.companies.find(c=>c.id===a.company);
    $('confirm-title').textContent=label(a);
    $('confirm-body').innerHTML='<div class="preview"><span>現金</span><strong>'+amount(before.cash)+' → '+amount(after.cash)+'</strong>'+(c?'<span>'+esc(c.name)+' 株価</span><strong>'+amount(c.stocks.length)+' → '+amount(next.stocks.length)+'</strong>':'')+'<span>次回利息</span><strong>'+amount(E.nextInterest(state,before.id))+' → '+amount(E.nextInterest(r.state,before.id))+'</strong></div><p>'+esc(note(a))+'</p>';
    $('confirm').showModal();
  }
  function label(a){return {buyStock:'株式を購入',sellStock:'株式を売却',rescueSell:'救済のため株式を売却',buyHappy:'幸福を購入',buyProperty:'不動産を購入',borrow:'融資を受ける',repay:'元本を全額返済',refinance:'低金利へ借り換え',offer:'貸付を提案',accept:'貸付を受諾',cancelOffer:'貸付提案を取消',eventSell:'イベントで不動産を売却',rescueBorrow:'緊急融資を受ける',restructure:'資産整理へ移行'}[a.type]||a.type;}
  function note(a){if(['buyStock','sellStock','buyHappy','buyProperty'].includes(a.type))return '主行動を1回使用します。取消すると取引も行動消費もありません。';if(a.type==='restructure')return '株をすべて処分し、残債を収入で返済します。幸福と不動産は保持します。';if(a.type==='eventSell')return '購入額の'+(state.pending.rate>0?'＋':'')+state.pending.rate+'%。1万円未満切り捨て。主行動は消費しません。';return '金融操作は手番ごとに1回。契約成立ラウンドの末尾から利息が発生します。';}
  function render(){
    clearTimeout(timer);const p=E.current(state),rent=state.properties.filter(x=>x.owner===p.id&&x.occupied).reduce((n,x)=>n+x.rent,0);
    $('age').textContent=(20+state.round*2)+'–'+(22+state.round*2)+'歳';$('round').textContent=state.round+' / 24 ROUND';
    $('hud').innerHTML=[['現金',p.cash,'万円'],['幸福',E.happiness(state,p.id),'pt'],['借入・残債',E.debt(state,p.id),'万円'],['次回収支',state.config.income+rent+state.loans.filter(l=>l.lender===p.id).reduce((n,l)=>n+E.interest(l),0)-E.nextInterest(state,p.id)-(p.rehab?Math.min(p.cash+state.config.income+rent,state.claims.filter(l=>l.borrower===p.id).reduce((n,l)=>n+l.amount,0)):0),'万円']].map(([k,v,u])=>'<div class="metric"><small>'+k+'</small><strong>'+v+'<em>'+u+'</em></strong></div>').join('');
    $('turn').textContent=state.phase==='finished'?'人生の決算':p.name+(state.phase==='event'?'の売却機会':state.phase==='rescue'?'の支払救済':'の手番');
    $('guide').textContent=state.phase==='ready'?'まずはカードを眺め、準備できたら開始。':state.phase==='event'?'不動産を1件売るか、見送るかを選んでください。':state.phase==='rescue'?'株を売るか緊急借入で利息を払います。難しければ資産整理へ。':p.rehab?'資産整理中：収入は残債返済に充当されます。':'主行動 '+(state.mainUsed?'使用済み':'あと1回')+' ／ 金融操作 '+(state.financeUsed?'使用済み':'あと1回');
    $('pause').textContent=paused?'再開':'一時停止';$('event-title').textContent=state.event?.name||'人生の準備をしましょう';$('event-detail').textContent=state.event?.detail||'投資で資金を育てるか、早いうちに幸福を買うか。最後は幸福ポイントで勝負。';
    $('players').innerHTML=state.players.map(q=>'<div class="player-row"><strong><i class="dot owner-'+q.id+'"></i>'+esc(q.name)+(q.id===state.active?' ◀':'')+'</strong><small>幸福 '+E.happiness(state,q.id)+'pt · 現金 '+amount(q.cash)+'<br>株 '+E.stocks(state,q.id).length+'枚 · 不動産 '+state.properties.filter(x=>x.owner===q.id).length+'件<br>借入・残債 '+amount(E.debt(state,q.id))+' · 利息 '+amount(E.nextInterest(state,q.id))+(q.rehab?' · 資産整理中':'')+'</small></div>').join('');
    $('history').innerHTML=state.log.slice(-10).reverse().map(l=>'<li>'+l.round+'R · '+esc(l.text)+'</li>').join('');
    $('action-title').textContent=paused?'進行を停止しています':state.phase==='ready'?'自分らしい人生を、ここから':state.phase==='finished'?'24ラウンドが終了しました':p.name+' · 幸福 '+E.happiness(state,p.id)+'pt';
    $('action-note').textContent=state.phase==='rescue'?'支払不足を解消するまで次へ進めません':state.phase==='event'?'今回だけの売却機会です':'株は追加後／除去後価格。幸福は表示価格で購入。';
    $('end').textContent=state.phase==='ready'?'人生を開始':state.phase==='event'?'売却を見送る':state.phase==='finished'?'結果を見る':'ターン終了';
    $('end').disabled=paused||blocked||state.phase==='rescue'||(p.controller==='ai'&&!['ready','finished'].includes(state.phase));
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
    let html='';
    if(state.phase==='event')html+='<div class="notice">'+esc(name(state.pending.owner))+'だけの売却機会。不動産タブから1件選択、または下のボタンで見送れます。</div>';
    if(state.phase==='rescue')html+='<div class="notice">株式タブの保有株を売却、または '+button('緊急借入 10万円',{type:'rescueBorrow'})+button('資産整理へ',{type:'restructure'})+'</div>';
    if(tab==='stocks'){
      html+='<div class="cards">'+state.companies.map(c=>'<article class="card"><span class="kicker">'+esc(c.sector)+'</span><h3>'+esc(c.name)+'</h3><p>自分 '+c.stocks.filter(t=>t.owner===p.id).length+'株 / NPC '+c.stocks.filter(t=>t.owner==='npc').length+'株</p><strong class="price">'+c.stocks.length+'<small> 万円</small></strong><div class="stack" aria-label="所有者別の株カード">'+c.stocks.slice(-8).map(t=>'<span class="stock-chip owner-'+t.owner+'">'+(t.owner==='npc'?'N':t.owner+1)+'</span>').join('')+'</div>'+button('購入 '+amount(c.stocks.length+1),{type:'buyStock',company:c.id})+'</article>').join('')+'</div><p class="legend">N：市場NPC ／ 数字：プレイヤー番号。カードの総枚数が株価です。表示は最後の8枚。<br>基礎点分もNPC株なので、株価は初期価格を下回ります。</p>';
      html+='<h2 class="section-label">あなたの保有株 · 1枚ずつ売却</h2>';
      const own=state.companies.flatMap(c=>c.stocks.filter(t=>t.owner===p.id).map(t=>'<div class="list-row"><div>'+esc(c.name)+'<small>取得 '+amount(t.cost)+' · 売却損益 '+amount(c.stocks.length-1-t.cost)+'</small></div>'+button('売却 '+amount(c.stocks.length-1),{type:state.phase==='rescue'?'rescueSell':'sellStock',company:c.id,stock:t.id})+'</div>'));html+=own.join('')||'<p class="legend">まだ株式を保有していません。</p>';
    }else if(tab==='property'){
      html+='<div class="cards">'+state.properties.map(x=>'<article class="card"><span class="kicker">'+(x.occupied?'● 入居中':'○ 空室')+'</span><h3>'+esc(x.name)+'</h3><p>家賃 '+amount(x.rent)+' / ラウンド<br>所有：'+esc(x.owner===null?'売出中':name(x.owner))+'</p><strong class="price">'+x.price+'<small> 万円</small></strong>'+(x.owner===null?button('購入する',{type:'buyProperty',property:x.id}):state.phase==='event'&&x.owner===state.pending.owner?button('売却 '+amount(E.money(x.cost,100+state.pending.rate)),{type:'eventSell',property:x.id}):'<p>売却はイベント時のみ</p>')+'</article>').join('')+'</div><p class="legend">不動産は借入担保に含みません。入居中のみラウンド末に家賃が入ります。</p>';
    }else if(tab==='happy'){
      html+='<article class="card happy-card wide"><div class="happy-symbol">✺</div><p class="kicker">THE THINGS THAT MATTER</p><h3>いま、しあわせを買う</h3><p>思い出、家族との時間、自分のための選択。<br>一度得た幸福は、誰にも売れません。</p><strong class="price">'+E.happyPrice(state)+'<small> 万円 / 1pt</small></strong>'+button('幸福を1つ購入',{type:'buyHappy'})+'<p>みんなの購入 '+state.happiness.filter(x=>x.owner!=='npc').length+'枚 · NPC購入 '+state.happiness.filter(x=>x.owner==='npc').length+'枚</p></article>';
    }else{
      html+='<div class="notice">担保評価 '+amount(E.stockValue(state,p.id))+' ／ 借入可能上限 '+amount(Math.min(50,Math.floor(E.stockValue(state,p.id)/2)))+'。借入は2契約まで。</div><h2 class="section-label">銀行の融資</h2>';
      html+=[...state.bankOffers,{id:'emergency',principal:10,rate:10}].map(o=>'<div class="list-row"><div>'+(o.id==='emergency'?'緊急融資（常時補充）':'銀行融資')+'<small>元本 '+amount(o.principal)+' · '+o.rate+'% · 利息 '+amount(E.interest(o))+'</small></div>'+button('借入',{type:'borrow',offer:o.id})+'</div>').join('');
      html+='<h2 class="section-label">あなたの借入・返済</h2>';
      html+=state.loans.filter(l=>l.borrower===p.id).map(l=>'<div class="list-row"><div>'+esc(name(l.lender))+'から '+amount(l.principal)+'<small>金利 '+l.rate+'% · 利息 '+amount(E.interest(l))+'</small></div>'+button('完済',{type:'repay',loan:l.id})+state.bankOffers.filter(o=>o.principal===l.principal&&o.rate<l.rate).map(o=>button('借り換え '+o.rate+'%',{type:'refinance',loan:l.id,offer:o.id})).join('')+'</div>').join('')||'<p class="legend">借入契約はありません。</p>';
      html+='<h2 class="section-label">プレイヤーへの貸付 · 元本20万円／5%</h2>'+state.players.filter(q=>q.id!==p.id).map(q=>'<div class="list-row"><span>'+esc(q.name)+'</span>'+button('貸付を提案',{type:'offer',borrower:q.id})+'</div>').join('');
      for(const o of state.offers){if(o.borrower===p.id)html+='<div class="list-row"><span>'+esc(name(o.lender))+'から20万円の提案</span>'+button('受諾',{type:'accept',offer:o.id})+'</div>';if(o.lender===p.id)html+='<div class="list-row"><span>'+esc(name(o.borrower))+'へ20万円確保中</span>'+button('取消',{type:'cancelOffer',offer:o.id})+'</div>';}
      html+='<h2 class="section-label">貸付中・残債</h2><p class="legend">貸付元本 '+amount(state.loans.filter(l=>l.lender===p.id).reduce((n,l)=>n+l.principal,0))+' ／ 利息収入見込 '+amount(state.loans.filter(l=>l.lender===p.id).reduce((n,l)=>n+E.interest(l),0))+' ／ 無利息の残債 '+amount(state.claims.filter(l=>l.borrower===p.id).reduce((n,l)=>n+l.amount,0))+'</p>';
    }
    $('market-content').innerHTML=html;
    if(state.phase==='finished'&&!lastResult){lastResult=true;showResult();}
    schedule();
  }
  function schedule(){clearTimeout(timer);if(!paused&&!blocked&&!document.hidden&&!document.querySelector('dialog[open]')&&E.current(state).controller==='ai'&&!['ready','finished'].includes(state.phase))timer=setTimeout(()=>{if(paused||blocked||document.hidden||document.querySelector('dialog[open]'))return;const a=LifeAI.choose(state);if(a)commit(a);},650);}
  function showResult(){$('result-title').textContent=state.winners.map(name).join('・')+(state.winners.length>1?'の共同勝利':'の勝利');$('result-body').innerHTML=state.players.map(p=>'<div class="player-row"><strong>'+esc(p.name)+' · 幸福 '+E.happiness(state,p.id)+'pt</strong><small>現金 '+amount(p.cash)+' · 未完済残債 '+amount(E.debt(state,p.id))+' · 不動産 '+state.properties.filter(x=>x.owner===p.id).length+'件</small></div>').join('')+'<p>資産額ではなく、手に入れた幸福が勝敗を決めました。</p>';$('result').showModal();}
  document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b)request(JSON.parse(b.dataset.action));const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render();}});
  $('end').onclick=()=>{if(state.phase==='finished')showResult();else request({type:state.phase==='ready'?'start':state.phase==='event'?'eventSkip':'end'});};
  $('commit').onclick=()=>{const a=pending;pending=null;$('confirm').close();if(a&&!document.hidden&&!paused)commit(a);};$('cancel').onclick=()=>{pending=null;$('confirm').close();schedule();};
  $('pause').onclick=()=>{if(blocked){feedback('保存状態を確認するため再読み込みしてください');return;}paused=!paused;render();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;clearTimeout(timer);render();}});
  $('help').onclick=()=>{clearTimeout(timer);$('help-dialog').showModal();};$('close-help').onclick=()=>{$('help-dialog').close();schedule();};$('motion').onchange=()=>document.body.classList.toggle('reduced',$('motion').checked);
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>{schedule();});
  function setup(){clearTimeout(timer);$('setup').showModal();}
  function newGame(){if((state.phase!=='ready'||blocked)&&!confirm('進行を破棄して、新しい人生を始めますか？'))return;setup();}
  $('new').onclick=newGame;$('again').onclick=()=>{$('result').close();newGame();};$('view-result').onclick=()=>$('result').close();
  $('setup').addEventListener('close',()=>{if($('setup').returnValue!=='start')return;const count=Number($('count').value),mode=$('mode').value;state=E.create(Date.now()>>>0,Array.from({length:count},(_,i)=>mode==='ai'&&i>0?'ai':'human'));paused=false;blocked=false;lastResult=false;save();render();});
  $('continue').onclick=()=>{$('resume').close();paused=true;render();if(state.phase==='finished')showResult();};$('fresh').onclick=()=>{if(!confirm('前回の保存を新しいゲームで置き換えますか？'))return;$('resume').close();setup();};
  window.addEventListener('storage',e=>{if(e.key===LifeStorage.key){blocked=true;paused=true;feedback('別のタブで保存が変更されました。再読み込みしてください');render();}});
  try{const saved=LifeStorage.read();if(saved){state=saved;paused=true;$('save').textContent='保存した進行を読み込みました · このブラウザで再開できます';$('resume-detail').textContent=state.round+'ラウンド目・'+name(state.active)+'の進行を再開できます。';render();$('resume').showModal();}else{render();setup();}}catch(e){blocked=true;feedback('保存データを読み込めません：'+e.message);render();}
  document.body.classList.toggle('reduced',$('motion').checked);
})();
