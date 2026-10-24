/* pwa.js — installer AVERSE comme une appli.
   Le navigateur envoie « beforeinstallprompt » quand l'installation est possible :
   on garde l'événement et on affiche les boutons [data-install] (cachés sinon). */
(function(){
let ev=null;
const show=on=>document.querySelectorAll('[data-install]').forEach(b=>{b.hidden=!on;});
addEventListener('beforeinstallprompt',e=>{e.preventDefault();ev=e;show(true);});
addEventListener('appinstalled',()=>{ev=null;show(false);toast('AVERSE est installée');});
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-install]');if(!b)return;
  e.preventDefault();
  if(!ev){toast('Installation proposée par le menu du navigateur');return;}
  const p=ev;ev=null;show(false);
  try{p.prompt();await p.userChoice;}catch(err){}   // un événement ne sert qu'une fois ; le navigateur en renverra un si besoin
});
window.averseInstall={ready:()=>!!ev};
})();
