/* feedback.js — v6 : « Signaler / Suggérer » (bug, idée, demande).
   Rien n'est envoyé par AVERSE : le bouton ouvre la page « Nouveau ticket » de GitHub, PRÉREMPLIE
   (titre, texte, étiquette) ; c'est toi qui relis et valides sur GitHub. Repli : e-mail (SITE.feedbackEmail, caché si vide).
   « Joindre les infos techniques » ajoute UNIQUEMENT : version d'AVERSE, navigateur, langue, taille d'écran,
   page et outil ouverts, style / couleur, mode installé ou non. JAMAIS le contenu des notes, ni jeton, ni mot de passe,
   ni l'adresse complète (le # d'un lien de partage contient une clé : on ne garde que le nom de la page).
   Ouvert par : liens [data-feedback-btn] (pied de page, carnet), la recherche (« signaler », « bug », « idée »…),
   le clic droit (dernière entrée de chaque menu AVERSE). */
const FEEDBACK=(function(){
const VERSION='v8 (cache averse-v16)';   // à mettre à jour avec sw.js
const MAXURL=6000;
const TYPES=[['bug','Bug','Quelque chose ne marche pas'],['idée','Idée','Une amélioration, un nouvel outil'],['demande','Demande','Une question, un besoin']];
const S=()=>typeof SITE!=='undefined'?SITE:{};
const repo=()=>{const r=S().feedbackRepo;return typeof r==='string'&&/^[\w.-]+\/[\w.-]+$/.test(r)?r:'GabRealX/averse';};
const email=()=>{const e=S().feedbackEmail;return typeof e==='string'&&/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e)?e:'';};
/* les infos techniques (sans rien de personnel) */
function tech(){
  const page=(location.pathname.split('/').pop()||'index.html').replace(/[^\w.-]/g,'');
  let tool='';try{if(typeof NOXE!=='undefined'&&NOXE.current&&NOXE.current())tool=String(NOXE.current()).replace(/[^\w-]/g,'');}catch(e){}
  const r=document.documentElement,mm=q=>!!(window.matchMedia&&matchMedia(q).matches);
  const ua=navigator.userAgent.replace(/[\r\n]/g,' ').slice(0,300);
  return[
    ['Version','AVERSE '+VERSION],
    ['Navigateur',ua],
    ['Langue',navigator.language||'?'],
    ['Écran',screen.width+'×'+screen.height+' (fenêtre '+innerWidth+'×'+innerHeight+', ×'+(devicePixelRatio||1)+')'],
    ['Page',page+(tool?' · outil : '+tool:'')],
    ['Style',(r.dataset.style||'normal')+' · couleur '+(r.dataset.accent||'#c7bce4')],
    ['Mode',(mm('(display-mode: standalone)')?'appli installée':'navigateur')+(navigator.onLine===false?' · hors ligne':'')+(mm('(pointer: coarse)')?' · tactile':'')]
  ];
}
const LABEL={bug:'Bug',idée:'Idée',demande:'Demande'};
/* le texte du ticket (Markdown GitHub) */
function body(o){
  let b=String(o.message||'').replace(/\r\n?/g,'\n').trim()||'(pas de description)';
  if(o.type==='bug'&&!/étapes|reproduire/i.test(b))b+='\n\n### Étapes pour reproduire\n1. \n\n### Ce qui était attendu\n';
  if(o.tech){b+='\n\n<details><summary>Infos techniques (ajoutées par AVERSE)</summary>\n\n'+
    (o.techList||tech()).map(([k,v])=>'- **'+k+'** : '+String(v).replace(/[<>]/g,'')).join('\n')+'\n\n</details>';}
  return b+'\n\n_Envoyé depuis le bouton « Signaler / Suggérer » d\'AVERSE._';
}
/* l'adresse GitHub « nouveau ticket » prérempli ; le message est raccourci si l'adresse dépasse ~6000 caractères */
function url(o){
  const type=LABEL[o.type]?o.type:'bug';
  const title='['+LABEL[type]+'] '+(String(o.title||'').replace(/[\r\n]+/g,' ').trim().slice(0,200)||'(sans titre)');
  const mk=msg=>'https://github.com/'+repo()+'/issues/new?title='+encodeURIComponent(title)+
    '&body='+encodeURIComponent(body(Object.assign({},o,{message:msg})))+'&labels='+encodeURIComponent(type);
  let msg=String(o.message||''),u=mk(msg),cut=false;
  while(u.length>MAXURL&&msg.length){
    const over=u.length-MAXURL;msg=msg.slice(0,Math.max(0,msg.length-Math.max(40,Math.ceil(over/3))));cut=true;
    if(/[\uD800-\uDBFF]$/.test(msg))msg=msg.slice(0,-1);   // ne pas couper un emoji en deux (encodeURIComponent planterait)
    u=mk(msg+'\n\n… (message raccourci : trop long pour un lien, colle la suite sur GitHub)');
  }
  return{url:u,cut,title};
}
function mailto(o){
  const e=email();if(!e)return'';
  const t=url(o).title;let b=body(o);if(b.length>1800)b=b.slice(0,1800)+'\n…';
  return'mailto:'+e+'?subject='+encodeURIComponent('AVERSE '+t)+'&body='+encodeURIComponent(b.replace(/<\/?details>|<\/?summary>/g,''));
}
/* ---------- la fenêtre ---------- */
let ov=null,prev=null;
function close(){if(!ov)return;ov.remove();ov=null;removeEventListener('keydown',onKey,true);if(prev&&prev.isConnected&&prev.focus)prev.focus({preventScroll:true});}
const onKey=e=>{if(e.key==='Escape'&&ov){e.preventDefault();e.stopImmediatePropagation();close();}};
function open(pre){
  pre=pre||{};close();prev=document.activeElement;
  ov=document.createElement('div');ov.className='ctx-ov';ov.id='fbDlg';
  const t0=LABEL[pre.type]?pre.type:'bug';
  ov.innerHTML='<form class="ctx-dlg tpl-dlg fb-dlg" role="dialog" aria-modal="true" aria-labelledby="fbT">'+
    '<div class="ctx-dt" id="fbT">Signaler / Suggérer</div>'+
    '<div class="fb-types" role="radiogroup" aria-label="Type">'+TYPES.map(([k,n,d])=>
      '<label class="fb-type"><input type="radio" name="fbType" value="'+esc(k)+'"'+(k===t0?' checked':'')+'><span><b>'+esc(n)+'</b><small>'+esc(d)+'</small></span></label>').join('')+'</div>'+
    '<label class="tpl-l" for="fbTitle">Titre</label><input id="fbTitle" maxlength="200" required placeholder="En une phrase" value="'+esc(pre.title||'')+'">'+
    '<label class="tpl-l" for="fbMsg">Message</label><textarea id="fbMsg" rows="6" maxlength="20000" placeholder="Que s\'est-il passé ? Qu\'aimerais-tu ?">'+esc(pre.message||'')+'</textarea>'+
    '<label class="fb-tech"><input type="checkbox" id="fbTech" checked> joindre les infos techniques <button type="button" class="fb-see" data-f="see">voir</button></label>'+
    '<pre class="fb-techlist" id="fbTechList" hidden></pre>'+
    '<p class="sh-info">Jamais joints : tes notes, jetons ou mots de passe. Le bouton ouvre GitHub avec le ticket prérempli : rien ne part tant que tu ne valides pas là-bas (il faut un compte GitHub).</p>'+
    '<p class="sh-info warn" id="fbCut" hidden></p>'+
    '<div class="ctx-db sh-btns"><button type="button" class="tpl-b" data-f="x">Annuler</button>'+
      (email()?'<button type="button" class="tpl-b" data-f="mail" id="fbMail">Par e-mail</button>':'')+
      '<button type="submit" class="tpl-b primary">Ouvrir sur GitHub</button></div></form>';
  document.body.appendChild(ov);addEventListener('keydown',onKey,true);
  ov.addEventListener('click',e=>{if(e.target===ov)close();});
  const f=ov.firstChild,q=s=>f.querySelector(s);
  const val=()=>({type:(f.querySelector('input[name=fbType]:checked')||{}).value,title:q('#fbTitle').value,message:q('#fbMsg').value,tech:q('#fbTech').checked});
  f.addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;e.preventDefault();
    if(b.dataset.f==='x')close();
    else if(b.dataset.f==='see'){const l=q('#fbTechList');l.hidden=!l.hidden;l.textContent=tech().map(([k,v])=>k+' : '+v).join('\n');}
    else if(b.dataset.f==='mail'){if(!q('#fbTitle').value.trim()){q('#fbTitle').focus();return;}const m=mailto(val());if(m){location.href=m;close();}}
  });
  f.addEventListener('submit',e=>{e.preventDefault();
    if(!q('#fbTitle').value.trim()){q('#fbTitle').focus();return;}
    const r=url(val());FEEDBACK.last=r;
    FEEDBACK.opener(r.url);   // (avec noopener, window.open renvoie toujours null : on ne peut pas savoir si c'est bloqué)
    if(r.cut){const c=q('#fbCut');c.hidden=false;c.textContent='Message raccourci dans le lien : colle la fin directement sur GitHub.';}
    toast('Ticket prérempli ouvert sur GitHub');if(!r.cut)close();
  });
  (pre.title?q('#fbMsg'):q('#fbTitle')).focus();
  return f;
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-feedback-btn]');if(a){e.preventDefault();open();}});
return{open,close,url,body,mailto,tech,TYPES,VERSION,MAXURL,last:null,
  opener:u=>window.open(u,'_blank','noopener')};   // remplaçable (tests : on ne quitte pas la page)
})();
window.FEEDBACK=FEEDBACK;
