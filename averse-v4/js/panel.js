/* panel.js — le carnet en panneau latéral, disponible partout avec Ctrl+J (ou ⌘+J sur Mac).
   Lit et écrit directement le même stockage que notes.html (clé noxe-notes) :
   à chaque modification on relit le stockage, on change UNE note, on réécrit (pas d'écrasement des autres onglets).
   Une note supprimée ici laisse une « pierre tombale » (deleted) pour que notes.html ne la ressuscite pas. */
(function(){
const KEY='noxe-notes';
const read=()=>{const d=getLS(KEY,null);return d&&d.notes?d:{notes:{},openId:null};};
const uid=()=>'n_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
let box=null,body=null,editing=null,query='',timer=null;

function build(){
  box=document.createElement('aside');box.id='notePanel';box.className='npanel';
  box.setAttribute('aria-label','Carnet');box.hidden=true;
  box.innerHTML='<div class="np-head"><b>Carnet</b><span class="np-keys">Ctrl+J · Échap</span><button class="np-x" aria-label="Fermer le panneau">✕</button></div><div class="np-body" id="npBody"></div>';
  document.body.appendChild(box);
  body=box.querySelector('.np-body');
  box.querySelector('.np-x').onclick=close;
}
const snippet=n=>(n.body||'').replace(/[#>*`\[\]_-]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80);

function list(){
  editing=null;
  const d=read(),q=query.toLowerCase();
  const notes=Object.values(d.notes).filter(n=>!q||((n.title||'')+' '+(n.body||'')+' '+(n.tags||[]).join(' ')).toLowerCase().includes(q))
    .sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||(b.updated||0)-(a.updated||0));   // épinglées d'abord
  body.innerHTML='<div class="np-tools"><input type="search" id="npQ" placeholder="Chercher une note…" value="'+esc(query)+'"><button class="btn primary" id="npNew">+ Note</button></div>'+
    '<div class="np-list">'+notes.slice(0,60).map(n=>'<button class="np-item" data-id="'+esc(n.id)+'"><b>'+(n.pinned?'◆ ':'')+esc(n.title||'Sans titre')+'</b><small>'+esc(snippet(n))+'</small></button>').join('')+
    (notes.length?'':'<p class="np-none">'+(q?'Aucune note ne correspond.':'Aucune note pour l\'instant.')+'</p>')+'</div>'+
    '<a class="np-link" href="notes.html">Ouvrir le carnet complet ↗</a>';
  const qi=$('npQ');
  qi.oninput=()=>{query=qi.value;const pos=qi.selectionStart;list();const n=$('npQ');n.focus();n.setSelectionRange(pos,pos);};
  qi.onkeydown=e=>{if(e.key==='Enter'){const f=body.querySelector('.np-item');if(f)edit(f.dataset.id);}};
  $('npNew').onclick=create;
  body.querySelector('.np-list').onclick=e=>{const b=e.target.closest('[data-id]');if(b)edit(b.dataset.id);};
}
function create(){
  const d=read(),id=uid(),t=Date.now();
  d.notes[id]={id,title:'Sans titre',tags:[],created:t,updated:t,body:''};
  setLS(KEY,d);edit(id);$('npT').select();
}
function edit(id){
  const n=read().notes[id];if(!n){list();return;}
  editing=id;
  body.innerHTML='<div class="np-tools"><button class="btn ghost" id="npBack">← Notes</button><a class="btn ghost" href="notes.html#'+encodeURIComponent(id)+'">Carnet ↗</a><button class="btn ghost" id="npDel">Supprimer</button></div>'+
    '<input class="np-title" id="npT" value="'+esc(n.title)+'" aria-label="Titre"><textarea class="np-text" id="npB" aria-label="Contenu (Markdown)" spellcheck="true">'+esc(n.body)+'</textarea>'+
    '<div class="np-st" id="npSt">Enregistré automatiquement</div>';
  $('npBack').onclick=list;
  $('npDel').onclick=()=>{
    if(!confirm('Supprimer « '+($('npT').value||'Sans titre')+' » ? Cette action est définitive.'))return;
    const d=read();delete d.notes[id];(d.deleted||(d.deleted={}))[id]=Date.now();
    if(d.openId===id)d.openId=null;
    setLS(KEY,d);toast('Note supprimée');list();
  };
  const later=()=>{$('npSt').textContent='…';clearTimeout(timer);timer=setTimeout(saveNow,300);};
  $('npT').oninput=later;$('npB').oninput=later;
  $('npB').focus();
}
function saveNow(){
  clearTimeout(timer);timer=null;
  if(!editing||!$('npT'))return;
  const d=read(),n=d.notes[editing];
  if(!n){toast('Cette note a été supprimée dans un autre onglet');list();return;}
  n.title=$('npT').value;n.body=$('npB').value;n.updated=Date.now();
  $('npSt').textContent=setLS(KEY,d)?'Enregistré':'⚠ Stockage plein : non enregistré';
}

function open(id){
  if(!box)build();
  box.hidden=false;document.body.classList.add('np-on');
  if(id)edit(id);else if(editing)edit(editing);else{list();$('npQ').focus();}
}
function close(){
  if(!box||box.hidden)return;
  if(timer)saveNow();
  box.hidden=true;document.body.classList.remove('np-on');
}
const isOpen=()=>!!box&&!box.hidden;
window.notePanel={open,close,toggle:()=>isOpen()?close():open(),isOpen};
const refresh=()=>{if(isOpen()&&!editing)list();};
window.notePanel.refresh=refresh;
if(typeof NOXE!=='undefined')NOXE.notesChanged=refresh;

addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&e.key.toLowerCase()==='j'){e.preventDefault();notePanel.toggle();return;}
  if(e.key==='Escape'&&isOpen()){e.preventDefault();e.stopPropagation();close();}
},true);                                                   // phase de capture : Échap ferme le panneau avant de quitter l'outil
/* un autre onglet a modifié le carnet : on met la liste à jour (sauf pendant qu'on écrit) */
addEventListener('storage',e=>{
  if(e.key!==KEY||!isOpen())return;
  if(!editing)list();
  else if(!read().notes[editing]){toast('Cette note a été supprimée dans un autre onglet');list();}
});
addEventListener('beforeunload',()=>{if(timer)saveNow();});
})();
