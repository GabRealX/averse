/* wco.js — v9 : appli installée en mode « window-controls-overlay » (Windows / Linux / macOS, Chrome et Edge).
   Dans ce mode, la page monte jusqu'en haut de la fenêtre et les boutons ─ ☐ ✕ se posent PAR-DESSUS.
   Le CSS (base.css) lit env(titlebar-area-*) ; ce petit script fait la même chose avec l'API JS
   (navigator.windowControlsOverlay), au cas où env() n'est pas pris en compte, et suit les changements de taille.
   Résultat : trois variables CSS --tb-l (marge à gauche), --tb-r (marge à droite), --tb-h (hauteur de la barre de titre)
   + la classe html.wco. Hors appli installée : rien ne change (variables à 0). */
(function(){
  const o=navigator.windowControlsOverlay,h=document.documentElement;
  if(!o)return;
  function apply(){
    if(!o.visible){h.classList.remove('wco');['--tb-l','--tb-r','--tb-h'].forEach(k=>h.style.removeProperty(k));return;}
    const r=o.getTitlebarAreaRect(),W=h.clientWidth||innerWidth;
    h.classList.add('wco');
    h.style.setProperty('--tb-l',Math.max(0,r.x)+'px');
    h.style.setProperty('--tb-r',Math.max(0,W-r.x-r.width)+'px');   // largeur des boutons de fenêtre (à droite sous Windows)
    h.style.setProperty('--tb-h',Math.max(0,r.height)+'px');
  }
  apply();
  try{o.addEventListener('geometrychange',apply);}catch(e){}
  addEventListener('resize',apply);
})();
