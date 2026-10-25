/* home.js — v9 : l'accueil sans grille d'outils. Au centre, un GRAND Glyph (l'assistant) toujours un peu vivant.
   - clic / tap sur le Glyph, « / », Ctrl+K, ou commencer à taper → la barre de recherche apparaît (le Glyph se réduit au-dessus) ;
   - barre ouverte et vide → la liste complète des outils (favoris, récents, familles + « Autres outils ») ;
   - Échap, ou barre vide quand on la quitte → retour au Glyph seul ;
   - un fichier qui survole la page → le Glyph « aspire » ; au dépôt, app.js choisit l'outil (PDF, image, JSON…) ;
   - pendant la frappe, le motif du Glyph suit l'intention détectée (PDF, image, code, note, synchro, IA…).
   Une seule boucle d'animation (glyph.js), arrêtée quand l'onglet est caché ou quand l'accueil n'est pas affiché. */
(function(){
const hv=document.getElementById('homeView'),btn=document.getElementById('homeGlyph'),q=document.getElementById('q');
if(!hv||!btn||!q||typeof GLYPH==='undefined')return;
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const g=GLYPH.create({size:240,smooth:true,pause:true});g.el.setAttribute('aria-hidden','true');g.el.removeAttribute('role');
btn.appendChild(g.el);
let isOpen=false,hold=0,holdT=0,dragN=0;

/* ---------- l'intention : quel motif pour ce qui est tapé ? ---------- */
const BY_KEY={pdfoutils:'pdf',pdf:'pdf',optimiser:'image',convertir:'image',editeur:'image',ocr:'ocr',
  json:'code',regex:'code',jwt:'code',base64:'code',url:'code',encodage:'code',uuid:'code',diff:'conflict',
  carnet:'note',memo:'note',sauvegarde:'sync'};
function intent(v){
  const t=norm(v).trim();if(!t)return'alive';
  if(/^\?|\?$/.test(t))return'think';                        // une question → l'IA réfléchit
  if(/\b(synchro|sync|gist|appareil)/.test(t))return'sync';
  if(/\bconflit/.test(t))return'conflict';
  if(/\b(photo|scan|ocr)/.test(t))return'ocr';
  if(/\b(note|carnet|ecrire|memo)/.test(t))return'note';
  const r=(NOXE.search?NOXE.search(v):[])[0];
  if(r&&r.type==='tool'&&BY_KEY[r.key])return BY_KEY[r.key];
  if(r&&(r.type==='note'||r.type==='memo'))return'note';
  return'search';
}
/* motif pour un fichier (survol, dépôt, collage) */
function fileMotif(files){
  const f=files[0];if(!f)return'absorb';
  if(f.type==='application/pdf'||/\.pdf$/i.test(f.name||''))return'pdf';
  if(/^image\//.test(f.type))return'image';
  if(/json/.test(f.type)||/\.json$/i.test(f.name||''))return'code';
  if(/^text\//.test(f.type)||/\.(txt|md|csv|log)$/i.test(f.name||''))return'note';
  return'absorb';
}
function apply(m){if(g.state()!==m)g.set(m);hv.dataset.motif=m;}
function mood(){if(Date.now()<hold)return;apply(isOpen?intent(q.value):'alive');}
/* un motif d'action, gardé un moment puis retour à l'intention */
function flash(m,ms){hold=Date.now()+(ms||1400);clearTimeout(holdT);apply(m);holdT=setTimeout(()=>{hold=0;mood();},ms||1400);}

/* ---------- ouvrir / refermer la barre ---------- */
function setOpen(v,focus){
  if(v!==isOpen){isOpen=v;hv.dataset.home=v?'open':'rest';btn.setAttribute('aria-expanded',String(v));
    if(v&&NOXE.refreshHome)NOXE.refreshHome();}               // barre vide → la liste des outils (app.js)
  if(v&&focus&&document.activeElement!==q)q.focus({preventScroll:true});
  mood();
}
function rest(focusGlyph){
  if(q.value.trim())return;
  setOpen(false);
  if(focusGlyph&&!hv.hidden)btn.focus({preventScroll:true});
}
NOXE.homeOpen=()=>setOpen(true);
/* retour sur l'accueil (chargement, fin d'un outil) : le Glyph seul — sauf si on est déjà en train d'utiliser la barre */
NOXE.homeIdle=()=>{if(document.activeElement===q||q.value.trim())return;setOpen(false);};
NOXE.homeState=()=>({open:isOpen,motif:g.state()});
NOXE.homeGlyph=g;

btn.addEventListener('click',()=>setOpen(true,true));
document.getElementById('homeAll').addEventListener('click',()=>{q.value='';setOpen(true,true);});
q.addEventListener('focus',()=>setOpen(true));
q.addEventListener('input',()=>{if(q.value.trim()&&!isOpen)setOpen(true);else mood();});   // du texte dans la barre → elle est visible
/* Échap (app.js vide d'abord le champ) → le Glyph seul */
q.addEventListener('keydown',e=>{if(e.key==='Escape')setTimeout(()=>rest(true),0);});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||e.defaultPrevented||hv.hidden||!isOpen||(NOXE.current&&NOXE.current()))return;
  if(document.querySelector('.ctx-ov,.modal-overlay,.ai-ov,.pal'))return;   // une fenêtre ouverte passe avant
  if(document.activeElement===q)return;                      // le champ a son propre Échap (ci-dessus)
  e.preventDefault();q.value='';q.dispatchEvent(new Event('input'));rest(true);
});
/* on quitte la barre vide (clic ailleurs) → retour au repos */
hv.addEventListener('focusout',()=>setTimeout(()=>{
  const a=document.activeElement;
  if(isOpen&&!q.value.trim()&&(!a||a===document.body)&&document.getElementById('suggest').hidden)rest(false);},120));
document.addEventListener('pointerdown',e=>{
  if(isOpen&&!q.value.trim()&&!hv.hidden&&!e.target.closest('.search-hero,#results,#homeBlocks,#suggest,#homeGlyph,.home-hint,nav,.ai-ov,.ctx-ov,.modal-overlay'))
    setTimeout(()=>{if(document.getElementById('suggest').hidden)rest(false);},0);
});

/* ---------- glisser un fichier : le Glyph aspire ; au dépôt, motif du type puis app.js ouvre / propose l'outil ---------- */
const hasFiles=e=>e.dataTransfer&&[...e.dataTransfer.types].includes('Files');
const onHome=()=>!hv.hidden&&!(NOXE.current&&NOXE.current());
addEventListener('dragenter',e=>{if(!hasFiles(e)||!onHome())return;dragN++;hv.classList.add('h-drag');hold=Date.now()+6e4;apply('absorb');});
addEventListener('dragleave',e=>{if(!hasFiles(e)||!onHome())return;if(--dragN<=0){dragN=0;hv.classList.remove('h-drag');hold=0;mood();}});
addEventListener('drop',e=>{
  dragN=0;if(!hv.classList.contains('h-drag')&&!onHome())return;hv.classList.remove('h-drag');
  if(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files.length)flash(fileMotif([...e.dataTransfer.files]),1600);else{hold=0;mood();}
},true);                                                      // en capture : avant app.js qui peut ouvrir l'outil tout de suite
/* coller : même réaction (app.js s'occupe des suggestions) */
document.addEventListener('paste',e=>{
  if(!onHome())return;const cd=e.clipboardData;if(!cd)return;const files=[...(cd.files||[])];
  if(files.length){flash(fileMotif(files),1600);return;}
  const t=cd.getData('text/plain');if(!t||!NOXE.detect)return;const f=NOXE.detect(t)[0];
  if(f)flash(BY_KEY[f.key]||'code',1600);
},true);

/* ---------- l'accueil réapparaît (retour d'un outil) → l'animation repart ---------- */
if('IntersectionObserver' in window)new IntersectionObserver(es=>{if(es.some(x=>x.isIntersecting))g.set(g.state());}).observe(btn);
addEventListener('hashchange',()=>setTimeout(()=>{if(!hv.hidden)g.set(g.state());},0));
/* app.js a pu donner le focus à la barre avant le chargement de ce fichier : au repos, on le lui retire */
if(document.activeElement===q&&!q.value.trim())q.blur();else if(document.activeElement===q)setOpen(true);
mood();
})();
