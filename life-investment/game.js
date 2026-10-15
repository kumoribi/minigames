(function(){
  'use strict';
  const E=LifeEngine,$=id=>document.getElementById(id);
  const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=n=>Number(n).toLocaleString('ja-JP');
  function amount(n){const sign=n<0?'−':'';n=Math.abs(n);return sign+(n>=10000?Math.floor(n/10000)+'億'+(n%10000?num(n%10000)+'万円':'円'):num(n)+'万円');}
  let state=E.create(),tab='assets',paused=false,blocked=false,pending=null,timer=null,lastResult=false;
  let guideHidden=false,lastChange=null,placedProperty=null;
  try{guideHidden=localStorage.getItem('life-investment-guide-hidden')==='1';}catch(_){}
  function guidePreference(hidden){guideHidden=hidden;try{localStorage.setItem('life-investment-guide-hidden',hidden?'1':'0');}catch(_){}}
  const name=id=>id==='bank'?'銀行':id==='npc'?'NPC':E.player(state,id)?.name||'不明';
  const caption={buyStock:'株式を購入',sellStock:'株式を売却',rescueSell:'救済のため株式を売却',buyHappy:'幸福を購入',buyProperty:'不動産を購入',borrow:'融資カードを利用',repay:'元本と未払利息を全額返済',refinance:'融資カードで借り換え',offer:'市場へ融資カードを置く',cancelOffer:'未契約カードを取り下げ',eventSell:'イベントで不動産を売却',rescueBorrow:'無担保の緊急融資を受ける',restructure:'資産整理・破産処理',end:'手番を終了'};
  function button(label,a){const r=E.dispatch(state,a);return '<button data-action="'+esc(JSON.stringify(a))+'"'+(r.ok?'':' aria-disabled="true" title="'+esc(r.error)+'"')+'>'+esc(label)+'</button>'+(!r.ok?'<small class="unavailable">'+esc(r.error)+'</small>':'');}
  function feedback(text){$('status').textContent=text;}
  function save(){try{LifeStorage.save(state);$('save').textContent='自動保存済み · 分割資金・複数銘柄ルール v5';}catch(e){blocked=true;paused=true;$('save').textContent='保存できません：'+e.message;feedback(e.message);}}
  function sound(){if(!$('sound').checked||document.hidden)return;try{const a=new AudioContext(),o=a.createOscillator(),g=a.createGain();o.frequency.value=620;g.gain.setValueAtTime(.03,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+.12);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+.14);o.onended=()=>a.close();}catch(_){}}
  function commit(a){
    const actor=E.current(state),previous=state.cashReport?.updatedRevision;
    const r=E.dispatch(state,{...a,revision:a.revision??state.revision});if(!r.ok){feedback(r.error);return;}
    lastChange={text:caption[a.type]||'手番が進みました',prices:r.state.companies.map((c,i)=>({id:c.id,delta:c.stocks.length-state.companies[i].stocks.length})),happy:E.happiness(r.state,actor.id)-E.happiness(state,actor.id)};
    const oldPhase=state.phase;state=r.state;if(a.type==='buyProperty'){placedProperty=a.property;tab='assets';}if(state.phase==='event'&&oldPhase!=='event')tab='property';if(state.phase==='rescue'&&oldPhase!=='rescue')tab='assets';const report=state.cashReport,changed=report&&report.updatedRevision!==previous;
    reportPending=!!(changed&&(actor.controller==='human'||report.kind==='round')&&state.players.some(p=>p.controller==='human'));
    feedback((lastChange.text)+(lastChange.happy>0?' · 幸福 ＋'+lastChange.happy+'pt':''));sound();save();render();
    if(a.type==='buyProperty')document.querySelector('.personal-scene')?.scrollIntoView({block:'center'});
    if(reportPending){reportPending=false;openStatement(actor.controller==='human'?actor.id:state.players.find(p=>p.controller==='human').id);}
  }
  let reportPending=false;
  function statementRow(row,estimated=false) {
    const t=E.cashTotals(row),groups=[['収入明細','in',['base','rent','dividend','interest']],['利払い明細','out',['interest']],['元本・その他の入出金',null,['grant','principal','claims','stock','funding','other']]];
    let html='<p class="statement-player">'+esc(name(row.player))+'</p>';
    html+='<dl class="statement-lines statement-totals statement-overview"><div><dt>収入合計</dt><dd>＋'+amount(t.income)+'</dd></div><div><dt>利払い合計</dt><dd class="expense">−'+amount(t.paidInterest)+'</dd></div><div><dt>収入 − 利払い</dt><dd>'+amount(t.operatingNet)+'</dd></div></dl>';
    if(!estimated)html+='<dl class="statement-lines statement-totals"><div><dt>現金増減（元本なども含む）</dt><dd>'+amount(t.net)+'</dd></div><div><dt>現金</dt><dd>'+amount(row.cashBefore)+' → '+amount(row.cashAfter)+'</dd></div></dl>';
    html+='<details class="statement-details"><summary>収入・利払い・入出金の明細を開く</summary>';
    for(const [title,direction,categories] of groups){
      const lines=row.entries.filter(e=>(!direction||e.direction===direction)&&categories.includes(e.category));
      html+='<h3>'+title+'</h3>'+(lines.length?'<dl class="statement-lines">'+lines.map(e=>'<div><dt>'+esc(({base:'基礎収入',rent:'家賃',dividend:'配当',interest:e.direction==='in'?'貸付利息':'支払利息',grant:'初期資金の分割支給',principal:'元本返済',claims:'残債返済（元本・未払分）',stock:'株式売却',funding:'借入金',other:'その他'})[e.category])+'<small>'+esc(e.label)+'</small></dt><dd class="'+(e.direction==='out'?'expense':'')+'">'+(e.direction==='out'?'−':'＋')+amount(e.amount)+'</dd></div>').join('')+'</dl>':'<p class="legend">なし</p>');
    }
    html+='</details>';
    if(row.transferredInterest)html+='<p class="notice">残債に組み替えた未払利息：'+amount(row.transferredInterest)+'。利払い合計には含めません。残債返済は元本・未払分を合わせた額です。</p>';
    if(row.unpaidInterest)html+='<p class="danger">まだ払えていない利息：'+amount(row.unpaidInterest)+'。上の利払い合計は支払済みの額です。</p>';
    return html;
  }
  function renderStatement() {
    const report=state.cashReport;if(!report)return;
    const row=report.rows.find(r=>r.player===Number($('statement-player').value))||report.rows[report.actor];
    $('statement-title').textContent=report.kind==='round'?'ラウンド精算'+(report.complete?'結果':'中'):'手番終了の収支';
    let html='<p>'+report.round+'ラウンド目。'+(report.kind==='round'?(report.complete?'実際に処理した収支です。':'支払不足のため精算が途中です。明細を閉じて救済操作を選んでください。'):'今回はラウンド末の収入・通常利払いはまだ発生していません。')+'</p>';
    const grant=report.startingGrant;html+='<p class="notice">'+esc(name(grant.player))+'の手番開始時の支給：'+amount(grant.amount)+'（受取済み '+grant.paid+'/5回・残り '+amount(grant.remaining)+'）。この支給は手番終了前に受取済みです。収入合計とは分けて記録します。</p>';
    if(report.kind==='round')html+='<p>次の手番開始時に支給された初期資金は、元本・その他の入出金に記載します。</p>';
    if(report.partial)html+='<p class="notice">更新前の精算途中から再開したため、記録開始後の入出金だけを表示します。</p>';
    if(report.kind==='turn'&&report.forecast){html+='<h3>ラウンド末の見込み（未精算）</h3><p>現在の保有資産・契約を維持した場合です。貸付利息は相手の返済状況によって変わります。元本返済・残債返済はこの見込みに含みません。</p>'+statementRow(report.forecast,true)+'<h3>今回の手番終了で実際に動いた現金</h3>';}
    html+=(report.kind==='turn'&&report.forecast&&!row.entries.length?'<p>今回の現金：'+amount(row.cashBefore)+' → '+amount(row.cashAfter)+'（変更なし）</p>':statementRow(row));$('statement-body').innerHTML=html;
  }
  function openStatement(id) {
    const report=state.cashReport;if(!report){feedback('手番を終了すると収支明細が残ります');return;}
    clearTimeout(timer);$('statement-player').innerHTML=report.rows.map(r=>'<option value="'+r.player+'">'+esc(name(r.player))+'</option>').join('');
    $('statement-player').value=String(id??report.actor);$('statement-players').hidden=report.kind!=='round';renderStatement();$('statement').showModal();
  }

  function dueEmergency(s,id){const p=E.player(s,id);return s.loans.filter(l=>l.borrower===id&&l.emergency&&l.dueTurn<=p.turns);}
  function request(a){
    if(paused||blocked){feedback('再開ボタンで進行を再開してください');return;}
    if(E.current(state).controller==='ai'&&state.phase!=='ready'){feedback('対戦AIの手番です');return;}
    const r=E.dispatch(state,a);if(!r.ok){feedback(r.error);return;}
    if(a.type==='start'||a.type==='eventSkip'||(a.type==='end'&&!dueEmergency(state,state.active).length)){commit(a);return;}
    pending={...a,revision:state.revision};
    $('stock-order').hidden=!['buyStock','buyHappy'].includes(a.type);
    if(['buyStock','buyHappy'].includes(a.type)){$('stock-quantity').value=a.quantity??1;$('stock-order').dataset.company=a.company||'';$('stock-order').dataset.type=a.type;$('quantity-label').textContent=a.type==='buyHappy'?'購入する幸福（pt）':'購入株数';$('quantity-note').textContent=a.type==='buyHappy'?'1ptずつ値上がりする価格で購入します。主行動は使いません。':'1株ずつ値上がりする価格で購入します。';}
    $('commit').disabled=false;
    const before=E.current(state),after=E.player(r.state,before.id),c=state.companies.find(c=>c.id===a.company),next=r.state.companies.find(c=>c.id===a.company);
    let preview='<div class="preview"><span>現金</span><strong>'+amount(before.cash)+' → '+amount(after.cash)+'</strong><span>使用可能な現金</span><strong>'+amount(E.spendable(state,before.id))+' → '+amount(E.spendable(r.state,before.id))+'</strong>'+(c?'<span>'+esc(c.name)+' 株価</span><strong>'+amount(c.stocks.length)+' → '+amount(next.stocks.length)+'</strong>':'')+'<span>次回利息</span><strong>'+amount(E.nextInterest(state,before.id))+' → '+amount(E.nextInterest(r.state,before.id))+'</strong></div>';
    if(c)preview+='<div class="preview"><span>ラウンド末の配当見込</span><strong>'+amount(E.dividends(state,before.id))+' → '+amount(E.dividends(r.state,before.id))+'</strong></div>';
    if(a.type==='buyStock')preview+='<div class="preview"><span>購入株数</span><strong>'+(a.quantity??1)+'株</strong><span>購入総額</span><strong>'+amount(before.cash-after.cash)+'</strong></div>';
    if(a.type==='buyHappy')preview+='<div class="preview"><span>購入総額</span><strong>'+amount(before.cash-after.cash)+'</strong><span>幸福ポイント</span><strong>'+E.happiness(state,before.id)+' → '+E.happiness(r.state,before.id)+'</strong><span>次の購入価格</span><strong>'+amount(E.happyPrice(r.state))+'</strong></div>';
    const newLoans=r.state.loans.filter(l=>!state.loans.some(old=>old.id===l.id)||state.loans.find(old=>old.id===l.id)?.principal!==l.principal);
    if(newLoans.length)preview+='<h3>この操作で成立する融資</h3>'+newLoans.map(l=>'<p>'+esc(name(l.borrower))+' ← '+esc(name(l.lender))+'：'+amount(l.principal)+'・'+l.rate+'%'+(l.emergency?'。緊急融資／第'+l.dueTurn+'手番末が期限':'。信用枠で借入／資産の拘束なし')+'</p>').join('');
    const eliminated=r.state.players.filter(p=>p.bankrupt&&!E.player(state,p.id).bankrupt);
    if(eliminated.length)preview+='<p class="danger">'+eliminated.map(p=>esc(p.name)).join('・')+'は返済不能により破産・脱落します。</p>';
    $('confirm-title').textContent=caption[a.type]||a.type;
    $('confirm-body').innerHTML=preview+'<p>'+esc(note(a))+'</p>';if(!$('confirm').open)$('confirm').showModal();
  }
  function note(a){
    if(a.type==='buyHappy')return '主行動・金融操作は消費しません。同じ手番で何度でも購入できます。次の1枚は購入後の価格になります。';
    if(a.type==='buyStock'||a.type==='sellStock')return '同じ手番で複数銘柄を何度でも売買できます。この手番の主行動を不動産購入には変更できません。幸福は別枠で購入できます。';
    if(a.type==='offer')return '元本は確保しません。他の人が借りる時に現金不足なら、あなたも他の融資から強制調達します。最悪の場合は緊急融資になります。';
    if(a.type==='borrow'||a.type==='refinance')return '通常融資は追加融資枠の範囲内で利用できます。資産は拘束しません。貸し手の資金不足では連鎖借入が発生します。上の契約と期限を確認してください。';
    if(a.type==='end')return '期限に達した緊急融資は自動返済されます。現金が不足すると破産・脱落します。';
    if(a.type==='eventSell')return '取得額の'+(state.pending.rate>0?'＋':'')+state.pending.rate+'%。1万円未満切り捨て。借入中の物件もイベントの条件で売却できます。';
    if(a.type==='restructure')return state.loans.some(l=>l.borrower===state.active&&l.emergency)?'緊急融資のある支払不能は破産・脱落です。':'株を処分し、残債を以後の収入で返済します。';
    return '表示金額は万円単位・端数切り捨て。確定するまで取引は実行されません。';
  }
  // Art files are presentation only; ownership and occupancy always come from state.
  const artwork={character:'assets/character.svg',apartment:'assets/apartment.svg',house:'assets/house.svg',shop:'assets/shop.svg',office:'assets/office.svg',mall:'assets/mall.svg',tower:'assets/tower.svg'};
  function art(id,kind='building-art'){return '<img class="'+kind+'" src="'+artwork[id]+'" alt="" width="240" height="240" decoding="async">';}
  function propertyToken(x){return '<figure class="estate-token'+(placedProperty===x.id?' newly-placed':'')+'" data-property="'+x.id+'">'+art(x.id)+'<figcaption>'+esc(x.name)+'</figcaption><span class="occupancy '+(x.occupied?'occupied':'vacant')+'">'+(x.occupied?'入居中':'空室')+'</span></figure>';}
  function estateScene(q,compact=false){const owned=state.properties.filter(x=>x.owner===q.id);return '<section class="estate-scene '+(compact?'compact-scene':'personal-scene')+'" aria-label="'+esc(q.name)+'の駒と所有物件" data-player="'+q.id+'"><div class="player-pawn owner-color-'+q.id+'">'+'<span class="pawn-figure">'+art('character','character-art')+'<span class="pawn-base" aria-hidden="true"></span></span><span class="pawn-name">'+esc(q.name)+'</span></div><div class="estate-plots">'+(owned.length?owned.map(x=>propertyToken(x)).join(''):'<div class="empty-plot"><span aria-hidden="true">＋</span><small>物件を買うと<br>ここに並びます</small></div>')+'</div></section>';}
  function stockStack(c){return '<div class="stock-stack" aria-label="株券 '+c.stocks.length+'枚。NPC '+c.stocks.filter(t=>t.owner==='npc').length+'枚"><span class="stock-stack-label">株券</span><div class="stack">'+c.stocks.slice(-10).map(t=>'<span class="stock-chip owner-'+t.owner+'">'+(t.owner==='npc'?'N':t.owner+1)+'</span>').join('')+'</div><small>計 '+c.stocks.length+'枚</small></div>';}
  function emergencySummary(l){const p=E.player(state,l.borrower);return l.dueTurn<=p.turns?'この手番末までに返済':'次の自分の手番末までに返済';}
  function render(){
    clearTimeout(timer);const p=E.current(state),rent=state.properties.filter(x=>x.owner===p.id&&x.occupied).reduce((n,x)=>n+x.rent,0),credit=E.creditProfile(state,p.id);
    $('age').textContent=(20+state.round*2)+'–'+(22+state.round*2)+'歳';$('round').textContent=state.round+' / 24 ROUND';
    const lead=Math.max(...E.alive(state).map(q=>E.happiness(state,q.id)),0),gap=Math.max(0,lead-E.happiness(state,p.id)),due=dueEmergency(state,p.id).reduce((n,l)=>n+E.repaymentTotal(l),0);
    $('hud').innerHTML=[['幸福',E.happiness(state,p.id),'pt'],['首位との差',gap,'pt'],['使用可能な現金',E.spendable(state,p.id),'万円'],['この手番末の返済',due,'万円']].map(([k,v,u])=>'<div class="metric"><small>'+k+'</small><strong>'+num(v)+'<em>'+u+'</em></strong></div>').join('');
    $('market-tabs').hidden=!['stocks','property'].includes(tab);
    const hints={assets:['1 · 人生の目標','最後に幸福が最も多い人が勝利。資産は幸福を手に入れるための手段です。まず「市場」で配当と価格を比べましょう。'],stocks:['2 · 将来の収入を育てる','6社を比べて購入。株数は確認画面でまとめて指定できます。会社の特徴は「会社情報」で確認。'],property:['2 · 家賃を育てる','家賃は入居中のみ。購入するとこの手番の株取引はできません。売却はイベント時だけです。'],happy:['3 · 幸福に変える','主行動を使わず何度でも購入できます。数量を変えると、合計額と購入後の現金を確認できます。'],finance:['4 · 返済まで見通す','利息と期限を先に確認。緊急融資は次の自分の手番末が期限で、その後のラウンド収入は返済に使えません。']};
    const hint=hints[tab];$('coach').hidden=guideHidden||state.phase==='finished';$('coach').innerHTML='<strong>'+hint[0]+'</strong><p>'+hint[1]+'</p><button id="guide-hide">ガイドを閉じる</button>';
    $('turn').textContent=state.phase==='finished'?'人生の決算':p.name+(state.phase==='event'?'の売却機会':state.phase==='rescue'?'の支払救済':'の手番');
    $('guide').textContent=state.phase==='ready'?'初期資金は自分の最初の5手番に100万円ずつ支給。幸福の初期価格は10万円。':state.phase==='event'?'所有物件を1件売るか、見送ってください。':state.phase==='rescue'?'支払不足です。緊急融資は次の手番末に返せなければ脱落します。':p.rehab?'資産整理中：収入を残債返済へ。':(state.tradeCompany?'株式売買中（複数銘柄・回数制限なし）':'主行動 '+(state.mainUsed?'使用済み':'あと1回'))+' ／ 金融 '+(state.financeUsed?'使用済み':'あと1回')+' ／ 幸福は別枠';
    $('pause').textContent=paused?'再開':'一時停止';$('event-title').textContent=state.event?.name||'人生の準備をしましょう';$('event-detail').textContent=state.event?.detail||'6社の配当と値動き、26枚から引く24枚のイベント。最後は幸福で勝負。';
    $('funding').textContent=state.phase==='ready'?'初期資金500万円は、自分の最初の5手番に100万円ずつ受け取ります。':(p.bankrupt?'脱落後の支給はありません。':p.turnGrant?'第'+p.turns+'手番開始時に100万円を受け取りました。':'この手番の初期資金支給はありません。')+' 受取済み '+p.grantsPaid+'/5回・残り '+amount(state.config.startingFunds-p.grantsPaid*state.config.grantAmount);
    $('players').innerHTML=state.players.map(q=>{
      const urgent=state.loans.filter(l=>l.borrower===q.id&&l.emergency);
      return '<div class="player-row '+(q.bankrupt?'eliminated':'')+'"><strong><i class="dot owner-'+q.id+'"></i>'+esc(q.name)+(q.bankrupt?' · 脱落':q.id===state.active?' ◀':'')+'</strong>'+estateScene(q,true)+'<small>幸福 '+E.happiness(state,q.id)+'pt · 現金 '+amount(q.cash)+'<br>使用可能 '+amount(E.spendable(state,q.id))+' · 株 '+E.stocks(state,q.id).length+'枚<br>借入・残債 '+amount(E.debt(state,q.id))+' · 不動産 '+state.properties.filter(x=>x.owner===q.id).length+'件<br>初期資金 '+q.grantsPaid+'/5回受取済み'+(q.rehab&&!q.bankrupt?' · 資産整理中':'')+'</small>'+urgent.map(l=>'<p class="deadline">緊急 '+amount(l.principal)+'・20%<br>'+emergencySummary(l)+'</p>').join('')+'</div>';
    }).join('');
    $('history').innerHTML=state.log.slice(-12).reverse().map(l=>'<li>'+l.round+'R · '+esc(l.text)+'</li>').join('');
    $('action-title').textContent=paused?'進行を停止しています':state.phase==='ready'?'自分らしい人生を、ここから':state.phase==='finished'?'人生の結果を確認できます':p.name+' · 現金 '+amount(p.cash);
    const urgent=dueEmergency(state,p.id);
    $('action-note').textContent=urgent.length?'この手番末 '+amount(due)+' ／ 現金 '+amount(p.cash)+' ／ 不足 '+amount(Math.max(0,due-p.cash))+'。期限後の収入は使えません。':'追加融資枠 '+amount(credit.remaining)+' ／ 収入見込 '+amount(state.config.income+rent+E.dividends(state,p.id))+'（うち配当 '+amount(E.dividends(state,p.id))+'）。金額は端数切り捨て。';
    $('end').textContent=state.phase==='ready'?'人生を開始':state.phase==='event'?'売却を見送る':state.phase==='finished'?'結果を見る':'ターン終了';
    $('end').disabled=paused||blocked||state.phase==='rescue'||(p.controller==='ai'&&!['ready','finished'].includes(state.phase));
    document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab||(b.closest('.bottom-nav')&&b.dataset.tab==='stocks'&&tab==='property'))));
    let html='';
    if(state.phase==='event')html+='<div class="notice">'+esc(name(state.pending.owner))+'の売却機会。不動産タブから1件選ぶか、見送れます。</div>';
    if(state.phase==='rescue')html+='<div class="notice">保有株を売却、または '+button('緊急融資で支払う',{type:'rescueBorrow'})+button('資産整理・破産処理',{type:'restructure'})+'</div>';
    if(tab==='stocks') {
      const holdings=E.portfolio(state,p.id).holdings;
      html+='<h2 class="section-label">6社を比べる · 単位は万円</h2><div class="company-list">'+state.companies.map(c=>{const h=holdings.find(h=>h.company===c.id),delta=lastChange?.prices.find(x=>x.id===c.id)?.delta||0;return '<article class="company-row stock-card" data-company="'+c.id+'"><h3>'+esc(c.name)+'<small>'+esc(c.sector)+'</small></h3>'+stockStack(c)+'<dl><div><dt>株価</dt><dd>'+c.stocks.length+(delta?'<small class="price-change">'+(delta>0?'＋':'')+delta+'</small>':'')+'</dd></div><div><dt>配当 / 株</dt><dd>'+c.dividend+'</dd></div><div><dt>保有</dt><dd>'+(h?.count||0)+'株</dd></div><div><dt>含み損益</dt><dd class="'+((h?.profit||0)<0?'profit-negative':'profit-positive')+'">'+((h?.profit||0)>0?'＋':'')+num(h?.profit||0)+'</dd></div></dl><div class="company-order">'+button('購入 '+amount(c.stocks.length+1),{type:'buyStock',company:c.id})+'</div><details><summary>会社情報</summary><p>'+esc(c.profile)+'<br>基準値幅 ±'+c.swing+'万円 · 自社株買い '+E.buybackCount(c.id)+'/26枚<br>NPC '+c.stocks.filter(t=>t.owner==='npc').length+'株。配当はラウンド末の保有株が対象です。</p></details></article>';}).join('')+'</div><p class="legend">株価はカード枚数。購入すると1株ごとに値上がりします。保有株の売却は「資産」から。</p>';
    } else if(tab==='assets') {
      const emergency=state.loans.filter(l=>l.borrower===p.id&&l.emergency);
      html+='<h2 class="section-label">あなたの人生ボード</h2>'+estateScene(p)+'<section class="asset-summary"><div><small>ラウンド末の収入見込</small><strong>'+amount(state.config.income+rent+E.dividends(state,p.id))+'</strong><p>基礎 '+amount(state.config.income)+' · 家賃 '+amount(rent)+' · 配当 '+amount(E.dividends(state,p.id))+'</p></div><div><small>ラウンド末の利払い見込</small><strong>'+amount(E.nextInterest(state,p.id))+'</strong><p>貸付利息・元本返済は別。未精算の見込みです。</p></div></section>';
      if(emergency.length)html+='<section class="deadline"><strong>緊急融資の返済</strong>'+emergency.map(l=>'<p>'+emergencySummary(l)+' '+amount(E.repaymentTotal(l))+' ／ 現金 '+amount(p.cash)+' ／ 不足 '+amount(Math.max(0,E.repaymentTotal(l)-p.cash))+'</p>').join('')+'<p>期限後に入るラウンド収入は使えません。</p><button data-tab="finance">融資・返済を確認</button></section>';
      html+='<h2 class="section-label">保有不動産</h2>'+ (state.properties.filter(x=>x.owner===p.id).map(x=>'<div class="asset-property">'+art(x.id)+'<strong>'+esc(x.name)+'</strong><span>'+ (x.occupied?'入居中 · 家賃 '+amount(x.rent):'空室 · 家賃なし')+'</span></div>').join('')||'<p class="legend">まだ不動産を保有していません。</p>')+'<h2 class="section-label">保有株 · 銘柄別</h2>';
      const book=E.portfolio(state,p.id),opened=new Set([...document.querySelectorAll('.holding-details[open]')].map(d=>d.dataset.company));
      const profit=n=>'<strong class="holding-profit '+(n>0?'profit-positive':n<0?'profit-negative':'profit-neutral')+'">'+(n>0?'＋':'')+amount(n)+'</strong>';
      const profitLabel=n=>n>0?'含み益':n<0?'含み損':'評価損益';
      html+='<section class="portfolio-total" aria-label="保有株の合計"><span>'+profitLabel(book.profit)+'合計</span>'+profit(book.profit)+'<p>'+book.holdings.length+'銘柄・'+book.count+'株 ／ 取得総額 '+amount(book.cost)+' ／ 売却評価額 '+amount(book.value)+'</p></section>';
      html+='<p class="legend">含み損益＝全株を1株ずつ売った場合の手取り−取得総額。売却ごとの値下がりを反映し、受取済み配当は含みません。</p><div class="holdings">';
      html+=book.holdings.map(h=>{
        const c=state.companies.find(c=>c.id===h.company);
        return '<article class="holding-card" data-company="'+c.id+'"><div class="holding-heading"><h3>'+esc(c.name)+'</h3><span>'+h.count+'株</span></div><p class="holding-profit-label">'+profitLabel(h.profit)+'</p>'+profit(h.profit)+'<dl class="holding-metrics"><div><dt>取得総額</dt><dd>'+amount(h.cost)+'</dd></div><div><dt>売却評価額</dt><dd>'+amount(h.value)+'</dd></div><div><dt>配当見込 / ラウンド</dt><dd>'+amount(h.dividend)+'</dd></div></dl><details class="holding-details" data-company="'+c.id+'"'+(opened.has(c.id)?' open':'')+'><summary>詳細・売却</summary>'+c.stocks.filter(t=>t.owner===p.id).map(t=>'<div class="list-row"><div>取得 '+amount(t.cost)+'<small>この1株を今売る損益 '+(c.stocks.length-1-t.cost>0?'＋':'')+amount(c.stocks.length-1-t.cost)+'</small></div><div>'+button('売却 '+amount(c.stocks.length-1),{type:state.phase==='rescue'?'rescueSell':'sellStock',company:c.id,stock:t.id})+'</div></div>').join('')+'</details></article>';
      }).join('')||'<p class="legend">まだ株式を保有していません。</p>';
      html+='</div>';
    } else if(tab==='property') {
      html+='<div class="cards">'+state.properties.map(x=>'<article class="card property-card">'+art(x.id)+'<span class="kicker">'+(x.occupied?'● 入居中':'○ 空室')+'</span><h3>'+esc(x.name)+'</h3><p>家賃 '+amount(x.rent)+' / ラウンド<br>所有：'+esc(x.owner===null?'売出中':name(x.owner))+'</p><strong class="price property-price">'+amount(x.price)+'</strong><div class="card-action">'+(x.owner===null?button('購入する',{type:'buyProperty',property:x.id}):state.phase==='event'&&x.owner===state.pending.owner?button('売却 '+amount(E.money(x.cost,100+state.pending.rate)),{type:'eventSell',property:x.id}):'<p>売却はイベント時のみ</p>')+'</div></article>').join('')+'</div><p class="legend">取得額の50%を信用評価。借入中でも売却イベントで売れます。家賃は入居中のみ。</p>';
    } else if(tab==='happy') {
      html+='<article class="card happy-card wide"><div class="happy-symbol">✺</div><p class="kicker">THE THINGS THAT MATTER</p><h3>いま、しあわせを買う</h3><p>思い出、家族との時間、自分のための選択。<br>一度得た幸福は、誰にも売れません。<br>主行動を使わず、何度でも購入できます。</p><strong class="price">'+E.happyPrice(state)+'<small> 万円 / 1pt</small></strong>'+button('数量を選んで購入',{type:'buyHappy'})+'<p>みんなの購入 '+state.happiness.filter(x=>x.owner!=='npc').length+'枚 · NPC '+state.happiness.filter(x=>x.owner==='npc').length+'枚</p></article>';
    } else {
      const free=E.creditProfile(state,p.id);
      html+='<div class="notice">追加で借りられる額 '+amount(free.remaining)+'<br>信用上限 '+amount(free.limit)+' − 借入・残債 '+amount(free.outstanding)+'<br>株50% '+amount(free.stock)+' ／ 不動産50% '+amount(free.property)+' ／ 自己現金100% '+amount(free.ownCash)+'<br>現金は全額使用可能。株・不動産も拘束しません。現金評価から借入金相当額を除き、既存債務を信用上限から差し引きます。</div>';
      const urgentOthers=state.loans.filter(l=>l.emergency&&l.borrower!==p.id);
      if(urgentOthers.length)html+='<div class="notice opportunity">融資のチャンス：'+urgentOthers.map(l=>esc(name(l.borrower))+'が緊急融資 '+amount(l.principal)+'を保有').join(' ／ ')+'。同じ元本のカードを置けば借り換え先になります。</div>';
      html+='<h2 class="section-label">共通の融資カード市場</h2><div class="loan-grid">'+state.offers.map(o=>'<article class="loan-card"><span class="kicker">'+(o.lender==='bank'?'BANK LOAN':'PLAYER LOAN')+'</span><h3>'+esc(name(o.lender))+'の融資</h3><strong>'+amount(o.principal)+'</strong><p>金利 <b>'+o.rate+'%</b> ／ ラウンド<br>利息 '+amount(E.interest(o))+(o.lender==='bank'?'':'<br>元本の事前確保なし')+'</p>'+button(o.lender===p.id?'取り下げる':'このカードで借入',{type:o.lender===p.id?'cancelOffer':'borrow',offer:o.id})+'</article>').join('')+'</div>';
      if(!state.offers.length)html+='<p class="legend">通常の融資カードがありません。プレイヤーが新たな融資カードを置けます。</p>';
      html+='<article class="loan-card emergency"><span class="kicker">EMERGENCY · DEADLINE</span><h3>緊急融資 · 常時補充</h3><p>無担保・20%／ラウンド。次の自分の手番末までに返済できないと破産・脱落。借り直しによる期限延長は不可。</p><label>元本（万円）<input id="emergency-principal" type="number" min="1" step="1" value="100"></label><button id="emergency-borrow">緊急融資を受ける</button></article>';
      html+='<section class="panel offer-panel"><h2>あなたの融資カードを場に置く</h2><p class="legend">元本は今は確保しません。実際に貸す時に足りなければ、あなたにも強制借入が発生します。</p><div class="offer-fields"><label>元本（万円）<input id="loan-principal" type="number" min="1" step="1" value="200"></label><label>金利（0～20%／ラウンド）<input id="loan-rate" type="number" min="0" max="20" step="0.01" value="18"></label></div><button id="place-offer">融資カードを場に置く</button></section>';
      html+='<h2 class="section-label">あなたの借入カード</h2><div class="loan-grid">';
      for(const l of state.loans.filter(l=>l.borrower===p.id)) {
        const possible=state.offers.filter(o=>o.lender!==p.id&&o.principal===l.principal&&(o.rate<l.rate||(l.emergency&&o.rate===l.rate)));
        html+='<article class="loan-card '+(l.emergency?'emergency':'')+'"><span class="kicker">'+(l.emergency?'緊急融資':'契約済み')+'</span><h3>'+esc(name(l.lender))+'から '+amount(l.principal)+'</h3><p>金利 '+l.rate+'% ／ 利息 '+amount(E.interest(l))+'<br>資産の拘束なし</p>'+(l.emergency?'<p class="deadline">'+emergencySummary(l)+'<br>完済必要額 '+amount(E.repaymentTotal(l))+'</p>':'')+button('完済 '+amount(E.repaymentTotal(l)),{type:'repay',loan:l.id})+possible.map(o=>button('借り換え '+esc(name(o.lender))+' '+o.rate+'%',{type:'refinance',loan:l.id,offer:o.id})).join('')+'</article>';
      }
      html+='</div><p class="legend">貸付元本 '+amount(state.loans.filter(l=>l.lender===p.id).reduce((n,l)=>n+l.principal,0))+' ／ 利息収入見込 '+amount(state.loans.filter(l=>l.lender===p.id).reduce((n,l)=>n+E.interest(l),0))+' ／ 無利息残債 '+amount(state.claims.filter(l=>l.borrower===p.id).reduce((n,l)=>n+l.amount,0))+'</p>';
    }
    if(tab==='finance'){
      const market=html.indexOf('<h2 class="section-label">共通の融資カード市場'),emergency=html.indexOf('<article class="loan-card emergency"'),contracts=html.indexOf('<h2 class="section-label">あなたの借入カード');
      const creditInfo=html.slice(0,market),offers=html.slice(market,emergency),optional=html.slice(emergency,contracts),debts=html.slice(contracts);
      html=debts+'<details class="credit-details"><summary>信用枠の内訳を確認</summary>'+creditInfo+'</details>'+offers+'<details class="finance-options"><summary>融資カードを置く・緊急融資を利用する</summary>'+optional+'</details>';
    }
    $('market-content').innerHTML=html;
    if(lastChange&&!document.body.classList.contains('reduced'))$('status').classList.add('feedback-flash');
    for(const [id,action] of [['place-offer',{type:'offer',principal:200,rate:18}],['emergency-borrow',{type:'borrow',offer:'emergency',principal:100}]]) {
      const b=$(id);if(!b)continue;
      const check=E.dispatch(state,action);b.setAttribute('aria-disabled',String(!check.ok));
      if(!check.ok){const reason=document.createElement('small');reason.className='unavailable';reason.textContent=check.error;b.after(reason);}
    }
    placedProperty=null;
    if(state.phase==='finished'&&!lastResult&&!reportPending){lastResult=true;showResult();}schedule();
  }
  function schedule(){clearTimeout(timer);if(!paused&&!blocked&&!document.hidden&&!document.querySelector('dialog[open]')&&E.current(state).controller==='ai'&&!['ready','finished'].includes(state.phase))timer=setTimeout(()=>{if(paused||blocked||document.hidden||document.querySelector('dialog[open]'))return;const a=LifeAI.choose(state);if(a)commit(a);},650);}
  function showResult(){
    $('result-title').textContent=state.winners.length?state.winners.map(name).join('・')+(state.winners.length>1?'の共同勝利':'の勝利'):'全員脱落 · 勝者なし';
    $('result-body').innerHTML=state.players.map(p=>'<div class="player-row"><strong>'+esc(p.name)+(p.bankrupt?' · 脱落':' · 幸福 '+E.happiness(state,p.id)+'pt')+'</strong><small>現金 '+amount(p.cash)+' · 未完済残債 '+amount(E.debt(state,p.id))+' · 不動産 '+state.properties.filter(x=>x.owner===p.id).length+'件</small></div>').join('')+'<p>脱落者は幸福による勝利対象から除外します。最後の生存者は即勝利。</p>';$('result').showModal();
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest('[data-action]');if(b)request(JSON.parse(b.dataset.action));
    const t=e.target.closest('[data-tab]');if(t){tab=t.dataset.tab;render();$('turn').scrollIntoView({block:'start'});}
    if(e.target.closest('#guide-hide')){guidePreference(true);render();}
    if(e.target.closest('#guide-reset')){guidePreference(false);$('help-dialog').close();render();}
    if(e.target.closest('#place-offer'))request({type:'offer',principal:Number($('loan-principal').value),rate:Number($('loan-rate').value)});
    if(e.target.closest('#emergency-borrow'))request({type:'borrow',offer:'emergency',principal:Number($('emergency-principal').value)});
  });
  $('end').onclick=()=>state.phase==='finished'?showResult():request({type:state.phase==='ready'?'start':state.phase==='event'?'eventSkip':'end'});
  $('commit').onclick=()=>{const a=pending;pending=null;$('confirm').close();if(a&&!document.hidden&&!paused)commit(a);};
  $('stock-quantity').oninput=()=>{
    if(!$('confirm').open||$('stock-order').hidden)return;
    const a={type:$('stock-order').dataset.type,company:$('stock-order').dataset.company,quantity:Number($('stock-quantity').value),revision:state.revision};
    const r=E.dispatch(state,a);
    // Clear a stale valid order while keeping the quantity editable.
    if(!r.ok){pending=null;$('commit').disabled=true;$('confirm-body').textContent=r.error;return;}
    request(a);
  };
  $('cancel').onclick=()=>{pending=null;$('confirm').close();schedule();};
  $('pause').onclick=()=>{if(blocked){feedback('保存状態を確認するため再読み込みしてください');return;}paused=!paused;render();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){paused=true;clearTimeout(timer);render();}});
  $('statement-open').onclick=()=>openStatement();
  $('statement-player').onchange=renderStatement;
  $('close-statement').onclick=()=>$('statement').close();
  $('statement').addEventListener('close',()=>{if(state.phase==='finished'&&!lastResult){lastResult=true;showResult();}});
  $('help').onclick=()=>{clearTimeout(timer);$('help-dialog').showModal();};$('close-help').onclick=()=>{$('help-dialog').close();schedule();};
  $('events').onclick=()=>{
    clearTimeout(timer);
    $('event-list').innerHTML=LifeCards.events.map(e=>'<article class="event-entry"><h3>'+esc(e.name)+'<span>'+e.copies+'枚</span></h3><p>'+esc(e.description)+'</p></article>').join('');
    $('event-cards-dialog').showModal();
  };
  $('close-events').onclick=()=>$('event-cards-dialog').close();
  $('motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;$('motion').onchange=()=>document.body.classList.toggle('reduced',$('motion').checked);
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('close',schedule));
  function setup(){clearTimeout(timer);$('setup').showModal();}
  function newGame(){if((state.phase!=='ready'||blocked)&&!confirm('新ルールの進行を破棄して始めますか？旧版の保存は保持します。'))return;setup();}
  $('new').onclick=newGame;$('again').onclick=()=>{$('result').close();newGame();};$('view-result').onclick=()=>$('result').close();
  $('setup').addEventListener('close',()=>{if($('setup').returnValue!=='start')return;const count=Number($('count').value),mode=$('mode').value;state=E.create(Date.now()>>>0,Array.from({length:count},(_,i)=>mode==='ai'&&i>0?'ai':'human'));paused=false;blocked=false;lastResult=false;save();render();});
  $('continue').onclick=()=>{$('resume').close();paused=true;render();if(state.phase==='finished')showResult();};
  $('fresh').onclick=()=>{if(!confirm('新ルールの保存を新しい人生で置き換えますか？旧版の保存は保持します。'))return;$('resume').close();setup();};
  $('legacy-new').onclick=()=>{$('legacy-dialog').close();setup();};
  window.addEventListener('storage',e=>{if(e.key===LifeStorage.key){blocked=true;paused=true;feedback('別のタブで保存が変わりました。再読み込みしてください');render();}});
  try {
    const saved=LifeStorage.read();
    if(saved){state=saved;paused=true;$('save').textContent='分割資金・複数銘柄ルール v5 の進行を読み込みました';$('resume-detail').textContent=state.round+'ラウンド目・'+name(state.active)+'の進行を再開できます。';render();$('resume').showModal();}
    else {render();if(LifeStorage.hasLegacy()){$('legacy-links').innerHTML=LifeStorage.legacySaves().map(x=>'<a class="legacy-link" href="'+x.path+'">'+x.label+'で続きから</a>').join('');$('legacy-dialog').showModal();}else setup();}
  }catch(e){blocked=true;feedback('保存データを読み込めません：'+e.message);render();}
  document.body.classList.toggle('reduced',$('motion').checked);
})();
