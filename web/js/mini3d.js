/* =====================================================================
 * mini3d.js —— 自写的轻量 WebGL 三维引擎（不依赖任何外部库，离线可用）
 *  · 几何体：长方体、圆柱/圆台、回转体、圆环、平面、圆盘
 *  · 材质：颜色、高光、透明、自发光、贴图（canvas）、光学平台孔阵
 *  · 场景树：节点的位置 / 旋转 / 缩放可以随实验状态实时改变
 *  · 交互：拖动 360° 旋转、滚轮或双指缩放、右键平移、双击复位、自动旋转
 *  · 标注：三维锚点投影成 HTML 文字
 * ===================================================================== */
const M3 = (() => {
  /* ---------------- 矩阵 ---------------- */
  const I4 = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  function mul(a, b){ const o=new Float32Array(16);
    for (let c=0;c<4;c++) for (let r=0;r<4;r++){ let s=0; for (let k=0;k<4;k++) s+=a[k*4+r]*b[c*4+k]; o[c*4+r]=s; } return o; }
  function perspective(fov, asp, n, f){ const t=1/Math.tan(fov/2), o=new Float32Array(16);
    o[0]=t/asp; o[5]=t; o[10]=(f+n)/(n-f); o[11]=-1; o[14]=2*f*n/(n-f); return o; }
  function lookAt(e, t, u){
    let z=[e[0]-t[0],e[1]-t[1],e[2]-t[2]]; const zl=Math.hypot(...z); z=z.map(v=>v/zl);
    let x=[u[1]*z[2]-u[2]*z[1],u[2]*z[0]-u[0]*z[2],u[0]*z[1]-u[1]*z[0]]; const xl=Math.hypot(...x)||1; x=x.map(v=>v/xl);
    const y=[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -(x[0]*e[0]+x[1]*e[1]+x[2]*e[2]), -(y[0]*e[0]+y[1]*e[1]+y[2]*e[2]), -(z[0]*e[0]+z[1]*e[1]+z[2]*e[2]), 1]);
  }
  /* T · Ry · Rx · Rz · S */
  function trs(p, r, s){
    const [cx,cy,cz]=r.map(Math.cos), [sx,sy,sz]=r.map(Math.sin);
    const m00=cy*cz+sy*sx*sz, m01=-cy*sz+sy*sx*cz, m02=sy*cx;
    const m10=cx*sz,          m11=cx*cz,           m12=-sx;
    const m20=-sy*cz+cy*sx*sz,m21=sy*sz+cy*sx*cz,  m22=cy*cx;
    return new Float32Array([m00*s[0],m10*s[0],m20*s[0],0, m01*s[1],m11*s[1],m21*s[1],0, m02*s[2],m12*s[2],m22*s[2],0, p[0],p[1],p[2],1]);
  }
  function normalMat(m){ // 模型矩阵左上 3×3 的逆转置
    const a=m[0],b=m[1],c=m[2],d=m[4],e=m[5],f=m[6],g=m[8],h=m[9],i=m[10];
    const A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, det=a*A+b*B+c*C||1e-9;
    return new Float32Array([A/det,B/det,C/det, -(b*i-c*h)/det,(a*i-c*g)/det,-(a*h-b*g)/det, (b*f-c*e)/det,-(a*f-c*d)/det,(a*e-b*d)/det]);
  }
  const xform=(m,v)=>{ const x=v[0],y=v[1],z=v[2]; return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14], m[3]*x+m[7]*y+m[11]*z+m[15]]; };

  /* ---------------- 几何体（返回顶点数组，上传在 Viewer 里做） ---------------- */
  function G(){ return {p:[],n:[],u:[],i:[]}; }
  function quadStrip(g, ring, rows, cols){ // 网格三角化
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++){ const a=ring+r*(cols+1)+c, b=a+cols+1; g.i.push(a,b,a+1, b,b+1,a+1); }
  }
  function box(w,h,d){
    const g=G(), X=w/2,Y=h/2,Z=d/2;
    const faces=[[[1,0,0],[0,0,-1],[0,1,0]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[1,0,0],[0,0,-1]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[-1,0,0],[0,1,0]]];
    for (const [n,u,v] of faces){ const b=g.p.length/3;
      for (const [su,sv] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
        g.p.push((n[0]+u[0]*su+v[0]*sv)*X,(n[1]+u[1]*su+v[1]*sv)*Y,(n[2]+u[2]*su+v[2]*sv)*Z); g.n.push(...n); g.u.push((su+1)/2,(sv+1)/2); }
      g.i.push(b,b+1,b+2, b,b+2,b+3); }
    return g;
  }
  /* 回转体：pts = [[半径, 高度], …]，绕 y 轴旋转一周 */
  function lathe(pts, seg=48, {u0=0}={}){
    const g=G(), n=pts.length;
    for (let k=0;k<n;k++){
      const [r,y]=pts[k], prev=pts[Math.max(0,k-1)], next=pts[Math.min(n-1,k+1)];
      let dr=next[0]-prev[0], dy=next[1]-prev[1]; const l=Math.hypot(dr,dy)||1; const nr=dy/l, ny=-dr/l;
      for (let s=0;s<=seg;s++){ const a=s/seg*Math.PI*2, c=Math.cos(a), si=Math.sin(a);
        g.p.push(r*c,y,r*si); g.n.push(nr*c,ny,nr*si); g.u.push(s/seg+u0,k/(n-1)); }
    }
    quadStrip(g,0,n-1,seg); return g;
  }
  function disc(r, y=0, seg=48, up=true, r0=0){
    const g=G(); const s0=up?1:-1;
    for (let s=0;s<=seg;s++){ const a=s/seg*Math.PI*2, c=Math.cos(a), si=Math.sin(a);
      g.p.push(r0*c,y,r0*si, r*c,y,r*si); g.n.push(0,s0,0, 0,s0,0); g.u.push(.5+.5*c*r0/r,.5-.5*si*r0/r, .5+.5*c,.5-.5*si); }
    for (let s=0;s<seg;s++){ const a=s*2; if (up) g.i.push(a,a+2,a+1, a+1,a+2,a+3); else g.i.push(a,a+1,a+2, a+1,a+3,a+2); }
    return g;
  }
  function merge(...gs){ const o=G(); for (const g of gs){ const b=o.p.length/3; o.p.push(...g.p); o.n.push(...g.n); o.u.push(...g.u); o.i.push(...g.i.map(i=>i+b)); } return o; }
  /* 圆柱 / 圆台，轴沿 y，可选封口 */
  function cylinder(rt, rb, h, seg=40, caps=true){
    const side=lathe([[rb,-h/2],[rt,h/2]], seg);
    if (!caps) return side;
    return merge(side, disc(rt,h/2,seg,true), disc(rb,-h/2,seg,false));
  }
  function torus(R, r, seg=48, tseg=16){
    const g=G();
    for (let i=0;i<=seg;i++){ const a=i/seg*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a);
      for (let j=0;j<=tseg;j++){ const b=j/tseg*Math.PI*2, cb=Math.cos(b), sb=Math.sin(b);
        g.p.push((R+r*cb)*ca, r*sb, (R+r*cb)*sa); g.n.push(cb*ca,sb,cb*sa); g.u.push(i/seg,j/tseg); } }
    quadStrip(g,0,seg,tseg); return g;
  }
  function plane(w, d){ const g=G(); g.p.push(-w/2,0,-d/2, w/2,0,-d/2, w/2,0,d/2, -w/2,0,d/2); g.n.push(0,1,0,0,1,0,0,1,0,0,1,0); g.u.push(0,0,1,0,1,1,0,1); g.i.push(0,2,1, 0,3,2); return g; }

  /* ---------------- 场景节点 ---------------- */
  class Node {
    constructor(geom=null, mat=null){ this.geom=geom; this.mat=mat; this.pos=[0,0,0]; this.rot=[0,0,0]; this.scl=[1,1,1]; this.children=[]; this.visible=true; }
    add(...c){ this.children.push(...c); return this; }
    at(x,y,z){ this.pos=[x,y,z]; return this; }
    rotate(x,y,z){ this.rot=[x,y,z]; return this; }
    scale(x,y=x,z=x){ this.scl=[x,y,z]; return this; }
  }

  /* ---------------- 着色器 ---------------- */
  const VS=`attribute vec3 aP; attribute vec3 aN; attribute vec2 aU;
uniform mat4 uM, uVP; uniform mat3 uNM;
varying vec3 vN, vW, vL; varying vec2 vU;
void main(){ vec4 w=uM*vec4(aP,1.0); vW=w.xyz; vL=aP; vU=aU; vN=normalize(uNM*aN); gl_Position=uVP*w; }`;
  const FS=`precision highp float;
uniform vec3 uC, uE, uCam; uniform float uSp, uSh, uA; uniform int uPat; uniform bool uUnlit, uHasMap; uniform sampler2D uMap;
varying vec3 vN, vW, vL; varying vec2 vU;
void main(){
  vec3 base=uC; float a=uA;
  if (uHasMap){ vec4 t=texture2D(uMap,vU); base=mix(base,t.rgb,t.a); }
  vec3 N=normalize(vN); if (!gl_FrontFacing) N=-N;
  if (uPat==1 && N.y>0.5){ vec2 g=fract(vW.xz/2.5)-0.5; float d=length(g); base=mix(base*0.22, base, smoothstep(0.13,0.17,d)); }
  if (uPat==2){ float d=length(vL.xz)*2.0; a=uA*(1.0-smoothstep(0.15,1.0,d)); }
  if (uUnlit){ gl_FragColor=vec4(base+uE,a); return; }
  vec3 V=normalize(uCam-vW);
  vec3 L1=normalize(vec3(0.45,1.0,0.35)), L2=normalize(vec3(-0.6,0.45,-0.75));
  float hemi=0.5+0.5*N.y;
  vec3 amb=mix(vec3(0.10,0.10,0.11),vec3(0.36,0.37,0.39),hemi);
  float d1=max(dot(N,L1),0.0), d2=max(dot(N,L2),0.0);
  float s=pow(max(dot(N,normalize(L1+V)),0.0),uSh)+0.45*pow(max(dot(N,normalize(L2+V)),0.0),uSh);
  float fr=pow(1.0-max(dot(N,V),0.0),3.0);
  vec3 col=base*(amb+0.95*d1*vec3(1.0,0.98,0.95)+0.38*d2*vec3(0.82,0.87,1.0)) + uSp*s*vec3(1.0) + uSp*0.35*fr*vec3(0.75,0.78,0.85);
  gl_FragColor=vec4(col+uE,a);
}`;

  const hex = h => { h=h.replace('#',''); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255); };
  /* 材质：{color, spec, shin, opacity, emissive, map, pattern, unlit, additive} */
  const mat = (o={}) => ({color:hex(o.color||'#888888'), spec:o.spec??0.3, shin:o.shin??32, opacity:o.opacity??1, emissive:o.emissive?hex(o.emissive):[0,0,0],
    map:o.map||null, pattern:o.pattern||0, unlit:!!o.unlit, additive:!!o.additive, doubleSided:o.doubleSided??true});

  /* ---------------- 视图 ---------------- */
  class Viewer {
    constructor(el, {target=[0,8,0], dist=70, theta=0.7, phi=1.05, minDist=15, maxDist=200}={}){
      this.el=el; this.home={target:[...target],dist,theta,phi}; Object.assign(this,{target:[...target],dist,theta,phi,minDist,maxDist});
      this.canvas=document.createElement('canvas'); this.canvas.className='v3d-canvas'; el.appendChild(this.canvas);
      this.labelBox=document.createElement('div'); this.labelBox.className='v3d-labels'; el.appendChild(this.labelBox);
      const gl=this.canvas.getContext('webgl',{antialias:true,alpha:true,premultipliedAlpha:false});
      if (!gl) throw new Error('当前电脑不支持 WebGL');
      this.gl=gl; this.root=new Node(); this.labels=[]; this.showLabels=true; this.auto=true; this.dirty=true; this.buffers=new Map();
      this.prog=this.program(VS,FS);
      gl.enable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0);
      this.bindControls();
      this.ro=new ResizeObserver(()=>{ this.resize(); this.render(); }); this.ro.observe(el);
      this.last=0; const loop=t=>{ this.raf=requestAnimationFrame(loop); if (!this.el.isConnected||this.el.offsetParent===null) { this.last=t; return; }
        const dt=this.last?Math.min(0.05,(t-this.last)/1000):0; this.last=t;
        if (this.auto && !this.dragging){ this.theta+=dt*0.22; this.dirty=true; }
        if (this.tween){ const k=Math.min(1,(t-this.tween.t0)/450), e=1-Math.pow(1-k,3), a=this.tween.from, b=this.home;
          this.theta=a.theta+(b.theta-a.theta)*e; this.phi=a.phi+(b.phi-a.phi)*e; this.dist=a.dist+(b.dist-a.dist)*e;
          this.target=a.target.map((v,i)=>v+(b.target[i]-v)*e); this.dirty=true; if (k>=1) this.tween=null; }
        if (this.dirty) this.render(); };
      this.raf=requestAnimationFrame(loop);
      this.resize();
    }
    program(vs,fs){ const gl=this.gl, sh=(t,s)=>{ const o=gl.createShader(t); gl.shaderSource(o,s); gl.compileShader(o); if(!gl.getShaderParameter(o,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const p=gl.createProgram(); gl.attachShader(p,sh(gl.VERTEX_SHADER,vs)); gl.attachShader(p,sh(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
      const loc={}; ['aP','aN','aU'].forEach(n=>loc[n]=gl.getAttribLocation(p,n));
      ['uM','uVP','uNM','uC','uE','uCam','uSp','uSh','uA','uPat','uUnlit','uHasMap','uMap'].forEach(n=>loc[n]=gl.getUniformLocation(p,n));
      return {p,loc}; }
    upload(g){ if (this.buffers.has(g)) return this.buffers.get(g); const gl=this.gl, mk=(t,d)=>{ const b=gl.createBuffer(); gl.bindBuffer(t,b); gl.bufferData(t,d,gl.STATIC_DRAW); return b; };
      const big=g.p.length/3>65535; if (big && !gl.getExtension('OES_element_index_uint')) throw new Error('模型过大');
      const o={p:mk(gl.ARRAY_BUFFER,new Float32Array(g.p)), n:mk(gl.ARRAY_BUFFER,new Float32Array(g.n)), u:mk(gl.ARRAY_BUFFER,new Float32Array(g.u)),
        i:mk(gl.ELEMENT_ARRAY_BUFFER, big?new Uint32Array(g.i):new Uint16Array(g.i)), count:g.i.length, type:big?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT};
      this.buffers.set(g,o); return o; }
    /* 用一张 canvas 作为贴图；live=true 时每次渲染都重新上传（用于实时的干涉条纹） */
    texture(canvas, live=false){ const gl=this.gl, t={tex:gl.createTexture(), canvas, live, dirty:true};
      t.upload=()=>{ if (!canvas.width||!canvas.height) return; gl.bindTexture(gl.TEXTURE_2D,t.tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,canvas);
        const pot=v=>(v&(v-1))===0;
        if (pot(canvas.width)&&pot(canvas.height)){ gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT); }
        else { gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); }
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); t.dirty=false; };
      return t; }
    label(text, anchorNode, offset=[0,0,0]){ const d=document.createElement('div'); d.className='v3d-label'; d.textContent=text; this.labelBox.appendChild(d); this.labels.push({d,node:anchorNode,offset}); }
    resize(){ const r=this.el.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
      this.w=Math.max(1,r.width); this.h=Math.max(1,r.height); this.canvas.width=Math.round(this.w*dpr); this.canvas.height=Math.round(this.h*dpr); this.dirty=true; }
    /* 视图又宽又矮时（嵌在面板里），自动拉近一些，让器材不至于太小 */
    fit(){ return Math.min(1, Math.max(0.55, this.h/(this.w*0.62))); }
    eye(){ const d=this.dist*this.fit(), s=Math.sin(this.phi); return [this.target[0]+d*s*Math.cos(this.theta), this.target[1]+d*Math.cos(this.phi), this.target[2]+d*s*Math.sin(this.theta)]; }
    reset(){ this.tween={t0:performance.now(), from:{theta:this.theta%(Math.PI*2),phi:this.phi,dist:this.dist,target:[...this.target]}}; this.home.theta=this.theta-((this.theta-this.home.theta)%(Math.PI*2)); }
    bindControls(){
      const c=this.canvas, pts=new Map(); let pinch=0;
      const stopAuto=()=>{ if (this.auto){ this.auto=false; this.onAuto&&this.onAuto(false); } };
      c.addEventListener('contextmenu',e=>e.preventDefault());
      c.addEventListener('pointerdown',e=>{ c.setPointerCapture(e.pointerId); pts.set(e.pointerId,{x:e.clientX,y:e.clientY,b:e.button,shift:e.shiftKey}); this.dragging=true; stopAuto(); this.tween=null;
        if (pts.size===2){ const [a,b]=[...pts.values()]; pinch=Math.hypot(a.x-b.x,a.y-b.y); } });
      c.addEventListener('pointermove',e=>{ const p=pts.get(e.pointerId); if (!p) return; const dx=e.clientX-p.x, dy=e.clientY-p.y; p.x=e.clientX; p.y=e.clientY;
        if (pts.size===2){ const [a,b]=[...pts.values()], d=Math.hypot(a.x-b.x,a.y-b.y); if (pinch) this.zoom(pinch/d); pinch=d; return; }
        if (p.b===2 || p.shift){ const s=this.dist*0.0016, t=this.theta;
          const right=[-Math.sin(t),0,Math.cos(t)], up=[-Math.cos(this.phi)*Math.cos(t), Math.sin(this.phi), -Math.cos(this.phi)*Math.sin(t)];
          for (let i=0;i<3;i++) this.target[i]+= -right[i]*dx*s + up[i]*dy*s; }
        else { this.theta+=dx*0.009; this.phi=Math.min(Math.PI-0.03,Math.max(0.03,this.phi-dy*0.009)); }
        this.dirty=true; });
      const up=e=>{ pts.delete(e.pointerId); if (!pts.size) this.dragging=false; pinch=0; };
      c.addEventListener('pointerup',up); c.addEventListener('pointercancel',up);
      c.addEventListener('wheel',e=>{ e.preventDefault(); stopAuto(); this.zoom(Math.exp(e.deltaY*0.0012)); },{passive:false});
      c.addEventListener('dblclick',()=>{ stopAuto(); this.reset(); });
    }
    zoom(k){ this.dist=Math.min(this.maxDist,Math.max(this.minDist,this.dist*k)); this.dirty=true; }
    render(){
      const gl=this.gl, L=this.prog.loc; this.dirty=false;
      gl.viewport(0,0,this.canvas.width,this.canvas.height); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); gl.useProgram(this.prog.p);
      const eye=this.eye(), V=lookAt(eye,this.target,[0,1,0]), P=perspective(0.62,this.w/this.h,1,800), VP=mul(P,V);
      gl.uniformMatrix4fv(L.uVP,false,VP); gl.uniform3fv(L.uCam,eye);
      const items=[]; const walk=(n,parent)=>{ if (!n.visible) return; const m=mul(parent,trs(n.pos,n.rot,n.scl)); n.world=m;
        if (n.geom){ const c=xform(m,[0,0,0]); const dz=Math.hypot(c[0]-eye[0],c[1]-eye[1],c[2]-eye[2]); items.push({n,m,dz}); }
        for (const ch of n.children) walk(ch,m); };
      walk(this.root,I4());
      const opaque=items.filter(x=>x.n.mat.opacity>=1&&!x.n.mat.additive), trans=items.filter(x=>x.n.mat.opacity<1||x.n.mat.additive).sort((a,b)=>b.dz-a.dz);
      const draw=({n,m})=>{ const b=this.upload(n.geom), M=n.mat;
        gl.bindBuffer(gl.ARRAY_BUFFER,b.p); gl.enableVertexAttribArray(L.aP); gl.vertexAttribPointer(L.aP,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,b.n); gl.enableVertexAttribArray(L.aN); gl.vertexAttribPointer(L.aN,3,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ARRAY_BUFFER,b.u); gl.enableVertexAttribArray(L.aU); gl.vertexAttribPointer(L.aU,2,gl.FLOAT,false,0,0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,b.i);
        gl.uniformMatrix4fv(L.uM,false,m); gl.uniformMatrix3fv(L.uNM,false,normalMat(m));
        gl.uniform3fv(L.uC,M.color); gl.uniform3fv(L.uE,M.emissive); gl.uniform1f(L.uSp,M.spec); gl.uniform1f(L.uSh,M.shin); gl.uniform1f(L.uA,M.opacity);
        gl.uniform1i(L.uPat,M.pattern); gl.uniform1i(L.uUnlit,M.unlit?1:0);
        if (M.map){ if (M.map.live||M.map.dirty) M.map.upload(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,M.map.tex); gl.uniform1i(L.uMap,0); gl.uniform1i(L.uHasMap,1); } else gl.uniform1i(L.uHasMap,0);
        gl.drawElements(gl.TRIANGLES,b.count,b.type,0); };
      gl.disable(gl.BLEND); gl.depthMask(true); opaque.forEach(draw);
      gl.enable(gl.BLEND); gl.depthMask(false);
      trans.forEach(x=>{ if (x.n.mat.additive) gl.blendFunc(gl.SRC_ALPHA,gl.ONE); else gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); draw(x); });
      gl.depthMask(true); gl.disable(gl.BLEND);
      /* 标注 */
      const showL=this.showLabels && this.h>=200;
      this.labelBox.hidden=!showL;
      if (showL) for (const l of this.labels){
        const w=l.node.world; if (!w || !l.node.visible){ l.d.style.display='none'; continue; }
        const p=xform(VP,xform(w,l.offset)); if (p[3]<=0){ l.d.style.display='none'; continue; }
        const x=(p[0]/p[3]*0.5+0.5)*this.w, y=(1-(p[1]/p[3]*0.5+0.5))*this.h;
        l.d.style.display=''; l.d.style.transform=`translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; }
    }
  }
  return {Viewer, Node, mat, box, cylinder, lathe, disc, torus, plane, merge, hex};
})();
