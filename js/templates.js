/* templates.js — v6 : les MODÈLES de note (ceux d'AVERSE + les tiens).
   - Tes modèles : localStorage « averse-tpl » = {items:{id:{id,name,title,tags,body,created,updated}}, deleted:{id:date}}
     (même logique que les notes : la version la plus récente gagne, « pierre tombale » pour une suppression).
   - Ils voyagent avec les notes : Sauvegarde (backup.js), fichier lié et synchro Gist (notes.js → notesApi).
   - Variables remplacées à la création de la note : {{date}} {{heure}} {{jour}} {{année}} {{titre}}
     ({{titre}} = le titre final de la note, utile dans le corps). Une variable inconnue reste telle quelle.
   Tout ce qui est lu (stockage, sauvegarde, synchro) est revérifié par clean() : textes bornés, ids sûrs. */
const TPL=(function(){
const KEY='averse-tpl',RE_ID=/^[\w-]{1,48}$/,BAD=/^(__proto__|constructor|prototype)$/;
/* modèles fournis (non modifiables, mais on peut les copier : « Dupliquer en mon modèle ») */
const BUILTIN=[
  {id:'tp',name:'Compte-rendu de TP',title:'TP — ',tags:['tp'],body:'## Objectif\n\n## Matériel et logiciels\n- \n\n## Manipulations\n1. \n2. \n\n## Résultats\n\n## Conclusion\n'},
  {id:'cours',name:'Fiche de cours',title:'Cours — ',tags:['cours'],body:'## L\'essentiel\n\n## Définitions\n- **terme** : \n\n## Exemple\n```\n\n```\n\n## À retenir pour le contrôle\n- [ ] \n'},
  {id:'stage',name:'Journal de stage',title:'Stage — {{date}}',tags:['stage'],body:'## Ce que j\'ai fait\n- \n\n## Ce que j\'ai appris\n- \n\n## Difficultés\n- \n\n## À faire demain\n- [ ] \n'},
  {id:'adressage',name:'Plan d\'adressage',title:'Plan d\'adressage — ',tags:['réseau'],body:'| Équipement | Interface | Adresse IP | Masque | Passerelle |\n|---|---|---|---|---|\n| R1 | g0/0 | 192.168.1.1 | 255.255.255.0 | — |\n| PC1 | eth0 | 192.168.1.10 | 255.255.255.0 | 192.168.1.1 |\n\n## Remarques\n'},
  {id:'incident',name:'Dépannage',title:'Dépannage — ',tags:['dépannage'],body:'## Symptôme\n\n## Hypothèses\n- [ ] \n\n## Tests effectués\n```\n\n```\n\n## Cause\n\n## Solution\n'},
  {id:'taches',name:'Liste de tâches',title:'À faire',tags:['tâches'],body:'- [ ] \n- [ ] \n- [ ] \n'}
];
const now=()=>Date.now();
const str=(v,n)=>typeof v==='string'?v.slice(0,n):'';
/* un modèle venu de l'extérieur → modèle propre, ou null */
function clean(t){
  if(!t||typeof t!=='object'||typeof t.id!=='string'||!RE_ID.test(t.id)||BAD.test(t.id))return null;
  const n=now(),num=v=>(v=+v,isFinite(v)&&v>0?Math.min(v,n+864e5):0),updated=num(t.updated)||n;
  const name=str(t.name,80).trim();if(!name)return null;
  return{id:t.id,name,title:str(t.title,300),body:str(t.body,200000),
    tags:Array.isArray(t.tags)?t.tags.filter(x=>typeof x==='string').map(x=>x.slice(0,60)).slice(0,20):[],
    created:num(t.created)||updated,updated};
}
function read(){
  const d=getLS(KEY,null),o={items:Object.create(null),deleted:Object.create(null)};
  if(d&&typeof d==='object'){
    if(d.items&&typeof d.items==='object')Object.keys(d.items).forEach(k=>{const t=clean(d.items[k]);if(t&&t.id===k)o.items[k]=t;});
    if(d.deleted&&typeof d.deleted==='object')Object.keys(d.deleted).forEach(k=>{const v=+d.deleted[k];if(RE_ID.test(k)&&!BAD.test(k)&&isFinite(v)&&v>0)o.deleted[k]=v;});
  }
  return o;
}
let onChange=null;
function write(o,silent){setLS(KEY,{items:o.items,deleted:o.deleted});if(!silent&&onChange)try{onChange();}catch(e){}}
const list=()=>Object.values(read().items).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
const get=id=>read().items[id]||null;
const builtin=id=>BUILTIN.find(b=>b.id===id)||null;
/* créer / modifier (renvoie le modèle enregistré) */
function save(t){
  const o=read(),old=t.id&&o.items[t.id];
  const id=old?t.id:'t'+now().toString(36)+Math.random().toString(36).slice(2,6);
  const c=clean(Object.assign({},t,{id,created:old?old.created:now(),updated:Math.max(now(),old?old.updated+1:0)}));
  if(!c)return null;
  o.items[id]=c;delete o.deleted[id];write(o);return c;
}
function remove(id){const o=read();if(!o.items[id])return false;delete o.items[id];o.deleted[id]=now();write(o);return true;}
/* pour la synchro : trié (le même texte sur tous les appareils), pierres tombales de moins de 90 jours */
function payload(){
  const o=read(),items={},deleted={},old=now()-90*864e5;
  Object.keys(o.items).sort().forEach(k=>{items[k]=o.items[k];});
  Object.keys(o.deleted).sort().forEach(k=>{if(o.deleted[k]>old)deleted[k]=o.deleted[k];});
  return{items,deleted};
}
/* fusion d'une liste venue d'ailleurs ; renvoie le nombre de changements */
function merge(d){
  if(!d||typeof d!=='object')return 0;
  const o=read();let n=0;
  if(d.deleted&&typeof d.deleted==='object')Object.keys(d.deleted).forEach(k=>{const v=Math.min(+d.deleted[k],now());
    if(!RE_ID.test(k)||BAD.test(k)||!isFinite(v)||v<=0)return;if(v>(o.deleted[k]||0))o.deleted[k]=v;});
  if(d.items&&typeof d.items==='object')Object.keys(d.items).slice(0,500).forEach(k=>{const t=clean(d.items[k]);if(!t||t.id!==k)return;
    if((o.deleted[k]||0)>=t.updated)return;                  // supprimé depuis : il ne revient pas
    const l=o.items[k];if(!l||t.updated>l.updated){o.items[k]=t;n++;}});
  Object.keys(o.deleted).forEach(k=>{const l=o.items[k];if(l&&l.updated<=o.deleted[k]){delete o.items[k];n++;}});
  if(n||d.deleted)write(o,true);
  return n;
}
/* remplace les variables ; when = date de création (tests) */
function fill(s,vars){
  return String(s||'').replace(/\{\{\s*([a-zéèû]+)\s*\}\}/gi,(m,k)=>{
    k=k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return Object.prototype.hasOwnProperty.call(vars,k)?vars[k]:m;});
}
function expand(t,when){
  const d=when?new Date(when):new Date();
  const vars={date:d.toLocaleDateString('fr-FR'),heure:d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}),
    jour:d.toLocaleDateString('fr-FR',{weekday:'long'}),annee:String(d.getFullYear())};
  const title=fill(t.title,vars).slice(0,300)||'Sans titre';
  vars.titre=title;
  return{title,body:fill(t.body,vars),tags:(t.tags||[]).slice()};
}
const VARS=[['{{date}}','date du jour (24/10/2026)'],['{{heure}}','heure (14:05)'],['{{jour}}','jour de la semaine'],['{{année}}','année'],['{{titre}}','titre de la note']];
return{KEY,BUILTIN,builtin,clean,read,list,get,save,remove,payload,merge,expand,VARS,set onChange(f){onChange=f;}};
})();
window.TPL=TPL;   // accessible aussi comme propriété de window (tests du carnet : la CSP y interdit eval)
