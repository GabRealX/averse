/* ctxmenu.js — le menu du clic droit d'AVERSE (toutes les pages).
   Ce qu'il propose dépend de ce qu'on vise :
     une NOTE (liste du carnet, panneau Ctrl+J, nœud du graphe, résultat de recherche) → ouvrir, renommer, dupliquer, épingler, tag, .md, PDF, supprimer
     un FICHIER chargé dans un outil (miniature, ligne de liste) → autre outil, renommer, télécharger, copier, retirer, infos
     une SÉLECTION de texte, un RÉSULTAT, une IMAGE → copier, envoyer vers un outil (le chaînage), ajouter au carnet, ouvrir l'outil associé
     une carte d'outil → ouvrir, favori, copier le lien
   Le menu natif du navigateur reste disponible : Maj + clic droit, et dans les champs de saisie (sauf s'il y a une sélection).
   Clavier : touche Menu ou Maj+F10 pour l'ouvrir, ↑ ↓ Début Fin pour choisir, Entrée, → ouvre un sous-menu, ← revient, Échap ferme. */
const CTX=(function(){
const providers=[];
let menu=null,before=null,stack=[];
const isEditable=el=>!!el&&(el.isContentEditable||el.tagName==='TEXTAREA'||el.tagName==='INPUT'&&!/^(checkbox|radio|button|range|file|submit|reset|color)$/i.test(el.type));
const hasNoxe=()=>typeof NOXE!=='undefined'&&!!NOXE.open;
const bytes=n=>hasNoxe()?NOXE.bytes(n):n<1e6?(n/1e3).toFixed(1)+' Ko':(n/1e6).toFixed(2)+' Mo';

/* ---------- le menu lui-même ---------- */
/* items : [{label, run, sub:()=>items, danger, hint, disabled}] ou '-' pour un séparateur */
function open(x,y,items,title){
  close(true);
  before=document.activeElement;stack=[];
  menu=document.createElement('div');menu.className='ctx';menu.id='ctxMenu';menu.setAttribute('role','menu');
  document.body.appendChild(menu);
  fill(items,title);
  const r=menu.getBoundingClientRect(),W=innerWidth,H=innerHeight;
  menu.style.left=Math.max(4,Math.min(x,W-r.width-4))+'px';
  menu.style.top=Math.max(4,Math.min(y,H-r.height-4))+'px';
  return menu;
}
function fill(items,title){
  menu._items=items;
  menu.innerHTML=(title?'<div class="ctx-title">'+esc(title)+'</div>':'')+(stack.length?'<button type="button" role="menuitem" class="ctx-back" data-back>← Retour</button>':'')+
    items.map((it,i)=>it==='-'?'<div class="ctx-sep" role="separator"></div>':
      '<button type="button" role="menuitem" data-ci="'+i+'"'+(it.disabled?' disabled':'')+(it.sub?' aria-haspopup="menu"':'')+' class="'+(it.danger?'danger':'')+'">'+
        '<span>'+esc(it.label)+'</span>'+(it.sub?'<span class="ctx-k">▸</span>':it.hint?'<span class="ctx-k">'+esc(it.hint)+'</span>':'')+'</button>').join('');
  const f=menu.querySelector('button:not([disabled])');if(f)f.focus();
}
async function act(btn){
  if(btn.hasAttribute('data-back')){back();return;}
  const it=menu._items[+btn.dataset.ci];if(!it||it.disabled)return;
  if(it.sub){
    const sub=await it.sub();if(!menu)return;
    stack.push({items:menu._items,title:menu.querySelector('.ctx-title')&&menu.querySelector('.ctx-title').textContent});
    fill(sub&&sub.length?sub:[{label:'Aucun outil compatible',disabled:true}],it.label);return;
  }
  close();
  try{await it.run();}catch(e){console.error(e);toast('Action impossible');}
}
function back(){if(!stack.length){close();return;}const s=stack.pop();fill(s.items,s.title);}
function close(silent){
  if(!menu)return;menu.remove();menu=null;stack=[];
  if(!silent&&before&&before.isConnected&&before.focus)before.focus({preventScroll:true});
}
document.addEventListener('click',e=>{
  if(!menu)return;
  const b=e.target.closest('#ctxMenu button');
  if(b){e.preventDefault();act(b);return;}
  if(!e.target.closest('#ctxMenu'))close(true);
},true);
addEventListener('keydown',e=>{
  if(!menu)return;
  const bs=[...menu.querySelectorAll('button:not([disabled])')],i=bs.indexOf(document.activeElement);
  const k=e.key,stop=()=>{e.preventDefault();e.stopImmediatePropagation();};
  if(k==='Escape'){stop();close();}
  else if(k==='ArrowDown'){stop();bs[(i+1)%bs.length].focus();}
  else if(k==='ArrowUp'){stop();bs[(i-1+bs.length)%bs.length].focus();}
  else if(k==='Home'){stop();bs[0].focus();}
  else if(k==='End'){stop();bs[bs.length-1].focus();}
  else if(k==='ArrowRight'){const b=document.activeElement;if(b&&b.getAttribute('aria-haspopup')){stop();act(b);}}
  else if(k==='ArrowLeft'||k==='Backspace'){if(stack.length){stop();back();}}
  else if(k==='Enter'||k===' '){if(i>=0){stop();act(bs[i]);}}
  else if(k==='Tab'){stop();close();}
  else if(k.length===1&&!e.ctrlKey&&!e.metaKey)stop();           // pas de raccourci clavier pendant que le menu est ouvert
},true);
addEventListener('resize',()=>close(true));
addEventListener('blur',()=>close(true));
document.addEventListener('scroll',e=>{if(menu&&!menu.contains(e.target))close(true);},true);

/* ---------- petites boîtes : question, confirmation, infos ---------- */
function dialog(html,onReady){
  return new Promise(res=>{
    const prev=document.activeElement;
    const ov=document.createElement('div');ov.className='ctx-ov';
    ov.innerHTML='<form class="ctx-dlg" role="dialog" aria-modal="true">'+html+'</form>';
    document.body.appendChild(ov);
    const f=ov.firstChild;
    const done=v=>{ov.remove();removeEventListener('keydown',key,true);if(prev&&prev.isConnected&&prev.focus)prev.focus({preventScroll:true});res(v);};
    const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(null);}};
    addEventListener('keydown',key,true);
    ov.addEventListener('click',e=>{if(e.target===ov)done(null);});
    f.querySelector('[data-x]').onclick=e=>{e.preventDefault();done(null);};
    f.onsubmit=e=>{e.preventDefault();done(onReady?onReady(f):true);};
    (f.querySelector('input')||f.querySelector('button[type=submit]')||f.querySelector('button')).focus();
    if(f.querySelector('input'))f.querySelector('input').select();
  });
}
const ask=(label,value,ok)=>dialog('<label class="ctx-dt" for="ctxIn">'+esc(label)+'</label><input id="ctxIn" type="text" spellcheck="false" value="'+esc(value||'')+'">'+
  '<div class="ctx-db"><button class="btn ghost" data-x type="button">Annuler</button><button class="btn primary" type="submit">'+esc(ok||'OK')+'</button></div>',
  f=>{const v=f.querySelector('input').value.trim();return v||null;});
const confirm=(msg,ok)=>dialog('<p class="ctx-dt">'+esc(msg)+'</p><div class="ctx-db"><button class="btn ghost" data-x type="button">Annuler</button><button class="btn primary danger" type="submit">'+esc(ok||'Confirmer')+'</button></div>').then(v=>!!v);
const message=(title,text)=>dialog('<div class="ctx-dt">'+esc(title)+'</div><p class="ctx-msg">'+esc(text)+'</p>'+
  '<div class="ctx-db"><button class="btn primary" data-x type="button">OK</button></div>');
const info=rows=>dialog('<div class="ctx-dt">Infos</div><dl class="ctx-info">'+rows.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>'+
  '<div class="ctx-db"><button class="btn ghost" data-x type="button">Fermer</button></div>');

/* ---------- actions communes ---------- */
const dl=(blob,name)=>{
  if(hasNoxe())return NOXE.download(blob,name);
  const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);
};
/* copier une image dans le presse-papiers (toujours en PNG : c'est le seul format accepté partout) */
async function copyImage(blob){
  try{
    let png=blob;
    if(blob.type!=='image/png'){
      const b=await createImageBitmap(blob),c=document.createElement('canvas');c.width=b.width;c.height=b.height;c.getContext('2d').drawImage(b,0,0);
      png=await new Promise(r=>c.toBlob(r,'image/png'));
    }
    await navigator.clipboard.write([new ClipboardItem({'image/png':png})]);
    toast('Image copiée');return true;
  }catch(e){toast('Copie d\'image refusée par le navigateur');return false;}
}
/* envoyer du texte / des fichiers vers un outil. Hors de l'accueil (carnet, à propos) : on passe par sessionStorage */
const STATIC={text:[['json','JSON'],['base64','Base64'],['url','URL'],['encodage','Hash'],['regex','Regex'],['qr','QR code']]};
function targets(r){
  if(hasNoxe())return NOXE.chainTargets(r).map(([k])=>[k,(NOXE.tools.find(t=>t.key===k)||{}).title||k]);
  return r.text!=null?STATIC.text:[];
}
function sendItems(r){
  return targets(r).map(([k,label])=>({label,run:()=>send(k,r)}));
}
function send(k,r){
  if(hasNoxe())return NOXE.sendTo(k,r);
  try{sessionStorage.setItem('averse-send',JSON.stringify({key:k,text:r.text}));}catch(e){}
  location.href='index.html';
}
function guess(text){
  if(!hasNoxe()||!NOXE.detect)return null;
  const f=NOXE.detect(text);return f.length?f[0]:null;
}
function toNotebook(text){
  const t=String(text).trim(),title=t.split('\n')[0].replace(/^#+\s*/,'').slice(0,60)||'Sans titre';
  addToNotebook(title,t,[]);toast('Ajouté au carnet');
  if(hasNoxe()&&NOXE.notesChanged)NOXE.notesChanged();
  if(typeof window.notesReloadFromStorage==='function')window.notesReloadFromStorage();
}
function textItems(text){
  const g=guess(text),T=hasNoxe()&&g&&NOXE.tools.find(t=>t.key===g.key);
  return tag({text},[
    {label:'Copier',hint:'',run:()=>copy(text,'Copié')},
    {label:'Envoyer vers…',sub:()=>sendItems({text})},
    {label:'Ajouter au carnet',run:()=>toNotebook(text)},
    T?{label:'Ouvrir l\'outil associé : '+T.title,run:()=>NOXE.open(g.key,{tab:g.tab,text:g.text,input:g.input})}:
      !hasNoxe()?{label:'Ouvrir dans AVERSE (outil deviné)',run:()=>{try{sessionStorage.setItem('averse-send',JSON.stringify({detect:text}));}catch(e){}location.href='index.html';}}:
      {label:'Ouvrir l\'outil associé',disabled:true,hint:'aucun'}
  ]);
}
/* v7 : on étiquette la liste (texte visé, note visée) pour que l'IA (ai.js) ajoute ses entrées */
const tag=(o,a)=>Object.assign(a,o);
function imageItems(getFile){
  return[
    {label:'Copier l\'image',run:async()=>copyImage(await getFile())},
    {label:'Envoyer vers…',sub:async()=>sendItems({files:[await getFile()]})},
    hasNoxe()&&NOXE.tools.some(t=>t.key==='ocr')?{label:'Envoyer vers OCR (lire le texte)',run:async()=>NOXE.open('ocr',{files:[await getFile()]})}:null,
    window.PHOTO?{label:'Photo → note (lire le texte)',run:async()=>PHOTO.open(await getFile())}:null,   // v9
    {label:'Télécharger',run:async()=>{const f=await getFile();dl(f,f.name);}}
  ].filter(Boolean);
}
async function fileOfImage(el){
  if(el.tagName==='CANVAS'){const b=await new Promise(r=>el.toBlob(r,'image/png'));return new File([b],'image.png',{type:'image/png'});}
  const b=await(await fetch(el.currentSrc||el.src)).blob();
  return new File([b],(el.alt||'image').replace(/[^\w\-]+/g,'-')+'.'+((b.type.split('/')[1]||'png').replace('jpeg','jpg').replace('svg+xml','svg')),{type:b.type});
}

/* ---------- infos d'un fichier : taille, type, dimensions (image), pages (PDF) ---------- */
async function fileInfo(f,extra){
  const rows=[['Nom',f.name],['Type',f.type||'inconnu'],['Taille',bytes(f.size)+' ('+f.size.toLocaleString('fr-FR')+' octets)']];
  if(/^image\//.test(f.type)){try{const b=await createImageBitmap(f);rows.push(['Dimensions',b.width+' × '+b.height+' px']);if(b.close)b.close();}catch(e){rows.push(['Dimensions','illisibles']);}}
  if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){
    let n=extra&&extra.pages;
    if(!n){const t=new TextDecoder('latin1').decode(await f.arrayBuffer());n=(t.match(/\/Type\s*\/Page(?!s)/g)||[]).length||'?';}
    rows.push(['Pages',String(n)]);
  }
  if(f.lastModified)rows.push(['Modifié',new Date(f.lastModified).toLocaleString('fr-FR')]);
  return info(rows);
}
/* menu d'un fichier chargé dans un outil. spec = NOXE.fileItems(…) de l'outil, i = son index */
function fileItems(spec,i){
  const it=spec.get(i);if(!it)return null;
  const cur=()=>{const x=spec.get(i);return x.out?new File([x.out],x.name||x.file.name,{type:x.out.type}):x.name&&x.name!==x.file.name?new File([x.file],x.name,{type:x.file.type}):x.file;};
  const img=/^image\//.test((it.out||it.file).type);
  return[
    {label:'Ouvrir dans un autre outil',sub:()=>sendItems({files:[cur()]})},
    img&&hasNoxe()&&NOXE.current()!=='ocr'&&NOXE.tools.some(t=>t.key==='ocr')?{label:'Envoyer vers OCR (lire le texte)',run:()=>NOXE.open('ocr',{files:[cur()]})}:null,
    spec.rename?{label:'Renommer pour l\'export…',run:async()=>{
      const old=it.name||it.file.name,v=await ask('Nouveau nom du fichier',old,'Renommer');
      if(!v)return;let n=v.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').slice(0,120);
      const ext=(/\.[^.]+$/.exec(old)||[''])[0];if(ext&&!/\.[^.]+$/.test(n))n+=ext;      // on garde l'extension
      spec.rename(i,n);toast('Renommé : '+n);}}:null,
    {label:'Télécharger',run:()=>{const f=cur();dl(f,f.name);}},
    img?{label:'Copier l\'image',run:()=>copyImage(cur())}:null,
    spec.remove?{label:'Retirer de la liste',danger:true,run:()=>spec.remove(i)}:null,
    '-',
    {label:'Infos (taille, dimensions, pages)',run:()=>fileInfo(cur(),it)}
  ].filter(Boolean);
}

/* ---------- notes : le même menu partout ----------
   ops = {get(id), open(id), save(id, note modifiée), duplicate(id), remove(id), pdf(id)} — fourni par notes.js, ou LS_OPS ci-dessous */
function noteItems(id,ops){
  const n=ops.get(id);if(!n)return null;
  const upd=fn=>{const x=JSON.parse(JSON.stringify(ops.get(id)));fn(x);x.updated=Date.now();ops.save(id,x);};
  return tag({noteId:id,noteGet:ops.get},[
    {label:'Ouvrir',run:()=>ops.open(id)},
    {label:'Renommer…',run:async()=>{const v=await ask('Nouveau titre',n.title||'','Renommer');if(v)upd(x=>{x.title=v.slice(0,300);});}},
    {label:'Dupliquer',run:()=>{ops.duplicate(id);toast('Note dupliquée');}},
    {label:n.pinned?'Désépingler':'Épingler en haut',run:()=>{upd(x=>{x.pinned=!x.pinned;});toast(n.pinned?'Désépinglée':'Épinglée');}},
    {label:'Ajouter un tag…',run:async()=>{const v=await ask('Tag à ajouter','','Ajouter');if(v)upd(x=>{const t=v.replace(/,/g,' ').trim().slice(0,60);x.tags=x.tags||[];if(!x.tags.includes(t))x.tags.push(t);});}},
    '-',
    {label:'Exporter .md',run:()=>{const x=ops.get(id);dl(new Blob([(x.title?'# '+x.title+'\n\n':'')+(x.body||'')+'\n'],{type:'text/markdown'}),
      (x.title||'note').replace(/[^\w\-À-ÿ ]+/g,'').trim().replace(/\s+/g,'-')+'.md');}},
    {label:'Exporter PDF',run:()=>ops.pdf(id)},
    '-',
    {label:'Supprimer…',danger:true,run:async()=>{if(await confirm('Supprimer « '+(n.title||'Sans titre')+' » ? Cette action est définitive.','Supprimer'))ops.remove(id);}}
  ]);
}
/* les mêmes opérations directement sur le stockage (panneau Ctrl+J, résultats de recherche) */
const KEY='noxe-notes';
const readN=()=>{const d=getLS(KEY,null);return d&&d.notes?d:{notes:{},openId:null,deleted:{}};};
const after=()=>{if(window.notePanel&&notePanel.refresh)notePanel.refresh();if(hasNoxe()&&NOXE.refreshHome)NOXE.refreshHome();};
const LS_OPS={
  get:id=>readN().notes[id],
  open:id=>{if(window.notePanel)notePanel.open(id);else location.href='notes.html#'+encodeURIComponent(id);},
  save:(id,x)=>{const d=readN();if(!d.notes[id])return;d.notes[id]=sanitizeNote(x)||d.notes[id];setLS(KEY,d);after();},
  duplicate:id=>{const d=readN(),n=d.notes[id];if(!n)return;const nid='n_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6),t=Date.now();
    d.notes[nid]=Object.assign({},n,{id:nid,title:(n.title||'Sans titre')+' (copie)',created:t,updated:t,pinned:false});setLS(KEY,d);after();},
  remove:id=>{const d=readN();delete d.notes[id];(d.deleted||(d.deleted={}))[id]=Date.now();if(d.openId===id)d.openId=null;setLS(KEY,d);toast('Note supprimée');after();},
  pdf:id=>{location.href='notes.html?print=1#'+encodeURIComponent(id);}
};

/* ---------- qui fournit le menu ? (le premier qui répond gagne, par priorité) ---------- */
function add(fn,prio){providers.push({fn,prio:prio||50});providers.sort((a,b)=>a.prio-b.prio);}
function selectionText(t){
  if(isEditable(t)&&t.selectionStart!=null&&t.selectionEnd>t.selectionStart)return t.value.slice(t.selectionStart,t.selectionEnd);
  const s=getSelection(),txt=s&&s.toString();
  if(!txt||!txt.trim()||!s.rangeCount)return'';
  for(let i=0;i<s.rangeCount;i++)if(s.getRangeAt(i).intersectsNode(t))return txt;
  return'';
}
/* notes : résultats de recherche de l'accueil et liste du panneau */
add(t=>{
  const a=t.closest('.np-item[data-id], a.res-item[href^="notes.html#"]');if(!a)return null;
  const id=a.dataset.id||decodeURIComponent(a.getAttribute('href').split('#')[1]||'');
  const it=noteItems(id,LS_OPS);return it&&{items:it,title:(LS_OPS.get(id)||{}).title||'Note'};
},10);
/* fichiers chargés dans un outil */
add(t=>{
  if(!hasNoxe()||!NOXE.fileSpec)return null;
  const spec=NOXE.fileSpec();if(!spec)return null;
  const el=t.closest('[data-fi]');if(!el||!$('toolBody')||!$('toolBody').contains(el))return null;
  const it=fileItems(spec,+el.dataset.fi);if(!it)return null;
  const x=spec.get(+el.dataset.fi);return{items:it,title:x.name||x.file.name};
},20);
/* une sélection de texte (dans la page, ou dans un champ) */
add(t=>{const s=selectionText(t);return s?{items:textItems(s),title:'Sélection · '+s.length+' car.'}:null;},30);
/* une image / un canvas */
add(t=>{
  const el=t.closest('img,canvas');if(!el||el.id==='rain'||el.closest('#ctxMenu'))return null;
  if(el.tagName==='CANVAS'&&(el.id==='graph'||el.width<8))return null;
  return{items:imageItems(()=>fileOfImage(el)),title:'Image'};
},40);
/* un résultat d'outil */
add(t=>{
  const tb=$('toolBody');if(!tb||!tb.contains(t))return null;
  const el=t.closest('[data-result],.codebox[data-copy],.out .line[data-copy],textarea[readonly]');
  if(!el)return null;
  const v=el.dataset.copy!=null&&el.dataset.copy!==''?el.dataset.copy:el.value!=null&&el.tagName==='TEXTAREA'?el.value:el.textContent;
  return v&&v.trim()?{items:textItems(v),title:'Résultat'}:null;
},50);
/* une carte / un résultat d'outil sur l'accueil */
add(t=>{
  if(!hasNoxe())return null;
  const a=t.closest('a[href^="#/"]');if(!a)return null;
  const k=a.getAttribute('href').slice(2),T=NOXE.tools.find(x=>x.key===k);if(!T)return null;
  return{title:T.title,items:[
    {label:'Ouvrir',run:()=>NOXE.open(k)},
    {label:NOXE.isFav(k)?'Retirer des favoris':'Ajouter aux favoris',run:()=>{const on=NOXE.toggleFav(k);toast(on?'Ajouté aux favoris':'Retiré des favoris');if(NOXE.refreshHome)NOXE.refreshHome();}},
    {label:'Copier le lien',run:()=>copy(location.href.split('#')[0]+'#/'+k,'Lien copié')}
  ]};
},60);

/* ---------- le clic droit ---------- */
document.addEventListener('contextmenu',e=>{
  if(e.shiftKey||e.defaultPrevented)return;                  // Maj + clic droit : le menu du navigateur
  const t=e.target instanceof Element?e.target:e.target.parentElement;if(!t||t.closest('#ctxMenu'))return;
  if(isEditable(t)&&!selectionText(t))return;                // dans un champ sans sélection : copier/coller natif
  for(const p of providers){
    const r=p.fn(t,e);
    if(r&&r.items&&r.items.length){
      e.preventDefault();
      let x=e.clientX,y=e.clientY;
      if(!x&&!y){const b=t.getBoundingClientRect();x=b.left+8;y=b.top+Math.min(b.height,24);}   // ouvert au clavier (touche Menu)
      /* v6 : dernière entrée de chaque menu AVERSE */
      let items=r.items;
      if(typeof AI!=='undefined'&&(items.text||items.noteId))items=items.concat(AI.ctxItems(items));   // v7 : sous-menu IA ✦
      if(typeof FEEDBACK!=='undefined')items=items.concat(['-',{label:'Signaler / Suggérer…',run:()=>FEEDBACK.open()}]);
      open(x,y,items,r.title);return;
    }
  }
});

return{open,close,add,ask,confirm,info,message,noteItems,fileItems,textItems,imageItems,fileInfo,copyImage,LS_OPS,isOpen:()=>!!menu};
})();
