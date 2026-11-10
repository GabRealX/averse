/* fonts.js — v11 : charge les polices Google SANS bloquer l'affichage.
   Avant, la feuille de style des polices était dans <head> : le navigateur n'affichait RIEN avant de l'avoir reçue,
   ce qui se sent sur téléphone en 4G. Maintenant la page s'affiche tout de suite avec la police de secours (font-display: swap
   est déjà dans l'adresse) et la vraie police arrive dès qu'elle est prête. Fichier externe : la CSP interdit le script en ligne.
   L'adresse est lue sur l'attribut data-href de la balise <script>. */
(function(){
  const s=document.currentScript,h=s&&s.getAttribute('data-href');
  if(!h||!/^https:\/\/fonts\.googleapis\.com\//.test(h))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href=h;
  document.head.appendChild(l);
})();
