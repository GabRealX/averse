/* notes-page.js — petits branchements de la page carnet (v5 : plus aucun script « en ligne » dans notes.html → CSP stricte)
   + la barre de boutons défilante sur mobile, rendue visible : fondus aux bords, flèches ‹ ›, petite barre de position. */
(function(){
  const sb=$('styleBtn');if(sb)sb.addEventListener('click',()=>toggleStyle());
  const bn=$('blankNew');if(bn)bn.addEventListener('click',()=>$('newBtn').click());
  if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

  /* ===== v9 : menu « ⋯ » (actions secondaires, ordinateur) ===== */
  const mb=$('moreBtn'),mm=$('moreMenu');
  if(mb&&mm){
    const items=()=>[...mm.querySelectorAll('button')];
    const open=(on,focus)=>{mm.classList.toggle('open',on);mb.setAttribute('aria-expanded',on?'true':'false');
      if(on&&focus)items()[0].focus();};
    mb.addEventListener('click',e=>{e.stopPropagation();open(!mm.classList.contains('open'),e.detail===0);});
    mm.addEventListener('click',e=>{if(e.target.closest('button'))open(false);});        // une action choisie → le menu se ferme
    document.addEventListener('click',e=>{if(mm.classList.contains('open')&&!e.target.closest('#barMore'))open(false);});
    mm.addEventListener('keydown',e=>{const it=items(),i=it.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();it[(i+(e.key==='ArrowDown'?1:-1)+it.length)%it.length].focus();}
      else if(e.key==='Home'){e.preventDefault();it[0].focus();}else if(e.key==='End'){e.preventDefault();it[it.length-1].focus();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mm.classList.contains('open')){e.stopPropagation();open(false);mb.focus();}},true);
    mb.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();open(true,true);}});
    window.barMore={open,isOpen:()=>mm.classList.contains('open')};
  }

  /* ===== barre défilante ===== */
  const row=document.querySelector('.bar-right'),nav=$('barNav'),th=$('barThumb'),L=$('barL'),R=$('barR');
  if(!row||!nav)return;
  function update(){
    const over=row.scrollWidth-row.clientWidth>2;           // ça déborde ? (sur ordinateur : non → rien n'apparaît)
    nav.hidden=L.hidden=R.hidden=!over;row.classList.toggle('scrolls',over);
    if(!over){row.classList.remove('fade-l','fade-r');return;}
    const max=row.scrollWidth-row.clientWidth,x=row.scrollLeft,r=row.getBoundingClientRect(),br=row.parentElement.getBoundingClientRect();
    row.classList.toggle('fade-l',x>2);row.classList.toggle('fade-r',x<max-2);
    L.classList.toggle('dim',x<=2);R.classList.toggle('dim',x>=max-2);
    nav.style.left=(r.left-br.left)+'px';nav.style.width=r.width+'px';
    L.style.left=(r.left-br.left)+'px';R.style.left=(r.right-br.left-R.offsetWidth)+'px';
    const w=Math.max(18,r.width*row.clientWidth/row.scrollWidth);
    th.style.width=w+'px';th.style.transform='translateX('+((r.width-w)*x/max)+'px)';
  }
  const by=d=>row.scrollBy({left:d*row.clientWidth*.7,behavior:'smooth'});
  L.addEventListener('click',()=>by(-1));R.addEventListener('click',()=>by(1));
  nav.addEventListener('click',e=>{const r=nav.getBoundingClientRect();row.scrollTo({left:(e.clientX-r.left)/r.width*(row.scrollWidth-row.clientWidth),behavior:'smooth'});});
  row.addEventListener('scroll',update,{passive:true});addEventListener('resize',update);
  if(window.ResizeObserver)new ResizeObserver(update).observe(row);
  update();setTimeout(update,300);
  /* première visite sur mobile : la barre glisse un peu puis revient, pour montrer qu'elle défile (une seule fois) */
  try{if(row.scrollWidth-row.clientWidth>2&&!localStorage.getItem('averse-bar-hint')&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    localStorage.setItem('averse-bar-hint','1');
    setTimeout(()=>{row.scrollTo({left:Math.min(90,row.scrollWidth),behavior:'smooth'});setTimeout(()=>row.scrollTo({left:0,behavior:'smooth'}),700);},600);}}catch(e){}
  window.barScroll={update};
})();
