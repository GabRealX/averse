/* notes-page.js — petits branchements de la page carnet (CSP stricte, aucun script en ligne).
   v9 : menu « ... » des actions secondaires (ordinateur).
   v14 : sur écran étroit, ce même menu accueille aussi Éditeur, Graphe, IA, Synchro
   (plus de défilement horizontal ni de flèches < >). Menu « ... » des actions de la note
   (Exporter, PDF, Partager, Modèle, Supprimer) sur téléphone. */
(function(){
  const sb=$('styleBtn');if(sb)sb.addEventListener('click',()=>toggleStyle());
  const bn=$('blankNew');if(bn)bn.addEventListener('click',()=>$('newBtn').click());
  if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

  const mb=$('moreBtn'),mm=$('moreMenu'),mp=$('morePrimary'),row=document.querySelector('.bar-right');
  const mq=window.matchMedia('(max-width:799px)');
  function primaries(){
    return [document.querySelector('.bar .seg'),$('aiBtn'),$('syncState'),$('cloudBtn'),$('cloudState'),document.querySelector('.bar [data-install]')].filter(Boolean);
  }
  function placeBar(){
    if(!mb||!mm||!row)return;
    const narrow=mq.matches;
    if(mp)mp.hidden=!narrow;
    const dest=narrow&&mp?mp:row;
    primaries().forEach(el=>{
      if(narrow&&mp)mp.appendChild(el);
      else row.insertBefore(el, document.getElementById('barMore')||null);
    });
  }
  function itemsOf(menu){return [...menu.querySelectorAll('button, [role="menuitem"], [role="menuitemradio"]')].filter(b=>b.offsetParent!==null||mq.matches);}
  function bindMenu(btn,menu,root){
    if(!btn||!menu)return;
    const items=()=>[...menu.querySelectorAll('button')].filter(b=>!b.disabled&&getComputedStyle(b).display!=='none');
    const open=(on,focus)=>{menu.classList.toggle('open',on);btn.setAttribute('aria-expanded',on?'true':'false');
      if(on&&focus){const it=items();if(it[0])it[0].focus();}};
    btn.addEventListener('click',e=>{e.stopPropagation();open(!menu.classList.contains('open'),e.detail===0);});
    menu.addEventListener('click',e=>{if(e.target.closest('button'))open(false);});
    document.addEventListener('click',e=>{if(menu.classList.contains('open')&&!e.target.closest(root))open(false);});
    menu.addEventListener('keydown',e=>{const it=items(),i=it.indexOf(document.activeElement);
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(it.length)it[(i+(e.key==='ArrowDown'?1:-1)+it.length)%it.length].focus();}
      else if(e.key==='Home'){e.preventDefault();if(it[0])it[0].focus();}
      else if(e.key==='End'){e.preventDefault();if(it.length)it[it.length-1].focus();}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){e.stopPropagation();open(false);btn.focus();}},true);
    btn.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();open(true,true);}});
    return {open,isOpen:()=>menu.classList.contains('open')};
  }
  const barMore=bindMenu(mb,mm,'#barMore');
  if(barMore)window.barMore=barMore;
  bindMenu($('edMoreBtn'),$('edMoreMenu'),'#edActs');
  placeBar();
  if(mq.addEventListener)mq.addEventListener('change',placeBar);else mq.addListener(placeBar);
  addEventListener('resize',placeBar);

  function syncDot(){
    const st=$('cloudState');
    if(mb){
      const err=st&&st.dataset.state==='err';
      mb.classList.toggle('has-err',!!err);
      if(err)mb.setAttribute('title','Plus d\'actions — erreur de synchro');
    }
  }
  window.barScroll={update:()=>{placeBar();syncDot();}};
  syncDot();
})();
