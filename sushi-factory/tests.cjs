const assert=require('node:assert/strict');
const E=require('./engine.js');
let passed=0;
function test(name,fn){fn();passed++;console.log('OK '+name);}
const tick=(s,n)=>{for(let i=0;i<n;i++)E.step(s);};
function empty(stage=3){const s=E.create();s.cells={};s.stage=stage;[s.width,s.height]=E.SIZE[stage];s.coins=10000;return s;}
function add(s,x,y,type,option='',dir=0){assert.equal(E.place(s,x,y,type,option,dir),'');return E.at(s,x,y);}
test('開始・新規・復元は停止',()=>{const s=E.create();tick(s,500);assert.equal(s.ticks,0);s.running=true;assert.equal(E.restore(E.save(s)).running,false);});
test('導入の空きレーンをつなぐと注文を達成',()=>{const s=E.create();add(s,9,5,'belt');s.running=true;tick(s,400);assert.ok(s.sold.tunaSushi>=20);assert.equal(s.stage,1);assert.equal(s.width,20);assert.ok(s.coins>500);});
test('空きレーンがあると提供せず、食材が滞留',()=>{const s=E.create();s.running=true;tick(s,500);assert.equal(s.sold.tunaSushi,0);assert.equal(E.at(s,6,5).out.length,4);assert.equal(E.status(E.at(s,6,5)),'搬出口が満杯');});
test('配置拒否・費用・撤去返金',()=>{const s=empty(0),before=s.coins;assert.ok(E.place(s,-1,0,'belt'));assert.ok(E.place(s,0,0,'bridge'));add(s,0,0,'belt');assert.ok(E.place(s,0,0,'cat'));assert.equal(s.coins,before-5);E.remove(s,0,0);assert.equal(s.coins,before);s.coins=0;assert.ok(E.place(s,0,0,'cat'));});
test('撤去は中身を廃棄し、二重返金しない',()=>{const s=empty(),e=add(s,0,0,'source','rice'),before=s.coins;e.out=['rice'];E.remove(s,0,0);const coins=s.coins;assert.equal(coins,before+40);assert.ok(E.remove(s,0,0));assert.equal(s.coins,coins);});
test('レーンは1ステップに1マスだけ移動',()=>{const s=empty();for(let x=0;x<4;x++)add(s,x,0,'belt');E.at(s,0,0).packet={type:'rice',dir:0};s.running=true;tick(s,1);assert.equal(E.at(s,1,0).packet.type,'rice');assert.equal(E.at(s,2,0).packet,null);});
test('満杯のレーンでは消失・複製しない（全走査順）',()=>{for(let seed=0;seed<30;seed++){const s=empty();s.ticks=seed;for(let x=0;x<8;x++){const e=add(s,x,0,'belt');e.packet={type:'rice',dir:0};}s.running=true;tick(s,80);assert.equal(Object.values(s.cells).filter(e=>e.packet).length,8);}});
test('合流は競合しても1個だけ受け取り、残りを保持',()=>{for(let seed=0;seed<20;seed++){const s=empty();s.ticks=seed;const a=add(s,0,1,'belt'),b=add(s,1,0,'belt','',1);add(s,1,1,'belt');a.packet={type:'rice',dir:0};b.packet={type:'tuna',dir:1};s.running=true;tick(s,1);assert.ok(E.at(s,1,1).packet);assert.equal(Object.values(s.cells).filter(e=>e.packet).length,2);}});
test('猫は指定した側から取り、指定した側へ渡す',()=>{const s=empty(),src=add(s,1,0,'belt'),c=add(s,1,1,'cat'),dst=add(s,2,1,'belt');c.input=3;src.packet={type:'rice',dir:1};s.running=true;tick(s,1);assert.equal(dst.packet.type,'rice');assert.equal(src.packet,null);});
test('猫のフィルターは別の食材を取り出さない',()=>{const s=empty(),src=add(s,0,0,'source','rice'),c=add(s,1,0,'cat');add(s,2,0,'belt');src.out=['rice'];c.filter='tuna';s.running=true;tick(s,1);assert.equal(src.out.length,1);assert.equal(E.at(s,2,0).packet,null);});
test('猫同士が同じ入荷箱を取り合っても複製しない',()=>{const s=empty(),src=add(s,1,1,'source','rice');add(s,2,1,'cat');add(s,3,1,'belt');add(s,1,2,'cat','',1);add(s,1,3,'belt');src.out=['rice'];s.running=true;tick(s,1);assert.equal([E.at(s,3,1),E.at(s,1,3)].filter(e=>e.packet).length,1);});
test('レーンから調理台への直接搬入は禁止',()=>{const s=empty(),a=add(s,0,0,'belt'),m=add(s,1,0,'machine','cook');a.packet={type:'rice',dir:0};s.running=true;tick(s,10);assert.ok(a.packet);assert.deepEqual(m.inv,{});});
test('材料不一致・保管上限',()=>{const e=E.entity('machine','tunaGrip');assert.equal(E.accepts(e,'rice',0,true),false);e.inv.shari=4;assert.equal(E.accepts(e,'shari',0,true),false);assert.equal(E.accepts(e,'tunaCut',0,true),true);});
test('全レシピで必要材料だけを消費して1個完成',()=>{for(const [id,r] of Object.entries(E.RECIPES)){const s=empty(),m=add(s,0,0,'machine',id);m.inv={...r.inputs};s.running=true;tick(s,r.time+2);assert.deepEqual(m.out,[r.output]);assert.ok(Object.values(m.inv).every(n=>n===0));}});
test('材料が不足している間は消費しない',()=>{const s=empty(),m=add(s,0,0,'machine','makiRoll');m.inv={shari:2,nori:2};s.running=true;tick(s,100);assert.equal(m.inv.shari,2);assert.equal(m.out.length,0);});
test('分岐器が2方向に交互搬送',()=>{const s=empty(),a=add(s,1,1,'splitter'),f=add(s,2,1,'belt'),l=add(s,1,0,'belt');s.running=true;a.packet={type:'rice',dir:0};tick(s,1);assert.ok(f.packet);a.packet={type:'rice',dir:0};tick(s,1);assert.ok(l.packet);});
test('分岐フィルターは指定食材を左、それ以外を直進',()=>{for(const [item,pos] of [['rice',[1,0]],['tuna',[2,1]]]){const s=empty(),a=add(s,1,1,'splitter');a.filter='rice';add(s,1,0,'belt');add(s,2,1,'belt');a.packet={type:item,dir:0};s.running=true;tick(s,1);assert.equal(E.at(s,...pos).packet.type,item);}});
test('立体交差は縦横独立で方向を維持',()=>{const s=empty(),a=add(s,1,1,'bridge');a.h={type:'rice',dir:0};a.v={type:'tuna',dir:1};add(s,2,1,'belt');add(s,1,2,'belt');s.running=true;tick(s,1);assert.equal(E.at(s,2,1).packet.type,'rice');assert.equal(E.at(s,1,2).packet.type,'tuna');assert.equal(a.h,null);assert.equal(a.v,null);});
test('提供は完成品だけ・一皿につき一回',()=>{const s=empty(),src=add(s,0,0,'belt');add(s,1,0,'cat');add(s,2,0,'counter');src.packet={type:'tunaSushi',dir:0};const before=s.coins;s.running=true;tick(s,20);assert.equal(s.sold.tunaSushi,1);assert.equal(s.coins,before+12);src.packet={type:'shari',dir:0};tick(s,10);assert.ok(src.packet);assert.equal(s.sold.tunaSushi,1);});
test('全注文の段階解放・報酬は一度限り',()=>{const s=empty(0);s.running=true;let expected=s.coins;for(let stage=0;stage<3;stage++){const g=E.GOALS[stage];s.sold[g.item]=20;tick(s,1);expected+=g.reward;assert.equal(s.stage,stage+1);assert.equal(s.coins,expected);tick(s,20);assert.equal(s.coins,expected);}assert.equal(s.width,28);});
test('途中の保存復元後も生産が同じ結果になる',()=>{const a=E.create();add(a,9,5,'belt');a.running=true;tick(a,73);const b=E.restore(E.save(a));b.running=true;tick(a,150);tick(b,150);assert.equal(E.save(a),E.save(b));});
test('壊れた保存データを拒否',()=>{assert.throws(()=>E.restore('{'));for(const mutate of [s=>s.stage=9,s=>s.coins=-1,s=>s.width=999,s=>s.cells['1,2'].option='unknown',s=>s.cells['2,2'].dir=8,s=>s.cells['1,2'].out=['???']]){const s=E.create();mutate(s);assert.throws(()=>E.restore(JSON.stringify(s)));}});
test('実搬送で3種類の注文を順に達成できる',()=>{
  const s=E.create();add(s,9,5,'belt');s.running=true;tick(s,400);assert.equal(s.stage,1);
  const replace=(x,y,t,o)=>{E.remove(s,x,y);add(s,x,y,t,o);};
  replace(1,7,'source','salmon');replace(3,7,'machine','salmonPrep');replace(6,5,'machine','salmonGrip');
  // Rebuilding clears old tuna stuck on the feeder. This is the same refundable UI operation.
  for(const [x,y,d] of [[5,7,0],[6,7,3]]){E.remove(s,x,y);add(s,x,y,'belt','',d);}
  tick(s,450);assert.equal(s.stage,2);assert.ok(s.sold.salmonSushi>=20);
  replace(1,7,'source','cucumber');replace(3,7,'machine','cucumberPrep');replace(6,5,'machine','makiRoll');
  for(const [x,y,d] of [[5,7,0],[6,7,3]]){E.remove(s,x,y);add(s,x,y,'belt','',d);}
  add(s,4,5,'source','nori');add(s,5,5,'cat');tick(s,500);assert.equal(s.stage,3);assert.ok(s.sold.maki>=20);
});
console.log(passed+' tests passed');
