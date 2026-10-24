/* eggs.js — v7 : petites surprises (jamais gênantes, rien ne tourne en continu)
   1. code Konami (↑↑↓↓←→←→BA, hors champ de saisie sauf la recherche) → averse de confettis (canvas temporaire, s'arrête et disparaît seul)
   2. taper « pluie » ou « averse » dans une recherche → grosse averse temporaire (rain.js : rainBurst)
   3. cliquer 5 fois en 2 s sur le titre AVERSE → les lettres « dégoulinent » une fois
   4. console : un petit parapluie ASCII (une fois)
   prefers-reduced-motion : moins de confettis, sans rotation, plus court ; titre = simple message. */
const EGGS=(function(){
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const KONAMI=['arrowup','arrowup','arrowdown','arrowdown','arrowleft','arrowright','arrowleft','arrowright','b','a'];
let pos=0,conf=null,raf=0,drip=0;
const editable=el=>el&&(el.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
/* les champs de recherche (#q a le focus dès l'ouverture de l'accueil) comptent aussi : on y retire ensuite le « ba » tapé */
const SEARCH='#q,#search,.pal input';
document.addEventListener('keydown',e=>{
  const t=e.target,inSearch=t&&t.matches&&t.matches(SEARCH);
  if(e.ctrlKey||e.metaKey||e.altKey||(editable(t)&&!inSearch))return;
  const k=(e.key||'').toLowerCase();
  pos=k===KONAMI[pos]?pos+1:(k===KONAMI[0]?1:0);
  if(pos===KONAMI.length){pos=0;confetti();
    if(inSearch)setTimeout(()=>{if(/ba$/i.test(t.value)){t.value=t.value.slice(0,-2);t.dispatchEvent(new Event('input',{bubbles:true}));}},0);}
});

/* --- confettis : un canvas fixe, pointer-events:none, retiré à la fin (et la boucle annulée) --- */
function confetti(){
  if(conf)return conf.left=Math.max(conf.left,1);          // déjà en cours : on ne double pas
  const c=document.createElement('canvas');c.className='egg-confetti';c.setAttribute('aria-hidden','true');
  Object.assign(c.style,{position:'fixed',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'900'});
  document.body.appendChild(c);
  const x=c.getContext('2d'),dpr=Math.min(2,devicePixelRatio||1),W=innerWidth,H=innerHeight;
  c.width=W*dpr;c.height=H*dpr;x.scale(dpr,dpr);
  const r=reduce(),n=r?30:150,acc=getComputedStyle(document.documentElement).getPropertyValue('--fg').trim()||'#c7bce4';
  const cols=[acc,'#ff9494','#8fb4ff','#8fdca6','#f5b26b','#f5a0cf','#73d9e6','#ebd96b'];
  const P=[];for(let i=0;i<n;i++)P.push({x:W/2+(Math.random()-.5)*W*.3,y:H*.35,vx:(Math.random()-.5)*(r?160:900),vy:-(r?80:300)-Math.random()*(r?120:520),
    w:5+Math.random()*6,h:3+Math.random()*5,a:Math.random()*6,va:r?0:(Math.random()-.5)*12,c:cols[i%cols.length]});
  conf={c,left:r?1.6:3.2};let last=performance.now();
  const step=now=>{
    const dt=Math.min(.05,(now-last)/1000);last=now;conf.left-=dt;
    x.clearRect(0,0,W,H);const fade=Math.min(1,conf.left/.6);
    for(const p of P){p.vy+=(r?220:700)*dt;p.vx*=1-.9*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.a+=p.va*dt;
      x.save();x.globalAlpha=Math.max(0,fade);x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.w/2,-p.h/2,p.w,p.h);x.restore();}
    if(conf.left<=0||document.hidden){stopConfetti();return;}
    raf=requestAnimationFrame(step);
  };
  raf=requestAnimationFrame(step);
  return true;
}
function stopConfetti(){cancelAnimationFrame(raf);raf=0;if(conf){conf.c.remove();conf=null;}}

/* --- recherche « pluie » / « averse » : déclenché une fois au moment où le mot est tapé --- */
const WORD=/^(pluie|averse)$/i;const had=new WeakMap();
document.addEventListener('input',e=>{
  const t=e.target;if(!t||!t.matches||!t.matches('#q,#search,.pal input'))return;
  const hit=WORD.test(t.value.trim());
  if(hit&&!had.get(t)&&window.rainBurst){rainBurst(reduce()?2500:7000);if(window.toast)toast('☂ Sors le parapluie…');}
  had.set(t,hit);
});

/* --- titre cliqué 5 fois en 2 s (le grand titre, ou le logo ASCII en style ASCII) --- */
let clicks=[];
const shown=el=>el&&el.getClientRects().length&&el.getBoundingClientRect().width>2;
function titleOf(h){
  const head=h.closest('header');if(!head)return h;
  const a=head.querySelector('.ascii-logo'),t=head.querySelector('h1');
  return shown(a)?a:shown(t)?t:h;
}
document.addEventListener('click',e=>{
  const h=e.target.closest&&e.target.closest('.hero h1,header h1,.logo,.ascii-logo');if(!h)return;
  const now=Date.now();clicks=clicks.filter(t=>now-t<2000);clicks.push(now);
  if(clicks.length<5)return;clicks=[];
  const t=titleOf(h);
  if(reduce()||!/^(H1|PRE)$/.test(t.tagName)){if(window.toast)toast('Il pleut des lettres… (en silence) ☂');drip++;return;}
  if(t.dataset.drip)return;
  const txt=t.textContent;t.dataset.drip='1';
  t.textContent='';let row=0,col=0;
  for(const ch of txt){
    if(ch==='\n'){t.appendChild(document.createTextNode(ch));row++;col=0;continue;}
    if(ch===' '){t.appendChild(document.createTextNode(ch));col++;continue;}
    const s=document.createElement('span');s.className='egg-drip';s.textContent=ch;
    s.style.animationDelay=(t.tagName==='PRE'?col*.018+row*.05:col*.09)+'s';t.appendChild(s);col++;
  }
  if(t.tagName==='H1'){t.setAttribute('aria-label',txt);t.querySelectorAll('span').forEach(s=>s.setAttribute('aria-hidden','true'));}
  drip++;
  setTimeout(()=>{t.textContent=txt;delete t.dataset.drip;if(t.tagName==='H1')t.removeAttribute('aria-label');},2400);
});

/* --- console --- */
try{if(!sessionStorage.getItem('averse-egg-console')){sessionStorage.setItem('averse-egg-console','1');
  console.log('%c   .-^-.\n  /_/_\\_\\\n    |\n    J    AVERSE — tout reste dans ton navigateur. Essaie ↑↑↓↓←→←→BA.','color:#c7bce4;font-family:monospace');}}catch(e){}

return{confetti,stop:stopConfetti,active:()=>!!conf,raf:()=>raf,drips:()=>drip};
})();
window.EGGS=EGGS;
