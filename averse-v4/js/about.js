/* about.js — la page « À propos » : les projets et les liens de data.js (c'était l'ancienne page d'accueil) */
(function(){

/* projets et liens (depuis data.js) */
$('projectGrid').innerHTML=SITE.projects.map(p=>{
  const open=p.url?'<a class="project-card" href="'+esc(p.url)+'" target="_blank" rel="noopener">':'<div class="project-card">';
  return open+'<span class="project-tag">'+esc(p.tag)+'</span><h3>'+esc(p.title)+'</h3><p>'+esc(p.desc)+(p.url?'':' <em>(bientôt)</em>')+'</p>'+(p.url?'</a>':'</div>');
}).join('');
$('footerLinks').innerHTML=SITE.links.map(l=>'<a href="'+esc(l.url)+'" target="_blank" rel="noopener">'+esc(l.label)+'</a>').join('');

/* bascule de style et de pluie */
(function(){
  const a=$('styleSwitch');
  if(a)a.onclick=e=>{e.preventDefault();toggleStyle();if(window.rainSetColor)rainSetColor();};
  const r=$('rainSwitch');if(!r)return;
  const lab=()=>{r.textContent='pluie : '+(window.rainOn&&rainOn()?'on':'off');};
  r.onclick=e=>{e.preventDefault();if(window.rainToggle)rainToggle();lab();};lab();
})();

/* mode hors-ligne */
if('serviceWorker' in navigator&&location.protocol!=='file:'){
  addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
})();
