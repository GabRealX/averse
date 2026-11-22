/* ai-mark.js — v12 : le petit indicateur d'attente de l'IA (20–28 px), façon pointillée (Nothing).
   Une forme = N points (le même nombre partout). On passe de l'une à l'autre en interpolant les points.
   États :
     idle    X immobile (au repos)
     search  X qui tourne, puis se transforme en « ? »
     think   « ? » (réflexion chez le service)
     read    lignes (lecture / recherche dans tes notes)
     write   trois points qui ondulent (rédaction)
     done    coche
     error   point d'exclamation
   Une seule boucle requestAnimationFrame pour tous les indicateurs ; elle s'arrête si plus rien n'anime,
   si l'élément n'est plus affiché, ou si l'onglet est caché.
   prefers-reduced-motion : pas de rotation, passage d'une forme à l'autre par fondu (pas de morphing). */
const AIMARK=(function(){
const N=16,SIZE=24;
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const line=(x0,y0,x1,y1,n)=>{const o=[];for(let i=0;i<n;i++){const t=n===1?0:i/(n-1);o.push({x:x0+(x1-x0)*t,y:y0+(y1-y0)*t});}return o;};
const arc=(cx,cy,r,a0,a1,n)=>{const o=[];for(let i=0;i<n;i++){const t=n===1?0:i/(n-1),a=a0+(a1-a0)*t;o.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)}); }return o;};
const SHAPES={
  x:   line(.18,.18,.82,.82,8).concat(line(.82,.18,.18,.82,8)),
  q:   [{x:.32,y:.40},{x:.28,y:.28},{x:.36,y:.18},{x:.50,y:.14},{x:.64,y:.18},{x:.72,y:.28},{x:.70,y:.40},{x:.60,y:.50},{x:.50,y:.58},{x:.50,y:.68},{x:.50,y:.72},{x:.50,y:.84},{x:.50,y:.88},{x:.50,y:.88},{x:.50,y:.88},{x:.50,y:.88}],
  read:line(.18,.22,.82,.22,4).concat(line(.18,.41,.82,.41,4),line(.18,.60,.82,.60,4),line(.18,.79,.72,.79,4)),
  write:line(.22,.50,.28,.50,5).concat(line(.47,.50,.53,.50,5),line(.72,.50,.78,.50,6)),
  check:line(.16,.52,.40,.76,6).concat(line(.40,.76,.86,.22,10)),
  error:line(.50,.16,.50,.68,12).concat(line(.50,.86,.50,.90,4))
};
const LABEL={idle:'IA',search:'Recherche',think:'Réflexion',read:'Lecture des notes',write:'Rédaction',done:'Terminé',error:'Erreur'};
const all=new Set();let raf=0,last=0;

function color(){
  const cs=getComputedStyle(document.documentElement),th=document.documentElement.dataset.theme;
  const acc=cs.getPropertyValue('--fg').trim()||'#c7bce4';
  const glow=cs.getPropertyValue('--accent').trim()||cs.getPropertyValue('--acc').trim()||'';
  return{fill:th==='neon'?'#ffffff':acc,glow:th==='neon'?(glow||acc):''};
}
function lerp(a,b,t){const o=new Array(N);for(let i=0;i<N;i++)o[i]={x:a[i].x+(b[i].x-a[i].x)*t,y:a[i].y+(b[i].y-a[i].y)*t};return o;}
function ease(t){return t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;}

function create(o){
  o=o||{};
  const size=o.size||SIZE,dpr=Math.min(2,devicePixelRatio||1);
  const el=document.createElement('canvas');el.className='ai-mark';el.width=el.height=Math.round(size*dpr);
  el.style.width=el.style.height=size+'px';el.setAttribute('role','img');
  const x=el.getContext('2d');
  const S={state:o.state||'idle',from:'x',to:shapeOf(o.state||'idle'),t:0,morph:1,rot:0,spin:0,fade:1,prev:null,pause:!!o.pause};
  function shapeOf(st){return st==='search'||st==='idle'?'x':st==='think'?'q':st==='read'?'read':st==='write'?'write':st==='done'?'check':st==='error'?'error':'x';}
  function frame(dt){
    S.t+=dt;
    if(S.morph<1){S.morph=Math.min(1,S.morph+dt/(reduce()?.2:.32));if(S.morph>=1)S.prev=null;}
    /* rotation : seulement en recherche (le X tourne), elle ralentit pendant le passage au « ? » */
    if(S.state==='search'&&!reduce()){
      const target=S.morph<1?2.8*(1-S.morph):2.8;
      S.spin+=(target-S.spin)*Math.min(1,dt*4);S.rot+=S.spin*dt;
    }else{
      S.spin=0;
      S.rot=S.rot%(Math.PI*2);if(S.rot>Math.PI)S.rot-=Math.PI*2;if(S.rot<-Math.PI)S.rot+=Math.PI*2;
      S.rot*=Math.max(0,1-dt*10);
      if(Math.abs(S.rot)<.02)S.rot=0;
    }
    draw();
  }
  function dots(){
    const a=SHAPES[S.from],b=SHAPES[S.to],t=ease(Math.min(1,S.morph));
    let pts=S.morph>=1?SHAPES[S.to].map(p=>({x:p.x,y:p.y})):lerp(a,b,t);
    if(S.state==='write'&&S.morph>=1){
      const w=1.8; /* trois paquets : 5 + 5 + 6 */
      for(let i=0;i<N;i++){const g=i<5?0:i<10?1:2;pts[i].y+=.11*Math.sin(S.t*w*6+g*2.1);}
    }
    return pts;
  }
  function draw(){
    const W=el.width,col=color(),pts=dots(),cs=Math.max(2,Math.round(W*.09)),pad=W*.08,span=W-pad*2;
    x.clearRect(0,0,W,W);
    x.save();
    x.translate(W/2,W/2);x.rotate(S.rot);x.translate(-W/2,-W/2);
    x.fillStyle=col.fill;if(col.glow){x.shadowColor=col.glow;x.shadowBlur=cs*.8;}
    const paint=arr=>{
      for(const p of arr){const px=pad+p.x*span,py=pad+p.y*span;x.fillRect(Math.round(px-cs/2),Math.round(py-cs/2),cs,cs);}
    };
    if(reduce()&&S.prev&&S.morph<1){
      x.globalAlpha=1-S.morph;paint(SHAPES[S.prev]);x.globalAlpha=S.morph;paint(SHAPES[S.to]);
    }else{x.globalAlpha=1;paint(pts);}
    x.restore();x.globalAlpha=1;x.shadowBlur=0;
  }
  function live(){
    if(!el.isConnected)return false;
    if(S.pause&&!el.getClientRects().length)return false;
    if(reduce())return S.morph<1;
    if(S.state==='write')return true;
    if(S.state==='search')return true;
    if(S.spin>0.02||S.morph<1)return true;
    return false;
  }
  const g={el,
    set(state){
      state=state||'idle';
      if(state===S.state&&S.morph>=1){el.dataset.state=state;el.setAttribute('aria-label',LABEL[state]||state);return g;}
      const next=shapeOf(state);
      if(reduce()){S.prev=S.to;S.from=next;S.to=next;S.morph=0;S.rot=0;S.spin=0;}
      else{S.from=S.to;S.to=next;S.morph=0;if(state==='search')S.spin=Math.max(S.spin,2.2);}
      S.state=state;el.dataset.state=state;el.setAttribute('aria-label',LABEL[state]||state);
      frame(0);wake(g);return g;
    },
    state:()=>S.state,live,frame,size,
    token(){return g.set('write');},
    destroy(){all.delete(g);el.remove();}
  };
  S.to=shapeOf(S.state);S.from=S.to;S.morph=1;
  el.dataset.state=S.state;el.setAttribute('aria-label',LABEL[S.state]||S.state);
  frame(0);          // dessiner tout de suite (set() ignorait le 1er appel, déjà « idle »)
  return g;
}
function wake(g){if(g)all.add(g);if(!raf&&!document.hidden)raf=requestAnimationFrame(loop);last=performance.now();}
function loop(now){
  raf=0;const dt=Math.min(.08,(now-last)/1000);last=now;
  for(const g of [...all]){if(!g.live()){g.frame(0);all.delete(g);continue;}g.frame(dt);}
  if(all.size&&!document.hidden)raf=requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else if(all.size)wake();});
return{create,SHAPES,LABEL,running:()=>!!raf,count:()=>all.size};
})();
window.AIMARK=AIMARK;
