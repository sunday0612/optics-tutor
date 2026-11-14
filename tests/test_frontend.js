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
 console.log('Frontend regression checks passed (syntax, tab sync, schema, concurrency, invalid data, ideal results).');
})().catch(e=>{console.error(e);process.exitCode=1});
