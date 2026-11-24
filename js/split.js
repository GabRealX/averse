/* split.js — v14 : séparateurs réglables du carnet (liste | éditeur | aperçu,
   et zone d'écriture / bandeau du bas : pièces jointes, références, notes liées).
   Tailles mémorisées (localStorage « averse-split »). Accessible au clavier
   (role=separator, flèches, Home/End), double-clic pour rétablir, doigt OK.
   Sur téléphone (≤ 820 px) : pas de séparateurs horizontaux de colonnes ;
   le bas reste repliable, cibles ≥ 44 px. */
(function(){
const KEY='averse-split';
const DEF={side:288,write:.40,south:140,fold:{att:false,bl:false,rel:false}};
const MIN={side:160,write:140,prev:180,south:56};
const MAX_SIDE=480;
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow=()=>matchMedia('(max-width:820px)').matches;

function load(){
  try{const o=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!o||typeof o!=='object')return Object.assign({},DEF,{fold:Object.assign({},DEF.fold)});
    return{
      side:isFinite(o.side)?o.side:DEF.side,
      write:isFinite(o.write)?o.write:DEF.write,
      south:isFinite(o.south)?o.south:DEF.south,
      fold:Object.assign({},DEF.fold,o.fold&&typeof o.fold==='object'?o.fold:{})
    };
  }catch(e){return Object.assign({},DEF,{fold:Object.assign({},DEF.fold)});}
}
function store(s){try{localStorage.setItem(KEY,JSON.stringify(s));}catch(e){}}
let S=load();

function apply(){
  const app=document.querySelector('.app'),panes=$('panes'),south=$('edSouth'),body=$('edBody');
  if(app){
    if(narrow())app.style.removeProperty('--side-w');
    else app.style.setProperty('--side-w',Math.round(Math.max(MIN.side,Math.min(MAX_SIDE,S.side)))+'px');
  }
  if(panes){
    if(narrow()){panes.style.removeProperty('--write-fr');panes.style.removeProperty('--prev-fr');}
    else{
      const w=Math.max(.18,Math.min(.82,S.write));
      panes.style.setProperty('--write-fr',(w*100).toFixed(2)+'%');
      panes.style.setProperty('--prev-fr',((1-w)*100).toFixed(2)+'%');
    }
  }
  if(south&&body){
    if(narrow())south.style.removeProperty('--south-h');
    else{
      const max=Math.max(MIN.south,Math.floor(body.getBoundingClientRect().height*.62));
      south.style.setProperty('--south-h',Math.round(Math.max(MIN.south,Math.min(max,S.south)))+'px');
    }
  }
}

function wireSep(el,kind){
  if(!el||el.dataset.split==='1')return;el.dataset.split='1';
  el.setAttribute('role','separator');
  el.setAttribute('tabindex','0');
  el.setAttribute('aria-orientation',kind==='south'?'horizontal':'vertical');
  const label=kind==='side'?'Largeur de la liste de notes':kind==='panes'?'Largeur de l\'aperçu':'Hauteur du bas de page';
  el.setAttribute('aria-label',label);
  let drag=null;
  const start=(x,y)=>{
    if(narrow()&&kind!=='south')return;
    if(narrow()&&kind==='south')return;          // téléphone : sections repliables, pas de poignée
    const panes=$('panes'),body=$('edBody');
    drag={kind,x,y,side:S.side,write:S.write,south:S.south,
      panesW:panes?panes.getBoundingClientRect().width:0,
      bodyH:body?body.getBoundingClientRect().height:0};
    el.classList.add('on');
    document.body.classList.add('splitting');
  };
  const move=(x,y)=>{
    if(!drag)return;
    if(drag.kind==='side')S.side=Math.max(MIN.side,Math.min(MAX_SIDE,drag.side+(x-drag.x)));
    else if(drag.kind==='panes'){
      const w=drag.panesW||1,next=drag.write+((x-drag.x)/w);
      const minW=MIN.write/w,minP=MIN.prev/w;
      S.write=Math.max(minW,Math.min(1-minP,next));
    }else{
      const max=Math.max(MIN.south,Math.floor((drag.bodyH||400)*.62));
      S.south=Math.max(MIN.south,Math.min(max,drag.south-(y-drag.y)));
    }
    apply();
  };
  const end=()=>{
    if(!drag)return;drag=null;el.classList.remove('on');document.body.classList.remove('splitting');store(S);
  };
  el.addEventListener('pointerdown',e=>{
    if(e.button!=null&&e.button!==0)return;
    e.preventDefault();
    try{el.setPointerCapture(e.pointerId);}catch(x){}
    start(e.clientX,e.clientY);
  });
  el.addEventListener('pointermove',e=>{if(drag){e.preventDefault();move(e.clientX,e.clientY);}});
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('dblclick',e=>{
    e.preventDefault();
    if(kind==='side')S.side=DEF.side;
    else if(kind==='panes')S.write=DEF.write;
    else S.south=DEF.south;
    apply();store(S);
  });
  el.addEventListener('keydown',e=>{
    if(narrow())return;
    const step=e.shiftKey?48:16;
    let used=true;
    if(kind==='south'){
      if(e.key==='ArrowUp')S.south=S.south+step;
      else if(e.key==='ArrowDown')S.south=S.south-step;
      else if(e.key==='Home')S.south=DEF.south;
      else if(e.key==='End')S.south=MIN.south;
      else used=false;
    }else if(kind==='side'){
      if(e.key==='ArrowLeft')S.side=S.side-step;
      else if(e.key==='ArrowRight')S.side=S.side+step;
      else if(e.key==='Home')S.side=MIN.side;
      else if(e.key==='End')S.side=MAX_SIDE;
      else if(e.key==='Enter'||e.key===' '){S.side=DEF.side;}
      else used=false;
    }else{
      const panes=$('panes'),w=panes?panes.getBoundingClientRect().width:800;
      if(e.key==='ArrowLeft')S.write=S.write-step/w;
      else if(e.key==='ArrowRight')S.write=S.write+step/w;
      else if(e.key==='Home')S.write=DEF.write;
      else if(e.key==='End')S.write=MIN.write/w;
      else used=false;
    }
    if(!used)return;
    e.preventDefault();apply();store(S);
  });
}

function wireFold(el,key){
  if(!el)return;
  const head=el.querySelector('.att-h, .bl-head');
  if(!head)return;
  if(!head.dataset.splitFold){
    head.dataset.splitFold='1';
    if(!head.hasAttribute('tabindex'))head.tabIndex=0;
    head.setAttribute('role','button');
    const go=()=>{S.fold[key]=!S.fold[key];applyFold(el,key);store(S);};
    head.addEventListener('click',e=>{if(e.target.closest('button,a,input,label,select'))return;go();});
    head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){if(e.target.closest('button,a,input'))return;e.preventDefault();go();}});
  }
  applyFold(el,key);
}
function applyFold(el,key){
  const on=!!S.fold[key];
  el.classList.toggle('folded',on);
  const head=el.querySelector('.att-h, .bl-head');
  if(head)head.setAttribute('aria-expanded',on?'false':'true');
}

function folds(){
  wireFold($('attBox'),'att');
  wireFold($('backlinks'),'bl');
  wireFold($('aiRelated'),'rel');
}

function init(){
  const app=document.querySelector('.app');
  if(!app||app.dataset.split==='1')return;
  app.dataset.split='1';
  wireSep($('splitSide'),'side');
  wireSep($('splitPanes'),'panes');
  wireSep($('splitSouth'),'south');
  folds();
  const south=$('edSouth');
  if(south&&window.MutationObserver)new MutationObserver(()=>folds()).observe(south,{childList:true,subtree:false});
  apply();
  addEventListener('resize',()=>apply());
  /* pas d'animation de taille (même sans reduced-motion : le drag doit être immédiat) */
  void reduce;
}

window.SPLIT={init,reset:()=>{S=Object.assign({},DEF,{fold:Object.assign({},DEF.fold)});apply();store(S);},get:()=>S,apply};
if(document.querySelector('.app'))init();
else document.addEventListener('DOMContentLoaded',init);
})();
