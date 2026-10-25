/* app.js — l'accueil v2 : une grande barre de recherche, les favoris / récents, le collage malin,
   le glisser-déposer n'importe où, et le routage par adresse :
     #/          → recherche (accueil)
     #/autres    → les outils moins utilisés (réseau, électronique, texte & dates, mémo)
     #/json …    → la page d'un outil (créée par NOXE.open, voir tools/base.js)
   L'ancien lien index.html#outil=json marche encore. */
(function(){
const homeV=$('homeView'),othersV=$('othersView'),q=$('q'),resBox=$('results'),sugBox=$('suggest'),blocks=$('homeBlocks');
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const catName=k=>(NOXE.cats.find(c=>c[0]===k)||['',''])[1];
const toolOf=k=>NOXE.tools.find(t=>t.key===k);

/* ---------- recherche « floue » ----------
   chaque mot tapé doit se retrouver quelque part (titre > mots-clés > description) ;
   en dernier recours on accepte les lettres dans l'ordre (« jsn » → JSON, « qrc » → QR code) */
const subseq=(w,s)=>{let i=0;for(const c of s)if(c===w[i])i++;return i===w.length;};
const reEsc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function score(qn,t){
  const title=norm(t.title),key=norm(t.key),words=norm((t.words||'')+' '+catName(t.cat)),desc=norm(t.desc);
  if(title===qn||key===qn)return 1000;
  if(title.startsWith(qn))return 500;
  let s=0;
  /* v8 : « json ? » cherche encore « json » (la ponctuation d'une question ne compte pas) */
  const ws=qn.split(/\s+/).map(w=>w.replace(/[?!¿¡]+/g,'')).filter(Boolean);if(!ws.length)return 0;
  for(const w of ws){
    const start=new RegExp('(^|[^a-z0-9])'+reEsc(w));
    if(start.test(title))s+=100;
    else if(start.test(key+' '+words))s+=60;
    else if(title.includes(w)||words.includes(w))s+=30;
    else if(desc.includes(w))s+=15;
    else if(w.length>=3&&(subseq(w,title.replace(/[^a-z0-9]/g,''))||subseq(w,key)))s+=10;
    else return 0;
  }
  if(NOXE.isFav(t.key))s+=5;
  if(NOXE.recents().includes(t.key))s+=3;
  return s;
}
/* résultats (v6) : [{type:'tool'|'note'|'memo', group, …}] — groupés Outils / Notes / Mémo, les meilleurs d'abord.
   Notes et mémo : search.js (sans accents, extrait surligné, index précalculé). */
const LIM={tool:8,note:8,memo:6};
const CMDS=[
  {id:'feedback',title:'Signaler / Suggérer (bug, idée, demande)',words:'signaler suggerer suggestion bug probleme erreur idee demande feedback avis contact ticket'},
  {id:'accent',title:'Changer la couleur d\'accent',words:'couleur accent violet rouge bleu vert orange rose cyan jaune'},
  {id:'theme',title:'Changer de thème (Défaut, Néon, Papier, Terminal, Nuit d\'orage)',words:'theme apparence neon papier terminal orage nuit defaut clair sombre'}];
/* v7 : d'autres fichiers (ai.js…) peuvent ajouter leurs commandes : NOXE.cmds.push({id,title,words,run}) */
NOXE.cmds=CMDS;
const runCmd=id=>{const c=CMDS.find(x=>x.id===id);if(c&&c.run){c.run();return;}
  if(id==='feedback'&&typeof FEEDBACK!=='undefined')FEEDBACK.open();else if((id==='accent'||id==='theme')&&typeof ACCENT!=='undefined')ACCENT.picker();};
let totals={tool:0,note:0,memo:0};
/* v8 : options placées EN TÊTE des résultats par d'autres fichiers (ai-bar.js : « Demander à l'IA »).
   NOXE.searchLead(texte, forcé) → [{type:'ai', title, hint, run}] ; elles ne prennent la sélection que si on les force
   (préfixe « ? », Tab, bouton) ou s'il n'y a rien d'autre : Entrée garde son sens habituel. */
let forceLead=false;
NOXE.forceLead=()=>{if(!q.value.trim())return false;forceLead=true;sel=0;drawResults();return true;};
NOXE.search=query=>{
  const qn=norm(query).trim();if(!qn)return[];
  const tools=NOXE.tools.map(t=>({type:'tool',key:t.key,title:t.title,hint:catName(t.cat),s:score(qn,t)})).filter(r=>r.s>0)
    .sort((a,b)=>b.s-a.s||a.title.localeCompare(b.title));
  const notes=typeof SEARCH!=='undefined'?SEARCH.notes(query,LIM.note):{list:[],total:0};
  const memo=typeof SEARCH!=='undefined'?SEARCH.memo(query,LIM.memo):{list:[],total:0};
  /* v6 : commandes (rangées après les outils : chaque mot tapé doit commencer un mot-clé) */
  const cmds=CMDS.filter(c=>qn.split(/\s+/).every(w=>c.words.split(' ').some(x=>x.startsWith(w)))).map(c=>({type:'tool',cmd:c.id,key:'',title:c.title,hint:'Commande',s:1}));
  totals={tool:tools.length+cmds.length,note:notes.total,memo:memo.total};
  return tools.slice(0,LIM.tool-cmds.length).concat(cmds,notes.list,memo.list);
};
NOXE.searchTotals=()=>totals;

/* ---------- cartes ---------- */
const card=t=>{
  const f=NOXE.isFav(t.key);
  return'<div class="card"><a class="tool" href="#/'+t.key+'"><h3>'+esc(t.title)+'</h3><p>'+esc(t.desc)+'</p></a>'+
    '<button class="star'+(f?' on':'')+'" data-star="'+t.key+'" aria-pressed="'+f+'" title="'+(f?'Retirer des favoris':'Ajouter aux favoris')+'">'+(f?'★':'☆')+'</button></div>';
};
const group=(title,list,extra)=>list.length||extra?'<div class="tool-group"><div class="tool-category">'+esc(title)+'</div><div class="tools">'+list.map(card).join('')+(extra||'')+'</div></div>':'';
function renderHome(){
  const favs=NOXE.favs().map(toolOf).filter(Boolean),rec=NOXE.recents().map(toolOf).filter(t=>t&&!NOXE.isFav(t.key)).slice(0,4);
  let html=group('★ Favoris',favs)+group('Récents',rec);
  if(!favs.length)html+='<p class="hint-line">Astuce : clique ☆ sur un outil pour l\'épingler ici.</p>';
  NOXE.main.forEach(c=>{
    const extra=c==='notes'?'<div class="card"><a class="tool" href="notes.html"><h3>Carnet complet</h3><p>Toutes tes notes, liens [[entre notes]], graphe, export.</p></a></div>'+
      '<div class="card"><button class="tool" type="button" data-panel><h3>Panneau Ctrl+J</h3><p>Les notes à portée de main, depuis n\'importe quel outil.</p></button></div>':'';
    html+=group(catName(c),NOXE.tools.filter(t=>t.cat===c),extra);
  });
  const n=NOXE.tools.filter(t=>!NOXE.main.includes(t.cat)).length;
  html+='<a class="more-link" href="#/autres">Autres outils ('+n+') : réseau, électronique, texte &amp; dates, mémo →</a>';
  blocks.innerHTML=html;
}
function renderOthers(){
  $('othersGroups').innerHTML=NOXE.cats.filter(c=>!NOXE.main.includes(c[0])).map(([k,name])=>group(name,NOXE.tools.filter(t=>t.cat===k))).join('');
}
document.addEventListener('click',e=>{
  const st=e.target.closest('[data-star]');
  if(st){e.preventDefault();const on=NOXE.toggleFav(st.dataset.star);toast(on?'Ajouté aux favoris':'Retiré des favoris');
    if(!homeV.hidden&&!q.value)renderHome();else{st.classList.toggle('on',on);st.textContent=on?'★':'☆';st.setAttribute('aria-pressed',on);}
    if(!othersV.hidden)renderOthers();return;}
  if(e.target.closest('[data-panel]')&&window.notePanel)notePanel.open();
});

/* ---------- résultats de recherche ---------- */
let results=[],sel=0,autoSel=true;
function drawResults(){
  const v=q.value.trim();
  blocks.hidden=!!v;resBox.hidden=!v;
  if(!v)return;
  results=NOXE.search(v);
  const lead=NOXE.searchLead?NOXE.searchLead(v,forceLead)||[]:[];
  if(lead.length){const n=results.length;results=lead.concat(results);
    if(autoSel)sel=forceLead||!n||/^\s*\?/.test(v)?0:lead.length;}
  autoSel=false;sel=Math.min(sel,Math.max(0,results.length-1));
  const G={tool:'Outils',note:'Notes',memo:'Mémo',ai:'IA'};let last='',html='';
  results.forEach((r,i)=>{
    if(r.type!==last){last=r.type;const n=totals[r.type],shown=results.filter(x=>x.type===r.type).length;
      html+='<div class="res-group" role="presentation">'+G[r.type]+(n>shown?' · '+shown+' sur '+n:'')+'</div>';}
    const href=r.type==='ai'?'#/':r.cmd?'#/':r.type==='tool'?'#/'+r.key:r.type==='memo'?'#/memo':'notes.html#'+encodeURIComponent(r.id);
    /* titleHtml / snip / valueHtml : déjà échappés par search.js (seules des balises <mark> sont ajoutées) */
    const body=r.type==='note'?'<span class="res-t">'+r.titleHtml+'<small class="res-snip">'+(r.snip||'<i>note vide</i>')+'</small></span><em>Note</em>'
      :r.type==='memo'?'<span class="res-t">'+r.titleHtml+'<small class="res-snip">'+r.valueHtml+'</small></span><em>'+esc(r.hint)+'</em>'
      :'<span>'+esc(r.title)+'</span><em>'+esc(r.hint)+'</em>';
    html+='<a class="res-item res-'+(r.cmd?'cmd':r.type)+(r.act?' res-ai-'+r.act:'')+(i===sel?' on':'')+'" data-i="'+i+'" role="option" aria-selected="'+(i===sel)+'" href="'+href+'">'+body+'</a>';
  });
  resBox.innerHTML=results.length?html:'<div class="res-none">Aucun outil, note ni fiche du mémo pour « '+esc(v)+' ».</div>';
  const on=resBox.querySelector('.res-item.on');if(on&&on.scrollIntoView)on.scrollIntoView({block:'nearest'});
}
function go(r,newTab){
  if(!r)return;
  if(r.type==='ai'){if(r.run)r.run();return;}
  if(r.type==='note'){if(window.notePanel&&!newTab)notePanel.open(r.id);else location.href='notes.html#'+encodeURIComponent(r.id);return;}
  if(r.cmd){runCmd(r.cmd);return;}
  if(r.type==='memo'){NOXE.open('memo',{text:q.value.trim(),input:'mq'});return;}   // le mémo s'ouvre filtré sur la recherche
  NOXE.open(r.key);
}
resBox.addEventListener('click',e=>{
  const a=e.target.closest('[data-i]');if(!a||e.ctrlKey||e.metaKey)return;
  e.preventDefault();go(results[+a.dataset.i]);
});
q.addEventListener('input',()=>{sel=0;autoSel=true;if(!q.value.trim())forceLead=false;clearSuggest();drawResults();});
q.addEventListener('keydown',e=>{
  if(e.key==='ArrowDown'&&results.length&&q.value){e.preventDefault();sel=(sel+1)%results.length;drawResults();}
  else if(e.key==='ArrowUp'&&results.length&&q.value){e.preventDefault();sel=(sel-1+results.length)%results.length;drawResults();}
  /* v8 : Tab (sans Maj) avec du texte = proposer / choisir « Demander à l'IA » ; une 2e fois, Tab sort normalement du champ */
  else if(e.key==='Tab'&&!e.shiftKey&&!e.ctrlKey&&!e.altKey&&q.value.trim()&&NOXE.searchLead&&!(results[sel]&&results[sel].type==='ai')&&(NOXE.searchLead(q.value,true)||[]).length){
    e.preventDefault();NOXE.forceLead();}
  else if(e.key==='Enter'){
    e.preventDefault();
    if(!q.value.trim()&&pending.length){useSuggest(0);return;}     // Entrée = première suggestion du collage
    if(results.length)go(results[sel]);
  }
  else if(e.key==='Escape'){if(q.value||pending.length){e.preventDefault();q.value='';clearSuggest();drawResults();}}
});

/* ---------- collage malin & fichiers déposés : la barre de suggestions ---------- */
let pending=[];
function clearSuggest(){pending=[];sugBox.hidden=true;sugBox.innerHTML='';}
function suggest(title,list){
  pending=list;
  sugBox.innerHTML='<div class="sug-title">'+esc(title)+'</div><div class="sug-list">'+
    list.map((s,i)=>'<button class="btn'+(i?' ghost':' primary')+'" data-sug="'+i+'">'+esc(s.label)+'</button>').join('')+
    '<button class="btn ghost" data-sug="x" aria-label="Ignorer">✕</button></div><div class="sug-hint">Entrée = '+esc(list[0].label)+'</div>';
  sugBox.hidden=false;if(NOXE.homeOpen)NOXE.homeOpen();   // v9 : la barre s'ouvre sous le Glyph
}
function useSuggest(i){
  const s=pending[i];if(!s)return;clearSuggest();
  if(s.run){s.run();return;}                                 // v9 : choix qui n'est pas un outil (Photo → note)
  NOXE.open(s.key,s.files?{files:s.files}:{tab:s.tab,text:s.text,input:s.input});
}
sugBox.addEventListener('click',e=>{const b=e.target.closest('[data-sug]');if(!b)return;if(b.dataset.sug==='x'){clearSuggest();q.focus();}else useSuggest(+b.dataset.sug);});

const isImg=f=>/^image\//.test(f.type),isPdf=f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name);
NOXE.fileChoices=files=>{
  if(files.every(isPdf))return[{key:'pdfoutils',label:files.length>1?'Fusionner ces PDF':'Découper / extraire des pages'}];
  if(files.every(isImg)){
    const l=[{key:'optimiser',label:'Optimiser'},{key:'convertir',label:'Convertir (PNG / JPG / WEBP)'}];
    if(files.length===1)l.push({key:'editeur',label:'Éditer (recadrer, retoucher…)'},{key:'ocr',label:'Lire le texte (OCR)'});
    l.push({key:'pdf',label:'Mettre en PDF'});
    if(files.length===1&&window.PHOTO)l.push({key:'photo',label:'Photo → note (lire le texte)',run:()=>PHOTO.open(files[0])});
    return l;
  }
  return[{key:'encodage',label:'Calculer le hash'},{key:'base64',label:'Convertir en Base64'}];
};
function offerFiles(files,how){
  const list=NOXE.fileChoices(files).map(s=>Object.assign(s,{files:files}));
  if(how==='drop'&&files.every(isPdf)){NOXE.open('pdfoutils',{files});return;}   // un PDF déposé : pas d'hésitation
  if(NOXE.current())NOXE.close();
  const names=files.length>1?files.length+' fichiers':files[0].name||'image collée';
  suggest(({drop:'Déposé : ',open:'Ouvert : ',share:'Partagé : '}[how]||'Collé : ')+names+' — que veux-tu en faire ?',list);
}
document.addEventListener('paste',e=>{
  if(NOXE.current())return;                                 // dans un outil, le collage reste normal
  const tg=e.target;if(tg!==q&&tg!==document.body&&tg!==document.documentElement)return;
  const cd=e.clipboardData;if(!cd)return;
  const files=[...(cd.files||[])];
  if(files.length){e.preventDefault();offerFiles(files,'paste');return;}
  const text=cd.getData('text/plain'),found=NOXE.detect(text);
  if(!found.length)return;                                  // rien de reconnu : le texte se colle dans la recherche
  e.preventDefault();
  const kind=found[0].label.split(' →')[0];
  suggest('Collé : '+kind+' ('+text.trim().length+' caractères)',found);
});
/* glisser-déposer n'importe où sur la page (les zones de dépôt des outils passent en premier) */
let dragN=0;
const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
addEventListener('dragenter',e=>{if(hasFiles(e)){dragN++;document.body.classList.add('dropping');}});
addEventListener('dragleave',e=>{if(hasFiles(e)&&--dragN<=0){dragN=0;document.body.classList.remove('dropping');}});
addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault();});            // sinon le navigateur ouvre le fichier
addEventListener('drop',e=>{
  dragN=0;document.body.classList.remove('dropping');
  if(!hasFiles(e)||e.defaultPrevented)return;                 // déjà pris par la zone de dépôt de l'outil
  e.preventDefault();
  const files=[...e.dataTransfer.files];if(!files.length)return;
  const cur=NOXE.current(),t=cur&&toolOf(cur);
  if(t&&(t.image||t.multi)&&files.some(f=>NOXE.accepts(t,f))){NOXE.open(cur,{files});return;}   // l'outil ouvert les accepte
  if(t&&NOXE.wantsFiles()){NOXE.open(cur,{files});return;}
  if(!t){NOXE.routeFiles(files,'drop');return;}               // v9 : sur l'accueil, la détection choisit l'outil (PDF, JSON, texte…)
  offerFiles(files,'drop');
});

/* ---------- « Ouvrir avec AVERSE » : fichiers et partages venus du système (v3) ----------
   Chaque entrée va vers le bon outil : PDF → outils PDF, JSON → JSON, texte → l'outil qui le reconnaît
   (sinon le carnet), images → la barre de choix (Entrée = Optimiser), le reste → hash / Base64. */
const readText=f=>f.text?f.text():new Response(f).text();
NOXE.routeText=(text,title)=>{
  const t=String(text||'').trim();if(!t)return null;
  const found=NOXE.detect(t);
  if(found.length){const s=found[0];NOXE.open(s.key,{tab:s.tab,text:s.text,input:s.input});return s.key;}
  NOXE.open('carnet',{text:t,input:'nq_b'});
  if(title&&$('nq_t')){$('nq_t').value=String(title).slice(0,200);}
  return'carnet';
};
NOXE.routeFiles=async(files,how)=>{
  files=[...files].filter(Boolean);if(!files.length)return null;
  if(files.every(isPdf)){NOXE.open('pdfoutils',{files});return'pdfoutils';}
  const f=files[0];
  if(files.length===1&&(/json/.test(f.type)||/\.json$/i.test(f.name))){
    NOXE.open('json',{text:await readText(f),input:'j_in'});return'json';
  }
  if(files.length===1&&(/^text\//.test(f.type)||/\.(txt|md|csv|log)$/i.test(f.name))){
    return NOXE.routeText(await readText(f),f.name.replace(/\.[^.]+$/,''));
  }
  offerFiles(files,how||'open');
  return files.every(isImg)?'images':'fichier';
};
/* fichiers ouverts depuis l'explorateur (manifest « file_handlers ») */
if('launchQueue' in window&&window.launchQueue&&launchQueue.setConsumer){
  launchQueue.setConsumer(async p=>{
    if(!p.files||!p.files.length)return;
    const files=[];for(const h of p.files){try{files.push(await h.getFile());}catch(e){}}
    NOXE.routeFiles(files,'open');
  });
}
/* partage depuis une autre appli (manifest « share_target ») : sw.js a rangé le contenu dans le cache « averse-share » */
NOXE.takeShare=async()=>{
  if(!('caches' in window))return null;
  const c=await caches.open('averse-share'),m=await c.match('./__share/meta');
  if(!m)return null;
  const meta=await m.json().catch(()=>({})),files=[];
  for(let i=0;i<(meta.files|0)&&i<20;i++){
    const r=await c.match('./__share/'+i);if(!r)continue;
    const b=await r.blob();
    files.push(new File([b],decodeURIComponent(r.headers.get('x-name')||'fichier'),{type:b.type||r.headers.get('content-type')||''}));
  }
  for(const k of await c.keys())await c.delete(k);           // une seule fois : on vide derrière soi
  if(files.length)return NOXE.routeFiles(files,'share');
  const link=meta.url||((meta.text||'').match(/^\s*https?:\/\/\S+\s*$/)?meta.text:'');
  return NOXE.routeText(link||[meta.text,meta.url].filter(Boolean).join('\n')||meta.title,meta.title);
};
const params=new URLSearchParams(location.search);
/* envoyé depuis une autre page (clic droit dans le carnet → « Envoyer vers… ») */
try{
  const s=JSON.parse(sessionStorage.getItem('averse-send')||'null');sessionStorage.removeItem('averse-send');
  if(s&&typeof s.text==='string'&&s.key&&toolOf(s.key))setTimeout(()=>NOXE.sendTo(s.key,{text:s.text}),0);
  else if(s&&typeof s.detect==='string')setTimeout(()=>NOXE.routeText(s.detect),0);
}catch(e){}
if(params.has('share')||params.has('open')){
  history.replaceState(null,'',location.pathname+location.hash);   // on nettoie l'adresse
  if(params.has('share'))setTimeout(()=>NOXE.takeShare().catch(e=>console.error(e)),0);
}

/* ---------- routage ---------- */
let routing=false;
function show(v){
  homeV.hidden=v!=='home';othersV.hidden=v!=='autres';
  document.title=v==='autres'?'Autres outils — AVERSE':'AVERSE';
  if(v==='home'){if(q.value)drawResults();else renderHome();setTimeout(()=>{if(NOXE.current())return;if(q.value||!NOXE.homeIdle)q.focus({preventScroll:true});else NOXE.homeIdle();},0);}   // v9 : au repos, le Glyph seul (home.js)
  if(v==='autres')renderOthers();
}
function route(){
  let h=location.hash;
  const old=/^#outil=([\w-]+)/.exec(h);
  if(old){history.replaceState(null,'','#/'+old[1]);h='#/'+old[1];}
  const k=h.replace(/^#\/?/,'');
  if(k&&k!=='autres'&&toolOf(k)){
    if(NOXE.current()!==k)NOXE.open(k);
    const t=toolOf(k);document.title=t.title+' — AVERSE';
    return;
  }
  if(NOXE.current()){routing=true;NOXE.close();routing=false;}
  show(k==='autres'?'autres':'home');
}
NOXE.afterClose=()=>{if(!routing)route();};
NOXE.refreshHome=()=>{if(!homeV.hidden&&q.value)drawResults();else if(!homeV.hidden)renderHome();else if(!othersV.hidden)renderOthers();};
NOXE.route=route;
addEventListener('hashchange',route);
addEventListener('popstate',route);

addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(NOXE.current())NOXE.close();else location.hash='#/';q.focus();q.select();return;}
  if(NOXE.current())return;
  if(e.key==='Escape'&&!othersV.hidden){e.preventDefault();location.hash='#/';return;}
  /* sur l'accueil, taper n'importe où écrit dans la recherche */
  const a=document.activeElement;
  if(!homeV.hidden&&e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(!a||a===document.body||a.id==='homeGlyph'||a.classList.contains('tool')))q.focus();
});

/* liens du pied de page (data.js) — uniquement des adresses http(s) */
if(typeof SITE!=='undefined'&&$('footerLinks'))
  $('footerLinks').innerHTML=SITE.links.filter(l=>/^https?:\/\//i.test(l.url)).map(l=>'<a href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.label)+'</a>').join('');

/* bascule de style et de pluie (pied de page) */
(function(){
  const a=$('styleSwitch');
  if(a)a.onclick=e=>{e.preventDefault();toggleStyle();if(window.rainSetColor)rainSetColor();};
  const r=$('rainSwitch');if(!r)return;
  const lab=()=>{r.textContent='pluie : '+(window.rainOn&&rainOn()?'on':'off');};
  document.addEventListener('averse-theme',lab);
  r.onclick=e=>{e.preventDefault();if(window.rainToggle)rainToggle();lab();};lab();
})();

/* mode hors-ligne */
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

route();
})();
