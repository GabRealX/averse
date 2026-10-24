/* keys.js — les raccourcis clavier, sur toutes les pages (accueil + outils, carnet, à propos).
     /            → aller à la recherche
     ?            → afficher / masquer l'aide des raccourcis
     Ctrl+Entrée  → lancer / recalculer l'outil ouvert
     Ctrl+Maj+C   → copier le résultat principal de l'outil
     Échap        → revenir en arrière (fermer l'aide, le menu, l'outil…)
   Règle d'or : « / » et « ? » ne font RIEN quand on écrit dans un champ (sauf « ? » dans une recherche vide).
   À charger AVANT app.js : app.js ignore les touches déjà prises (e.defaultPrevented). */
(function(){
const mac=/Mac|iPhone|iPad/.test(navigator.platform||'');
const C=mac?'⌘':'Ctrl';
const editable=el=>!!el&&(el.isContentEditable||el.tagName==='TEXTAREA'||el.tagName==='SELECT'||
  el.tagName==='INPUT'&&!/^(checkbox|radio|button|range|file|submit|reset|color)$/i.test(el.type));
const page=$('q')?'index':$('bodyIn')?'notes':'autre';
const tool=()=>typeof NOXE!=='undefined'&&NOXE.current&&NOXE.current();

const LIST={
  index:[['Partout',[['/','aller à la recherche'],['?','cette aide'],[C+'|K','recherche (même dans un champ)'],[C+'|J','panneau de notes'],['clic droit','copier, envoyer, ajouter au carnet'],['Maj|clic droit','menu habituel du navigateur'],['Échap','revenir en arrière']]],
         ['Dans un outil',[[C+'|Entrée','lancer / recalculer'],[C+'|Maj|C','copier le résultat'],['→ Envoyer vers…','passer le résultat à un autre outil'],['Échap','retour à la recherche']]],
         ['Accueil',[['↑|↓','choisir un outil'],['Entrée','ouvrir'],[C+'|V','coller : AVERSE devine l\'outil']]]],
  notes:[['Carnet',[['/','chercher dans les notes'],['?','cette aide'],['clic droit','copier, envoyer vers un outil…'],['Échap','retour à l\'accueil (hors champ)']]]],
  autre:[['Partout',[['/','aller à la recherche'],['?','cette aide'],[C+'|J','panneau de notes'],['Échap','retour à l\'accueil']]]]
};

let box=null,before=null;
function open(){
  if(box)return;
  before=document.activeElement;
  box=document.createElement('div');box.className='keys-ov';box.id='keysHelp';
  box.innerHTML='<div class="keys-box" role="dialog" aria-modal="true" aria-labelledby="keysTitle">'+
    '<div class="keys-head"><h2 id="keysTitle">Raccourcis clavier</h2><button type="button" class="keys-x" aria-label="Fermer">✕</button></div>'+
    LIST[page].map(([t,rows])=>'<div class="keys-sec"><div class="keys-t">'+esc(t)+'</div>'+
      rows.map(([k,d])=>'<div class="keys-row"><span>'+k.split('|').map(x=>'<kbd>'+esc(x)+'</kbd>').join(' ')+'</span><span>'+esc(d)+'</span></div>').join('')+'</div>').join('')+
    '<p class="keys-foot">Échap ou ? pour fermer</p></div>';
  box.addEventListener('click',e=>{if(e.target===box||e.target.closest('.keys-x'))close();});
  document.body.appendChild(box);
  box.querySelector('.keys-x').focus();
}
function close(){
  if(!box)return;box.remove();box=null;
  if(before&&before.isConnected&&before.focus)before.focus();
}
window.keysHelp={open,close,isOpen:()=>!!box};

/* aller à la recherche, selon la page */
function toSearch(){
  if(page==='index'){
    if(tool())NOXE.close();
    else if(location.hash&&location.hash!=='#/')location.hash='#/';
    setTimeout(()=>{const q=$('q');q.focus();q.select();},0);
  }else if(page==='notes')$('search').focus();
  else location.href='index.html';
}

/* l'aide ouverte passe avant tout (phase de capture) : Échap / ? la ferment, Tab reste dedans */
addEventListener('keydown',e=>{
  if(!box)return;
  if(e.key==='Escape'||e.key==='?'){e.preventDefault();e.stopImmediatePropagation();close();}
  else if(e.key==='Tab'){e.preventDefault();box.querySelector('.keys-x').focus();}
},true);

addEventListener('keydown',e=>{
  if(e.defaultPrevented||e.altKey||e.isComposing)return;
  const t=e.target,inField=editable(t),mod=e.ctrlKey||e.metaKey;
  if(e.key==='?'&&!mod&&(!inField||(t.id==='q'||t.id==='search')&&!t.value)){e.preventDefault();open();return;}
  if(e.key==='/'&&!mod&&!inField){e.preventDefault();toSearch();return;}
  if(mod&&!e.shiftKey&&e.key==='Enter'&&tool()){e.preventDefault();NOXE.runMain();return;}
  if(mod&&e.shiftKey&&e.key.toLowerCase()==='c'&&tool()){e.preventDefault();NOXE.copyMain();return;}
  /* Échap hors outil, sur le carnet / à propos : retour à l'accueil (jamais quand une fenêtre est ouverte ou qu'on écrit) */
  if(e.key==='Escape'&&page!=='index'&&!inField&&!document.querySelector('[aria-modal="true"],.modal-overlay')){
    e.preventDefault();location.href='index.html';
  }
});
document.addEventListener('click',e=>{const a=e.target.closest('[data-keys-help]');if(a){e.preventDefault();open();}});
})();
