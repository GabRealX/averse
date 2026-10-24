/* notes.js — le carnet : notes liées par [[liens]], recherche, tags, graphe, export/import.
   Tout est stocké dans le navigateur (localStorage). Aucun serveur. */
const uid=()=>'n_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const now=()=>Date.now();
const norm=s=>String(s||'').trim().toLowerCase();
function fmtDate(t){const d=new Date(t),j=86400000,diff=now()-t;
  if(diff<60000)return'à l\'instant';
  if(diff<3600000)return Math.floor(diff/60000)+' min';
  if(diff<j)return Math.floor(diff/3600000)+' h';
  if(diff<7*j)return Math.floor(diff/j)+' j';
  return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});}

/* ===== TOAST & CONFIRMATION (remplacent alert/confirm, cohérents avec le thème) ===== */
function confirmBox(message,okLabel){
  return new Promise(res=>{
    const prev=document.activeElement;
    const ov=document.createElement('div');ov.className='modal-overlay on';ov.setAttribute('role','dialog');ov.setAttribute('aria-modal','true');
    ov.innerHTML='<div class="modal-card"><div class="m-title">Confirmer</div>'+
      '<p class="m-sub">'+esc(message)+'</p>'+
      '<div class="m-actions"><button class="btn" data-x>Annuler</button>'+
      '<button class="btn primary" data-ok>'+esc(okLabel||'Confirmer')+'</button></div></div>';
    document.body.appendChild(ov);
    const done=v=>{ov.remove();removeEventListener('keydown',onKey);if(prev&&prev.focus)prev.focus();res(v);};
    const onKey=e=>{if(e.key==='Escape'){e.preventDefault();done(false);}};
    ov.addEventListener('click',e=>{if(e.target===ov)done(false);});
    ov.querySelector('[data-x]').onclick=()=>done(false);
    ov.querySelector('[data-ok]').onclick=()=>done(true);
    addEventListener('keydown',onKey);
    ov.querySelector('[data-ok]').focus();
  });
}

/* ===== TEINTE du graphe ===== v6 : suit la couleur d'accent du site (accent.js), relue à chaque changement */
const ACC={hex:'#c7bce4',rgb:[199,188,228]};
function accRead(){if(typeof ACCENT==='undefined')return;const h=ACCENT.readable(ACCENT.get());ACC.hex=h;ACC.rgb=ACCENT.rgb(h);}
accRead();
document.addEventListener('averse-accent',e=>{ACC.hex=e.detail.hex;ACC.rgb=e.detail.rgb;if(typeof redraw==='function'&&G.canvas){redraw();renderLegend();}});
const acc=a=>'rgba('+ACC.rgb[0]+','+ACC.rgb[1]+','+ACC.rgb[2]+','+a+')';

/* ===== ÉTAT / PERSISTANCE ===== */
const KEY='noxe-notes';           // (clé gardée telle quelle pour ne pas perdre les notes déjà écrites)
let data={notes:{},openId:null};
let tagFilter=null, query='', view='editor';

addEventListener('beforeunload',()=>{try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){}});
function save(){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){}if(typeof fsLater==='function')fsLater();if(window.cloudLater)cloudLater();}   // v5 : + synchro Gist
function load(){try{const s=localStorage.getItem(KEY);if(s){const d=JSON.parse(s);if(d&&d.notes)return d;}}catch(e){}return null;}

function seed(){
  const a=uid(),b=uid(),c=uid();
  data.notes[a]={id:a,title:'Bienvenue',tags:['méta'],created:now(),updated:now(),
    body:'# Le carnet\nUn espace pour **garder des traces** de ce que tu apprends.\n\nRelie tes notes entre elles avec des liens : tape [[Liens]] pour pointer vers une autre note.\n\n- Recherche et filtre par tag à gauche\n- Bascule en vue [[Graphe]] pour voir tout le réseau\n- Tout reste sur ton appareil'};
  data.notes[b]={id:b,title:'Liens',tags:['méta'],created:now(),updated:now(),
    body:'## Liens entre notes\nÉcris le titre d\'une note entre doubles crochets : `[[Bienvenue]]`.\n\nSi la note n\'existe pas encore, cliquer dessus la crée. Les notes qui pointent vers celle-ci apparaissent dans **Référencé par**.\n\nLiens externes classiques aussi : [Anthropic](https://www.anthropic.com) ou collés directement https://exemple.fr'};
  data.notes[c]={id:c,title:'Graphe',tags:['méta'],created:now(),updated:now(),
    body:'## Le graphe\nChaque note est un nœud, chaque [[Liens]] une arête. Plus une note est reliée, plus son carré est grand.\n\nClique un nœud pour l\'ouvrir, glisse-le pour réorganiser.'};
  data.openId=a;save();
}

/* ===== ACCÈS NOTES ===== */
const allNotes=()=>Object.values(data.notes);
/* Recherche d'une note par titre. Pendant un rendu de toute la liste / du graphe, withTitles() construit
   un index une seule fois (v4 : sinon chaque lien parcourait toutes les notes → lent à 500 notes). */
let TI=null;
const byTitle=t=>{const k=norm(t);if(TI)return TI.get(k)||null;return allNotes().find(n=>norm(n.title)===k)||null;};
function withTitles(fn){
  if(TI)return fn();
  TI=new Map();allNotes().forEach(n=>{const k=norm(n.title);if(!TI.has(k))TI.set(k,n);});
  try{return fn();}finally{TI=null;}
}
function wikiTargets(body){const out=[],re=/\[\[([^\]]+)\]\]/g;let m;
  while((m=re.exec(body||''))){out.push(m[1].trim());}return out;}
function outLinks(note){const seen={},res=[];wikiTargets(note.body).forEach(t=>{const tg=byTitle(t);if(tg&&tg.id!==note.id&&!seen[tg.id]){seen[tg.id]=1;res.push(tg);}});return res;}
function backlinks(note){const k=norm(note.title);return allNotes().filter(n=>n.id!==note.id&&wikiTargets(n.body).some(t=>norm(t)===k));}
function allTags(){const s={};allNotes().forEach(n=>(n.tags||[]).forEach(t=>{s[t]=(s[t]||0)+1;}));return s;}

/* ===== RENDU MARKDOWN LÉGER ===== */
// v6 : le moteur est dans md.js (partagé avec share.html, la page de lecture d'une note partagée)
const safeUrl=MD.safeUrl;
const MDO={exists:t=>!!byTitle(t)};
const inline=t=>MD.inline(t,MDO);
const render=body=>MD.render(body,MDO);
const renderMd=body=>MD.renderMd(body,MDO);
const typeset=el=>{if(typeof MATH!=='undefined')MATH.typeset(el);};

/* ===== LISTE ===== */
function matchQuery(n){if(!query)return true;const q=norm(query);
  return norm(n.title).includes(q)||norm(n.body).includes(q)||(n.tags||[]).some(t=>norm(t).includes(q));}
function renderList(){withTitles(renderList0);}
function renderList0(){
  const host=$('list');
  let ns=allNotes().filter(n=>matchQuery(n)&&(!tagFilter||(n.tags||[]).includes(tagFilter)));
  ns.sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||b.updated-a.updated);   // épinglées d'abord
  if(!ns.length){host.innerHTML='<div class="list-empty">Aucune note'+(query||tagFilter?' pour ce filtre.':' — crée la première.')+'</div>';if(window.AINOTES)AINOTES.semantic(query,host,[]);return;}
  host.innerHTML=ns.map(n=>{
    const links=outLinks(n).length;
    return'<div class="note-item'+(n.id===data.openId?' active':'')+'" data-id="'+esc(n.id)+'">'+
      '<h4>'+(n.pinned?'<span class="pin" title="Épinglée">◆</span> ':'')+esc(n.title||'Sans titre')+'</h4>'+
      '<div class="meta"><span>'+fmtDate(n.updated)+'</span>'+
      (links?'<span class="dot"></span><span>'+links+' lien'+(links>1?'s':'')+'</span>':'')+
      ((n.tags||[]).length?'<span class="dot"></span><span>'+esc(n.tags.join(' · '))+'</span>':'')+
      '</div></div>';
  }).join('');
  if(window.AINOTES)AINOTES.semantic(query,host,ns.map(n=>n.id));   // v7 : « par le sens » sous les résultats
}
function renderTags(){
  const t=allTags(),keys=Object.keys(t).sort(),host=$('tagbar');
  if(!keys.length){host.innerHTML='';return;}
  host.innerHTML=keys.map(k=>'<span class="tag-chip'+(tagFilter===k?' on':'')+'" data-tag="'+esc(k)+'">'+esc(k)+' '+t[k]+'</span>').join('');
}

/* ===== ÉDITEUR ===== */
function openNote(id){data.openId=id;save();renderEditor();renderList();}
function renderEditor(){
  const main=$('main'),n=data.notes[data.openId];
  if(!n){main.querySelector('.editor').style.display='none';$('blank').style.display='flex';return;}
  $('blank').style.display='none';
  const ed=main.querySelector('.editor');ed.style.display='flex';
  $('titleIn').value=n.title||'';
  $('tagsIn').value=(n.tags||[]).join(', ');
  $('bodyIn').value=n.body||'';
  $('preview').innerHTML='<div class="rendered">'+render(n.body)+'</div>';typeset($('preview'));
  renderBacklinks(n);
}
function renderBacklinks(n){
  const bl=backlinks(n),host=$('backlinks');
  host.innerHTML='<div class="bl-head">Référencé par ('+bl.length+')</div>'+
    (bl.length?bl.map(b=>'<a data-id="'+esc(b.id)+'">'+esc(b.title||'Sans titre')+'</a>').join(''):'<div class="none">Aucune note ne pointe encore ici.</div>');
  if(window.AINOTES)AINOTES.related(n,host);                 // v7 : notes liées par le sens (si l'IA locale est activée)
}
let saveT;
function liveSave(){
  const n=data.notes[data.openId];if(!n)return;
  n.title=$('titleIn').value;
  n.tags=$('tagsIn').value.split(',').map(s=>s.trim()).filter(Boolean);
  n.body=$('bodyIn').value;n.updated=now();
  clearTimeout(saveT);saveT=setTimeout(save,250);
}
function livePreview(){
  const n=data.notes[data.openId];if(!n)return;
  $('preview').innerHTML='<div class="rendered">'+render($('bodyIn').value)+'</div>';typeset($('preview'));
}
/* modèles : v6 → templates.js (ceux d'AVERSE + les tiens, avec variables {{date}}, {{titre}}…).
   tpl = id d'un modèle AVERSE (« tp », « cours »…) ou « u:<id> » pour un des tiens */
function tplOf(v){if(!v||typeof TPL==='undefined')return null;return v.startsWith('u:')?TPL.get(v.slice(2)):TPL.builtin(v);}
function newNote(title,tpl){
  const T=tplOf(tpl),X=T?TPL.expand(T):null;
  const id=uid();data.notes[id]={id:id,title:X?X.title:(title||'Sans titre'),tags:X?X.tags:[],created:now(),updated:now(),body:X?X.body:''};
  data.openId=id;save();renderAll();$('titleIn').focus();$('titleIn').select&&$('titleIn').select();
}
async function delNote(){
  const n=data.notes[data.openId];if(!n)return;
  const ok=await confirmBox('Supprimer « '+(n.title||'Sans titre')+' » ? Cette action est définitive.','Supprimer');
  if(!ok)return;
  (data.deleted||(data.deleted={}))[data.openId]=now();    // pierre tombale : les autres onglets la suppriment aussi
  delete data.notes[data.openId];
  data.openId=allNotes().sort((a,b)=>b.updated-a.updated)[0]?.id||null;
  save();renderAll();
  toast('Note supprimée');
}

/* ===== EXPORT / IMPORT ===== */
function exportJSON(){
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download='noxe-carnet-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(u),2000);
}
function importJSON(file){
  const r=new FileReader();
  r.onload=()=>{try{const d=JSON.parse(r.result);if(!d||!d.notes)throw 0;
    if(d.app==='averse'&&d.kind==='sauvegarde'){save();BACKUP.importFile(file).then(r=>{if(r.ok){data=load()||data;renderAll();}});return;}   // une sauvegarde complète
    let merged=0;Object.values(d.notes).forEach(n=>{if((n=sanitizeNote(n))){   // même nettoyage que la sauvegarde complète (core.js)
      if(data.deleted&&data.deleted[n.id]){delete data.deleted[n.id];n.updated=now();}   // réimportée exprès : elle gagne
      data.notes[n.id]=n;merged++;}});
    data.openId=data.openId||allNotes()[0]?.id||null;save();renderAll();
    toast(merged+' note(s) importée(s)');
  }catch(e){toast('Fichier illisible');}};
  r.readAsText(file);
}

/* PDF propre d'une note : une vue d'impression dédiée (#printArea, voir @media print dans notes.css)
   puis la boîte « Imprimer » du navigateur → « Enregistrer au format PDF ». */
async function printNote(){
  const n=data.notes[data.openId];if(!n){toast('Aucune note ouverte');return;}
  let a=$('printArea');if(!a){a=document.createElement('div');a.id='printArea';document.body.appendChild(a);}
  const d=new Date(n.updated||now()).toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  a.innerHTML='<article class="print-note"><h1>'+esc(n.title||'Sans titre')+'</h1>'+
    '<div class="print-meta">'+esc(d)+((n.tags||[]).length?' · '+n.tags.map(t=>'#'+esc(t)).join(' '):'')+'</div>'+
    '<div class="rendered">'+render(n.body)+'</div></article>';
  a.querySelectorAll('input[type=checkbox]').forEach(c=>c.disabled=true);
  if(typeof MATH!=='undefined')await MATH.typeset(a);
  try{await document.fonts.ready;}catch(e){}
  const old=document.title;document.title=n.title||'note';        // nom proposé pour le fichier PDF
  window.print();
  document.title=old;
}
window.printNote=printNote;

function exportMd(){
  const n=data.notes[data.openId];if(!n)return;
  const text=(n.title?'# '+n.title+'\n\n':'')+n.body+'\n';
  const u=URL.createObjectURL(new Blob([text],{type:'text/markdown'})),a=document.createElement('a');
  a.href=u;a.download=(n.title||'note').replace(/[^\w\-À-ÿ ]+/g,'').trim().replace(/\s+/g,'-')+'.md';a.click();
  setTimeout(()=>URL.revokeObjectURL(u),2000);
}

/* ===== FICHIER LIÉ = synchro entre appareils (v4) =====
   Le bouton « Fichier » lie le carnet à un vrai fichier .json (File System Access API : Chrome / Edge, ordinateur).
   Placé dans un dossier OneDrive / Google Drive / Dropbox, ce fichier sert de synchro entre appareils :
   - on surveille le fichier : au retour sur l'onglet (focus) et toutes les SYNC_MS ms (lastModified + taille) ;
   - AVANT chaque écriture on relit le fichier : s'il a changé ailleurs, on fusionne d'abord (rien n'est écrasé) ;
   - fusion = mergeNotes (la plus récente gagne, pierres tombales comprises) ;
   - CONFLIT (même note modifiée ici ET ailleurs depuis la dernière synchro, ou modifiée d'un côté et supprimée
     de l'autre) : on garde les deux — la plus récente reste en place, l'autre devient une note « (conflit …) »
     avec le tag « conflit » ;
   - fichier illisible (le service de synchro est en train de l'écrire, JSON coupé…) : on n'écrit PAS par-dessus,
     on affiche « erreur » et on réessaie au prochain passage ;
   - le fichier contient les notes triées, sans l'état de l'appareil (note ouverte) : deux appareils à jour
     produisent exactement le même fichier, donc pas d'écritures en ping-pong.
   Firefox / Safari n'ont pas cette API : le bouton explique d'utiliser Sauvegarde / Restaurer. */
const FS={ok:'showSaveFilePicker' in window,h:null,t:0,mod:-1,size:-1,base:null,busy:null,again:false,dirty:false,state:'off',
  name:'',at:0,conflicts:0,poll:0};
const SYNC_MS=5000,SYNC_KEY='noxe-sync';
const idb=()=>new Promise((res,rej)=>{const r=indexedDB.open(IDB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const idbGet=async k=>{const d=await idb();return new Promise(r=>{const q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(null);});};
const idbSet=async(k,v)=>{const d=await idb();return new Promise(r=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r();t.onerror=()=>r();});};
const hhmm=t=>new Date(t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
/* indicateur : off · busy · ok (synchro OK) · ext (modifié ailleurs → fusionné) · err (erreur) · re (à reconnecter) */
function fsUi(state,detail){
  FS.state=state;
  const b=$('fileBtn'),st=$('syncState');
  if(b){b.textContent=FS.h?'Fichier ✓':state==='re'?'Fichier — reconnecter':'Fichier';b.classList.toggle('on',!!FS.h&&state!=='err');}
  if(!st)return;
  const T={busy:'synchro…',ok:'synchro OK',ext:'modifié ailleurs — fusionné',err:'erreur',re:'accès au fichier à redonner'};
  st.hidden=state==='off';st.dataset.state=state;
  st.textContent=state==='off'?'':'● '+T[state]+(detail?' : '+detail:'')+(state==='ok'||state==='ext'?' · '+hhmm(FS.at):'');
  st.title=st.textContent+(FS.name?'\n':'')+(FS.name?'Fichier lié : '+FS.name+(FS.conflicts?' — '+FS.conflicts+' copie(s) de conflit créée(s)':''):'');
}
/* Fusion avec un autre onglet / le fichier lié. « Pierres tombales » : data.deleted = {id: date de suppression}.
   Une note supprimée ne revient plus, sauf si elle a été modifiée APRÈS sa suppression (dans un autre onglet). */
function mergeNotes(d){
  let n=0;const del=data.deleted||(data.deleted={});
  Object.entries(d.deleted||{}).forEach(([id,t])=>{t=+t||0;if(t>(del[id]||0))del[id]=t;});
  Object.values(d.notes||{}).forEach(x=>{if((x=sanitizeNote(x))){
    if((del[x.id]||0)>=(x.updated||0))return;              // supprimée depuis : on ne la ressuscite pas
    const old=data.notes[x.id];if(!old||(x.updated||0)>(old.updated||0)){data.notes[x.id]=x;n++;}}});
  Object.keys(del).forEach(id=>{const x=data.notes[id];if(x&&(x.updated||0)<=del[id]){delete data.notes[id];n++;}});
  if(data.openId&&!data.notes[data.openId])data.openId=allNotes().sort((a,b)=>b.updated-a.updated)[0]?.id||null;
  return n;
}
const sameNote=(a,b)=>a.title===b.title&&a.body===b.body&&(a.tags||[]).join('\u0001')===(b.tags||[]).join('\u0001');
/* ce qu'on écrit dans le fichier : trié et normalisé (identique d'un appareil à l'autre) */
function fileText(){
  const notes={},deleted={},del=data.deleted||{};
  Object.keys(data.notes).sort().forEach(k=>{const n=sanitizeNote(data.notes[k]);if(n)notes[k]=n;});
  Object.keys(del).sort().forEach(k=>{deleted[k]=del[k];});
  const o={app:'averse',kind:'carnet',version:2,notes,deleted};
  if(typeof TPL!=='undefined'){const t=TPL.payload();if(Object.keys(t.items).length||Object.keys(t.deleted).length)o.templates=t;}   // v6 : tes modèles voyagent avec les notes (absents s'il n'y en a pas : fichier identique à la v5)
  return JSON.stringify(o,null,1);
}
const baseNow=()=>{const b={};Object.values(data.notes).forEach(n=>{b[n.id]=n.updated||0;});return b;};
function setBase(){FS.base=baseNow();
  try{localStorage.setItem(SYNC_KEY,JSON.stringify({name:FS.name,base:FS.base}));}catch(e){}}
function conflictCopy(n,why){                               // copie gardée en cas de conflit (id stable : pas de doublon)
  const id=('c'+n.id).slice(0,48)+'-'+(n.updated||0).toString(36);
  if(data.notes[id]||(data.deleted||{})[id])return 0;
  data.notes[id]={id,title:((n.title||'Sans titre')+' (conflit — '+why+')').slice(0,300),body:n.body||'',
    tags:[...new Set((n.tags||[]).concat('conflit'))].slice(0,40),created:n.created||now(),updated:now(),pinned:false};
  return 1;
}
/* fusionne le contenu d d'un fichier modifié ailleurs ; renvoie {n: changements, c: conflits}
   v5 : base = état de la dernière synchro de CE canal (fichier lié ou Gist : chacun garde la sienne) */
function syncMerge(d,base){
  if(arguments.length<2)base=FS.base;
  const del=data.deleted||(data.deleted={}),rdel=d.deleted&&typeof d.deleted==='object'?d.deleted:{};
  const notes=d.notes&&typeof d.notes==='object'?d.notes:{},keep={notes:Object.create(null),deleted:rdel};
  const since=(id,t)=>!base||base[id]==null||(t||0)>base[id];      // modifiée depuis la dernière synchro ?
  let c=0;
  for(const k of Object.keys(notes)){
    const r=sanitizeNote(notes[k]);if(!r)continue;
    const l=data.notes[r.id];
    if(l&&!sameNote(l,r)&&r.updated!==l.updated&&since(r.id,l.updated)&&since(r.id,r.updated)){
      /* la plus récente reste « la » note (comme mergeNotes, donc les deux appareils convergent),
         la plus ancienne est gardée à côté en copie de conflit */
      const older=(r.updated||0)>(l.updated||0)?l:r;
      c+=conflictCopy(older,(older===r?'version de l\'autre appareil, ':'version de cet appareil, ')+new Date(older.updated||0).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}));
    }
    if(!l&&del[r.id]&&del[r.id]>=(r.updated||0)&&base&&base[r.id]!=null&&r.updated>base[r.id])
      c+=conflictCopy(r,'modifiée sur l\'autre appareil, supprimée ici');               // sinon cette modification serait perdue
    keep.notes[r.id]=r;
  }
  for(const id of Object.keys(rdel)){                       // supprimée là-bas, mais modifiée ici depuis la synchro
    const l=data.notes[id];
    if(l&&!notes[id]&&(+rdel[id]||0)>=(l.updated||0)&&base&&base[id]!=null&&l.updated>base[id])
      c+=conflictCopy(l,'modifiée ici, supprimée sur l\'autre appareil');
  }
  let n=mergeNotes(keep)+c;
  if(d.templates&&typeof TPL!=='undefined'){const t=TPL.merge(d.templates);if(t){n+=t;if(typeof tplRefresh==='function')tplRefresh();}}   // v6 : modèles
  return {n,c};
}
/* LA synchro : relit le fichier, fusionne si besoin, puis écrit si le fichier n'est pas à jour */
function fsSync(why){
  if(!FS.h)return Promise.resolve();
  if(FS.busy){FS.again=true;return FS.busy;}
  FS.busy=(async()=>{
    let res=null;
    try{
      const f=await FS.h.getFile();FS.name=f.name;
      const changed=f.lastModified!==FS.mod||f.size!==FS.size;
      if(!changed&&!FS.dirty)return;                        // rien de neuf ni ici ni là-bas
      if(FS.state!=='ext'&&FS.state!=='err')fsUi('busy');
      let txt='';
      if(changed){
        txt=await f.text();
        if(txt.trim()){
          let d=null;try{d=JSON.parse(txt);}catch(e){}
          if(!d||typeof d!=='object'||!d.notes||typeof d.notes!=='object'){
            fsUi('err','fichier illisible (synchro en cours ?), nouvel essai dans '+SYNC_MS/1000+' s');return;   // surtout ne pas l'écraser
          }
          res=syncMerge(d,FS.base);FS.conflicts+=res.c;
          if(res.n){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){}renderAll();if(res.c)toast(res.c+' conflit(s) : les deux versions sont gardées (tag « conflit »)');}
        }
      }
      const out=fileText();
      if(out!==txt){
        const again=await FS.h.getFile();                   // dernier contrôle juste avant d'écrire
        if(again.lastModified!==f.lastModified||again.size!==f.size){FS.again=true;return;}
        const w=await FS.h.createWritable();await w.write(out);await w.close();
      }
      const f2=await FS.h.getFile();FS.mod=f2.lastModified;FS.size=f2.size;FS.dirty=false;FS.at=Date.now();setBase();
      fsUi(res&&res.n?'ext':(FS.state==='ext'&&why==='poll'?'ext':'ok'),res&&res.c?res.c+' conflit(s) gardé(s) en double':'');
    }catch(e){
      if(e&&(e.name==='NotAllowedError'||e.name==='SecurityError'))fsUi('re');
      else if(e&&e.name==='NotFoundError')fsUi('err','fichier introuvable (déplacé, renommé ou supprimé ?)');
      else fsUi('err',(e&&e.message||'écriture impossible').slice(0,120));
    }finally{
      FS.busy=null;
      if(FS.again){FS.again=false;setTimeout(()=>fsSync('again'),50);}
    }
  })();
  return FS.busy;
}
function fsLater(){if(!FS.h)return;FS.dirty=true;clearTimeout(FS.t);FS.t=setTimeout(()=>fsSync('save'),800);}
function fsWatch(){
  clearInterval(FS.poll);
  FS.poll=setInterval(()=>{if(FS.h&&!document.hidden)fsSync('poll');},SYNC_MS);
}
/* lier un fichier (h = FileSystemFileHandle) — aussi utilisé par les tests avec un fichier OPFS */
async function fsAttach(h,known){
  FS.h=h;FS.mod=-1;FS.size=-1;FS.conflicts=0;FS.state='busy';
  let st=null;try{st=JSON.parse(localStorage.getItem(SYNC_KEY)||'null');}catch(e){}
  FS.base=known&&st&&st.base&&typeof st.base==='object'?st.base:null;   // fichier déjà lié ici avant : on reprend la dernière synchro
  try{await idbSet('handle',h);}catch(e){}
  fsUi('busy');await fsSync('link');fsWatch();
}
async function fsLink(){
  if(!FS.ok){
    const m='Ton navigateur (Firefox, Safari, ou un mobile) ne sait pas lier un fichier du disque. Pour passer tes notes d\'un appareil à l\'autre : '+
      '« Sauvegarde » ici, mets le fichier sur ton OneDrive / Google Drive, puis « Restaurer » sur l\'autre appareil (les notes sont fusionnées, rien n\'est écrasé). '+
      'La synchro automatique par fichier marche dans Chrome ou Edge sur ordinateur.';
    if(typeof CTX!=='undefined'&&CTX.message)CTX.message('Synchro par fichier indisponible',m);else alert(m);
    return;
  }
  if(FS.h){FS.h=null;clearInterval(FS.poll);await idbSet('handle',null);try{localStorage.removeItem(SYNC_KEY);}catch(e){}fsUi('off');toast('Fichier délié');return;}
  try{
    const h=await showSaveFilePicker({suggestedName:'carnet-averse.json',types:[{description:'Carnet AVERSE',accept:{'application/json':['.json']}}]});
    try{localStorage.removeItem(SYNC_KEY);}catch(e){}
    await fsAttach(h,false);
    if(FS.state==='ok'||FS.state==='ext')toast('Fichier lié : synchro automatique');
  }catch(e){}
}
async function fsRestore(){
  if(!FS.ok)return;
  try{
    const h=await idbGet('handle');if(!h)return;
    if(await h.queryPermission({mode:'readwrite'})==='granted'){await fsAttach(h,true);return;}
    FS.name=h.name||'';fsUi('re');
    $('fileBtn').onclick=async()=>{                         // la permission se redemande sur un clic
      if(await h.requestPermission({mode:'readwrite'})==='granted'){$('fileBtn').onclick=fsLink;await fsAttach(h,true);}
    };
  }catch(e){}
}
addEventListener('focus',()=>{if(FS.h)fsSync('focus');});
document.addEventListener('visibilitychange',()=>{if(FS.h&&!document.hidden)fsSync('focus');});
/* v5 : ce dont la synchro Gist (cloud.js) a besoin, sans toucher aux variables du carnet */
window.notesApi={
  payload:()=>{const o=JSON.parse(fileText()),p={notes:o.notes,deleted:o.deleted};if(o.templates)p.templates=o.templates;
    /* v7 : clés d'API de l'IA — SEULEMENT ici (coffre Gist chiffré de bout en bout), jamais dans le fichier lié en clair (fileText) */
    const sec=window.AI&&AI.syncPart();if(sec)p.secrets={ai:sec};
    return p;},   // trié, sans l'état de l'appareil
  text:()=>JSON.stringify(window.notesApi.payload()),
  merge:(d,base)=>{const r=syncMerge(d,base);
    if(d.secrets&&d.secrets.ai&&window.AI)AI.syncReceive(d.secrets.ai);   // v7
    if(r.n){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(e){}renderAll();
      if(r.c)toast(r.c+' conflit(s) : les deux versions sont gardées (tag « conflit »)');}
    return r;},
  base:baseNow,count:()=>Object.keys(data.notes).length};
window.notesSync={attach:fsAttach,sync:fsSync,state:()=>FS.state,unlink:()=>{FS.h=null;clearInterval(FS.poll);fsUi('off');},
  status:()=>{const s=$('syncState');return s?s.textContent:'';},setPoll:ms=>{clearInterval(FS.poll);FS.poll=setInterval(()=>{if(FS.h&&!document.hidden)fsSync('poll');},ms);}};

/* ===== VUES ===== */
function setView(v){
  view=v;
  $$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.v===v));
  const g=$('graphWrap');
  if(v==='graph'){g.classList.add('on');startGraph();}
  else{g.classList.remove('on');stopGraph();}
}

/* ===== GRAPHE : voir notes-graph.js (v5) ===== */

/* ===== RENDU GLOBAL ===== */
function renderAll(){renderList();renderTags();renderEditor();if(view==='graph')startGraph();}

/* ===== ÉVÉNEMENTS ===== */
function wire(){
  $('search').oninput=e=>{query=e.target.value;renderList();};
  $('newBtn').onclick=()=>{const v=$('tplSel').value;newNote(null,v);$('tplSel').value='';};
  $('titleIn').oninput=()=>{liveSave();renderList();};
  $('tagsIn').oninput=()=>{liveSave();renderTags();};
  $('bodyIn').oninput=()=>{liveSave();livePreview();};
  $('delBtn').onclick=delNote;
  $('exportBtn').onclick=exportJSON;
  $('mdBtn').onclick=exportMd;
  $('pdfBtn').onclick=printNote;
  $('bakOut').onclick=()=>{save();BACKUP.download();};
  $('bakIn').onclick=()=>$('bakFile').click();
  $('bakFile').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;save();
    const r=await BACKUP.importFile(f);if(r.ok){data=load()||data;renderAll();}};
  $('fileBtn').onclick=fsLink;
  if(!FS.ok){$('fileBtn').title='Synchro par fichier : Chrome / Edge sur ordinateur. Ici : Sauvegarde / Restaurer.';$('fileBtn').classList.add('off');}
  $('importBtn').onclick=()=>$('importFile').click();
  $('importFile').onchange=e=>{if(e.target.files[0])importJSON(e.target.files[0]);e.target.value='';};
    $$('.seg button').forEach(b=>b.onclick=()=>setView(b.dataset.v));
  $('menuBtn').onclick=()=>$('side').classList.toggle('open');

  // liste + tags + rétroliens (délégation)
  $('list').onclick=e=>{const it=e.target.closest('[data-id]');if(it){openNote(it.dataset.id);if(innerWidth<=820)$('side').classList.remove('open');}};
  $('tagbar').onclick=e=>{const c=e.target.closest('[data-tag]');if(c){tagFilter=tagFilter===c.dataset.tag?null:c.dataset.tag;renderTags();renderList();}};
  $('backlinks').onclick=e=>{const a=e.target.closest('[data-id]');if(a)openNote(a.dataset.id);};
  // cases à cocher : cocher dans l'aperçu modifie le texte de la note
  $('preview').addEventListener('change',e=>{const c=e.target.closest('input[data-ln]');if(!c)return;
    const n=data.notes[data.openId];if(!n)return;
    const L=n.body.replace(/\r/g,'').split('\n'),k=+c.dataset.ln;
    L[k]=L[k].replace(/\[( |x|X)?\]/,c.checked?'[x]':'[ ]');
    n.body=L.join('\n');n.updated=now();$('bodyIn').value=n.body;save();});
  // clic sur les [[liens]] du rendu
  $('preview').onclick=e=>{const a=e.target.closest('a.wl');if(!a)return;e.preventDefault();
    const t=a.dataset.title,tg=byTitle(t);if(tg)openNote(tg.id);else newNote(t);};

  // onglets écrire/aperçu (mobile)
  $$('.panes-tabs button').forEach(b=>b.onclick=()=>{
    $$('.panes-tabs button').forEach(x=>x.classList.toggle('active',x===b));
    $('paneWrite').classList.toggle('shown',b.dataset.p==='write');
    $('panePrev').classList.toggle('shown',b.dataset.p==='prev');});

  graphWire();                                              // graphe : souris, doigts, légende (notes-graph.js)
}
/* ===== CLIC DROIT SUR UNE NOTE (ctxmenu.js) : liste, rétroliens, nœud du graphe ===== */
const NOTE_OPS={
  get:id=>data.notes[id],
  open:id=>openNoteFromGraph({id}),
  save:(id,x)=>{const n=sanitizeNote(x);if(!n||!data.notes[id])return;data.notes[id]=n;save();renderAll();},
  duplicate:id=>{const n=data.notes[id];if(!n)return;const nid=uid();
    data.notes[nid]=Object.assign({},n,{id:nid,title:(n.title||'Sans titre')+' (copie)',tags:(n.tags||[]).slice(),created:now(),updated:now(),pinned:false});
    data.openId=nid;save();renderAll();},
  remove:id=>{if(!data.notes[id])return;(data.deleted||(data.deleted={}))[id]=now();delete data.notes[id];
    if(data.openId===id)data.openId=allNotes().sort((a,b)=>b.updated-a.updated)[0]?.id||null;save();renderAll();toast('Note supprimée');},
  pdf:id=>{openNoteFromGraph({id});printNote();}
};
if(typeof CTX!=='undefined')CTX.add((t,e)=>{
  let id=null;
  const it=t.closest('#list [data-id], #backlinks [data-id]');
  if(it)id=it.dataset.id;
  else if(t.id==='graph'&&view==='graph'){const r=t.getBoundingClientRect(),n=nodeAt(e.clientX-r.left,e.clientY-r.top);if(n)id=n.id;}
  if(!id||!data.notes[id])return null;
  const items=CTX.noteItems(id,NOTE_OPS);
  if(t.id==='graph')items.splice(1,0,graphGroupItems(id));    // v5 : sur un nœud, « Groupe… » (groupes manuels)
  return{items,title:data.notes[id].title||'Sans titre'};
},5);
/* une note ajoutée ailleurs (clic droit → « Ajouter au carnet ») : on relit le stockage avant d'écraser */
/* v5 : accès pour tests.html (les const/let ne sont pas sur window, et la page interdit eval : CSP) */
window.notesDebug={get data(){return data;},get acc(){return ACC.hex;},FS,G,step,tick,get settings(){return GS;},groupOf:id=>groupOf(data.notes[id]),
  styleOf:id=>styleOfGroup(groupOf(data.notes[id])),zoomAt,fit:()=>{fitGraph();redraw();},draw,setFocus:id=>setFocus(G.nodes.find(n=>n.id===id))};
window.notesReloadFromStorage=()=>{const d=load();if(d&&mergeNotes(d))renderAll();};

function openNoteFromGraph(n){if(G.focus)setFocus(null);setView('editor');$$('.seg button').forEach(b=>b.classList.toggle('active',b.dataset.v==='editor'));openNote(n.id);}

/* ===== INIT ===== */
(function init(){
  const d=load();if(d){data=d;}else{seed();}
  /* pierres tombales : on les garde 90 jours (largement assez pour que tous les onglets soient à jour) */
  data.deleted=data.deleted&&typeof data.deleted==='object'?data.deleted:{};
  Object.keys(data.deleted).forEach(id=>{if(now()-data.deleted[id]>90*864e5)delete data.deleted[id];});
  if(!data.openId)data.openId=allNotes().sort((a,b)=>b.updated-a.updated)[0]?.id||null;
  G.canvas=$('graph');G.ctx=G.canvas.getContext('2d');
  const hh=location.hash.slice(1);if(hh&&data.notes[hh])data.openId=hh;
  wire();renderAll();fsRestore();
  if(/[?&]print=1/.test(location.search)){history.replaceState(null,'',location.pathname+location.hash);setTimeout(printNote,300);}   // « Exporter PDF » depuis le panneau
  addEventListener('storage',e=>{if(e.key!==KEY||!e.newValue)return;if(!sessionStorage.getItem('averse-tests')&&localStorage.getItem('averse-tests-backup'))return;   // v5 : tests.html tourne dans un autre onglet → on n'avale pas ses notes de test
  try{const d=JSON.parse(e.newValue);if(mergeNotes(d))renderAll();}catch(x){}});
})();