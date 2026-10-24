/* core.js — trois petites fonctions partagées par toutes les pages */

const $=id=>document.getElementById(id);
const $$=sel=>document.querySelectorAll(sel);
/* échappe le HTML ; l'apostrophe aussi (v4), pour les attributs écrits entre '…' */
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* message temporaire en bas de l'écran */
let _toastTimer;
function toast(msg){
  let t=$('toast');
  if(!t){
    t=document.createElement('div');t.id='toast';t.className='toast';
    t.setAttribute('role','status');t.setAttribute('aria-live','polite');
    document.body.appendChild(t);
  }
  t.textContent=msg;t.classList.add('on');
  clearTimeout(_toastTimer);_toastTimer=setTimeout(()=>t.classList.remove('on'),1800);
}

/* copier dans le presse-papiers (avec repli si l'API n'est pas disponible) */
function copy(text,label){
  const ok=()=>toast(label||'Copié');
  const fallback=()=>{
    const a=document.createElement('textarea');a.value=text;a.style.cssText='position:fixed;opacity:0';
    document.body.appendChild(a);a.select();
    let done=false;try{done=document.execCommand('copy');}catch(e){}
    a.remove();done?ok():toast('Copie impossible');
  };
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(ok,fallback);
  else fallback();
}

/* v5 — tests.html tourne sur le même site que tes vraies notes : avant de commencer il range une copie de tout le
   localStorage dans « averse-tests-backup ». Si la page de tests est fermée en plein milieu (téléphone, onglet fermé…),
   la page suivante remet cette copie en place : tes notes ne restent jamais remplacées par les notes de test. */
(function(){try{
  if(sessionStorage.getItem('averse-tests')||!localStorage.getItem('averse-tests-backup'))return;
  const o=JSON.parse(localStorage.getItem('averse-tests-backup'));localStorage.clear();
  for(const k in o)if(k!=='averse-tests-backup')localStorage.setItem(k,o[k]);
}catch(e){}})();
/* IndexedDB : base séparée pendant les tests (le fichier lié / la clé de synchro de l'appareil ne sont jamais touchés) */
const IDB_NAME=(()=>{try{return sessionStorage.getItem('averse-tests')?'averse-tests':'averse';}catch(e){return 'averse';}})();

/* petite mémoire locale : lire / écrire du JSON sans planter (navigation privée, quota plein…) */
function getLS(k,def){try{const v=localStorage.getItem(k);return v==null?def:JSON.parse(v);}catch(e){return def;}}
function setLS(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch(e){return false;}}

/* une note venue de l'extérieur (import, sauvegarde, fichier lié, autre onglet) : on ne garde que des champs propres.
   Renvoie une note neuve ou null si elle est invalide. Le rendu échappe de toute façon le texte (pas de HTML brut). */
function sanitizeNote(n){
  if(!n||typeof n!=='object'||typeof n.id!=='string'||!/^[\w-]{1,64}$/.test(n.id)||/^(__proto__|constructor|prototype)$/.test(n.id)||n.title==null||typeof n.title==='object')return null;
  const t=Date.now(),num=v=>(v=+v,isFinite(v)&&v>0?Math.min(v,t+864e5):0);   // pas de date dans le futur lointain (elle gagnerait toujours)
  const updated=num(n.updated)||t;
  return{id:n.id,title:String(n.title).slice(0,300),body:typeof n.body==='string'?n.body.slice(0,1e6):String(n.body==null?'':n.body).slice(0,1e6),
    tags:Array.isArray(n.tags)?n.tags.filter(x=>typeof x==='string'||typeof x==='number').map(x=>String(x).slice(0,60)).slice(0,40):[],
    created:num(n.created)||updated,updated,pinned:n.pinned===true};
}

/* ajouter une note au carnet depuis n'importe quelle page (même stockage que notes.js) ; renvoie l'id */
function addToNotebook(title,body,tags){
  const KEY='noxe-notes';let d={notes:{},openId:null};
  try{const s=localStorage.getItem(KEY);if(s){const j=JSON.parse(s);if(j&&j.notes)d=j;}}catch(e){}
  const id='n_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),t=Date.now();
  d.notes[id]={id,title,tags:tags||[],created:t,updated:t,body};
  d.openId=id;
  localStorage.setItem(KEY,JSON.stringify(d));
  return id;
}

/* style : « ascii » par défaut, « normal » en option (mémorisé ; ?style=normal ou ?style=ascii dans l'adresse) */
(function(){
  let st='ascii';
  try{
    const q=/[?&]style=(\w+)/.exec(location.search);
    if(q)localStorage.setItem('averse-style',q[1]==='normal'?'normal':'ascii');
    if(localStorage.getItem('averse-style')==='normal')st='normal';
  }catch(e){}
  if(st==='ascii')document.documentElement.dataset.style='ascii';
})();
function toggleStyle(){
  const on=document.documentElement.dataset.style==='ascii';
  if(on)delete document.documentElement.dataset.style;else document.documentElement.dataset.style='ascii';
  try{localStorage.setItem('averse-style',on?'normal':'ascii');}catch(e){}
  document.querySelectorAll('[data-style-label]').forEach(e=>e.textContent=on?'style : normal':'style : ascii');
  return !on;
}
addEventListener('DOMContentLoaded',()=>{
  const on=document.documentElement.dataset.style==='ascii';
  document.querySelectorAll('[data-style-label]').forEach(e=>e.textContent=on?'style : ascii':'style : normal');
});
