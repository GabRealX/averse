/* accent.js — v6 : la COULEUR D'ACCENT du site (le violet par défaut) : rouge, bleu, vert… ou une couleur au choix.
   Même principe qu'au temps de NOXE : le site n'a qu'une teinte (--fg) et tout le reste en dérive (opacités de --acc-rgb).
   Il suffit donc de changer DEUX variables CSS sur <html> pour recolorer tout : boutons, liens, bordures, sélection,
   style ASCII, graphe (notes.js relit la teinte), pluie (rainSetColor), et la couleur de la barre du navigateur (theme-color).
   - Chargé dans <head> juste après core.js : la couleur est posée AVANT l'affichage (pas de flash violet).
   - Mémorisée dans localStorage « averse-accent » (et dans la Sauvegarde : backup.js, réglage « accent »).
   - Lisibilité : le fond est presque noir ; une couleur trop sombre est éclaircie automatiquement jusqu'à ce que
     le texte secondaire (--fg-soft, 68 % d'opacité) garde un contraste d'au moins 4,5:1 (norme WCAG AA). */
const ACCENT=(function(){
const KEY='averse-accent',DEF='#c7bce4',BG=[6,6,10],MIN=4.5,SOFT=.68;
const PRESETS=[['violet','#c7bce4'],['rouge','#ff9494'],['bleu','#8fb4ff'],['vert','#8fdca6'],['orange','#f5b26b'],['rose','#f5a0cf'],['cyan','#73d9e6'],['jaune','#ebd96b']];
const ok=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
const rgb=h=>{const n=parseInt(h.slice(1),16);return[(n>>16)&255,(n>>8)&255,n&255];};
const hex=a=>'#'+a.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');
/* luminance relative et contraste (formules WCAG 2) */
const lin=v=>(v/=255)<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);
const lum=a=>.2126*lin(a[0])+.7152*lin(a[1])+.0722*lin(a[2]);
const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);                 // t = part de b
/* contraste du texte principal (--fg) et du texte secondaire (--fg-soft posé sur le fond) */
function check(h){const c=rgb(h);return{fg:contrast(c,BG),soft:contrast(mix(BG,c,SOFT),BG)};}
/* couleur lisible : on éclaircit (mélange avec du blanc) par petits pas tant que le texte secondaire est trop pâle */
function readable(h){
  if(!ok(h))return DEF;
  let c=rgb(h),i=0;
  while(contrast(mix(BG,c,SOFT),BG)<MIN&&i++<40)c=mix(c,[255,255,255],.06);
  return hex(c);
}
function get(){try{const v=localStorage.getItem(KEY);return ok(v)?v.toLowerCase():DEF;}catch(e){return DEF;}}
/* pose la couleur sur la page (sans la mémoriser) */
function apply(h){
  h=readable(h);const c=rgb(h),r=document.documentElement;
  if(h===DEF){r.style.removeProperty('--fg');r.style.removeProperty('--acc-rgb');}
  else{r.style.setProperty('--fg',h);r.style.setProperty('--acc-rgb',c.join(','));}
  r.dataset.accent=h;
  /* barre du navigateur / appli installée : le fond, légèrement teinté par l'accent (les icônes système restent lisibles) */
  const tc=hex(mix(BG,c,.16));
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute('content',tc));
  if(window.rainSetColor)try{rainSetColor();}catch(e){}
  try{document.dispatchEvent(new CustomEvent('averse-accent',{detail:{hex:h,rgb:c}}));}catch(e){}
  return h;
}
/* change ET mémorise ; renvoie la couleur réellement appliquée (peut-être éclaircie) */
function set(h){
  if(!ok(h))return get();
  const v=readable(h.toLowerCase());
  try{if(v===DEF)localStorage.removeItem(KEY);else localStorage.setItem(KEY,v);}catch(e){}
  return apply(v);
}
apply(get());
addEventListener('storage',e=>{if(e.key===KEY)apply(get());});          // changée dans un autre onglet

/* petite fenêtre de choix : 8 pastilles + sélecteur libre + aperçu */
function picker(){
  if(document.getElementById('accentDlg'))return;
  const before=get(),prev=document.activeElement;
  const ov=document.createElement('div');ov.className='ctx-ov';ov.id='accentDlg';
  ov.innerHTML='<form class="ctx-dlg acc-dlg" role="dialog" aria-modal="true" aria-labelledby="accT">'+
    '<div class="ctx-dt" id="accT">Couleur d\'accent</div>'+
    '<div class="acc-sw" role="radiogroup" aria-label="Couleurs prêtes">'+PRESETS.map(([n,c])=>
      '<button type="button" role="radio" data-acc="'+c+'" title="'+n+'" aria-label="'+n+'" style="--c:'+c+'"><i></i><span>'+n+'</span></button>').join('')+'</div>'+
    '<label class="acc-own">Autre couleur <input type="color" id="accPick" value="'+before+'"></label>'+
    '<div class="acc-prev"><span class="acc-demo-btn">bouton</span> <a href="#" tabindex="-1">un lien</a> <span class="acc-soft">texte secondaire</span></div>'+
    '<p class="acc-info" id="accInfo" aria-live="polite"></p>'+
    '<div class="ctx-db"><button class="btn ghost" type="button" data-x>Annuler</button><button class="btn ghost" type="button" data-def>Violet d\'origine</button><button class="btn primary" type="submit">OK</button></div></form>';
  document.body.appendChild(ov);
  const f=ov.firstChild,info=f.querySelector('#accInfo'),pick=f.querySelector('#accPick');
  const show=(asked)=>{
    const cur=get(),k=check(cur);
    f.querySelectorAll('[data-acc]').forEach(b=>b.setAttribute('aria-checked',b.dataset.acc===cur));
    pick.value=cur;
    info.textContent='Contraste : '+k.fg.toFixed(1)+':1 (texte) · '+k.soft.toFixed(1)+':1 (texte secondaire)'+
      (asked&&asked.toLowerCase()!==cur?' — couleur éclaircie pour rester lisible sur le fond noir.':'');
  };
  const choose=h=>{set(h);show(h);};
  const done=keep=>{if(!keep)set(before);ov.remove();removeEventListener('keydown',key,true);if(prev&&prev.focus)prev.focus({preventScroll:true});};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(false);}};
  addEventListener('keydown',key,true);
  f.addEventListener('click',e=>{const b=e.target.closest('[data-acc]');if(b)choose(b.dataset.acc);
    if(e.target.closest('[data-def]'))choose(DEF);if(e.target.closest('[data-x]'))done(false);
    if(e.target.closest('.acc-prev a'))e.preventDefault();});
  pick.addEventListener('input',()=>choose(pick.value));
  ov.addEventListener('click',e=>{if(e.target===ov)done(false);});
  f.onsubmit=e=>{e.preventDefault();done(true);toast('Couleur d\'accent enregistrée');};
  show();(f.querySelector('[aria-checked="true"]')||f.querySelector('[data-acc]')).focus();
}
/* tout élément [data-accent-btn] ouvre la fenêtre (pied de page de l'accueil / à propos, barre du carnet) */
document.addEventListener('click',e=>{const a=e.target.closest('[data-accent-btn]');if(a){e.preventDefault();picker();}});
return{KEY,DEF,PRESETS,get,set,apply,readable,check,contrast,rgb,picker};
})();
window.ACCENT=ACCENT;   // accessible aussi comme propriété de window (tests du carnet : la CSP y interdit eval)
