/* share-view.js — v6 : page share.html, lecture d'une note partagée (voir share.js pour le format).
   Tout ce qui arrive du lien est NON FIABLE : décodé par SHARE.decode (format + tailles + JSON vérifiés),
   titre et tags affichés en textContent, corps rendu par md.js (tout est échappé, liens sûrs uniquement, [[liens]] en texte). */
(function(){
const $=id=>document.getElementById(id);
let note=null;
const MSG={format:'Ce lien est incomplet ou abîmé (il a peut-être été coupé par la messagerie). Demande le fichier .md à la place.',
  'clé':'Clé incorrecte, ou lien abîmé : impossible de déchiffrer.','trop gros':'Ce lien est trop gros pour être ouvert.',
  navigateur:'Ton navigateur est trop ancien pour décompresser cette note (il manque DecompressionStream). Essaie avec un navigateur à jour.'};
function state(t,bad){const s=$('svState');s.hidden=!t;s.textContent=t||'';s.classList.toggle('bad',!!bad);}
async function open(keyGiven){
  note=null;$('svNote').hidden=true;
  const h=location.hash;
  if(!h||h.length<3){state('Aucune note dans ce lien. Un lien de partage ressemble à …/share.html#n1.… (on le crée depuis le carnet : bouton « Partager »).');$('svKeyForm').hidden=true;return;}
  let p;try{p=SHARE.parse(h);}catch(e){state(MSG[e.message]||MSG.format,true);return;}
  if(!p.key&&!keyGiven){state('');$('svKeyForm').hidden=false;$('svKey').focus();return;}
  state('Déchiffrement…');
  try{note=await SHARE.decode(h,keyGiven);}
  catch(e){state(MSG[e.message]||MSG.format,true);if(!p.key){$('svKeyForm').hidden=false;$('svKey').select();}return;}
  $('svKeyForm').hidden=true;state('');show();
}
function show(){
  $('svTitle').textContent=note.t;
  document.title=note.t.slice(0,60)+' — note partagée · AVERSE';
  const tg=$('svTags');tg.textContent='';note.g.forEach(t=>{const s=document.createElement('span');s.className='sv-tag';s.textContent='#'+t;tg.appendChild(s);});
  $('svBody').innerHTML=MD.render(note.b,{nowiki:true,readonly:true,empty:'Note vide.'});
  if(typeof MATH!=='undefined')MATH.typeset($('svBody'));
  $('svSize').textContent=note.b.length.toLocaleString('fr-FR')+' caractères';
  $('svImport').disabled=false;$('svImport').textContent='Importer dans mon carnet';$('svOpen').hidden=true;
  $('svNote').hidden=false;
}
/* la note existe déjà (même titre ET même contenu) ? → on ne la duplique pas */
function already(){
  try{const d=JSON.parse(localStorage.getItem('noxe-notes')||'{}');
    return Object.values(d.notes||{}).find(n=>n&&n.title===note.t&&n.body===note.b)||null;}catch(e){return null;}
}
$('svImport').addEventListener('click',()=>{
  if(!note)return;
  const ex=already();
  if(ex){toast('Cette note est déjà dans ton carnet');}
  else{addToNotebook(note.t,note.b,note.g);toast('Note importée dans ton carnet');}
  $('svImport').disabled=true;$('svImport').textContent=ex?'Déjà dans ton carnet':'Importée ✓';$('svOpen').hidden=false;
});
$('svMd').addEventListener('click',()=>{
  if(!note)return;
  const txt='# '+note.t+'\n'+(note.g.length?'\nTags : '+note.g.map(x=>'#'+x).join(' ')+'\n':'')+'\n'+note.b;
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/markdown;charset=utf-8'}));
  a.download=(note.t.replace(/[\\/:*?"<>|#]+/g,' ').trim().slice(0,80)||'note')+'.md';document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
});
$('svKeyForm').addEventListener('submit',e=>{e.preventDefault();const k=$('svKey').value.trim();if(k)open(k);});
addEventListener('hashchange',()=>open());
open();
window.shareView={get note(){return note;},open};
})();
