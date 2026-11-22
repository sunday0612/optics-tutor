const fs=require('fs'),vm=require('vm'),assert=require('assert');
const path=require('path');process.chdir(path.join(__dirname,'..'));
for(const f of fs.readdirSync('web/js')) if(f.endsWith('.js'))new vm.Script(fs.readFileSync('web/js/'+f,'utf8'));
const elems=new Map();function $(id){if(!elems.has(id))elems.set(id,{value:'',innerHTML:'',textContent:'',disabled:false,listeners:{},addEventListener(k,f){this.listeners[k]=f},querySelectorAll(){return []},insertAdjacentHTML(p,t){this.innerHTML+=t}});return elems.get(id)}
const pending=[];
const c=vm.createContext({console,$,document:{querySelectorAll:()=>[]},esc:String,fmt:String,paras:String,stats:{ask:0},renderStats(){},logEvent(){},loadingHTML:()=>'',AI:{ready:Promise.resolve(),online:()=>true,label:()=> 'mock'},aiErrorNote:e=>e.message,aiJSON:()=>new Promise(resolve=>pending.push(resolve))});
vm.runInContext(fs.readFileSync('web/js/sim.js','utf8'),c);vm.runInContext('render=()=>{};',c);
assert.equal(vm.runInContext(`normalizeQuiz({question:'q',options:['a','b','c','d'],answer:'0'}).answer`,c),0);
assert.equal(vm.runInContext(`normalizeQuiz({question:'q',options:['a','b','c','d'],answer:0.5})`,c),null);
assert.throws(()=>vm.runInContext('validateResult({})',c));
$('#tabs').listeners.click({target:{closest:()=>({dataset:{k:'newton'}})}});
assert.equal($('#explain').innerHTML,vm.runInContext('PRINCIPLE.newton',c));assert($('#quiz').innerHTML.includes('中心'));
(async()=>{
 $('#q').value='first';const first=vm.runInContext('onAsk()',c);
 $('#q').value='second';await vm.runInContext('onAsk()',c);await new Promise(setImmediate);
 assert.equal(pending.length,1);
 pending[0]({experiment:'double',params:{},explanation:'ok'});await first;
 assert.equal($('#ask').disabled,false);
 const labs=vm.createContext({Math,rnd:(a,b)=>(a+b)/2,angDiff:(a,b)=>Math.abs(((a-b)%360+540)%360-180)});
 vm.runInContext(fs.readFileSync('web/js/uncertainty.js','utf8'),labs);
 for(const [f,n] of [['michelson','MI'],['newton','NR'],['spectrometer','SP'],['fiber','FB'],['polarization','PL'],['laser','LD']]){vm.runInContext(fs.readFileSync('web/js/lab-'+f+'.js','utf8').replace('return {mount, render, key};','return {s,init,calc};'),labs);vm.runInContext(n+'.init()',labs)}
 vm.runInContext(`SP.s.rows=[{n:1,k:1,L:180,R:0},{n:1,k:-1,L:180,R:0}]`,labs);
 assert.equal(vm.runInContext('SP.calc().ok.length',labs),0);
 vm.runInContext(`MI.s.rows=[{N:0,R:32},{N:0,R:32},{N:0,R:32},{N:50,R:32.016}]`,labs);
 assert.equal(vm.runInContext('MI.calc()',labs),null);
 vm.runInContext(`MI.s.rows=Array.from({length:10},(_,i)=>({N:i*50,R:32+i*50*632.8e-6/2}))`,labs);
 assert(Math.abs(vm.runInContext('MI.calc().mean',labs)-632.8)<1e-6);
 vm.runInContext(`const phi=Math.asin(546.1/(1e6/600))*180/Math.PI; SP.s.rows=[{n:1,k:1,L:180+phi,R:phi},{n:1,k:-1,L:180-phi,R:360-phi}]`,labs);
 assert(Math.abs(vm.runInContext('SP.calc().mean',labs)-1e6/600)<1e-6);
 const readings=(k,left,right)=>[
  {side:'L',k,x:left,off:0},
  {side:'R',k,x:right,off:0},
 ];
 const newtonCalc=rows=>{
  labs.newtonRows=rows;
  return vm.runInContext('NR.s.rows=newtonRows; NR.calc()',labs);
 };
 const inner=readings(21,21.500,28.500);
 const normal=[...inner,...readings(26,21.000,29.000)];
 const valid=newtonCalc(normal);
 assert.equal(valid.validCount,1);
 assert.equal(valid.invalid.length,0);
 assert.equal(valid.items[0].R.toFixed(3),'1.273');
 assert.equal(valid.mean.toFixed(3),'1.273');

 for(const [left,right,diameter,difference] of [
  [21.500,28.500,7,0],
  [22.000,28.000,6,-13],
 ]){
  const invalid=newtonCalc([...inner,...readings(26,left,right)]);
  assert.equal(invalid.validCount,0);
  assert.deepStrictEqual(Array.from(invalid.invalid,x=>({...x})),[
   {m:26,n:21,Dm:diameter,Dn:7,squaredDifference:difference},
  ]);
  assert(!('mean' in invalid));
  assert(!('err' in invalid));
 }

 const mixed=newtonCalc([...normal,...readings(22,21.500,28.500),...readings(27,22.000,28.000)]);
 assert.equal(mixed.validCount,1);
 assert.equal(mixed.mean,valid.mean);
 assert.equal(mixed.err,valid.err);
 assert.deepStrictEqual(Array.from(mixed.invalid,x=>({...x})),[
  {m:27,n:22,Dm:6,Dn:7,squaredDifference:-13},
 ]);

 const equalDiameters=newtonCalc([...readings(21,21.123,28.877),...readings(26,20.123,27.877)]);
 assert.equal(equalDiameters.validCount,0);
 assert.deepStrictEqual(Array.from(equalDiameters.invalid,x=>({...x})),[
  {m:26,n:21,Dm:7.754,Dn:7.754,squaredDifference:0},
 ]);
 const incomplete=newtonCalc(normal.slice(0,-1));
 assert.equal(incomplete.validCount,0);
 assert.equal(incomplete.invalid.length,0);
 // ---------- v1.1.0：不确定度 ----------
 assert.equal(vm.runInContext("Unc.format(632.6347,1.04,'nm').text",labs),'(632.6 ± 1.1) nm');
 assert.equal(vm.runInContext("Unc.format(1.0944,0.0083,'m').text",labs),'(1.094 ± 0.009) m');
 assert.equal(vm.runInContext("Unc.format(1666.84,0.41,'nm').text",labs),'(1666.8 ± 0.5) nm');
 assert.equal(vm.runInContext("Unc.round(0.96).u",labs),1);
 assert(Math.abs(vm.runInContext('Unc.typeA([1,2,3])',labs)-Math.sqrt(1/3))<1e-12);
 vm.runInContext(`MI.s.rows=Array.from({length:10},(_,i)=>({N:i*50,R:32+i*50*632.8e-6/2}))`,labs);
 const mi=vm.runInContext('MI.calc().sum',labs);
 assert(Math.abs(mi.uA)<1e-9);
 assert(Math.abs(mi.uB-632.8*Math.SQRT2*1e-4/Math.sqrt(3)/(250*632.8e-6/2))<1e-9);
 const nr=newtonCalc(normal).sum;
 assert.equal(nr.uA,null);
 assert(Math.abs(nr.uB-Math.SQRT2*0.005/Math.sqrt(3)*Math.hypot(16,14)/(20*589.3e-6)/1000)<1e-12);
 // ---------- v1.1.0：迈克尔逊自己数环 ----------
 vm.runInContext(`MI.s.rows=[0,50,100,150,200].map((n,i)=>({N:[0,50,98,148,198][i],Nt:n,cnt:[0,50,48,50,50][i],R:32+n*632.8e-6/2,rev:i===3?1:0,frac:0}))`,labs);
 assert.deepStrictEqual(Array.from(vm.runInContext('MI.calc().segs',labs),g=>[g.seg,g.cnt,g.real,g.diff,g.rev]),
  [[2,50,50,0,0],[3,48,50,-2,0],[4,50,50,0,1],[5,50,50,0,0]]);
 vm.runInContext(`MI.s.rows=Array.from({length:6},(_,i)=>({N:i*50,R:32+i*50*632.8e-6/2}))`,labs);
 assert.equal(vm.runInContext('MI.calc().segs.length',labs),0);
 // ---------- v1.1.0：分光计标定后测未知谱线（测试里 rnd 恒为中值，待测谱线为 404.7 nm） ----------
 vm.runInContext(`const px=Math.asin(404.7/(1e6/600))*180/Math.PI; SP.s.rows=[{n:1,k:1,L:180+phi,R:phi},{n:1,k:-1,L:180-phi,R:360-phi},{n:4,k:1,x:true,L:180+px,R:px},{n:4,k:-1,x:true,L:180-px,R:360-px}]`,labs);
 const sp=vm.runInContext('SP.calc()',labs);
 assert.equal(sp.ok.length,1);
 assert(Math.abs(sp.mean-1e6/600)<1e-6);
 assert.equal(sp.unknown.target,404.7);
 assert(Math.abs(sp.unknown.lam-404.7)<1e-6);
 assert(Math.abs(sp.unknown.u-Math.hypot(sp.unknown.fromD,sp.unknown.fromPhi))<1e-12);
 vm.runInContext(`SP.s.rows=SP.s.rows.slice(0,3)`,labs);
 assert.equal(vm.runInContext('SP.calc().unknown.lam',labs),undefined);
 // ---------- v1.2.0：光纤耦合与弯曲损耗 ----------
 const ref=vm.runInContext('FB.calc().ref',labs);
 assert(Math.abs(ref.c-1.584)<0.005, 'Marcuse c '+ref.c);          // c = 2γ³/(3β²)
 assert(Math.abs(ref.mfd-4.28)<0.02, 'MFD '+ref.mfd);              // 2w，Marcuse 模场近似
 labs.fbC=ref.c;
 vm.runInContext(`{const L=R=>3e3*Math.sqrt(R)*Math.exp(-fbC*R), P0=700, rows=[{t:'base',P:P0}];
   for(const [R,N] of [[4,1],[5,2],[6,5],[7,10]]){ rows.push({t:'bend',R,N,P:P0*10**(-L(R)*N/10)},{t:'base',P:P0}); }
   rows.push({t:'bend',R:3.5,N:1,P:P0*10**(-L(3.5)/10)},{t:'base',P:P0*0.95});          // 取下后基准降了 5%：耦合变了
   rows.push({t:'bend',R:6.5,N:1,P:P0*10**(-L(6.5)/10)});                                // 没有复测基准
   FB.s.rows=rows;}`,labs);
 const fb=vm.runInContext('FB.calc()',labs);
 assert.deepStrictEqual(Array.from(fb.items,x=>x.flag),['','','','','drift','small']);
 assert.equal(fb.pts.length,4);
 assert(Math.abs(fb.fit.c-ref.c)<1e-9);
 assert(fb.fit.uc<1e-9);
 vm.runInContext(`FB.s.rows=[{t:'bend',R:5,N:1,P:100},{t:'base',P:700}]`,labs);
 assert.equal(vm.runInContext('FB.calc().items[0].flag',labs),'nobase');
 vm.runInContext(`FB.s.rows=[20,30,40,50].map(L=>({t:'far',L,r:FB.calc().ref.th*(L+1.5)}))`,labs);
 const far=vm.runInContext('FB.calc().far',labs);
 assert(Math.abs(far.mfd-ref.mfd)<1e-9 && Math.abs(far.delta-1.5)<1e-9);
 assert(Math.abs(far.umfd/far.mfd-far.u/far.th)<1e-12);
 // ---------- v1.3.0：马吕斯定律与波片 ----------
 vm.runInContext(`Object.assign(PL.s,{t0:27.3,f0:40,type:'q',delta:90,plate:false});
   PL.s.rows=Array.from({length:13},(_,k)=>{const th=5+k*15; return {t:'m',th,I:2+470*Math.cos((th-27.3)*Math.PI/180)**2};});`,labs);
 const pm=vm.runInContext('PL.calc().m',labs);
 assert(Math.abs(pm.par-27.3)<1e-9 && Math.abs(pm.Imax-472)<1e-9 && Math.abs(pm.Imin-2)<1e-9 && pm.r2>0.999999);
 assert(pm.uA<1e-6 && Math.abs(pm.u-0.1/Math.sqrt(3))<1e-6);
 vm.runInContext(`PL.s.rows=PL.s.rows.slice(0,7)`,labs);                     // 只覆盖了 90°：不能拟合
 assert.equal(vm.runInContext('PL.calc().m',labs),null);
 // λ/4：从消光位置转过 α，I_min/I_max = tan²α；λ/2：始终是线偏振光，振动方向转过 2α
 vm.runInContext(`PL.s.rows=[{t:'e',a:40,th:117.3,I:1},{t:'w',a:70,th:0,I:400},{t:'w',a:70,th:90,I:100},{t:'w',a:85,th:10,I:300}]`,labs);
 const pg=vm.runInContext('PL.calc().g',labs);
 assert.equal(pg[0].alpha,30); assert.equal(pg[0].n,2); assert(Math.abs(pg[0].th.ratio-1/3)<1e-3);
 assert(Math.abs(pg[0].th.major-30)<0.11); assert.equal(pg[1].n,1);
 vm.runInContext(`PL.s.type='h'; PL.s.delta=180`,labs);
 const ph=vm.runInContext('PL.calc().g[0].th',labs);
 assert(ph.ratio<1e-6 && Math.abs(ph.major-60)<0.11);
 // ---------- v1.4.0：半导体激光器与光电二极管 ----------
 vm.runInContext(`{const T0=75, rows=[];
   for(const Ts of [20,25,30,35]){ const ith=30*Math.exp((Ts-25)/T0), eta=0.5;
     for(const I of [0,10,20]) rows.push({t:'pi',Ts,T:Ts,I,P:0.0008*I});
     for(let k=1;k<=6;k++){ const I=ith+k*2; rows.push({t:'pi',Ts,T:Ts,I,P:eta*(I-ith)}); } }
   rows.push({t:'pd',Ts:25,T:25,I:40,det:'pd',shut:true,v:0.2},{t:'pd',Ts:25,T:25,I:40,det:'pd',shut:true,v:0.1});
   for(const [I,P] of [[32,1],[34,2],[36,3],[40,5]]) rows.push({t:'pd',Ts:25,T:25,I,det:'pm',shut:false,v:P},{t:'pd',Ts:25,T:25,I,det:'pd',shut:false,v:0.42*P*1000+0.15});
   LD.s.rows=rows;}`,labs);
 const ld=vm.runInContext('LD.calc()',labs);
 assert.equal(ld.groups.length,4);
 const g25=ld.groups.find(g=>g.Ts===25);
 assert(Math.abs(g25.fit.ith-30)<1e-9 && Math.abs(g25.fit.eta-0.5)<1e-12 && g25.below===3 && g25.fit.uith<1e-9);
 assert(Math.abs(ld.T0.T0-75)<1e-6 && ld.T0.n===4);
 assert(Math.abs(ld.pd.dark-0.15)<1e-12 && ld.pd.n===4);
 assert(Math.abs(ld.pd.R-0.42)<1e-12 && Math.abs(ld.pd.pairs[0].R-0.42)<1e-12 && ld.pd.pairs[0].raw>0.42);
 assert(Math.abs(ld.pd.u-0.42*0.03/Math.sqrt(3))<1e-9);
 console.log('Frontend regression checks passed (Newton invalid data, uncertainty, self-count, unknown spectral line, fiber bend loss, Malus law and wave plates, laser diode and photodiode).');
})().catch(e=>{console.error(e);process.exitCode=1});
