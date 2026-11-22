/* =====================================================================
 * models3d.js —— 四个实验的三维器材模型（单位：cm，尺寸参照实验室常见型号）
 *   迈克尔逊干涉仪（WSM 型）、读数显微镜 + 牛顿环装置（JCD 型）、分光计（JJY 型）、光纤耦合与弯曲损耗
 * 每个模型返回 update()，在实验状态变化时调用：部件会跟着操作移动或转动。
 * 观察者默认站在 −z 一侧（“前方”）。
 * ===================================================================== */
const Models3D = (() => {
  const {Node, mat, box, cylinder, lathe, disc, torus, plane} = M3;
  const PI=Math.PI, rad=d=>d*PI/180, clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

  /* ---------- 材质 ---------- */
  const MAT = {
    table:   mat({color:'#2b2e33', spec:0.22, shin:18, pattern:1}),
    cast:    mat({color:'#4a545e', spec:0.22, shin:16}),     // 喷漆铸件
    castHi:  mat({color:'#68737e', spec:0.28, shin:18}),
    anod:    mat({color:'#1d1e21', spec:0.35, shin:40}),     // 黑色阳极氧化
    alu:     mat({color:'#c3c8ce', spec:0.65, shin:50}),     // 铝
    steel:   mat({color:'#a9aeb5', spec:0.9,  shin:80}),
    chrome:  mat({color:'#dde1e6', spec:1.0,  shin:120}),
    brass:   mat({color:'#b38b52', spec:0.75, shin:55}),
    knob:    mat({color:'#141414', spec:0.35, shin:26}),
    glass:   mat({color:'#cfe2fa', spec:1.0,  shin:140, opacity:0.28}),
    split:   mat({color:'#d6e3f0', spec:1.0,  shin:140, opacity:0.5}),
    mirror:  mat({color:'#eef2f6', spec:1.0,  shin:160}),
    shadow:  mat({color:'#000000', opacity:0.55, pattern:2, unlit:true}),
    red:     mat({color:'#ff2a1a', unlit:true, opacity:0.75, additive:true}),
    redHalo: mat({color:'#ff3a20', unlit:true, opacity:0.07, additive:true}),
    na:      mat({color:'#ffc23a', unlit:true, opacity:0.32, additive:true}),
    white:   mat({color:'#e6ecff', unlit:true, opacity:0.3, additive:true}),
    led:     mat({color:'#ff3b30', unlit:true}),
  };
  const glow = (hex,a=1) => mat({color:hex, unlit:true, opacity:a, additive:a<1});

  /* ---------- 几何体（全局共享） ---------- */
  const unitCyl = cylinder(1,1,1,20,false);              // 光束：半径、长度用缩放控制
  const N = (g,m) => new Node(g,m);
  const alongX = n => (n.rot=[0,0,-PI/2], n);             // 让局部 y 轴朝 +x
  const alongZ = n => (n.rot=[PI/2,0,0], n);              // 让局部 y 轴朝 +z
  const cylX = (r,len,m,x,y,z) => alongX(N(cylinder(r,r,len,40),m)).at(x,y,z);
  const cylZ = (r,len,m,x,y,z) => alongZ(N(cylinder(r,r,len,40),m)).at(x,y,z);
  const cylY = (r,len,m,x,y,z) => N(cylinder(r,r,len,40),m).at(x,y,z);
  const boxN = (w,h,d,m,x,y,z) => N(box(w,h,d),m).at(x,y,z);
  const shadow = (w,d,x,z) => N(plane(1,1),MAT.shadow).at(x,0.03,z).scale(w,1,d);
  /* 光束：从 a 到 b 的细圆柱（只沿一个坐标轴） */
  function beam(m, r=0.12){ const n=N(unitCyl,m); n.r=r; return n; }
  function setBeam(n, a, b){
    const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], len=Math.hypot(...d)||0.001;
    n.pos=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
    if (Math.abs(d[0])>=Math.abs(d[2]) && Math.abs(d[0])>=Math.abs(d[1])) n.rot=[0,0,-PI/2];
    else if (Math.abs(d[2])>=Math.abs(d[1])) n.rot=[PI/2,0,0]; else n.rot=[0,0,0];
    n.scl=[n.r,len,n.r];
  }
  function table(root, w=120, d=84){
    root.add(boxN(w,2,d,MAT.table,0,-1,0));
  }
  /* 旋钮：滚花圆柱 + 端面 */
  function knob(v, r, h, m=MAT.knob){
    const g=new Node(); const k=N(cylinder(r,r,h,48,false), mat({color:'#151515',spec:0.35,shin:24,map:knurl(v)}));
    g.add(k, N(disc(r,h/2,40,true),m), N(disc(r,-h/2,40,false),m), N(disc(r*0.45,h/2+0.01,24,true),MAT.chrome)); return g;
  }

  /* ---------- 贴图（canvas 生成；每个视图各自上传） ---------- */
  const texCache=new WeakMap();
  function tex(v, key, make){ let m=texCache.get(v); if(!m){ m={}; texCache.set(v,m); } return m[key] || (m[key]=v.texture(make())); }
  const cv=(w,h)=>{ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; };
  const FONT='"PingFang SC","Microsoft YaHei UI","Noto Sans SC",sans-serif';
  function knurl(v){ return tex(v,'knurl',()=>{ const c=cv(256,16), g=c.getContext('2d'); g.fillStyle='#1b1b1b'; g.fillRect(0,0,256,16);
    for (let i=0;i<64;i++){ g.fillStyle=i%2?'#0c0c0c':'#2c2c2c'; g.fillRect(i*4,0,2,16); } return c; }); }
  /* 直尺：mm 刻度，每 10 mm 标数字。flip 让文字在“前方”看是正的 */
  function ruler(v, mm, start=0){ return tex(v,'ruler'+mm+'_'+start,()=>{ const c=cv(2048,128), g=c.getContext('2d');
    g.translate(0,128); g.scale(1,-1);
    g.fillStyle='#d8dbde'; g.fillRect(0,0,2048,128); g.fillStyle='#111'; g.font='600 34px '+FONT; g.textAlign='center';
    for (let k=0;k<=mm;k++){ const x=24+k*(2000/mm), h=k%10===0?60:k%5===0?44:30; g.fillRect(x-1.2,128-h,2.4,h);
      if (k%10===0){ g.save(); g.translate(x,30); g.scale(1,-1); g.fillText(String(start+k),0,0); g.restore(); } }
    return c; }); }
  /* 鼓轮：一圈 100 格 */
  function drum(v){ return tex(v,'drum',()=>{ const c=cv(2048,256), g=c.getContext('2d');
    g.fillStyle='#cfd3d8'; g.fillRect(0,0,2048,256); g.fillStyle='#111'; g.font='600 44px '+FONT; g.textAlign='center';
    for (let k=0;k<100;k++){ const x=(k+0.5)*20.48, h=k%10===0?150:k%5===0?115:80; g.fillRect(x-1.5,0,3,h); if (k%10===0) g.fillText(String(k),x,210); }
    return c; }); }
  /* 分光计刻度盘：0.5° 一格，每 10° 标数字 */
  function dial(v){ return tex(v,'dial',()=>{ const S=2048, c=cv(S,S), g=c.getContext('2d'), R=S/2;
    g.translate(0,S); g.scale(1,-1);
    g.fillStyle='#c9cdd2'; g.beginPath(); g.arc(R,R,R,0,PI*2); g.fill();
    g.fillStyle='#b5b9bf'; g.beginPath(); g.arc(R,R,R*0.72,0,PI*2); g.fill();
    g.strokeStyle='#111'; g.fillStyle='#111'; g.font='600 40px '+FONT; g.textAlign='center'; g.textBaseline='middle';
    for (let k=0;k<720;k++){ const a=rad(k/2), L=k%20===0?110:k%10===0?80:50; g.lineWidth=k%20===0?4:2.4;
      g.beginPath(); g.moveTo(R+Math.cos(a)*(R-6),R+Math.sin(a)*(R-6)); g.lineTo(R+Math.cos(a)*(R-6-L),R+Math.sin(a)*(R-6-L)); g.stroke();
      if (k%20===0){ g.save(); g.translate(R+Math.cos(a)*(R-160),R+Math.sin(a)*(R-160)); g.rotate(a-PI/2); g.scale(1,-1); g.fillText(String(k/2),0,0); g.restore(); } }
    return c; }); }
  /* 牛顿环装置在钠光下的样子 */
  function ringsTex(v){ return tex(v,'rings',()=>{ const S=512, c=cv(S,S), g=c.getContext('2d'), img=g.createImageData(S,S);
    for (let j=0;j<S;j++) for (let i=0;i<S;i++){ const x=(i-S/2)/(S/2), y=(j-S/2)/(S/2), r2=x*x+y*y, o=(j*S+i)*4;
      const I=Math.sin(PI*r2*40)**2*(1-0.4*r2), k=r2>1?0.15:I; img.data[o]=60+190*k; img.data[o+1]=45+140*k; img.data[o+2]=10+20*k; img.data[o+3]=255; }
    g.putImageData(img,0,0); return c; }); }

  /* =================================================================
   * 1. 迈克尔逊干涉仪
   * ================================================================= */
  function michelson(v, S){
    const R=v.root, Y=14;                         // 光轴高度
    table(R);
    R.add(shadow(58,34,12,4), shadow(36,10,-36,0), shadow(16,13,-36,-16), shadow(6,6,-17,0), shadow(8,8,0,-17.6));
    /* 底座与调平脚 */
    R.add(boxN(50,4,26,MAT.cast,12,4,4), boxN(50.6,0.6,26.6,MAT.castHi,12,6.2,4));
    for (const [x,z] of [[-11,-7],[-11,15],[35,4]]) R.add(cylY(1.6,2,MAT.anod,x,1,z), knob(v,2,0.8).at(x,1.2,z));
    /* 导轨、丝杠、主尺 */
    R.add(boxN(36,1.8,5,MAT.steel,24,7.4,0), cylX(0.45,34,MAT.chrome,24,7.4,-3.6));
    R.add(boxN(32,0.4,2,MAT.alu,24,6.7,-6.1));
    const scale=N(plane(32,1.8), mat({color:'#ffffff',spec:0.3,map:ruler(v,100)})).at(24,6.92,-6.1); R.add(scale);
    /* 动镜 M₁（随鼓轮移动） */
    const m1=new Node();
    m1.add(boxN(6,2.5,7,MAT.castHi,0,9.55,0), boxN(1.2,7,7.5,MAT.anod,1.2,Y,0));
    const mir1=alongX(N(cylinder(2.6,2.6,0.5,48),MAT.mirror)).at(0.35,Y,0), rim1=alongX(N(torus(2.65,0.28,48,12),MAT.anod)).at(0.35,Y,0);
    m1.add(mir1, rim1);
    for (const z of [-2,2]) m1.add(alongX(knob(v,0.7,1.6)).at(2.6,Y+2.2,z));
    R.add(m1);
    /* 分光板 G₁、补偿板 G₂ */
    const plateHolder=(x,m)=>{ const g=new Node().at(x,0,0); g.add(cylY(0.55,5,MAT.steel,0,8.5,0), boxN(2.2,1,6.4,MAT.anod,0,11.3,0).rotate(0,PI/4,0),
        N(box(0.55,5.4,5.4),m).at(0,Y,0).rotate(0,PI/4,0)); return g; };
    const G1=plateHolder(0,MAT.split), G2=plateHolder(5.5,MAT.glass); R.add(G1,G2);
    /* 定镜 M₂（倾角随螺丝变化） */
    const m2post=new Node().at(0,0,15); m2post.add(cylY(0.8,6,MAT.steel,0,8.5,0), boxN(8,1.5,3,MAT.anod,0,10.8,1));
    const m2=new Node().at(0,Y,15);
    m2.add(boxN(7.5,7.5,1.2,MAT.anod,0,0,1.3), alongZ(N(cylinder(2.6,2.6,0.5,48),MAT.mirror)).at(0,0,0.3), alongZ(N(torus(2.65,0.28,48,12),MAT.anod)).at(0,0,0.3));
    for (const [x,y] of [[-2.6,2.6],[2.6,2.6],[2.6,-2.6]]) m2.add(alongZ(knob(v,0.75,1.8)).at(x,y,2.8));
    R.add(m2post, m2);
    /* 微动鼓轮（随读数转动）与粗动手轮 */
    const drumO=alongX(new Node()).at(43.6,7.4,-3.6), drumI=new Node();
    drumI.add(N(cylinder(3.2,3.2,2.6,64,false),mat({color:'#ffffff',spec:0.6,shin:60,map:drum(v)})), N(disc(3.2,1.3,48,true),MAT.chrome), N(disc(3.2,-1.3,48,false),MAT.chrome));
    const drumKnob=knob(v,3.4,1.2).at(0,2,0); drumI.add(drumKnob);
    drumO.add(drumI); R.add(drumO, cylX(1,2,MAT.chrome,41.4,7.4,-3.6));
    const wheelO=alongZ(new Node()).at(34,5,-9.6), wheelI=new Node();
    wheelI.add(N(torus(3.6,0.45,48,12),MAT.anod), cylY(0.9,1.2,MAT.chrome,0,0,0));
    for (let k=0;k<4;k++) wheelI.add(N(box(0.5,0.5,3.4),MAT.anod).at(Math.cos(k*PI/2)*1.8,0,Math.sin(k*PI/2)*1.8).rotate(0,-k*PI/2,0));
    wheelI.add(cylY(0.45,1.8,MAT.knob,3.6,-1,0).rotate(0,0,0));
    wheelO.add(wheelI); R.add(wheelO);
    R.add(boxN(3,1.6,0.3,MAT.anod,40,4.8,-9.05), N(plane(2.4,1.1),glow('#ccd5dd')).at(40,4.8,-9.25).rotate(-PI/2,0,0));   // 读数窗
    /* He-Ne 激光器、电源 */
    const laser=new Node();
    laser.add(cylX(2.2,26,MAT.alu,-36,Y,0), cylX(2.35,1.6,MAT.anod,-49.6,Y,0), cylX(2.35,1.6,MAT.anod,-22.6,Y,0), cylX(0.55,0.8,MAT.anod,-21.4,Y,0));
    for (const x of [-44,-28]) laser.add(cylY(0.7,11.6,MAT.steel,x,5.8,0), boxN(2,1.2,5,MAT.anod,x,11.4,0), boxN(5,0.8,5,MAT.anod,x,0.4,0));
    laser.add(boxN(12,7,9,MAT.anod,-36,3.5,-16), N(disc(0.35,0,16),MAT.led).at(-31.5,5.2,-20.52).rotate(-PI/2,0,0), alongZ(knob(v,0.9,1)).at(-34,3,-20.9));
    R.add(laser);
    /* 扩束镜 */
    const lens=new Node().at(-17,0,0);
    lens.add(cylY(0.5,11.4,MAT.steel,0,5.7,0), boxN(4,0.8,4,MAT.anod,0,0.4,0), alongX(N(torus(1.5,0.3,40,10),MAT.anod)).at(0,Y,0),
      alongX(N(lathe([[0.01,-0.35],[0.9,-0.25],[1.3,0],[0.9,0.25],[0.01,0.35]],40),MAT.glass)).at(0,Y,0));
    R.add(lens);
    /* 观察屏（毛玻璃，显示实时干涉图样） */
    const scr=new Node().at(0,0,-17);
    const screenMap=v.texture(S().screen, true);
    /* 毛玻璃屏：观察者在 −z 一侧看，屏框只有四条边，光从背面透过来 */
    const face=N(plane(11,11),mat({color:'#ffffff',spec:0.1,map:screenMap})).at(0,Y,-0.6).rotate(-PI/2,0,0);
    scr.add(cylY(0.6,7.5,MAT.steel,0,3.75,-0.6), boxN(6,0.8,6,MAT.anod,0,0.4,-0.6), face,
      boxN(13,1,1,MAT.anod,0,Y+6,-0.6), boxN(13,1,1,MAT.anod,0,Y-6,-0.6), boxN(1,11,1,MAT.anod,-6,Y,-0.6), boxN(1,11,1,MAT.anod,6,Y,-0.6));
    R.add(scr);
    /* 光路 */
    const b=[beam(MAT.red,0.1), beam(MAT.red,0.1), beam(MAT.red,0.55), beam(MAT.red,0.55), beam(MAT.red,0.6)], halo=beam(MAT.redHalo,1.4);
    b.forEach(x=>R.add(x)); R.add(halo);
    setBeam(b[0],[-21,Y,0],[-17,Y,0]); setBeam(b[1],[-17,Y,0],[0,Y,0]); setBeam(b[3],[0,Y,0],[0,Y,14.6]); setBeam(b[4],[0,Y,0],[0,Y,-16.4]); setBeam(halo,[0,Y,0],[0,Y,-16.4]);
    /* 标注 */
    const L=(t,n,o)=>v.label(t,n,o);
    L('He-Ne 激光器',laser.children[0],[0,3.2,0]); L('扩束镜',lens.children[3],[0,2.4,0]); L('分光板 G₁',G1.children[2],[0,3.8,0]); L('补偿板 G₂',G2.children[2],[0,3.8,0]);
    L('动镜 M₁',mir1,[0,0,0]); L('定镜 M₂',m2.children[0],[0,4.4,0]); L('微动鼓轮',drumI.children[0],[0,0,-3.6]); L('粗动手轮',wheelI.children[0],[0,0,4.2]);
    L('主尺',scale,[-10,0,0]); L('观察屏（毛玻璃）',face,[0,0,6.6]);
    return function update(){
      const s=S(), xm=24+clamp((s.gap-1.2)*30,-9,12);
      m1.pos=[xm,0,0]; setBeam(b[2],[0,Y,0],[xm,Y,0]);
      m2.rot=[-s.ty*0.06, s.tx*0.06, 0];
      drumI.rot=[0,-s.fine/100*PI*2,0]; wheelI.rot=[0,s.coarse/100*PI*2,0];
    };
  }
  michelson.camera={target:[4,9,0], dist:105, theta:-1.2, phi:1.02, minDist:25, maxDist:220};

  /* =================================================================
   * 2. 读数显微镜 + 牛顿环
   * ================================================================= */
  function newton(v, S){
    const R=v.root;
    table(R);
    R.add(shadow(36,24,0,-2), shadow(14,14,-27,0));
    /* 底座、载物台 */
    R.add(boxN(30,3,18,MAT.cast,0,1.5,-2), boxN(30.6,0.5,18.6,MAT.castHi,0,3.1,-2));
    for (const [x,z] of [[-13,-9],[13,-9],[-13,5],[13,5]]) R.add(cylY(1,0.6,MAT.anod,x,0.3,z));
    const stage=new Node();
    stage.add(boxN(13,0.6,13,MAT.anod,0,3.6,1), N(box(10.5,0.25,10.5),MAT.glass).at(0,4.0,1));
    for (const x of [-4.5,4.5]) stage.add(boxN(0.8,0.3,5,MAT.chrome,x,4.3,1), cylY(0.35,0.6,MAT.chrome,x,4.5,-1));
    R.add(stage);
    /* 牛顿环装置（前后位置随调节变化） */
    const dev=new Node();  // 前后位置在 update() 里设置
    dev.add(N(cylinder(3.2,3.2,1.1,56),MAT.brass).at(0,4.7,0), N(disc(2.6,5.27,56,true),mat({color:'#ffffff',spec:1,shin:120,map:ringsTex(v)})),
      N(torus(2.9,0.3,56,10),MAT.brass).at(0,5.25,0));
    for (let k=0;k<3;k++){ const a=k*PI*2/3+PI/6; dev.add(cylY(0.32,0.9,MAT.chrome,Math.cos(a)*2.9,5.6,Math.sin(a)*2.9)); }
    R.add(dev);
    /* 立柱、横向导轨、主尺、测微鼓轮 */
    R.add(cylY(1.5,22,MAT.castHi,-12,14,-8), boxN(30,2.8,2.8,MAT.cast,1,24.5,-8));
    const scale=N(plane(25,1.6),mat({color:'#ffffff',spec:0.3,map:ruler(v,50)})).at(1,24.5,-9.42).rotate(-PI/2,0,0); R.add(scale);
    R.add(cylX(1,3,MAT.chrome,17.5,24.5,-8));
    const drumO=alongX(new Node()).at(20.5,24.5,-8), drumI=new Node();
    drumI.add(N(cylinder(2.4,2.4,2.6,64,false),mat({color:'#ffffff',spec:0.6,shin:60,map:drum(v)})), N(disc(2.4,1.3,48,true),MAT.chrome), N(disc(2.4,-1.3,48,false),MAT.chrome), knob(v,2.6,1.1).at(0,1.9,0));
    drumO.add(drumI); R.add(drumO);
    /* 显微镜（随鼓轮左右移动） */
    const car=new Node();
    car.add(boxN(5,4.6,4.2,MAT.castHi,0,24.5,-8), boxN(3,2,8,MAT.cast,0,24.5,-4), boxN(3.6,3,3.6,MAT.cast,0,24.5,0));
    const tube=cylY(1.3,14.8,MAT.anod,0,18.6,0), eye=N(lathe([[1.15,0],[1.55,0.3],[1.55,3],[1.2,3.4],[0.6,3.45]],48),MAT.knob).at(0,26,0);
    const obj=N(cylinder(0.75,1,2.4,40),MAT.chrome).at(0,10,0);
    car.add(tube, eye, N(torus(1.35,0.18,40,8),MAT.chrome).at(0,26,0), obj);
    const half=N(box(3.2,0.22,3.2),MAT.split).at(0,7.4,0).rotate(0,0,-PI/4);
    car.add(half, boxN(0.3,2.6,3.6,MAT.anod,1.8,7.4,0), boxN(0.6,3.4,0.6,MAT.anod,1.8,10.1,1.5));
    const focus=alongX(new Node()).at(2.8,24.5,0), focusI=knob(v,1.7,1.2); focus.add(focusI); car.add(focus);
    R.add(car);
    /* 钠光灯 */
    const lamp=new Node().at(-27,0,0);
    lamp.add(boxN(11,1,11,MAT.anod,0,0.5,0), cylY(4,15,mat({color:'#3a3f46',spec:0.3}),0,8.5,0), cylY(4.3,1,MAT.anod,0,16.5,0),
      N(plane(3,4),glow('#ffcf4a')).at(4.05,7.4,0).rotate(0,0,-PI/2), N(plane(5,6),glow('#ffb300',0.25)).at(4.2,7.4,0).rotate(0,0,-PI/2));
    R.add(lamp);
    const toMirror=beam(MAT.na,0.9), down=beam(MAT.na,0.7); R.add(toMirror, down);
    /* 标注 */
    const L=(t,n,o)=>v.label(t,n,o);
    L('钠光灯',lamp.children[1],[0,8.5,0]); L('目镜',eye,[0,4.2,0]); L('读数显微镜',tube,[1.6,2,0]); L('物镜',obj,[1.4,0,0]); L('半反镜（45°）',half,[2,0,0]);
    L('牛顿环装置',dev.children[0],[0,0,-3.6]); L('载物台',stage.children[0],[5.5,0,-5.5]); L('测微鼓轮',drumI.children[0],[0,0,-3]); L('主尺',scale,[-9,0,0]); L('调焦手轮',focusI.children[0],[0,0,2.2]);
    return function update(){
      const s=S(), xc=clamp(s.dx*1.5,-10,10);
      car.pos=[xc,0,0]; dev.pos=[0,0,1+clamp(s.y0*3,-4,4)];
      setBeam(toMirror,[-22.8,7.4,0],[xc,7.4,0]); setBeam(down,[xc,7.2,0],[xc,5.3,0]);
      drumI.rot=[0,-s.drum/100*PI*2,0]; focusI.rot=[0,s.focus*4,0];
    };
  }
  newton.camera={target:[0,14,-1], dist:92, theta:-1.15, phi:1.08, minDist:22, maxDist:200};

  /* =================================================================
   * 3. 分光计
   * ================================================================= */
  function spectrometer(v, S){
    const R=v.root, Y=17.4;
    table(R);
    R.add(shadow(30,30,0,0), shadow(8,8,-31,0));
    /* 三脚底座、中心轴 */
    R.add(cylY(6,3,MAT.cast,0,1.5,0), cylY(2.3,6,MAT.castHi,0,6,0));
    for (let k=0;k<3;k++){ const a=k*PI*2/3+PI/2; R.add(N(box(13,2.2,3.2),MAT.cast).at(Math.cos(a)*7,1.4,Math.sin(a)*7).rotate(0,-a,0), knob(v,1.3,1).at(Math.cos(a)*13,0.6,Math.sin(a)*13)); }
    /* 刻度盘（随望远镜转动）与两个游标 */
    const dialN=new Node().at(0,9.6,0);
    dialN.add(N(cylinder(10,10,0.6,96,false),MAT.steel), N(disc(10,0.31,96,true),mat({color:'#ffffff',spec:0.5,shin:60,map:dial(v)})), N(disc(10,-0.3,96,false),MAT.steel));
    R.add(dialN);
    const vern=[];
    for (const [a,name] of [[270,'左游标'],[90,'右游标']]){ const g=new Node().rotate(0,-rad(a),0);
      g.add(boxN(3.4,1.6,1.8,MAT.anod,10.9,10.3,0), N(cylinder(0.75,0.75,0.5,24),MAT.glass).at(10.9,11.4,0));
      R.add(g); vern.push([g,name]); }
    /* 载物台与光栅 */
    R.add(cylY(1,5,MAT.chrome,0,12.6,0));
    const stage=new Node();
    stage.add(cylY(4.6,0.7,MAT.anod,0,15.4,0), cylY(4.2,0.5,MAT.castHi,0,14.6,0));
    for (let k=0;k<3;k++){ const a=k*PI*2/3; stage.add(cylY(0.25,2.2,MAT.chrome,Math.cos(a)*3.6,14.9,Math.sin(a)*3.6), knob(v,0.6,0.5).at(Math.cos(a)*3.6,13.7,Math.sin(a)*3.6)); }
    R.add(stage);
    const grat=new Node().at(0,0,0);
    grat.add(boxN(1.2,0.6,4.6,MAT.anod,0,16.1,0), N(box(0.3,3.6,4),mat({color:'#e4dcff',spec:1,shin:150,opacity:0.42})).at(0,Y,0), boxN(0.6,3.8,0.5,MAT.anod,0,Y,2.2), boxN(0.6,3.8,0.5,MAT.anod,0,Y,-2.2));
    R.add(grat);
    /* 平行光管（固定）、狭缝、汞灯 */
    const col=new Node();
    col.add(boxN(10,1.4,2.4,MAT.cast,-7,8.2,0), cylY(0.8,8.4,MAT.castHi,-12,12.6,0), boxN(3,1.2,3,MAT.anod,-12,16.4-0.6,0),
      cylX(1.6,17,MAT.anod,-15.5,Y,0), cylX(1.75,0.8,MAT.chrome,-6.6,Y,0), boxN(2.2,3.4,3.4,MAT.anod,-25,Y,0),
      N(box(0.05,1.8,0.12),glow('#f2f5ff')).at(-26.12,Y,0), alongZ(knob(v,0.6,0.8)).at(-25,Y,-2.1));
    R.add(col);
    const hg=new Node().at(-31,0,0);
    hg.add(boxN(6,0.8,6,MAT.anod,0,0.4,0), cylY(0.6,6,MAT.steel,0,3.8,0), boxN(5,9,5,mat({color:'#30343a',spec:0.3}),0,11.5,0),
      N(plane(2.6,3.6),glow('#dfe6ff')).at(2.52,Y,0).rotate(0,0,-PI/2), N(plane(4.4,5.6),glow('#b9c6ff',0.22)).at(2.6,Y,0).rotate(0,0,-PI/2));
    R.add(hg);
    const inBeam=beam(MAT.white,0.9); R.add(inBeam); setBeam(inBeam,[-6.2,Y,0],[0,Y,0]);
    const lampBeam=beam(glow('#c9d4ff',0.18),0.8); R.add(lampBeam); setBeam(lampBeam,[-28.4,Y,0],[-26,Y,0]);
    /* 衍射光束 */
    const LINES=[[404.7,.45],[435.8,.7],[546.1,1],[577.0,.75],[579.1,.75]], beams=[];
    const zero=new Node(); zero.add(beam(MAT.white,0.12)); setBeam(zero.children[0],[0.3,Y,0],[22,Y,0]); R.add(zero);
    for (const [w,a] of LINES) for (const k of [1,-1,2,-2]){ const n=new Node(), c=wl2rgb(w);
      const b=beam(mat({color:'#'+c.map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join(''),unlit:true,opacity:a*(Math.abs(k)===2?0.3:0.75),additive:true}),0.07);
      setBeam(b,[0.3,Y,0],[22,Y,0]); n.add(b); R.add(n); beams.push({n,w,k}); }
    /* 望远镜（随读数转动） */
    const tel=new Node();
    tel.add(boxN(13,1.4,3,MAT.cast,9,8.6,0), cylY(0.8,7.6,MAT.castHi,13,12.8,0), boxN(3,1.2,3,MAT.anod,13,16.2-0.4,0),
      cylX(1.6,16,MAT.anod,15,Y,0), cylX(1.75,0.8,MAT.chrome,7.2,Y,0));
    const eyeT=alongX(N(lathe([[1.25,0],[1.55,0.3],[1.55,3.2],[1.2,3.6],[0.55,3.65]],48),MAT.knob)).at(23,Y,0);
    const gauss=boxN(1.4,1.4,1.4,MAT.anod,24.2,Y+1.9,0), gaussLamp=N(disc(0.45,0,20),glow('#5dff8a')).at(24.2,Y+2.62,0);
    tel.add(eyeT, gauss, gaussLamp, alongZ(knob(v,0.8,1)).at(10,8.6,-2.2), alongZ(knob(v,0.7,0.9)).at(18,Y,-2));
    R.add(tel);
    /* 标注 */
    const L=(t,n,o)=>v.label(t,n,o);
    L('汞灯',hg.children[2],[0,5.5,0]); L('狭缝',col.children[6],[0,2.4,0]); L('平行光管',col.children[3],[0,2.4,0]); L('光栅',grat.children[1],[0,2.8,0]);
    L('载物台',stage.children[0],[0,0,-5]); L('望远镜',tel.children[3],[0,2.4,0]); L('目镜',eyeT,[0,0,0]); L('刻度盘',dialN.children[0],[0,0,-10.5]);
    vern.forEach(([g,name])=>L(name,g.children[0],[0,1.6,0]));
    return function update(){
      const s=S();
      tel.rot=[0,-rad(s.T-s.Tz),0];
      dialN.rot=[0,rad(s.left-270),0];
      grat.rot=[0,-rad(s.i*2),0];
      for (const b of beams){ const t=s.lineT(b.k,b.w); b.n.visible=t!=null; if (t!=null) b.n.rot=[0,-rad(t-s.Tz),0]; }
      gaussLamp.visible=s.view==='auto';
    };
  }
  spectrometer.camera={target:[0,12,0], dist:92, theta:-1.0, phi:0.98, minDist:22, maxDist:200};

  /* =================================================================
   * 4. 光纤耦合与弯曲损耗
   *   光轴沿 x；调整架 X 轴 = 世界 z，Y 轴 = 世界 y，Z 轴（调焦）= 世界 x
 *   这个模型的观察者站在 +z 一侧，光从左向右传播
   * ================================================================= */
  const sphere=lathe(Array.from({length:9},(_,i)=>{ const a=-PI/2+i*PI/8; return [Math.cos(a),Math.sin(a)]; }),16);
  /* 任意方向的细圆柱：局部 y 轴对准 a→b */
  function setSeg(n, a, b){
    const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], len=Math.hypot(...d)||1e-3, u=d.map(x=>x/len), sx=Math.sqrt(Math.max(0,1-u[1]*u[1]));
    n.pos=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]; n.rot=[Math.acos(clamp(u[1],-1,1)), sx<1e-6?0:Math.atan2(u[0],u[2]), 0]; n.scl=[n.r,len,n.r]; n.visible=true;
  }
  /* Catmull-Rom 平滑折线 */
  function smooth(pts, k=5){
    const o=[pts[0]];
    for (let i=0;i<pts.length-1;i++){ const p0=pts[Math.max(0,i-1)], p1=pts[i], p2=pts[i+1], p3=pts[Math.min(pts.length-1,i+2)];
      for (let j=1;j<=k;j++){ const t=j/k, t2=t*t, t3=t2*t;
        o.push([0,1,2].map(c=>0.5*(2*p1[c]+(-p0[c]+p2[c])*t+(2*p0[c]-5*p1[c]+4*p2[c]-p3[c])*t2+(-p0[c]+3*p1[c]-3*p2[c]+p3[c])*t3))); } }
    return o;
  }
  function lcdTex(v){ const c=cv(512,128); return {c, t:v.texture(c,true)}; }
  function fiber(v, S){
    const R=v.root, Y=8, K=0.06;                                     // 光轴高度；调整架位移放大：1 µm → 0.06 cm
    table(R, 140, 70);
    R.add(shadow(40,10,-38,0), shadow(16,14,-1,0), shadow(36,12,30,-6), shadow(18,10,46,-16));
    /* He-Ne 激光器 */
    const laser=new Node();
    laser.add(cylX(2.3,34,mat({color:'#2c3440',spec:0.45,shin:40}),-40,Y,0), cylX(2.45,1.2,MAT.chrome,-22.8,Y,0), cylX(2.45,1.2,MAT.chrome,-57.2,Y,0),
      cylX(0.7,1,MAT.anod,-21.8,Y,0), N(disc(0.22,0,20),MAT.led).at(-21.25,Y,0).rotate(0,0,-PI/2));
    for (const x of [-50,-30]) laser.add(boxN(3,Y-2.6,4,MAT.cast,x,(Y-2.6)/2,0), boxN(4.4,1.4,5,MAT.castHi,x,Y-2.4,0));
    R.add(laser);
    const b1=beam(MAT.red,0.12); R.add(b1); setBeam(b1,[-21.3,Y,0],[-12.2,Y,0]);
    /* 20× 显微物镜 + 支架 */
    const obj=alongX(N(lathe([[1.15,0],[1.15,2.6],[1.25,2.7],[1.25,3.2],[0.85,3.6],[0.55,4.4],[0.35,4.7]],40),MAT.chrome)).at(-12,Y,0);
    const objMount=new Node(); objMount.add(boxN(1,6,4,MAT.anod,-12.6,Y-1,0), cylY(0.6,Y-4,MAT.steel,-12.6,(Y-4)/2,0), boxN(4,0.8,5,MAT.cast,-12.6,0.4,0), N(torus(1.2,0.15,40,8),MAT.knob).at(-10.6,Y,0).rotate(0,0,PI/2));
    R.add(obj, objMount);
    const cone=beam(mat({color:'#ff2a1a',unlit:true,opacity:0.5,additive:true}),0.05); R.add(cone);
    /* 三维光纤调整架 */
    R.add(boxN(12,2,9,MAT.cast,0,1,0));
    const carZ=new Node(), carX=new Node(), carY=new Node();     // 调焦（x）→ 左右（z）→ 上下（y）
    carZ.add(boxN(10,1.6,8,MAT.castHi,0,2.8,0));
    carX.add(boxN(8,1.6,7,MAT.cast,0,4.4,0));
    carY.add(boxN(2,Y-4.4,6,MAT.castHi,1.5,(Y+5.2)/2,0), boxN(6,1.4,2.2,MAT.anod,-1.6,Y,0), boxN(6.2,0.5,2.4,MAT.alu,-1.6,Y+0.95,0),
      N(disc(0.2,0,16),glow('#ff5a3c',0.9)).at(-4.72,Y,0).rotate(0,0,PI/2));
    carX.add(carY); carZ.add(carX); R.add(carZ);
    const mic=()=>{ const g=new Node(); const thimble=knob(v,0.9,2.4,MAT.chrome); g.add(N(cylinder(0.55,0.55,3,24),MAT.steel).at(0,1.5,0), thimble.at(0,3.6,0)); return {g,th:thimble}; };
    const mX=mic(), mY=mic(), mZ=mic();
    mX.g.rot=[PI/2,0,0]; mX.g.pos=[0,4.4,3.6];                  // 指向观察者（+z）
    mY.g.rot=[0,0,0]; mY.g.pos=[1.5,Y+0.4,-1.8];                  // 竖直向上
    mZ.g.rot=[0,0,-PI/2]; mZ.g.pos=[5,2.8,0];                    // 指向 +x
    carX.add(mX.g); carY.add(mY.g); carZ.add(mZ.g);
    /* 弯曲圆柱 */
    R.add(boxN(36,0.8,6,MAT.anod,30,0.4,-7));
    const RADII=[3.5,4,4.5,5,5.5,6,6.5,7], rods=RADII.map((r,k)=>{ const x=16+k*4.2, n=cylY(r/10,4.6,MAT.alu,x,0.8+2.3,-7); R.add(n, cylY(r/10*1.02,0.08,MAT.anod,x,5.42,-7)); return {x,r:r/10,n}; });
    /* 输出端光纤夹持器、探头、功率计 */
    R.add(boxN(4,1.2,2.2,MAT.anod,54,Y,0), cylY(0.6,Y-0.6,MAT.steel,54,(Y-0.6)/2,0), boxN(4,0.8,5,MAT.cast,54,0.4,0));
    const det=new Node();
    det.add(cylX(1.7,2.4,MAT.anod,59.4,Y,0), N(disc(1.2,0,32),mat({color:'#1a1a1f',spec:0.9,shin:90})).at(58.18,Y,0).rotate(0,0,PI/2), cylY(0.6,Y-1.7,MAT.steel,59.6,(Y-1.7)/2,0), boxN(4,0.8,5,MAT.cast,59.6,0.4,0));
    R.add(det);
    const meterBox=new Node().at(47,0,-17);
    const lcd=lcdTex(v);
    meterBox.add(boxN(17,8,7,mat({color:'#3a3f46',spec:0.3}),0,4,0), boxN(17.4,0.6,7.4,MAT.anod,0,0.3,0),
      N(plane(11,2.75),mat({color:'#ffffff',unlit:true,map:lcd.t})).at(-1.5,5.2,3.52).rotate(PI/2,0,0),
      knob(v,0.8,0.6).at(6,5.2,3.7).rotate(PI/2,0,0), knob(v,0.5,0.6).at(6,2.6,3.7).rotate(PI/2,0,0));
    R.add(meterBox);
    const cable=[]; for (let i=0;i<8;i++){ const n=beam(mat({color:'#111214',spec:0.3}),0.18); n.visible=false; cable.push(n); R.add(n); }
    const cpts=smooth([[60.8,Y,0],[63,Y-1,-2],[62,1,-8],[56,0.5,-14],[52,2,-14]],2);
    for (let i=0;i<cpts.length-1&&i<cable.length;i++){ cable[i].r=0.18; setSeg(cable[i],cpts[i],cpts[i+1]); }
    /* 远场白屏（选做时出现） */
    const screen=new Node();
    screen.add(boxN(0.25,7,7,mat({color:'#e9e7e1',spec:0.1}),0,Y,0), cylY(0.5,Y-3.5,MAT.steel,0.5,(Y-3.5)/2,0), boxN(3,0.8,4,MAT.cast,0.5,0.4,0));
    const spot=N(disc(1,0,32),glow('#ff3a20',0.85)).rotate(0,0,PI/2); screen.add(spot);
    R.add(screen);
    const outCone=N(cylinder(1,0.03,1,24,false),mat({color:'#ff2a1a',unlit:true,opacity:0.16,additive:true})); R.add(outCone);
    /* 光纤：固定数量的细圆柱，按路径摆放 */
    const jacket=mat({color:'#e6c13a',spec:0.45,shin:36}), glowM=mat({color:'#ff2a14',unlit:true,opacity:0.5,additive:true});
    const segs=[], gsegs=[], joints=[];
    for (let i=0;i<260;i++){ const n=beam(jacket,0.14); n.visible=false; segs.push(n); R.add(n); }
    for (let i=0;i<150;i++){ const n=beam(glowM,0.34); n.visible=false; gsegs.push(n); R.add(n); }
    /* 标注 */
    const L=(t,n,o)=>v.label(t,n,o);
    L('He-Ne 激光器',laser.children[0],[0,3,0]); L('20× 物镜',obj,[0,2,0]); L('三维光纤调整架',carZ.children[0],[0,-1,5]); L('光纤端面',carY.children[1],[0,-2.4,1.4]);
    L('弯曲圆柱（R = 3.5～7 mm）',rods[3].n,[2,3.2,0]); L('光功率计',meterBox.children[0],[0,4.8,0]); L('探头',det,[59.4,Y+2.4,0]);
    L('白屏',screen,[0,Y+4.2,0]);
    const segLabel=new Node(); R.add(segLabel); L('单模光纤',segLabel,[0,0,0]);
    return function update(){
      const s=S();
      const dz=clamp(s.x*K,-2.4,2.4), dy=clamp(s.y*K,-1.6,1.6), dx=clamp(s.z*0.012,-1.8,1.8);
      carZ.pos=[dx,0,0]; carX.pos=[0,0,dz]; carY.pos=[0,dy,0];
      mX.th.rot=[0,s.x*0.3,0]; mY.th.rot=[0,s.y*0.3,0]; mZ.th.rot=[0,s.z*0.05,0];
      const tip=[-4.7+dx,Y+dy,dz];
      setBeam(cone,[-7.3,Y,0],[-5.2,Y,0]);
      /* 光纤路径 */
      const p=[tip,[-1.6+dx,Y+dy,dz],[2+dx,Y+dy-0.3,dz],[6,Y-3,2.5],[9,0.5,4],[13,0.25,4]];
      let helix=[];
      const k=s.wound?s.radii.indexOf(s.wR):-1;
      if (k>=0){ const rod=rods[k], rr=rod.r+0.07, n=s.wN, per=14;
        p.push([rod.x-2.2,0.25,4],[rod.x-0.6,0.9,-7+rr+0.6]);
        for (let i=0;i<=n*per;i++){ const a=-PI/2+i/per*2*PI; helix.push([rod.x-rr*Math.cos(a), 1.1+i/per*0.32, -7-rr*Math.sin(a)]); }
        p.push(...helix.slice(0,1)); }
      const tail=[[47,0.25,4],[50.5,2,2.5],[51.6,Y,0],[56,Y,0]];
      let pts=smooth(p,4);
      if (k>=0){ const rod=rods[k]; pts=pts.concat(helix.slice(1)); const end=helix[helix.length-1]; pts=pts.concat(smooth([end,[rod.x+0.6,end[1]-0.2,-7+rod.r+0.6],[rod.x+2.2,0.25,4],...tail],4).slice(1)); }
      else pts=pts.concat(smooth([p[p.length-1],...tail],4).slice(1));
      segs.forEach(n=>n.visible=false); gsegs.forEach(n=>n.visible=false);
      for (let i=0;i<pts.length-1&&i<segs.length;i++) setSeg(segs[i],pts[i],pts[i+1]);
      glowM.opacity=Math.min(0.85,0.08+0.9*Math.sqrt(s.lost||0));
      if (k>=0) for (let i=0;i<helix.length-1&&i<gsegs.length;i++) setSeg(gsegs[i],helix[i],helix[i+1]);
      segLabel.pos=[30,0.6,4];
      /* 输出端：功率计或白屏 */
      const far=s.view==='far', rel=Math.min(1,s.core/s.max);
      det.visible=!far; screen.visible=far; outCone.visible=far&&rel>0.02;
      if (far){ const d=(s.L+s.dl)/10; screen.pos=[56.2+d,0,0];
        const rv=Math.max(0.12,s.th*(s.L+s.dl)/10); spot.pos=[-0.14,Y,0]; spot.scl=[rv,1,rv]; spot.mat.opacity=0.2+0.75*rel;
        outCone.pos=[56.15+d/2,Y,0]; outCone.rot=[0,0,-PI/2]; outCone.scl=[rv,d,rv]; }
      const g=lcd.c.getContext('2d'); g.fillStyle='#0f1a14'; g.fillRect(0,0,512,128); g.fillStyle='#9fe7b0'; g.font='300 76px ui-monospace,Consolas,monospace'; g.textAlign='right';
      g.fillText(far?'——':s.reading.split(' ')[0],420,96); g.font='36px '+FONT; g.textAlign='left'; g.fillText(far?'':s.reading.split(' ')[1],430,96);
    };
  }
  

  fiber.camera={target:[4,6,-4], dist:155, theta:1.32, phi:0.98, minDist:20, maxDist:280};

  return {michelson, newton, spectrometer, fiber};
})();
