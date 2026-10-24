/* glyph.js — v7 : l'indicateur « l'IA travaille », façon Glyph (Nothing Phone) :
   un disque fait d'une grille de petits carrés, certains plus sombres (comme une lune).
   UN SEUL requestAnimationFrame pour tous les indicateurs de la page ; la boucle s'arrête toute seule
   quand plus rien n'anime (état terminé, élément retiré de la page, onglet caché).
   États :
     think    respiration lente et organique (on attend la réponse)
     search   balayage radar + points qui s'allument au hasard (recherche par le sens, RAG)
     download remplissage du disque de bas en haut = progression RÉELLE (0 → 1)
     write    une onde qui suit le flux de texte : plus les morceaux arrivent vite, plus elle s'agite
     error    flash bref puis disque éteint barré (statique)
     done     disque plein puis fondu (statique à la fin)
     idle     disque immobile (option dim : très atténué, « au repos » dans la barre de l'accueil)
   Le « type » de demande (résumé, flashcards, regex…) dessine un petit motif sombre au centre.
   prefers-reduced-motion : pas de flash, et les états animés ne changent que 3 fois par seconde, doucement.
   Utilisation : const g=GLYPH.create({size:56,kind:'summary'}); parent.appendChild(g.el);
                 g.set('download',{p:.4}); g.progress(.5); g.token(12); g.set('done'); g.destroy(); */
const GLYPH=(function(){
const N=17;                                    // 17 × 17 cases, on garde celles du disque
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
/* motifs 5×5 par type de demande (1 = case assombrie) */
const ICONS={
  summary:   ['11111','00000','11110','00000','11100'],   // lignes de texte de plus en plus courtes
  flashcards:['11100','10111','11101','00101','00111'],   // deux cartes décalées
  regex:     ['00100','10101','01110','10101','00100'],   // l'étoile de .*
  json:      ['01010','10001','10001','10001','01010'],   // { }
  rewrite:   ['00011','00110','01100','11000','10000'],   // un crayon en biais
  ask:       ['01110','10001','00110','00000','00100'],   // ?
  embed:     ['10001','01010','00100','01010','10001'],   // des points reliés
  model:     ['00100','00100','10101','01110','00100']    // flèche de téléchargement
};
/* bruit de valeur très simple (déterministe) pour la « peau » de la lune */
const hash=(x,y,s)=>{const h=Math.sin(x*127.1+y*311.7+s*74.7)*43758.5453;return h-Math.floor(h);};
const all=new Set();let raf=0,last=0;

function color(){
  const cs=getComputedStyle(document.documentElement),th=document.documentElement.dataset.theme;
  /* Néon et Terminal : carrés blancs (le plus « Glyph »), lueur à la couleur d'accent en Néon */
  const fg=cs.getPropertyValue('--fg').trim()||'#c7bce4';
  return{fill:th==='neon'?'#ffffff':fg,glow:th==='neon'?fg:'',bg:'rgb('+(cs.getPropertyValue('--bg-rgb').trim()||'6,6,10')+')'};
}

function create(o){
  o=o||{};
  const size=o.size||56,dpr=Math.min(2,devicePixelRatio||1);
  const el=document.createElement('canvas');el.className='glyph';el.width=el.height=Math.round(size*dpr);
  el.style.width=el.style.height=size+'px';el.setAttribute('role','img');
  const x=el.getContext('2d'),seed=Math.random()*100;
  /* cases du disque : position, distance au centre, angle, rang vertical, « cratère » de base */
  const cells=[],c=(N-1)/2,R=N/2-.15;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const dx=i-c,dy=j-c,d=Math.hypot(dx,dy);if(d>R)continue;
    const n=hash(i>>1,j>>1,seed)*.6+hash(i,j,seed+1)*.4;
    cells.push({i,j,d:d/R,a:Math.atan2(dy,dx),y:1-(j+.5)/N,crater:n>.82?.45:n>.7?.75:1,b:0});}
  const S={state:'idle',kind:o.kind||'',p:0,t:0,rate:0,energy:0,t0:0,label:'',dim:!!o.dim};
  const icon=new Set();
  function setKind(k){S.kind=k||'';icon.clear();const m=ICONS[S.kind];if(!m)return;
    for(let r=0;r<5;r++)for(let q=0;q<5;q++)if(m[r][q]==='1')icon.add((c-2+q)+','+(c-2+r));}
  setKind(S.kind);

  function frame(dt){
    S.t+=dt;const t=S.t,st=S.state,since=t-S.t0;
    S.energy*=Math.exp(-dt*2.2);S.rate+=(S.energy-S.rate)*Math.min(1,dt*4);   // débit lissé des morceaux reçus
    for(const k of cells){
      let b;
      switch(st){
        case 'think':b=.35+.55*(.5+.5*Math.sin(t*1.8-k.d*3.2+hash(k.i,k.j,seed)*1.5))*(1-.3*k.d);break;
        case 'search':{let da=(t*2.6-k.a)%(Math.PI*2);if(da<0)da+=Math.PI*2;
          b=.14+.8*Math.exp(-da*1.6)*(.4+.6*k.d);
          if(hash(k.i,k.j,Math.floor(t*6))>.93)b=Math.max(b,.95);break;}
        case 'download':{const edge=S.p-k.y;b=edge>0?.92:edge>-.06?.35+.4*(.5+.5*Math.sin(t*8+k.i)):.1;break;}
        case 'write':{const amp=.12+Math.min(.34,S.rate*.04),wy=.5+amp*Math.sin(k.i*.55-t*(3+Math.min(6,S.rate*.6)));
          const dist=Math.abs((1-k.y)-wy);b=.12+.85*Math.max(0,1-dist*5.5);break;}
        case 'error':{if(since<.35&&!reduce())b=.95*(1-since/.35)+.1;
          else{const bar=Math.abs((k.i-c)-(k.j-c))<=.7;b=bar?.9:.1;}break;}
        case 'done':{b=since<.25?Math.min(1,since*5):Math.max(.3,1-(since-.25)*.8);break;}
        default:b=S.dim?.24:.55;
      }
      if(st!=='error'&&st!=='download'&&icon.has(k.i+','+k.j))b*=.28;         // le motif du type de demande
      k.b=Math.max(.06,Math.min(1,b*k.crater));
    }
    draw();
  }
  function draw(){
    const W=el.width,cs=W/N,gap=Math.max(1,cs*.18),col=color();
    x.clearRect(0,0,W,W);x.fillStyle=col.fill;
    if(col.glow){x.shadowColor=col.glow;x.shadowBlur=cs*.6;}else x.shadowBlur=0;
    for(const k of cells){x.globalAlpha=k.b;x.fillRect(k.i*cs+gap/2,k.j*cs+gap/2,cs-gap,cs-gap);}
    x.globalAlpha=1;
  }
  /* animé ? (error et done s'arrêtent seuls après leur petite transition) */
  function live(){
    if(!el.isConnected)return false;
    if(S.state==='idle')return false;
    if(S.state==='error')return S.t-S.t0<.4&&!reduce();
    if(S.state==='done')return S.t-S.t0<1.2&&!reduce();
    return true;
  }
  const g={el,cells,
    set(state,opt){S.state=state;S.t0=S.t;if(opt&&opt.p!=null)S.p=Math.max(0,Math.min(1,+opt.p||0));if(opt&&opt.kind!==undefined)setKind(opt.kind);if(opt&&opt.dim!==undefined)S.dim=!!opt.dim;
      if(state==='done'&&reduce())S.t0=S.t-2;                // version réduite : directement l'image finale
      el.dataset.state=state;el.dataset.dim=S.dim&&state==='idle'?'1':'';el.setAttribute('aria-label',{think:'L\'IA réfléchit',search:'Recherche dans tes notes',download:'Téléchargement du modèle',
        write:'L\'IA écrit',error:'Erreur',done:'Terminé',idle:'IA'}[state]||state);
      frame(0);wake(g);return g;},
    progress(p){S.p=Math.max(0,Math.min(1,+p||0));el.dataset.p=S.p.toFixed(2);if(S.state!=='download')g.set('download',{p:S.p});else{frame(0);wake(g);}return g;},
    token(n){S.energy+=Math.min(40,(n||1)/4);if(S.state!=='write')g.set('write');return g;},  // n = nombre de caractères reçus
    kind(k){setKind(k);frame(0);return g;},
    state:()=>S.state,live,frame,
    destroy(){all.delete(g);el.remove();}};
  g.set(o.state||'idle');
  return g;
}
/* la boucle unique */
function wake(g){if(g)all.add(g);if(!raf&&!document.hidden)raf=requestAnimationFrame(loop);last=performance.now();}
let acc=0;
function loop(now){
  raf=0;
  const r=reduce();let dt=Math.min(.1,(now-last)/1000);last=now;
  if(r){acc+=dt;if(acc<.33){if([...all].some(g=>g.live()))raf=requestAnimationFrame(loop);else cleanup();return;}dt=acc*.25;acc=0;}   // lent et rare
  for(const g of [...all]){if(!g.live()){g.frame(0);all.delete(g);continue;}g.frame(dt);}
  if(all.size&&!document.hidden)raf=requestAnimationFrame(loop);
}
function cleanup(){for(const g of [...all])if(!g.live())all.delete(g);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else if(all.size)wake();});
return{create,ICONS,running:()=>!!raf,count:()=>all.size};
})();
window.GLYPH=GLYPH;
