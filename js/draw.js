/* draw.js — v10 : TABLEAU BLANC dans une note (bloc « dessin »).
   - Plein écran (aussi sur iPhone SE) : la page ne défile plus pendant qu'on dessine (touch-action:none + défilement bloqué).
   - Doigt, stylet, souris : Pointer Events (+ points « coalescés » pour un trait fluide) ; la PRESSION du stylet
     module l'épaisseur quand elle est disponible (souris / doigt : épaisseur constante).
   - Outils : stylo, gomme (efface les traits touchés), couleurs (la teinte d'AVERSE + quelques couleurs), épaisseur,
     annuler / rétablir (Ctrl+Z / Ctrl+Y), tout effacer, export PNG.
   - Stockage : JSON vectoriel léger (pas une image) dans une PIÈCE JOINTE (attach.js) → chiffré et synchronisé comme
     les autres pièces jointes. Format : {v:1, w, h, s:[{c, w, p:[x,y,pression(0–100), …]}]} (entiers).
     c = 'acc' (la teinte du thème, résolue à l'affichage) ou une couleur #rrggbb parmi celles proposées.
   - Dans le texte : ![dessin](att:ID). L'aperçu le dessine en SVG produit ICI (que des <path>, jamais le contenu brut) ;
     toucher le dessin dans l'aperçu le rouvre. Modifier = nouvelle pièce jointe, l'ancienne est retirée (synchro propre). */
const DRAW=(function(){
const TYPE='application/vnd.averse.draw+json';
const COLORS=[['acc','Teinte'],['#ff5a5f','Rouge'],['#4ea1ff','Bleu'],['#3ecf8e','Vert'],['#ffb020','Ambre']];
const SIZES=[2,5,12];
const MAXPTS=200000;
const acc=()=>getComputedStyle(document.documentElement).getPropertyValue('--fg').trim()||'#e8e6e3';
const col=c=>c==='acc'?acc():/^#[0-9a-f]{6}$/i.test(c)?c:acc();

/* ---------- format : on ne fait confiance à rien de ce qui est lu (synchro, sauvegarde) ---------- */
function clean(d){
  if(!d||typeof d!=='object'||d.v!==1)return null;
  const w=Math.min(4000,Math.max(50,d.w|0)),h=Math.min(4000,Math.max(50,d.h|0));let n=0;
  const s=(Array.isArray(d.s)?d.s:[]).slice(0,5000).map(x=>{
    if(!x||!Array.isArray(x.p))return null;const c=x.c==='acc'||/^#[0-9a-f]{6}$/i.test(x.c)?x.c:'acc';
    const p=x.p.slice(0,Math.max(0,MAXPTS-n)).map(v=>Math.round(+v||0));p.length-=p.length%3;n+=p.length;
    return p.length?{c,w:Math.min(40,Math.max(1,+x.w||3)),p}:null;}).filter(Boolean);
  return{v:1,w,h,s};
}
const parse=t=>{try{return clean(JSON.parse(t));}catch(e){return null;}};
/* épaisseur d'un point : pression 0–100 (50 = sans capteur) */
const wid=(w,pr)=>w*(.35+1.3*pr/100);

/* ---------- rendu SVG (aperçu, vignette) ---------- */
function svg(d,o){
  d=clean(d)||{v:1,w:400,h:300,s:[]};o=o||{};
  const paths=d.s.map(s=>{const p=s.p;let a='';let pr=0;
    for(let i=0;i<p.length;i+=3){a+=(i?'L':'M')+p[i]+' '+p[i+1];pr+=p[i+2];}
    if(p.length===3)a+='l.01 0';
    const k=pr/(p.length/3);
    return'<path d="'+a+'" stroke="'+col(s.c)+'" stroke-width="'+wid(s.w,k).toFixed(1)+'" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';}).join('');
  return'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+d.w+' '+d.h+'" width="'+d.w+'" height="'+d.h+'">'+
    (o.bg?'<rect width="100%" height="100%" fill="'+o.bg+'"/>':'')+paths+'</svg>';
}
const svgUrl=(d,o)=>URL.createObjectURL(new Blob([svg(d,o)],{type:'image/svg+xml'}));
/* rendu canvas (éditeur, PNG) : épaisseur qui suit la pression point par point */
function paint(ctx,d,sc,only){
  const list=only?[only]:d.s;
  for(const s of list){const p=s.p;ctx.strokeStyle=col(s.c);ctx.fillStyle=ctx.strokeStyle;ctx.lineCap='round';ctx.lineJoin='round';
    if(p.length===3){ctx.beginPath();ctx.arc(p[0]*sc,p[1]*sc,wid(s.w,p[2])*sc/2,0,7);ctx.fill();continue;}
    for(let i=3;i<p.length;i+=3){ctx.lineWidth=wid(s.w,(p[i-1]+p[i+2])/2)*sc;ctx.beginPath();ctx.moveTo(p[i-3]*sc,p[i-2]*sc);ctx.lineTo(p[i]*sc,p[i+1]*sc);ctx.stroke();}}
}
async function png(d,scale){
  d=clean(d);const sc=scale||2,c=document.createElement('canvas');c.width=d.w*sc;c.height=d.h*sc;const x=c.getContext('2d');
  x.fillStyle=getComputedStyle(document.body).backgroundColor||'#06060a';x.fillRect(0,0,c.width,c.height);paint(x,d,sc);
  return new Promise(r=>c.toBlob(r,'image/png'));
}

/* ---------- lecture / écriture via les pièces jointes ---------- */
async function load(id){const b=await ATT.blob(id);if(!b)return null;return parse(await b.text());}
async function save(noteId,d,name){
  const f=new File([JSON.stringify(clean(d))],name||('dessin-'+new Date().toISOString().slice(0,16).replace(/[-:T]/g,'')+'.json'),{type:TYPE});
  return ATT.add(noteId,f,{compress:false});
}

/* ---------- l'éditeur plein écran ---------- */
let ov=null;
function open(o){
  o=o||{};close();
  const prevFocus=document.activeElement;
  const vw=Math.max(document.documentElement.clientWidth,320),vh=window.innerHeight;
  let d=o.data?clean(o.data):{v:1,w:Math.round(Math.min(1600,vw)),h:Math.round(Math.min(1600,Math.max(240,vh-120))),s:[]};
  const undo=[],redo=[];let tool='pen',color='acc',size=SIZES[1],dirty=false;
  ov=document.createElement('div');ov.className='dw-ov';ov.id='drawDlg';
  const T=(k,label,txt,extra)=>'<button type="button" class="dw-b" data-dw="'+k+'" aria-label="'+label+'" title="'+label+'"'+(extra||'')+'>'+txt+'</button>';
  ov.innerHTML='<div class="dw-dlg" role="dialog" aria-modal="true" aria-label="Dessin">'+
    '<div class="dw-bar" role="toolbar" aria-label="Outils de dessin">'+
      T('pen','Stylo','✎',' aria-pressed="true"')+T('erase','Gomme (efface les traits touchés)','⌫',' aria-pressed="false"')+
      '<span class="dw-sep"></span>'+COLORS.map(([c,l],i)=>'<button type="button" class="dw-b dw-c" data-col="'+c+'" aria-label="Couleur : '+l+'" title="'+l+'" aria-pressed="'+(i?'false':'true')+'"><i style="background:'+(c==='acc'?'var(--fg)':c)+'"></i></button>').join('')+
      '<span class="dw-sep"></span>'+SIZES.map((s,i)=>'<button type="button" class="dw-b dw-s" data-size="'+s+'" aria-label="Épaisseur '+(i+1)+'" title="Épaisseur '+(i+1)+'" aria-pressed="'+(s===size)+'"><i style="width:'+(s+3)+'px;height:'+(s+3)+'px"></i></button>').join('')+
      '<span class="dw-sep"></span>'+T('undo','Annuler (Ctrl+Z)','↶')+T('redo','Rétablir (Ctrl+Y)','↷')+T('clear','Tout effacer','⨯')+T('png','Exporter en PNG','PNG')+
      '<span class="dw-sp"></span>'+T('x','Fermer sans enregistrer','✕')+'<button type="button" class="dw-b dw-ok" data-dw="ok" aria-label="Enregistrer le dessin" title="Enregistrer">✓ Enregistrer</button>'+
    '</div><div class="dw-stage"><canvas class="dw-cv" aria-label="Zone de dessin (doigt, stylet ou souris)"></canvas></div></div>';
  document.body.appendChild(ov);
  document.documentElement.classList.add('dw-lock');
  const cv=ov.querySelector('canvas'),ctx=cv.getContext('2d'),stage=ov.querySelector('.dw-stage');
  let sc=1,dpr=1;
  function fit(){const r=stage.getBoundingClientRect();sc=Math.min(r.width/d.w,r.height/d.h);dpr=window.devicePixelRatio||1;
    cv.style.width=Math.floor(d.w*sc)+'px';cv.style.height=Math.floor(d.h*sc)+'px';cv.width=Math.floor(d.w*sc*dpr);cv.height=Math.floor(d.h*sc*dpr);redraw();}
  function redraw(){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);paint(ctx,d,sc*dpr);}
  const snap=()=>d.s.slice();
  function push(){undo.push(snap());if(undo.length>200)undo.shift();redo.length=0;dirty=true;state();}
  function state(){ov.querySelector('[data-dw="undo"]').disabled=!undo.length;ov.querySelector('[data-dw="redo"]').disabled=!redo.length;}
  /* ---- les pointeurs ---- */
  let cur=null,pid=null;
  const pt=e=>{const r=cv.getBoundingClientRect();const pr=e.pointerType==='pen'&&e.pressure>0?e.pressure:e.pointerType==='touch'&&e.pressure>0&&e.pressure!==.5&&e.pressure!==1?e.pressure:.5;
    return[Math.round((e.clientX-r.left)/sc),Math.round((e.clientY-r.top)/sc),Math.round(pr*100)];};
  /* gomme : un trait est retiré si la gomme passe près d'un de ses SEGMENTS (pas seulement de ses points) */
  const near=(s,x,y,r)=>{const p=s.p,R=(r+s.w/2)*(r+s.w/2);
    if(p.length===3)return(p[0]-x)**2+(p[1]-y)**2<=R;
    for(let i=3;i<p.length;i+=3){const ax=p[i-3],ay=p[i-2],dx=p[i]-ax,dy=p[i+1]-ay,l=dx*dx+dy*dy;
      const t=l?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l)):0;if((ax+t*dx-x)**2+(ay+t*dy-y)**2<=R)return true;}
    return false;};
  function eraseAt(x,y){const r=Math.max(8,size*2);const keep=d.s.filter(s=>!near(s,x,y,r));const hit=keep.length!==d.s.length;
    if(hit){d.s=keep;redraw();}return hit;}
  cv.addEventListener('pointerdown',e=>{if(pid!=null||e.button>0)return;e.preventDefault();pid=e.pointerId;try{cv.setPointerCapture(pid);}catch(x){}
    if(tool==='erase'){cur={erase:true,before:snap(),hit:false};const p=pt(e);cur.hit=eraseAt(p[0],p[1]);return;}
    cur={c:color,w:size,p:pt(e)};d.s.push(cur);ctx.setTransform(1,0,0,1,0,0);paint(ctx,d,sc*dpr,cur);});
  cv.addEventListener('pointermove',e=>{if(e.pointerId!==pid||!cur)return;e.preventDefault();
    const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];
    for(const ev of (evs.length?evs:[e])){const p=pt(ev);
      if(cur.erase){if(eraseAt(p[0],p[1]))cur.hit=true;continue;}
      const n=cur.p.length;if(Math.abs(cur.p[n-3]-p[0])+Math.abs(cur.p[n-2]-p[1])<1)continue;
      cur.p.push(p[0],p[1],p[2]);
      const seg={c:cur.c,w:cur.w,p:cur.p.slice(-6)};ctx.setTransform(1,0,0,1,0,0);paint(ctx,d,sc*dpr,seg);}});
  const end=e=>{if(e.pointerId!==pid)return;pid=null;const c=cur;cur=null;if(!c)return;
    if(c.erase){if(c.hit){undo.push(c.before);redo.length=0;dirty=true;state();}return;}
    d.s.pop();push();d.s.push(c);redraw();};
  cv.addEventListener('pointerup',end);cv.addEventListener('pointercancel',end);
  /* pas de défilement, de zoom ou de menu pendant qu'on dessine */
  const stop=e=>{if(e.cancelable)e.preventDefault();};
  ['touchstart','touchmove','gesturestart'].forEach(k=>cv.addEventListener(k,stop,{passive:false}));
  cv.addEventListener('contextmenu',stop);
  ov.addEventListener('touchmove',e=>{if(!e.target.closest('.dw-bar'))stop(e);},{passive:false});
  /* ---- les boutons ---- */
  const sel=(attr,v)=>ov.querySelectorAll('['+attr+']').forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute(attr)===String(v))));
  async function finish(ok){
    if(ok&&o.onSave){const b=ov.querySelector('[data-dw="ok"]');b.disabled=true;
      try{await o.onSave(clean(d),dirty);}catch(e){b.disabled=false;toast('Dessin non enregistré : '+(e&&e.message||e));return;}}
    close();if(prevFocus&&prevFocus.isConnected)try{prevFocus.focus({preventScroll:true});}catch(e){}}
  ov.addEventListener('click',async e=>{
    const c=e.target.closest('[data-col]');if(c){color=c.dataset.col;sel('data-col',color);tool='pen';tools();return;}
    const s=e.target.closest('[data-size]');if(s){size=+s.dataset.size;sel('data-size',size);return;}
    const b=e.target.closest('[data-dw]');if(!b)return;
    switch(b.dataset.dw){
      case 'pen':tool='pen';tools();return;
      case 'erase':tool='erase';tools();return;
      case 'undo':if(undo.length){redo.push(snap());d.s=undo.pop();dirty=true;redraw();state();}return;
      case 'redo':if(redo.length){undo.push(snap());d.s=redo.pop();dirty=true;redraw();state();}return;
      case 'clear':if(d.s.length){push();d.s=[];redraw();}return;
      case 'png':{const bl=await png(d);const u=URL.createObjectURL(bl),a=document.createElement('a');a.href=u;a.download=(o.name||'dessin').replace(/\.json$/,'')+'.png';
        document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);return;}
      case 'x':if(dirty&&d.s.length&&typeof confirmBox==='function'&&!(await confirmBox('Fermer sans enregistrer le dessin ?','Fermer')))return;finish(false);return;
      case 'ok':finish(true);return;
    }});
  function tools(){ov.querySelector('[data-dw="pen"]').setAttribute('aria-pressed',String(tool==='pen'));ov.querySelector('[data-dw="erase"]').setAttribute('aria-pressed',String(tool==='erase'));cv.dataset.tool=tool;}
  ov._key=e=>{if(!ov)return;
    if(e.key==='Escape'&&!document.querySelector('.modal-overlay')){e.preventDefault();e.stopImmediatePropagation();ov.querySelector('[data-dw="x"]').click();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();ov.querySelector(e.shiftKey?'[data-dw="redo"]':'[data-dw="undo"]').click();}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();ov.querySelector('[data-dw="redo"]').click();}};
  addEventListener('keydown',ov._key,true);
  ov._fit=()=>fit();addEventListener('resize',ov._fit);
  tools();state();fit();
  setTimeout(()=>{const b=ov&&ov.querySelector('[data-dw="pen"]');if(b)b.focus({preventScroll:true});},0);
  const api={el:ov,data:()=>clean(d),dirty:()=>dirty,close};ov._api=api;return api;
}
function close(){if(!ov)return;removeEventListener('keydown',ov._key,true);removeEventListener('resize',ov._fit);ov.remove();ov=null;document.documentElement.classList.remove('dw-lock');}

/* ---------- dans le carnet : nouveau dessin, modifier un dessin ---------- */
async function newIn(){
  if(!window.notesApi||!notesApi.current()){toast('Ouvre d\'abord une note');return null;}
  const noteId=notesApi.current();
  return open({onSave:async d=>{if(!d.s.length)return;const m=await save(noteId,d);
    if(notesApi.current()===noteId)notesApi.insert('![dessin](att:'+m.id+')');
    else notesApi.update(noteId,n=>{n.body=(n.body||'')+'\n\n![dessin](att:'+m.id+')';});
    toast('Dessin ajouté à la note');}});
}
async function edit(id){
  const m=ATT.get(id);if(!m||m.type!==TYPE)return null;
  const d=await load(id);if(!d){toast('Dessin pas encore reçu sur cet appareil');return null;}
  return open({data:d,name:m.name,onSave:async(nd,dirty)=>{if(!dirty)return;
    const nm=await save(m.note,nd,m.name);
    notesApi.update(m.note,n=>{n.body=String(n.body||'').split('(att:'+id+')').join('(att:'+nm.id+')');});
    await ATT.remove(id);
    if(notesApi.current()===m.note)notesApi.open(m.note);
    toast('Dessin modifié');}});
}
return{TYPE,open,close,svg,svgUrl,png,clean,parse,load,save,newIn,edit,isOpen:()=>!!ov,api:()=>ov&&ov._api};
})();
window.DRAW=DRAW;
