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
 for(const [f,n] of [['michelson','MI'],['newton','NR'],['spectrometer','SP'],['prism','PM'],['fiber','FB'],['polarization','PL'],['laser','LD'],['beam','BM'],['lens','LN'],['telescope','TS']]){
  const internals={
   PL:'validExtinction,checkPlate,intensity',
   NR:'review,setRetake(levels){retake=levels},wedgeCalc,nx:()=>NX',
   MI:'naCalc,setNa(r){X.na=r},PERIOD',
   SP:'misread',
   BM:'erfFit,hyper,beam,wAt',
   LN:'sharpPos,trace',
   TS:'sp,Gp,Gc,Dp,lp,halfW,center',
   PM:'trace,rhoMin,dmin,nOf,nrm,shift',
  };
  const exports=`return {s,init,calc${internals[n]?','+internals[n]:''}};`;
  vm.runInContext(fs.readFileSync('web/js/lab-'+f+'.js','utf8').replace('return {mount, render, key};',exports),labs);
  vm.runInContext(n+'.init()',labs);
 }
 vm.runInContext(`SP.s.rows=[{n:1,k:1,L:180,R:0},{n:1,k:-1,L:180,R:0}]`,labs);
 assert.equal(vm.runInContext('SP.calc().ok.length',labs),0);
 vm.runInContext(`MI.s.rows=[{N:0,R:32},{N:0,R:32},{N:0,R:32},{N:50,R:32.016}]`,labs);
 assert.equal(vm.runInContext('MI.calc()',labs),null);
 vm.runInContext(`MI.s.rows=Array.from({length:10},(_,i)=>({N:i*50,R:32+i*50*632.8e-6/2}))`,labs);
 assert(Math.abs(vm.runInContext('MI.calc().mean',labs)-632.8)<1e-6);
 vm.runInContext(`const phi=Math.asin(546.1/(1e6/600))*180/Math.PI; SP.s.rows=[{n:1,k:1,L:180+phi,R:phi},{n:1,k:-1,L:180-phi,R:360-phi}]`,labs);
 assert(Math.abs(vm.runInContext('SP.calc().mean',labs)-1e6/600)<1e-6);
 // v1.11.0：三棱镜——用理想读数反推出顶角、折射率和柯西系数
 { const R=vm.runInContext('PM',labs), s=R.s; s.e=0;
   const rd=th=>({L:s.Tz+th, R:s.Tz+th+180}), r0=R.rhoMin(), d=R.trace(546.1,r0).dev, sg=Math.sign(d);
   assert(Math.abs(Math.abs(d)-R.dmin(546.1))<1e-6, 'trace at rhoMin should give δmin');
   const A=f=>({t:'A',f,...rd(R.nrm(f)),rho:s.rho});
   s.rows=[A(1),A(2),A(1),A(2),{t:'Z',...rd(0)},...[1,2,3].map(()=>({t:'D',w:546.1,...rd(d)})),...[404.7,435.8,577.0].map(w=>({t:'D',w,...rd(sg*R.dmin(w))}))];
   const c=R.calc();
   assert(Math.abs(c.sumA.mean-s.A)<1e-9 && Math.abs(c.n-R.nOf(546.1))<1e-9, `prism n ${c.n} vs ${R.nOf(546.1)}`);
   assert(Math.abs(c.fit.a-s.ga)<1e-3 && Math.abs(c.fit.b*1e6-s.gb)/s.gb<0.05, `cauchy ${c.fit.a} ${c.fit.b}`);
   assert(c.un>0 && c.un<5e-4 && c.fromA>0 && c.fromD>0);
   s.rows[1]={...s.rows[1],rho:s.rho+1}; assert(R.calc().pairs[0].moved);
   const sh=R.shift(2); assert(sh>1 && sh<20 && R.shift(0.5)<sh/10, 'quadratic shift '+sh); }
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
 // A valid pair does not unlock review while a requested retake is still incomplete.
 let newtonReviewMessage;
 labs.runReview=(_lab,{check})=>{ newtonReviewMessage=check(); return Promise.resolve(false); };
 newtonCalc(normal);
 vm.runInContext('NR.setRetake([27,22]); NR.review()',labs);
 assert.match(newtonReviewMessage,/第 27 级、第 22 级尚未补齐/);
 newtonCalc([...normal,...readings(22,21.5,28.5),...readings(27,20.99,29.01)]);
 vm.runInContext('NR.review()',labs);
 assert.equal(newtonReviewMessage,'');
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
 // A half-wave plate can be dark at the wrong analyzer angle. Both true axes remain valid.
 vm.runInContext(`PL.s.delta=182; PL.s.type='h';`,labs);
 assert(vm.runInContext('PL.intensity(177.3,70,true)<2',labs));
 assert.equal(vm.runInContext("PL.validExtinction({th:177.3,a:70,I:1.1})",labs),false);
 assert.equal(vm.runInContext("PL.validExtinction({th:117.3,a:130,I:0.99})",labs),true);
 assert.equal(vm.runInContext("PL.validExtinction({th:117.3,a:40,I:0.99})",labs),true);

 vm.runInContext(`PL.s.rows=[{t:'e',a:40,th:117.3,I:1},
    {t:'w',a:85,th:117.3,I:471},{t:'w',a:85,th:117.3,I:471}];`,labs);
 const duplicate=vm.runInContext('PL.calc().g[0]',labs);
 assert.equal(duplicate.valid,false);
 assert.equal(duplicate.ratio,null);
 vm.runInContext(`PL.s.rows.splice(1,2,
    {t:'w',a:85,th:162.3,I:235},{t:'w',a:85,th:252.3,I:235});`,labs);
 assert.equal(vm.runInContext('PL.calc().g[0].valid',labs),false); // Orthogonal angles that miss both extrema.
 vm.runInContext(`PL.s.rows.splice(1,2,
    {t:'w',a:85,th:117.3,I:471},{t:'w',a:265,th:27.3,I:1});`,labs);
 const halfTurn=vm.runInContext('PL.calc().g',labs);
 assert.equal(halfTurn.length,1);
 assert.equal(halfTurn[0].valid,true);
 assert(halfTurn[0].ratio<0.01);

 vm.runInContext(`PL.s.delta=90; PL.s.type='q';
    PL.s.rows.splice(1,2,{t:'w',a:85,th:0,I:235},{t:'w',a:85,th:90,I:235});`,labs);
 const circular=vm.runInContext('PL.calc().g[0]',labs);
 assert.equal(circular.valid,true);
 assert.equal(circular.ratio,1);
 assert.equal(circular.major,null);

 const plateCheck=()=>vm.runInContext('PL.checkPlate(PL.calc().e,PL.calc().g.filter(row=>row.valid))',labs);
 assert.match(plateCheck(),/5 个波片角度/);
 vm.runInContext(`for (const alpha of [15,30,60,75]){
    const a=40+alpha, th=(alpha<45?alpha:alpha-90)+27.3;
    for (const angle of [th,th+90]) PL.s.rows.push({t:'w',a,th:angle,I:PL.intensity(angle,a,true)});
 } PL.s.guess='';`,labs);
 assert.match(plateCheck(),/选择波片类型/);
 vm.runInContext("PL.s.guess='q';",labs);
 assert.equal(plateCheck(),'');
 vm.runInContext(`PL.s.rows=PL.s.rows.filter(r=>r.t!=='w'||r.a!==85);
   for (const th of [27.3,117.3]) PL.s.rows.push({t:'w',a:130,th,I:PL.intensity(th,130,true)});`,labs);
 assert.match(plateCheck(),/45°/);
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
 // ---------- v1.5.0：钠光双线、牛顿环灰尘与劈尖、分光计游标 ----------
 const per=vm.runInContext('MI.PERIOD',labs);
 assert(Math.abs(per-0.29077)<2e-4, 'Na period '+per);                       // λ̄²/(2Δλ) ≈ 0.291 mm
 vm.runInContext(`MI.setNa(Array.from({length:8},(_,i)=>({R:32+(i+0.5)*MI.PERIOD,k:i})))`,labs);
 const na=vm.runInContext('MI.naCalc()',labs);
 assert(Math.abs(na.mean-589.3**2/(2*per*1e6))<1e-9 && !na.skipped && Math.abs(na.mean-0.597)<0.002);
 vm.runInContext(`MI.setNa([0,1,3,4].map(i=>({R:32+i*MI.PERIOD,k:i})))`,labs);           // 漏记一次最低
 assert(vm.runInContext('MI.naCalc().skipped',labs));
 // 牛顿环：附加厚度 f 让单环结果偏小，逐差法不变
 vm.runInContext(`{const R=1000, L=589.3e-6, f=0.6; NR.nx().f=f; const rows=[];
   for (const k of [30,29,28,27,26,25,24,23,22,21]){ const h=Math.sqrt((k-f)*R*L); rows.push({side:'L',k,x:+(25-h).toFixed(3)},{side:'R',k,x:+(25+h).toFixed(3)}); }
   NR.s.rows=rows; NR.s.Rtrue=R;}`,labs);
 const nrd=vm.runInContext('NR.calc()',labs);
 assert(Math.abs(nrd.mean-1)<0.003 && nrd.single.mean<nrd.mean*0.985, 'dust bias '+nrd.single.mean);
 // 劈尖：d = Lλ/(2b)
 vm.runInContext(`{const w={xe:5,L:35,dw:0.08,rows:[],sel:'f',rev:0,pos:{X:6,A:6,dead:0,lastDir:0}}, b=589.3e-6*35/(2*0.08);
   for (let j=0;j<8;j++) w.rows.push({t:'f',N:20+10*j,x:5+(20+10*j)*b,off:0}); w.rows.push({t:'e',x:5,off:0},{t:'w',x:40,off:0}); NR.nx().w=w;}`,labs);
 const wc=vm.runInContext('NR.wedgeCalc()',labs);
 assert(Math.abs(wc.d-0.08)<1e-9 && Math.abs(wc.L-35)<1e-9);
 // 分光计：读游标的核对
 const mr=vm.runInContext(`[SP.misread({L:164+31/60,R:344+29/60,Lt:164+31/60,Rt:344+29/60}), SP.misread({L:165+1/60,R:344+29/60,Lt:164+31/60,Rt:344+29/60}), SP.misread({L:164+33/60,R:344+29/60,Lt:164+31/60,Rt:344+29/60})]`,labs);
 assert(!mr[0].bad && mr[1].bad && mr[1].text.includes('30′') && mr[2].bad && mr[2].text==='差了 2′');
 // ---------- v1.6.0：刀口法测光束、光具座测焦距 ----------
 const ef=vm.runInContext(`(()=>{ const w=0.5, xc=4, pts=[]; for (let k=0;k<30;k++){ const x=3+k*0.07; pts.push({x,P:1.2*0.5*(1-(()=>{const u=Math.SQRT2*(x-xc)/w; const t=1/(1+0.3275911*Math.abs(u)), y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-u*u); return u>=0?y:-y;})())}); } return BM.erfFit(pts); })()`,labs);
 assert(Math.abs(ef.w-0.5)<1e-4 && Math.abs(ef.xc-4)<1e-4 && Math.abs(ef.w1090-0.5)<0.01, 'erf fit '+ef.w);
 vm.runInContext(`Object.assign(BM.s,{W0:0.36,z0:-250,M2:1.2})`,labs);
 const hb=vm.runInContext(`BM.hyper([300,500,700,1000,1400].map(z=>({lens:false,z,fit:{w:BM.wAt(z,false)}})),false)`,labs);
 assert(Math.abs(hb.W0-0.36)<1e-6 && Math.abs(hb.z0+250)<1e-3 && Math.abs(hb.M2-1.2)<1e-6);
 assert(hb.reliable && !hb.why.length);
 // v1.7.2：位置太集中时外推不可靠，不能当有效结果
 const hc=vm.runInContext(`BM.hyper([115,120,125,130,135].map((z,k)=>({lens:false,z,fit:{w:BM.wAt(z,false)*(1+[0.004,-0.003,0.002,-0.004,0.003][k])}})),false)`,labs);
 assert(hc.invalid || (!hc.reliable && hc.why.some(w=>w.includes('只跨了'))), 'clustered M2 must be flagged');
 const h4=vm.runInContext(`BM.hyper([100,700,1300,1900].map(z=>({lens:false,z,fit:{w:BM.wAt(z,false)}})),false)`,labs);
 assert(!h4.reliable && h4.why[0].includes('只有 4 个位置'));
 const bl=vm.runInContext('BM.beam(true)',labs);
 assert(bl.z0>300 && bl.W0<0.36);                                              // 透镜后束腰在导轨上、比原来小
 vm.runInContext(`Object.assign(LN.s,{f:180,dl:2,rev:false}); { const sp=LN.sharpPos(1100); LN.s.rows=[{t:'b',xs:1100,x:sp[0],big:true,off:0},{t:'b',xs:1100,x:sp[1],big:false,off:0},
   {t:'a',x:100+180-2,rev:false,off:0},{t:'a',x:100+180+2,rev:true,off:0}]; }`,labs);
 const lc=vm.runInContext('LN.calc()',labs);
 assert(Math.abs(lc.bessel.mean-180)<1e-9 && Math.abs(lc.auto.f1-178)<1e-9 && Math.abs(lc.auto.mean-180)<1e-9 && Math.abs(lc.auto.delta-2)<1e-9);
 // ---------- v1.9.0：望远镜（有限远标尺的修正）与光具座光路追迹 ----------
 { vm.runInContext(`TS.init(); TS.s.t=TS.sp(); TS.s.rows=[{t:'c',ep:'A',K:1,N:TS.Gc(),tl:TS.s.t},{t:'c',ep:'A',K:1,N:TS.Gc(),tl:TS.s.t},{t:'p',ep:'A',d:TS.Dp(),z:TS.lp(),dz:0},{t:'f',ep:'A',x1:TS.s.c-TS.halfW(),x2:TS.s.c+TS.halfW()}]`,labs);
   const c=vm.runInContext('TS.calc().A',labs), s=vm.runInContext('TS.s',labs), G=s.fo/s.feA;
   assert(Math.abs(c.cmp.inf-G)/G<0.005 && Math.abs(c.pup.inf-G)/G<0.005, `telescope corrections ${c.cmp.inf} ${c.pup.inf} ${G}`);
   assert(c.pup.sum.mean>G*1.04 && c.cmp.sum.mean>c.pup.sum.mean, 'finite target enlarges measured magnification');
   const sp=vm.runInContext('TS.sp()',labs); assert(Math.abs(c.fov.sum.mean-2*Math.atan(5/sp)*180/Math.PI)<1e-9); }
 { // 自准法：物恰在焦面上时，回程光线回到物平面上同一点（倒像）
   vm.runInContext(`LN.init(); LN.s.mode='auto'; LN.s.xl=100+LN.s.f-LN.s.dl;`,labs);
   const back=vm.runInContext(`LN.trace().filter(r=>r.kind==='back').map(r=>r.pts[2][1])`,labs);
   assert(Math.max(...back)-Math.min(...back)<1e-9 && Math.abs(back[0]+5)<1e-9, 'autocollimation returns to an inverted point');
   vm.runInContext(`LN.s.mode='bessel'; LN.s.xs=900; LN.s.xl=LN.sharpPos()[0];`,labs);
   const ends=vm.runInContext(`LN.trace().filter(r=>r.kind==='fwd').map(r=>r.pts[2][1])`,labs);
   assert(Math.max(...ends.map(Math.abs))<1e-6, 'sharp Bessel position focuses on the screen'); }
 // ---------- v1.10.0：教学设置（t 因子、扩展不确定度、取位）与读数位数检查 ----------
 { const U=vm.runInContext('Unc',labs);
   assert.equal(U.format(632.84,0.664,'').text,'(632.8 ± 0.7)');            // 默认：1 位，只进不舍
   assert.equal(U.format(632.84,0.164,'').text,'(632.84 ± 0.17)');          // 首位是 1：保留 2 位
   U.config({tA:'t68'}); assert(Math.abs(U.typeA([1,2,3])/ (Math.sqrt(1/3)) - 1.321)<1e-9);
   U.config({k:2, sig:'2', round:'half'}); assert.equal(U.format(632.84,0.664,'').text,'(632.84 ± 1.33)'.replace('632.84 ± 1.33','632.8 ± 1.3'));
   U.config({tA:'none', k:1, sig:'auto', round:'up'}); }
 // ---------- v1.8.0：处理我的数据 ----------
 Object.assign(labs,{esc:s=>String(s),dms:d=>{d=((d%360)+360)%360;let a=Math.floor(d),m=Math.round((d-a)*60);if(m===60){a=(a+1)%360;m=0;}return `${a}°${String(m).padStart(2,'0')}′`;}});
 vm.runInContext(fs.readFileSync('web/js/mydata.js','utf8'),labs);
 const MD=vm.runInContext('MyData',labs);
 assert.equal(MD.num(' 3.5 '),3.5); assert.equal(MD.num(''),null); assert(Number.isNaN(MD.num('3.5a'))); assert.equal(MD.num('－２'),-2);
 assert(Math.abs(MD.ang('164°31′')-(164+31/60))<1e-12 && Math.abs(MD.ang('164 31')-(164+31/60))<1e-12 && MD.ang('164.5')===164.5 && Number.isNaN(MD.ang('164°61′')));
 const fullExample=key=>{ const spec=MD.SPECS[key], s=MD.blank(spec); spec.groups.forEach(g=>{ g.example().forEach(v=>s.rows.push({g:g.id,v:v.map(String)})); if (g.exParams) s.prm[g.id]={...g.exParams}; }); return MD.compute(spec,s); };
 const expect={michelson:/λ = \(63[23]\.\d ± /, newton:/R = \(1\.0[456]\d ± /, grating:/d = \(166[67]\.\d ± /, fiber:/θ = \(77\.\d ± /, polar:/θ<sub>∥<\/sub> = \(23\.\d+ ± /, laser:/R = \(0\.42\d ± /, beam:/M² = \(1\.1[0-9]\d ± /, lens:/f = \(16[45]\.\d+ ± /, telescope:/Γ比 = \(13\.\d+ ± /, prism:/n = \(1\.66\d+ ± /};
 for (const key of MD.KEYS){ const res=fullExample(key);
   assert(res.ok && res.entered && res.prmOk, key+' example should compute');
   assert.deepEqual(res.issues,[], key+' example has issues: '+res.issues.join('；'));
   assert(expect[key].test(res.result.replace(/<b>|<\/b>/g,'')), key+' result text: '+res.result.slice(0,300)); }
 // 有问题的数据要被指出：反转鼓轮、数错环、格式错误
 { const spec=MD.SPECS.michelson, s=MD.blank(spec);
   [['0','32.41250'],['50','32.42832'],['100','32.44x14'],['150','32.45990'],['200','32.47580'],['250','32.49160'],['300','32.50742'],['350','32.52480'],['400','32.53900'],['450','32.53890']].forEach(v=>s.rows.push({g:'he',v}));
   const res=MD.compute(spec,s), all=res.issues.join('\n');
   assert(/第 3 行有空白或不合法/.test(all) && /反转过鼓轮/.test(all) && /可能数错了环/.test(all), all); }
 // v1.8.1：信号无法分辨时不给结果
 { const spec=MD.SPECS.polar, s=MD.blank(spec); for (let k=0;k<13;k++) s.rows.push({g:'malus',v:[String(k*15),'0']});
   const res=MD.compute(spec,s); assert(!res.ok && /无法确定平行位置/.test(res.result) && !/final/.test(res.result) && res.issues.some(x=>/光强全部为零/.test(x))); }
 { const spec=MD.SPECS.polar, s=MD.blank(spec); for (let k=0;k<13;k++) s.rows.push({g:'malus',v:[String(k*15),(500+0.3*Math.sin(k*7)).toFixed(2)]});
   const res=MD.compute(spec,s); assert(!res.ok && /几乎不随检偏器角度变化/.test(res.result)); }
 { const spec=MD.SPECS.laser, s=MD.blank(spec); [[20,10,6],[20,20,10.1],[20,30,13.9],[20,40,18]].forEach(v=>s.rows.push({g:'pi',v:v.map(String)}));
   const res=MD.compute(spec,s); assert(!res.ok && res.issues.some(x=>/阈值电流/.test(x)), res.issues.join(';')); }
 // v1.8.1：数据来源逐格记录，部分替换的示例数据要标为“混合”
 { const spec=MD.SPECS.newton, s=MD.blank(spec), ex=spec.groups[0].example();
   ex.forEach(v=>s.rows.push({g:'ring',v:v.map(String),x:v.map(()=>1)}));
   assert.equal(MD.provenance(spec,s).source,'example');
   s.rows[0].v[1]='24.000'; s.rows[0].x[1]=0; s.rows[0].v[2]='26.000'; s.rows[0].x[2]=0;
   const pv=MD.provenance(spec,s); assert.equal(pv.source,'mixed'); assert.deepEqual([...pv.where[0].no],[1,2,3,4,5,6,7,8,9,10]);
   s.rows[0].x[0]=0; assert.deepEqual([...MD.provenance(spec,s).where[0].no],[2,3,4,5,6,7,8,9,10]);
   s.rows.forEach(r=>r.x=r.v.map(()=>0)); assert.equal(MD.provenance(spec,s).source,'real'); }
 { const spec=MD.SPECS.newton, s=MD.blank(spec); spec.groups[0].example().forEach((v,i)=>{ if(i===1) v[1]='24.91'; if(i===2) v[2]='25.1234'; s.rows.push({g:'ring',v}); });
   const is=MD.compute(spec,s).issues.filter(x=>x.startsWith('读数位数')); assert(is.length===2 && /第 2 行少了估读位/.test(is[0]) && /第 3 行记到了/.test(is[1]), is.join(';')); }
 // 位置太集中的光束数据不能给出可信的 M²
 { const h=MD.hyperFit([115,120,125,130,135],[0.4321,0.4330,0.4336,0.4347,0.4352],632.8e-6); assert(h.invalid || !h.reliable); }
 console.log('Frontend regression checks passed (Newton invalid data, uncertainty, self-count, unknown spectral line, fiber bend loss, Malus law and wave plates, laser diode and photodiode, Na doublet, Newton dust and wedge, vernier reading, knife-edge beam and M² with reliability checks, lens focal length, real-data processing for all ten experiments, prism minimum deviation, telescope finite-distance corrections, lens ray tracing).');
})().catch(e=>{console.error(e);process.exitCode=1});
