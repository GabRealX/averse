/* theme.js — v7 : THÈMES COMPLETS (fond, police, ambiance), combinables avec la couleur d'accent (accent.js).
   Principe : un seul attribut data-theme sur <html> ; css/base.css ne redéfinit que des VARIABLES par thème
   (--bg, --bg-rgb, --panel, opacités du texte, polices). Aucune règle CSS dupliquée.
   accent.js lit THEME.cur() pour adapter l'accent au fond (éclaircir sur fond noir, foncer sur papier)
   et garder le texte lisible (contraste WCAG AA ≥ 4,5:1 pour le texte principal ET secondaire).
   Mémorisé dans localStorage « averse-theme » (et dans la Sauvegarde, comme l'accent).
   Chargé dans <head> AVANT accent.js : pas de flash au chargement. */
const THEME=(function(){
const KEY='averse-theme';
/* bg : fond (RVB) · soft/faint : opacités du texte secondaire / discret · light : fond clair
   base : accent par défaut du thème si l'utilisateur n'en a pas choisi (null = violet d'AVERSE)
   rain : multiplicateur de densité · rainAlpha : opacité de la pluie · storm : éclairs */
const LIST={
  defaut:  {name:'Défaut',        bg:[6,6,10],   soft:.68,faint:.36,light:false,base:null,     rain:1,  rainAlpha:1},
  neon:    {name:'Néon',          bg:[2,1,8],    soft:.80,faint:.50,light:false,base:'#e879ff',rain:1,  rainAlpha:1,  sat:true},
  papier:  {name:'Papier',        bg:[244,238,223],soft:.82,faint:.56,light:true,base:'#5a4a86',rain:.5, rainAlpha:.3},
  terminal:{name:'Terminal',      bg:[0,0,0],    soft:.74,faint:.44,light:false,base:'#4dff88',rain:1,  rainAlpha:1},
  orage:   {name:'Nuit d\'orage', bg:[4,6,12],   soft:.70,faint:.38,light:false,base:null,     rain:2.4,rainAlpha:1.1,storm:true}
};
const ok=k=>Object.prototype.hasOwnProperty.call(LIST,k);
function get(){try{const v=localStorage.getItem(KEY);return ok(v)?v:'defaut';}catch(e){return'defaut';}}
let cur='defaut';
function apply(k){
  if(!ok(k))k='defaut';cur=k;
  const r=document.documentElement;r.dataset.theme=k;
  if(window.ACCENT)ACCENT.apply(ACCENT.get());      // l'accent dépend du fond
  if(window.rainTheme)try{rainTheme();}catch(e){}
  document.querySelectorAll('[data-theme-label]').forEach(e=>e.textContent='thème : '+LIST[k].name.toLowerCase());
  try{document.dispatchEvent(new CustomEvent('averse-theme',{detail:{theme:k}}));}catch(e){}
  return k;
}
function set(k){if(!ok(k))return cur;try{if(k==='defaut')localStorage.removeItem(KEY);else localStorage.setItem(KEY,k);}catch(e){}return apply(k);}
apply(get());
addEventListener('storage',e=>{if(e.key===KEY)apply(get());});
addEventListener('DOMContentLoaded',()=>apply(cur));     // libellés du pied de page
/* [data-theme-btn] ouvre la fenêtre « Apparence » (thème + couleur) */
document.addEventListener('click',e=>{const a=e.target.closest('[data-theme-btn]');if(a&&window.ACCENT){e.preventDefault();ACCENT.picker();}});
return{KEY,LIST,get,set,apply,cur:()=>cur,def:()=>LIST[cur],ids:()=>Object.keys(LIST)};
})();
window.THEME=THEME;
