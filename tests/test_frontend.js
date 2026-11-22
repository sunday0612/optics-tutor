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
 for(const [f,n] of [['michelson','MI'],['newton','NR'],['spectrometer','SP']]){vm.runInContext(fs.readFileSync('web/js/lab-'+f+'.js','utf8').replace('return {mount, render, key};','return {s,init,calc};'),labs);vm.runInContext(n+'.init()',labs)}
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
 console.log('Frontend regression checks passed (including Newton rings valid, invalid, mixed, and incomplete readings).');
})().catch(e=>{console.error(e);process.exitCode=1});
