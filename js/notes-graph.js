/* notes-graph.js — le GRAPHE du carnet (v5 : sorti de notes.js et enrichi)
   - simulation « force-directed » : répulsion entre nœuds proches (grille de REP px, ~O(n)), ressorts sur les liens ;
     elle S'ARRÊTE quand c'est stable (plus aucun calcul), et repart si on glisse un nœud ou si les notes changent ;
   - GROUPES : par tag (automatique) ou manuels (clic droit sur un nœud → Groupe), chacun avec sa forme
     (cercle, carré, triangle, losange, étoile) et sa couleur ; légende avec cases pour masquer / afficher ;
   - filtre par tag ; étiquettes seulement au survol / au zoom quand il y a beaucoup de nœuds ;
   - zoom : molette, boutons + / −, pincement à deux doigts sur mobile ; déplacement de la vue au doigt / à la souris ;
   - mode FOCUS : un clic sur un nœud met en avant ses voisins (le reste s'estompe) ; « Ouvrir » ou 2e clic ouvre la note.
   Réglages mémorisés dans localStorage « averse-graph » (propres à cet appareil).
   Utilise les fonctions de notes.js (data, allNotes, withTitles, outLinks, view…) : chargé AVANT lui, appelé après. */

const G={canvas:null,ctx:null,nodes:[],edges:[],raf:0,alpha:0,dpr:1,scale:1,running:false,steps:0,drawPending:false,
  drag:null,down:null,hover:null,focus:null,panStart:null,off:{x:0,y:0},ptrs:new Map(),pinch:null,labels:0,keep:{}};
const REP=300;                                              // au-delà, la répulsion (2600/d²) est négligeable
const nodeSize=n=>10+Math.min(16,n.deg*3);
const SHAPES={cercle:'circle',carré:'square',triangle:'triangle',losange:'diamond',étoile:'star'};   // libellé → code
const SHAPE_KEYS=Object.values(SHAPES);
const PALETTE=['#c7bce4','#7fd6c2','#f2b880','#f28b9b','#9ec3ff','#e6e07a','#b8f28b','#d79cf2'];
const GKEY='averse-graph',LABEL_ZOOM=1.1,LABEL_MAX=120,FEW=40;

/* ===== RÉGLAGES (mémorisés, revérifiés à la lecture) ===== */
const okColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
function cleanSettings(s){
  const o={v:1,groups:[],other:{shape:'square',color:PALETTE[0],hidden:false},tag:'',labels:'auto',legend:!(window.matchMedia&&matchMedia('(max-width:820px)').matches)};   // sur téléphone : légende repliée par défaut
  if(!s||typeof s!=='object')return o;
  if(Array.isArray(s.groups))s.groups.slice(0,40).forEach(g=>{
    if(!g||typeof g!=='object'||(g.kind!=='tag'&&g.kind!=='manual'))return;
    o.groups.push({id:typeof g.id==='string'&&/^[\w-]{1,40}$/.test(g.id)?g.id:'g'+Math.random().toString(36).slice(2,8),
      name:String(g.name||'Groupe').slice(0,40),kind:g.kind,tag:g.kind==='tag'?String(g.tag||'').slice(0,60):'',
      ids:g.kind==='manual'&&Array.isArray(g.ids)?g.ids.filter(x=>typeof x==='string'&&/^[\w-]{1,64}$/.test(x)).slice(0,5000):[],
      shape:SHAPE_KEYS.includes(g.shape)?g.shape:'circle',color:okColor(g.color)?g.color:PALETTE[0],hidden:g.hidden===true});
  });
  if(s.other&&typeof s.other==='object'){if(SHAPE_KEYS.includes(s.other.shape))o.other.shape=s.other.shape;
    if(okColor(s.other.color))o.other.color=s.other.color;o.other.hidden=s.other.hidden===true;}
  if(typeof s.tag==='string')o.tag=s.tag.slice(0,60);
  if(['auto','all','hover'].includes(s.labels))o.labels=s.labels;
  if(typeof s.legend==='boolean')o.legend=s.legend;
  return o;
}
let GS=cleanSettings(getLS(GKEY,null));
function saveGS(){setLS(GKEY,GS);}
const gid=()=>'g'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);

/* groupe d'une note : le PREMIER groupe de la légende qui la contient (l'ordre = la priorité) ; -1 = sans groupe */
function groupOf(note){
  for(let i=0;i<GS.groups.length;i++){const g=GS.groups[i];
    if(g.kind==='tag'?(note.tags||[]).includes(g.tag):g.ids.includes(note.id))return i;}
  return -1;
}
const styleOfGroup=i=>i<0?GS.other:GS.groups[i];
function autoTagGroups(){                                   // « Par tag » : un groupe par tag fréquent (8 au plus)
  const t=allTags(),top=Object.keys(t).sort((a,b)=>t[b]-t[a]||a.localeCompare(b)).slice(0,8);
  const have=new Set(GS.groups.filter(g=>g.kind==='tag').map(g=>g.tag));
  let k=GS.groups.length;
  top.forEach(tag=>{if(have.has(tag))return;
    GS.groups.push({id:gid(),name:'#'+tag,kind:'tag',tag,ids:[],shape:SHAPE_KEYS[k%5],color:PALETTE[(k+1)%PALETTE.length],hidden:false});k++;});
  saveGS();return top.length;
}

/* ===== CONSTRUCTION ===== */
function visibleNotes(){
  return allNotes().filter(n=>(!GS.tag||(n.tags||[]).includes(GS.tag))&&!styleOfGroup(groupOf(n)).hidden);
}
function buildGraph(){
  withTitles(()=>{
    const ns=visibleNotes(),idx={},R=40*Math.sqrt(ns.length+1);   // nouveaux nœuds : répartis selon le nombre de notes
    G.nodes.forEach(n=>{G.keep[n.id]=n;});                       // positions gardées même pour les nœuds masqués
    let fresh=0;
    G.nodes=ns.map(n=>{const old=G.keep[n.id],g=groupOf(n);if(old)return Object.assign(old,{title:n.title,deg:0,g});fresh++;
      return{id:n.id,title:n.title,x:(Math.random()-.5)*R,y:(Math.random()-.5)*R,vx:0,vy:0,deg:0,g};});
    G.nodes.forEach(n=>idx[n.id]=n);
    G.edges=[];G.nodes.forEach(n=>{const note=data.notes[n.id];outLinks(note).forEach(t=>{
      if(idx[t.id]){G.edges.push([n,idx[t.id]]);n.deg++;idx[t.id].deg++;}});});
    if(G.focus&&!idx[G.focus.id])G.focus=null;
    G.alpha=fresh>G.nodes.length/3?1:Math.max(G.alpha,.35);     // simple mise à jour : on ne rebat pas tout le graphe
  });
}
function sizeCanvas(){
  const c=G.canvas,r=c.parentElement.getBoundingClientRect();
  G.dpr=Math.min(2,window.devicePixelRatio||1);
  c.width=Math.max(1,r.width*G.dpr);c.height=Math.max(1,r.height*G.dpr);
  c.style.width=r.width+'px';c.style.height=r.height+'px';
}

/* ===== SIMULATION ===== */
/* un pas ; renvoie le plus grand déplacement (pour savoir si c'est stable) */
function step(){
  const N=G.nodes,grid=new Map(),R2=REP*REP;
  for(let i=0;i<N.length;i++){const n=N[i];n.i=i;n.cx=Math.floor(n.x/REP);n.cy=Math.floor(n.y/REP);
    const k=n.cx*100003+n.cy;let c=grid.get(k);if(!c)grid.set(k,c=[]);c.push(n);}
  for(const a of N){
    for(let gx=a.cx-1;gx<=a.cx+1;gx++)for(let gy=a.cy-1;gy<=a.cy+1;gy++){
      const c=grid.get(gx*100003+gy);if(!c)continue;
      for(const b of c){if(b.i<=a.i)continue;                // chaque paire une seule fois
        let dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy;if(d2>R2)continue;if(d2<25)d2=25;
        const d=Math.sqrt(d2),f=2600/d2;dx/=d;dy/=d;a.vx+=dx*f;a.vy+=dy*f;b.vx-=dx*f;b.vy-=dy*f;}
    }
  }
  G.edges.forEach(([a,b])=>{let dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy)||.01;
    const f=(d-110)*.02;dx/=d;dy/=d;a.vx+=dx*f;a.vy+=dy*f;b.vx-=dx*f;b.vy-=dy*f;});
  let moved=0;
  N.forEach(n=>{n.vx-=n.x*.01;n.vy-=n.y*.01;if(G.drag===n)return;n.vx*=.85;n.vy*=.85;
    const mx=n.vx*G.alpha,my=n.vy*G.alpha;n.x+=mx;n.y+=my;moved=Math.max(moved,Math.abs(mx)+Math.abs(my));});
  G.alpha*=.985;G.steps++;
  return moved;
}
/* une image de l'animation ; renvoie false quand c'est stable (la boucle s'arrête) */
function tick(paint){
  const moved=step();if(paint!==false)draw();
  return !!G.drag||!(G.alpha<.01||moved<.03);
}
function loop(){
  G.raf=0;if(!G.running)return;
  if(!tick()){G.running=false;return;}                      // stable : on arrête tout
  G.raf=requestAnimationFrame(loop);
}
function kick(a){                                          // relance la simulation (glisser un nœud, notes modifiées)
  G.alpha=Math.max(G.alpha,a||0);
  if(view!=='graph')return;
  if(!G.running){G.running=true;cancelAnimationFrame(G.raf);G.raf=requestAnimationFrame(loop);}
}
function redraw(){if(G.running||G.drawPending||view!=='graph')return;G.drawPending=true;requestAnimationFrame(draw);}   // un seul dessin
function fitGraph(){
  const W=G.canvas.width/G.dpr,H=G.canvas.height/G.dpr,N=G.nodes;if(!N.length)return;
  let a=1e9,b=1e9,c=-1e9,d=-1e9;N.forEach(n=>{a=Math.min(a,n.x);c=Math.max(c,n.x);b=Math.min(b,n.y);d=Math.max(d,n.y);});
  const bw=Math.max(1,c-a),bh=Math.max(1,d-b),padX=W<600?30:90,padT=56,padB=74;
  G.scale=Math.max(.05,Math.min(1.4,(W-padX*2)/bw,(H-padT-padB)/bh));
  G.off.x=-(a+c)/2*G.scale;G.off.y=-(b+d)/2*G.scale+(padT-padB)/2;
}
/* zoom autour d'un point de l'écran (molette, pincement, boutons) */
function zoomAt(px,py,f){
  const W=G.canvas.width/G.dpr,H=G.canvas.height/G.dpr,S=G.scale,ns=Math.max(.04,Math.min(4,S*f));
  const wx=(px-W/2-G.off.x)/S,wy=(py-H/2-G.off.y)/S;
  G.scale=ns;G.off.x=px-W/2-wx*ns;G.off.y=py-H/2-wy*ns;redraw();
}

/* ===== DESSIN ===== */
function shapePath(x,shape,sx,sy,r){
  if(shape==='circle'){x.moveTo(sx+r,sy);x.arc(sx,sy,r,0,Math.PI*2);}
  else if(shape==='square'){x.rect(sx-r*.88,sy-r*.88,r*1.76,r*1.76);}
  else if(shape==='diamond'){x.moveTo(sx,sy-r*1.15);x.lineTo(sx+r*1.15,sy);x.lineTo(sx,sy+r*1.15);x.lineTo(sx-r*1.15,sy);x.closePath();}
  else if(shape==='triangle'){const h=r*1.25;x.moveTo(sx,sy-h);x.lineTo(sx+h*.95,sy+h*.7);x.lineTo(sx-h*.95,sy+h*.7);x.closePath();}
  else{for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,q=i%2?r*.5:r*1.25;i?x.lineTo(sx+Math.cos(a)*q,sy+Math.sin(a)*q):x.moveTo(sx+Math.cos(a)*q,sy+Math.sin(a)*q);}x.closePath();}
}
const rgba=(hex,a)=>'rgba('+parseInt(hex.slice(1,3),16)+','+parseInt(hex.slice(3,5),16)+','+parseInt(hex.slice(5,7),16)+','+a+')';
function draw(){
  G.drawPending=false;
  const W=G.canvas.width/G.dpr,H=G.canvas.height/G.dpr,x=G.ctx,S=G.scale,cx=W/2+G.off.x,cy=H/2+G.off.y;
  x.save();x.scale(G.dpr,G.dpr);x.clearRect(0,0,W,H);
  const hot=G.focus||G.hover,near={};                       // nœud mis en avant (focus prioritaire sur le survol) + voisins
  if(hot){near[hot.id]=1;G.edges.forEach(([a,b])=>{if(a===hot)near[b.id]=1;if(b===hot)near[a.id]=1;});}
  G.near=near;
  x.strokeStyle=hot?acc(.05):acc(.15);x.lineWidth=1;x.beginPath();   // toutes les arêtes « normales » en un seul tracé
  G.edges.forEach(([a,b])=>{if(hot&&(a===hot||b===hot))return;x.moveTo(cx+a.x*S,cy+a.y*S);x.lineTo(cx+b.x*S,cy+b.y*S);});
  x.stroke();
  if(hot){x.strokeStyle=acc(.6);x.lineWidth=1.5;x.beginPath();
    G.edges.forEach(([a,b])=>{if(a===hot||b===hot){x.moveTo(cx+a.x*S,cy+a.y*S);x.lineTo(cx+b.x*S,cy+b.y*S);}});x.stroke();}
  const sc=Math.max(.45,Math.min(1.2,S));                    // nœuds plus petits quand on dézoome beaucoup
  /* un seul tracé par (groupe, estompé ou non) : 500 nœuds = une dizaine d'appels fill() */
  const packs=new Map();
  G.nodes.forEach(n=>{const sx=cx+n.x*S,sy=cy+n.y*S;if(sx<-30||sy<-30||sx>W+30||sy>H+30)return;
    const k=n.g+(hot&&!near[n.id]?'d':'');let p=packs.get(k);if(!p)packs.set(k,p={g:n.g,dim:k.endsWith('d'),list:[]});p.list.push(n);});
  packs.forEach(p=>{const st=styleOfGroup(p.g);x.fillStyle=p.dim?rgba(st.color,.16):st.color;x.beginPath();
    p.list.forEach(n=>shapePath(x,st.shape,cx+n.x*S,cy+n.y*S,nodeSize(n)*sc/2));x.fill();});
  if(G.focus){const n=G.focus,st=styleOfGroup(n.g);x.strokeStyle=st.color;x.lineWidth=2;x.beginPath();
    x.arc(cx+n.x*S,cy+n.y*S,nodeSize(n)*sc/2+6,0,Math.PI*2);x.stroke();}
  /* étiquettes : toutes s'il y a peu de nœuds ; sinon survol / focus + voisins, et au zoom (les plus liées d'abord, sans chevauchement) */
  const few=G.nodes.length<=FEW,mode=GS.labels,lab=[];
  G.nodes.forEach(n=>{const sx=cx+n.x*S,sy=cy+n.y*S;if(sx<-60||sy<-20||sx>W+60||sy>H+20)return;
    const must=n===hot||(hot&&near[n.id]);
    if(must||mode==='all'||(mode==='auto'&&(few||S>=LABEL_ZOOM)))lab.push({n,must,sx,sy});});
  lab.sort((a,b)=>(b.must-a.must)||(b.n.deg-a.n.deg));
  x.textAlign='center';x.font='500 11px "JetBrains Mono", monospace';
  const boxes=[];let count=0;
  for(const L of lab){
    if(!L.must&&count>=(mode==='all'?400:LABEL_MAX))break;
    const n=L.n,s=nodeSize(n)*sc,dim=hot&&!near[n.id];
    const t=(n.title||'').length>22?n.title.slice(0,21)+'\u2026':(n.title||'\u00b7');
    const tw=x.measureText(t).width,below=L.sy<H-44,ly=below?L.sy+s/2+5:L.sy-s/2-5,ry=below?ly-1:ly-13;
    const bx={a:L.sx-tw/2-4,b:ry,c:L.sx+tw/2+4,d:ry+14};
    if(!L.must&&boxes.some(o=>bx.a<o.c&&bx.c>o.a&&bx.b<o.d&&bx.d>o.b))continue;   // chevauche : on saute
    boxes.push(bx);count++;
    x.fillStyle='rgba(6,6,10,.82)';x.fillRect(bx.a,ry,tw+8,14);
    x.fillStyle=dim?acc(.4):(n===hot?ACC.hex:acc(.85));
    x.textBaseline=below?'top':'bottom';x.fillText(t,L.sx,ly);
  }
  G.labels=count;
  x.restore();
}
function nodeAt(px,py){
  const W=G.canvas.width/G.dpr,H=G.canvas.height/G.dpr,S=G.scale,cx=W/2+G.off.x,cy=H/2+G.off.y,sc=Math.max(.45,Math.min(1.2,S));
  const pad=G.ptrType==='touch'?12:5;                       // au doigt : cible plus large
  for(let i=G.nodes.length-1;i>=0;i--){const n=G.nodes[i],s=nodeSize(n)*sc;
    if(Math.abs(px-(cx+n.x*S))<=s/2+pad&&Math.abs(py-(cy+n.y*S))<=s/2+pad)return n;}return null;
}
function startGraph(){
  if(!allNotes().length){$('graphEmpty').style.display='flex';stopGraph();renderLegend();return;}
  $('graphEmpty').style.display='none';
  const first=!G.nodes.length;
  sizeCanvas();buildGraph();
  const t0=performance.now();                              // pré-calcul (au plus ~150 ms) avant le premier dessin
  for(let i=0;i<300&&performance.now()-t0<150;i++)if(step()<.03&&i>20)break;
  if(first||G.alpha>.5)fitGraph();
  renderLegend();renderFocus();
  draw();G.running=false;kick(0);
}
function stopGraph(){cancelAnimationFrame(G.raf);G.raf=0;G.running=false;}
function regraph(){if(view==='graph'){buildGraph();renderLegend();renderFocus();kick(.3);redraw();}}

/* ===== FOCUS ===== */
function setFocus(n){G.focus=n||null;renderFocus();redraw();}
function renderFocus(){
  const box=$('graphFocus');if(!box)return;
  const n=G.focus,note=n&&data.notes[n.id];
  if(!note){box.hidden=true;return;}
  const nb=G.edges.filter(([a,b])=>a===n||b===n).length,st=styleOfGroup(n.g);
  box.hidden=false;
  box.innerHTML='<span class="gf-sw">'+swatch(st,14)+'</span><b class="gf-t">'+esc(note.title||'Sans titre')+'</b>'+
    '<span class="gf-m">'+nb+' lien'+(nb>1?'s':'')+((note.tags||[]).length?' · '+esc(note.tags.map(t=>'#'+t).join(' ')):'')+'</span>'+
    '<button class="ico-btn" data-gf="open">Ouvrir</button><button class="ico-btn" data-gf="x" aria-label="Fermer">×</button>';
}

/* ===== LÉGENDE, FILTRE, ÉTIQUETTES ===== */
function swatch(st,s){                                      // petite forme SVG (légende, carte de focus)
  const r=s/2-1.5,c=s/2,p=[];
  if(st.shape==='circle')return'<svg width="'+s+'" height="'+s+'" aria-hidden="true"><circle cx="'+c+'" cy="'+c+'" r="'+r+'" fill="'+st.color+'"/></svg>';
  if(st.shape==='square')return'<svg width="'+s+'" height="'+s+'" aria-hidden="true"><rect x="2" y="2" width="'+(s-4)+'" height="'+(s-4)+'" fill="'+st.color+'"/></svg>';
  if(st.shape==='diamond')p.push([c,1],[s-1,c],[c,s-1],[1,c]);
  else if(st.shape==='triangle')p.push([c,1],[s-1,s-2],[1,s-2]);
  else for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,q=i%2?r*.45:r+1;p.push([c+Math.cos(a)*q,c+Math.sin(a)*q]);}
  return'<svg width="'+s+'" height="'+s+'" aria-hidden="true"><polygon points="'+p.map(q=>q[0].toFixed(1)+','+q[1].toFixed(1)).join(' ')+'" fill="'+st.color+'"/></svg>';
}
function groupCounts(){                                     // notes par groupe (toutes, même masquées, filtre de tag compris)
  const c={},ns=allNotes().filter(n=>!GS.tag||(n.tags||[]).includes(GS.tag));
  ns.forEach(n=>{const g=groupOf(n);c[g]=(c[g]||0)+1;});return c;
}
function renderLegend(){
  const L=$('graphLegend');if(!L)return;
  const c=groupCounts(),row=(i,st,name)=>'<div class="gl-row'+(st.hidden?' off':'')+'" data-g="'+i+'">'+
    '<input type="checkbox" data-gtog="'+i+'"'+(st.hidden?'':' checked')+' aria-label="Afficher '+esc(name)+'">'+
    '<button class="gl-name" data-gedit="'+i+'" title="Forme, couleur, nom">'+swatch(st,14)+'<span>'+esc(name)+'</span></button>'+
    '<span class="gl-n">'+(c[i]||0)+'</span></div>';
  L.classList.toggle('closed',!GS.legend);
  L.innerHTML='<button class="gl-head" data-gl="toggle" aria-expanded="'+GS.legend+'">Groupes '+(GS.legend?'▾':'▸')+'</button>'+
    (GS.legend?'<div class="gl-body">'+GS.groups.map((g,i)=>row(i,g,g.name)).join('')+row(-1,GS.other,'Sans groupe')+
    '<div class="gl-acts"><button class="ico-btn" data-gl="tags" title="Un groupe par tag fréquent">+ par tag</button>'+
    '<button class="ico-btn" data-gl="new" title="Groupe manuel : clic droit sur un nœud → Groupe">+ groupe</button></div></div>':'');
  const sel=$('graphTag');
  if(sel){const t=allTags(),keys=Object.keys(t).sort();
    sel.innerHTML='<option value="">tous les tags</option>'+keys.map(k=>'<option value="'+esc(k)+'"'+(k===GS.tag?' selected':'')+'>#'+esc(k)+' ('+t[k]+')</option>').join('')+
      (GS.tag&&!t[GS.tag]?'<option value="'+esc(GS.tag)+'" selected>#'+esc(GS.tag)+' (0)</option>':'');}
  const lb=$('graphLabels');if(lb)lb.value=GS.labels;
}
/* fenêtre d'édition d'un groupe (i = -1 : « Sans groupe ») */
function editGroup(i){
  const box=$('graphEdit');if(!box)return;
  const g=i<0?GS.other:GS.groups[i];if(!g)return;
  const tags=Object.keys(allTags()).sort();
  box.hidden=false;box.dataset.g=i;
  box.innerHTML='<div class="ge-head"><b>'+(i<0?'Sans groupe':'Groupe')+'</b><button class="ico-btn" data-ge="x" aria-label="Fermer">×</button></div>'+
    (i<0?'<p class="ge-p">Les notes qui ne sont dans aucun groupe.</p>':
    '<label class="ge-l">Nom <input id="geName" maxlength="40" value="'+esc(g.name)+'"></label>'+
    (g.kind==='tag'?'<label class="ge-l">Tag <select id="geTag">'+tags.map(t=>'<option'+(t===g.tag?' selected':'')+'>'+esc(t)+'</option>').join('')+
      (tags.includes(g.tag)?'':'<option selected>'+esc(g.tag)+'</option>')+'</select></label>':
      '<p class="ge-p">'+g.ids.length+' note(s). Ajouter / retirer : clic droit sur un nœud → « Groupe ».</p>'+
      '<button class="ico-btn" data-ge="addvis" title="Toutes les notes affichées (filtre de tag actuel)">+ notes affichées</button>'))+
    '<div class="ge-l">Forme <span class="ge-shapes">'+Object.entries(SHAPES).map(([lab,k])=>
      '<button data-shape="'+k+'" class="'+(g.shape===k?'on':'')+'" title="'+lab+'" aria-label="'+lab+'">'+swatch({shape:k,color:g.color},16)+'</button>').join('')+'</span></div>'+
    '<div class="ge-l">Couleur <span class="ge-cols">'+PALETTE.map(c=>'<button data-col="'+c+'" class="'+(g.color===c?'on':'')+'" style="background:'+c+'" aria-label="'+c+'"></button>').join('')+
      '<input type="color" id="geCol" value="'+g.color+'" aria-label="Autre couleur"></span></div>'+
    (i<0?'':'<div class="ge-acts"><button class="ico-btn" data-ge="up" title="Priorité plus haute (une note dans 2 groupes prend le premier)">↑</button>'+
      '<button class="ico-btn" data-ge="down">↓</button><button class="ico-btn danger" data-ge="del">Supprimer le groupe</button></div>');
}
function groupChanged(){saveGS();regraph();const b=$('graphEdit');if(b&&!b.hidden)editGroup(+b.dataset.g);if(view!=='graph')renderLegend();}
function newManualGroup(name,ids){
  const k=GS.groups.length;
  GS.groups.unshift({id:gid(),name:(name||'Groupe '+(k+1)).slice(0,40),kind:'manual',tag:'',ids:ids||[],shape:SHAPE_KEYS[(k+2)%5],color:PALETTE[(k+3)%PALETTE.length],hidden:false});
  saveGS();return 0;
}
function toggleInGroup(i,id){const g=GS.groups[i];if(!g||g.kind!=='manual')return;
  const p=g.ids.indexOf(id);if(p<0)g.ids.push(id);else g.ids.splice(p,1);groupChanged();}
/* éléments du clic droit sur un nœud : « Groupe » (sous-menu) */
function graphGroupItems(id){
  return{label:'Groupe…',sub:()=>GS.groups.map((g,i)=>g.kind==='manual'?{label:(g.ids.includes(id)?'✓ ':'')+g.name,run:()=>toggleInGroup(i,id)}:null).filter(Boolean)
    .concat([{label:'Nouveau groupe avec cette note…',run:async()=>{const v=await CTX.ask('Nom du groupe','','Créer');if(v){newManualGroup(v,[id]);groupChanged();editGroup(0);}}}])};
}

/* ===== ÉVÉNEMENTS ===== */
function graphWire(){
  const c=$('graph');
  const pos=e=>{const r=c.getBoundingClientRect();return{px:e.clientX-r.left,py:e.clientY-r.top};};
  c.addEventListener('pointerdown',e=>{if(e.button!==0)return; // clic droit : laissé au menu contextuel
    G.ptrType=e.pointerType;G.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{c.setPointerCapture(e.pointerId);}catch(x){}
    if(G.ptrs.size===2){                                    // 2 doigts : pincement (zoom), on annule le glisser
      const [a,b]=[...G.ptrs.values()];G.drag=null;G.panStart=null;G.down=null;
      G.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,s:G.scale};return;}
    if(G.ptrs.size>2)return;
    const {px,py}=pos(e),n=nodeAt(px,py);G.down={px:e.clientX,py:e.clientY,moved:false,n};
    if(n){G.drag=n;}else{G.panStart={x:e.clientX-G.off.x,y:e.clientY-G.off.y};}});
  c.addEventListener('pointermove',e=>{
    if(G.ptrs.has(e.pointerId))G.ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(G.pinch&&G.ptrs.size>=2){const [a,b]=[...G.ptrs.values()],r=c.getBoundingClientRect();
      const d=Math.hypot(a.x-b.x,a.y-b.y)||1,f=G.pinch.s*d/G.pinch.d/G.scale;
      zoomAt((a.x+b.x)/2-r.left,(a.y+b.y)/2-r.top,f);return;}
    const {px,py}=pos(e);
    if(G.down){if(Math.abs(e.clientX-G.down.px)>4||Math.abs(e.clientY-G.down.py)>4)G.down.moved=true;}
    if(G.drag){if(!G.down||!G.down.moved)return;const W=c.width/G.dpr,H=c.height/G.dpr;G.drag.x=(px-(W/2+G.off.x))/G.scale;G.drag.y=(py-(H/2+G.off.y))/G.scale;G.drag.vx=0;G.drag.vy=0;kick(.4);}
    else if(G.panStart){G.off.x=e.clientX-G.panStart.x;G.off.y=e.clientY-G.panStart.y;redraw();}
    else if(e.pointerType==='mouse'){const h=nodeAt(px,py);if(h!==G.hover){G.hover=h;c.style.cursor=h?'pointer':'grab';redraw();}}});
  const end=e=>{G.ptrs.delete(e.pointerId);
    if(G.pinch){if(G.ptrs.size<2)G.pinch=null;G.down=null;G.drag=null;G.panStart=null;return;}
    if(e.type==='pointerup'&&G.down&&!G.down.moved){
      const n=G.down.n;
      if(n){if(G.focus===n)openNoteFromGraph(n);else setFocus(n);}   // 1er clic : focus ; 2e clic : ouvrir
      else if(G.focus)setFocus(null);}
    G.drag=null;G.panStart=null;G.down=null;};
  c.addEventListener('pointerup',end);c.addEventListener('pointercancel',end);
  c.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&G.hover&&!G.down){G.hover=null;redraw();}});
  c.addEventListener('dblclick',e=>{const {px,py}=pos(e),n=nodeAt(px,py);if(n)openNoteFromGraph(n);});
  c.addEventListener('wheel',e=>{e.preventDefault();const {px,py}=pos(e);zoomAt(px,py,Math.exp(-Math.max(-60,Math.min(60,e.deltaY))*.004));},{passive:false});
  window.addEventListener('resize',()=>{if(view==='graph'){sizeCanvas();fitGraph();redraw();}});
  addEventListener('keydown',e=>{if(e.key==='Escape'&&view==='graph'&&G.focus&&!document.querySelector('#ctxMenu, .ctx-dlg'))setFocus(null);});

  const wrap=$('graphWrap');
  wrap.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    const W=c.width/G.dpr,H=c.height/G.dpr;
    if(b.dataset.zoom){const z=b.dataset.zoom;if(z==='fit'){fitGraph();redraw();}else zoomAt(W/2,H/2,z==='in'?1.35:1/1.35);return;}
    if(b.dataset.gf){if(b.dataset.gf==='open'&&G.focus)openNoteFromGraph(G.focus);else setFocus(null);return;}
    if(b.dataset.gl){const a=b.dataset.gl;
      if(a==='toggle'){GS.legend=!GS.legend;saveGS();renderLegend();}
      else if(a==='tags'){const n=autoTagGroups();if(!n)toast('Aucun tag dans tes notes');groupChanged();}
      else if(a==='new'){CTX.ask('Nom du nouveau groupe','','Créer').then(v=>{if(v){newManualGroup(v,[]);groupChanged();editGroup(0);}});}
      return;}
    if(b.dataset.gedit!=null){editGroup(+b.dataset.gedit);return;}
    const box=$('graphEdit'),i=box?+box.dataset.g:NaN,g=i<0?GS.other:GS.groups[i];
    if(b.dataset.ge){const a=b.dataset.ge;
      if(a==='x'){box.hidden=true;return;}
      if(a==='del'){GS.groups.splice(i,1);saveGS();box.hidden=true;regraph();renderLegend();return;}
      if(a==='up'&&i>0){[GS.groups[i-1],GS.groups[i]]=[GS.groups[i],GS.groups[i-1]];box.dataset.g=i-1;}
      if(a==='down'&&i<GS.groups.length-1){[GS.groups[i+1],GS.groups[i]]=[GS.groups[i],GS.groups[i+1]];box.dataset.g=i+1;}
      if(a==='addvis'&&g){G.nodes.forEach(n=>{if(!g.ids.includes(n.id))g.ids.push(n.id);});}
      groupChanged();return;}
    if(g&&b.dataset.shape){g.shape=b.dataset.shape;groupChanged();return;}
    if(g&&b.dataset.col){g.color=b.dataset.col;groupChanged();return;}
  });
  wrap.addEventListener('change',e=>{const t=e.target;
    if(t.dataset.gtog!=null){const st=styleOfGroup(+t.dataset.gtog);st.hidden=!t.checked;groupChanged();return;}
    if(t.id==='graphTag'){GS.tag=t.value;saveGS();setFocus(null);regraph();fitGraph();redraw();return;}
    if(t.id==='graphLabels'){GS.labels=t.value;saveGS();redraw();return;}
    const box=$('graphEdit'),i=+box.dataset.g,g=i<0?GS.other:GS.groups[i];if(!g)return;
    if(t.id==='geCol'&&okColor(t.value)){g.color=t.value;groupChanged();}
    else if(t.id==='geTag'){g.tag=t.value;if(/^#/.test(g.name)||!g.name)g.name='#'+t.value;groupChanged();}
    else if(t.id==='geName'){g.name=(t.value.trim()||'Groupe').slice(0,40);saveGS();renderLegend();}
  });
}
window.graphStats=()=>({nodes:G.nodes.length,edges:G.edges.length,running:G.running,steps:G.steps,alpha:G.alpha,labels:G.labels,scale:G.scale,focus:G.focus&&G.focus.id});   // pour les tests
