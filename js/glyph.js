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
   v9 : plus grand partout, et la grille gagne des points avec la taille (13 → 21 cases de côté).
   v9 (accueil) : le grand Glyph de l'accueil est « vivant » et change de motif selon l'intention :
     alive    au repos : respiration, clignement, regard qui se promène, petites ondes au hasard
     absorb   un fichier survole la page : des anneaux aspirés vers le centre
     pdf      des pages qui se feuillettent          image  un obturateur / objectif qui respire
     code     JSON / regex : des caractères qui défilent en colonnes
     note     un trait qui s'écrit                   sync   deux flèches qui tournent
     conflict deux moitiés qui se séparent            ocr    une ligne de scan
   Option smooth : chaque case glisse vers sa nouvelle luminosité (transitions douces entre motifs).
   Option pause : la boucle ignore ce Glyph quand il n'est pas affiché (accueil caché derrière un outil).
   Utilisation : const g=GLYPH.create({size:56,kind:'summary'}); parent.appendChild(g.el);
                 g.set('download',{p:.4}); g.progress(.5); g.token(12); g.set('done'); g.destroy(); */
const GLYPH=(function(){
/* v9 : la grille s'adapte à la taille (plus de points quand le Glyph est plus grand, chaque point garde ≥ 3 px) */
const gridFor=size=>size>=160?25:size>=64?21:size>=48?19:size>=36?15:13;
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
  model:     ['00100','00100','10101','01110','00100'],   // flèche de téléchargement
  photo:     ['01100','11111','10101','10001','11111']    // v9 : un appareil photo
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
  const size=o.size||56,dpr=Math.min(2,devicePixelRatio||1),N=o.n||gridFor(size);
  const el=document.createElement('canvas');el.className='glyph';el.width=el.height=Math.round(size*dpr);
  el.style.width=el.style.height=size+'px';el.setAttribute('role','img');
  const x=el.getContext('2d'),seed=Math.random()*100;
  /* cases du disque : position, distance au centre, angle, rang vertical, « cratère » de base */
  const cells=[],c=(N-1)/2,R=N/2-.15;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const dx=i-c,dy=j-c,d=Math.hypot(dx,dy);if(d>R)continue;
    const n=hash(i>>1,j>>1,seed)*.6+hash(i,j,seed+1)*.4;
    cells.push({i,j,d:d/R,a:Math.atan2(dy,dx),y:1-(j+.5)/N,crater:n>.82?.45:n>.7?.75:1,b:0});}
  const S={state:'idle',kind:o.kind||'',p:0,t:0,rate:0,energy:0,t0:0,label:'',dim:!!o.dim,
    blink:2+Math.random()*3,blinkT:-9,rip:[],nextRip:1.5,smooth:!!o.smooth,pause:!!o.pause};
  const MOT=new Set(['alive','absorb','pdf','image','code','note','sync','conflict','ocr']);
  const icon=new Set();
  function setKind(k){S.kind=k||'';icon.clear();const m=ICONS[S.kind];if(!m)return;
    for(let r=0;r<5;r++)for(let q=0;q<5;q++)if(m[r][q]==='1')icon.add((c-2+q)+','+(c-2+r));}
  setKind(S.kind);

  function frame(dt){
    S.t+=dt;const t=S.t,st=S.state,since=t-S.t0;
    S.energy*=Math.exp(-dt*2.2);S.rate+=(S.energy-S.rate)*Math.min(1,dt*4);   // débit lissé des morceaux reçus
    /* v9 : état « vivant » : clignement et petites ondes programmés au hasard */
    if(st==='alive'){
      if(t>S.blink){S.blinkT=t;S.blink=t+3+Math.random()*4;}
      if(t>S.nextRip){S.rip.push({x:Math.random()*(N-1),y:Math.random()*(N-1),t0:t});S.nextRip=t+1.6+Math.random()*2.4;}
      S.rip=S.rip.filter(r=>t-r.t0<2.2);
    }
    const gx=c+c*.38*Math.sin(t*.37+seed)+c*.12*Math.sin(t*1.3),gy=c+c*.28*Math.sin(t*.23+seed*2);   // le « regard »
    const bl=t-S.blinkT<.32?Math.sin((t-S.blinkT)/.32*Math.PI):0;                                    // paupières (0 → 1 → 0)
    for(const k of cells){
      let b;const nx=(k.i-c)/(c||1),ny=(k.j-c)/(c||1);
      switch(st){
        case 'alive':{b=.4+.1*Math.sin(t*1.15)-.08*k.d;
          b+=.32*Math.exp(-((k.i-gx)**2+(k.j-gy)**2)/(N*.9));
          for(const r of S.rip){const rr=(t-r.t0)*N*.28,dd=Math.hypot(k.i-r.x,k.j-r.y);b+=.3*Math.exp(-((dd-rr)**2)*1.4)*(1-(t-r.t0)/2.2);}
          if(bl&&Math.abs(ny)>1-bl*1.05)b*=.18;break;}
        case 'absorb':b=.16+.8*Math.pow(.5+.5*Math.sin(k.d*11+t*7),3)*(1-.25*k.d);break;
        case 'pdf':{const ph=(t*.9)%1,edge=1-ph*2.3+.22*ny*ny*Math.sin(ph*Math.PI),line=k.j%3===0;
          b=nx>edge?(nx-edge<.16?.98:.7)*(line?.5:1):.15+(line?0:.08);break;}
        case 'image':{const ap=.28+.4*(.5+.5*Math.sin(t*2.1)),th=ap*(1+.14*Math.cos(6*(k.a-t*.7)));
          b=k.d<th?.08+(Math.hypot(nx+.3,ny+.3)<.18?.8:0):.45+.4*(.5+.5*Math.cos(6*(k.a+k.d*2.2-t*.7)));break;}
        case 'code':{const v=.6+hash(k.i,0,seed)*1.4,head=(t*v*N*.55+hash(k.i,1,seed)*N)%(N+6),dy=head-k.j;
          b=dy>=0&&dy<5?.1+.88*(1-dy/5)*(hash(k.i,k.j+Math.floor(t*8),seed)>.25?1:.4):.1;break;}
        case 'note':{const ph=(t*.42)%1.25,py=c+N*.17*Math.sin(k.i*.7+1)-N*.06*Math.sin(k.i*.23),done=(k.i+.5)/N<ph;
          b=done&&Math.abs(k.j-py)<.85?.96:.12+(k.j%4===2?.06:0);if(done&&Math.abs((k.i+.5)/N-ph)<1.2/N&&Math.abs(k.j-py)<1.6)b=1;break;}
        case 'sync':{let da=((k.a-t*3)%Math.PI+Math.PI)%Math.PI;
          b=k.d>.5&&k.d<.9?(da<2.6?.16+.8*Math.pow(da/2.6,1.6):.1):.1;break;}
        case 'conflict':{const sep=.6+.9*(.5+.5*Math.sin(t*1.6)),left=k.i<c;
          b=Math.abs(k.i-c)<sep?.06:.25+.6*(.5+.5*Math.sin(t*3+(left?0:Math.PI)));if(!left)b*=1;break;}
        case 'ocr':{const ly=.5+.46*Math.sin(t*1.9),yy=(k.j+.5)/N,txt=k.j%3===1&&hash(k.i>>1,k.j,seed)>.2;
          b=Math.abs(yy-ly)<.6/N?.98:.1+(txt?(yy<ly?.42:.2):0);break;}
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
      const tb=Math.max(.06,Math.min(1,b*k.crater));
      k.b=S.smooth?k.b+(tb-k.b)*(dt>0?1-Math.exp(-dt*(reduce()?3:9)):0):tb;   // v9 : glissement doux d'un motif à l'autre
    }
    draw();
  }
  function draw(){
    /* v9 : cases calées sur des pixels entiers (bords nets), grille centrée */
    const W=el.width,cs=Math.max(2,Math.floor(W/N)),off=Math.floor((W-cs*N)/2),gap=Math.max(1,Math.round(cs*.2)),col=color();
    x.clearRect(0,0,W,W);x.fillStyle=col.fill;
    if(col.glow){x.shadowColor=col.glow;x.shadowBlur=cs*.6;}else x.shadowBlur=0;
    for(const k of cells){x.globalAlpha=k.b;x.fillRect(off+k.i*cs,off+k.j*cs,cs-gap,cs-gap);}
    x.globalAlpha=1;
  }
  /* animé ? (error et done s'arrêtent seuls après leur petite transition) */
  function live(){
    if(!el.isConnected)return false;
    if(S.pause&&!el.getClientRects().length)return false;        // v9 : pas affiché → pas d'animation
    if(MOT.has(S.state))return true;
    if(S.state==='idle')return false;
    if(S.state==='error')return S.t-S.t0<.4&&!reduce();
    if(S.state==='done')return S.t-S.t0<1.2&&!reduce();
    return true;
  }
  const g={el,cells,n:N,
    set(state,opt){S.state=state;S.t0=S.t;if(opt&&opt.p!=null)S.p=Math.max(0,Math.min(1,+opt.p||0));if(opt&&opt.kind!==undefined)setKind(opt.kind);if(opt&&opt.dim!==undefined)S.dim=!!opt.dim;
      if(state==='done'&&reduce())S.t0=S.t-2;                // version réduite : directement l'image finale
      el.dataset.state=state;el.dataset.dim=S.dim&&state==='idle'?'1':'';el.setAttribute('aria-label',{think:'L\'IA réfléchit',search:'Recherche dans tes notes',download:'Téléchargement du modèle',
        write:'L\'IA écrit',error:'Erreur',done:'Terminé',idle:'IA',
        alive:'Assistant',absorb:'Dépose ton fichier',pdf:'PDF',image:'Image',code:'Code',note:'Note',sync:'Synchro',conflict:'Conflit',ocr:'Lecture du texte'}[state]||state);
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
return{create,ICONS,MOTIFS:['alive','absorb','pdf','image','code','note','sync','conflict','ocr','search','think','write','download','error','done'],running:()=>!!raf,count:()=>all.size};
})();
window.GLYPH=GLYPH;
