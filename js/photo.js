/* photo.js — v9 : « Photo → note ». Prendre une photo (appareil photo du téléphone) ou choisir une image,
   lire le texte SUR L'APPAREIL (Tesseract.js, déjà fourni pour l'outil OCR, français + anglais), et en faire une note.
   · « Mettre au propre avec l'IA » (facultatif) : ta clé, ton fournisseur, avec l'aperçu habituel de ce qui part
     (ai.js) — rien n'est envoyé sans ce clic, et seulement le TEXTE lu (jamais l'image).
   · « Garder la photo en pièce jointe » : l'image est jointe à la note (attach.js : chiffrée pour la synchro).
   Pages : carnet (bouton, clic droit) et accueil (bouton 📷 de la barre). */
(function(){
const DIR='js/vendor/tesseract/';
const abs=p=>new URL(DIR+p,location.href).href;
const TYPES=/^image\/(png|jpeg|webp|gif|bmp)$/;
let worker=null,libP=null,ov=null,prevFocus=null;
function lib(){
  if(window.Tesseract)return Promise.resolve();
  return libP||(libP=new Promise((ok,ko)=>{const s=document.createElement('script');s.src=DIR+'tesseract.min.js';
    s.onload=()=>ok();s.onerror=()=>{libP=null;ko(new Error('moteur OCR introuvable'));};document.head.appendChild(s);}));
}
/* le moteur : fra+eng, gardé tant que la page est ouverte (le 2e scan est immédiat) */
let onLog=null;
async function engine(){
  if(worker)return worker;
  await lib();
  worker=await Tesseract.createWorker(['fra','eng'],1,{workerPath:abs('worker.min.js'),corePath:abs('core/'),langPath:abs('lang'),gzip:true,
    cacheMethod:'none',workerBlobURL:false,logger:m=>{if(onLog)onLog(m);}});
  return worker;
}
const STEP={'loading tesseract core':'chargement du moteur','initializing tesseract':'démarrage du moteur','loading language traineddata':'chargement des langues (fr + en)',
  'initializing api':'préparation','recognizing text':'lecture du texte'};
/* OCR par défaut ; remplaçable (tests : pas de moteur de 11 Mo) */
let OCR=async(file,prog)=>{onLog=m=>prog(STEP[m.status]||m.status,m.status==='recognizing text'?m.progress:null,m.progress);
  try{const w=await engine();const r=await w.recognize(file);return(r&&r.data&&r.data.text||'').trim();}finally{onLog=null;}};
const tidy=t=>String(t||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const titleOf=t=>{const l=String(t||'').split('\n').map(x=>x.replace(/^#+\s*/,'').trim()).find(x=>x.length>1);
  return l?l.slice(0,80):'Photo du '+new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});};

/* ---------- créer la note (carnet : notesApi ; accueil : addToNotebook) ---------- */
async function makeNote(text,file,keep){
  const title=titleOf(text),tags=['photo'];let id,body=text;
  if(window.notesApi&&notesApi.create)id=notesApi.create(title,body,tags);
  else id=addToNotebook(title,body,tags);
  if(keep&&file&&window.ATT){
    try{const m=await ATT.add(id,file);const ref='\n\n!['+m.name.replace(/[\[\]()]/g,'')+'](att:'+m.id+')';
      if(window.notesApi&&notesApi.update)notesApi.update(id,n=>{n.body=(n.body||'')+ref;});
      else{const K='noxe-notes';try{const d=JSON.parse(localStorage.getItem(K));if(d&&d.notes[id]){d.notes[id].body+=ref;d.notes[id].updated=Date.now();localStorage.setItem(K,JSON.stringify(d));}}catch(e){}}}
    catch(e){toast(e instanceof ATT.AttError?'Note créée, mais photo non jointe : '+e.message:'Note créée, photo non jointe');}
  }
  if(window.notesApi&&notesApi.open)notesApi.open(id);
  return id;
}
/* ---------- la fenêtre ---------- */
function close(){if(!ov)return;if(ov._g)ov._g.destroy();if(ov._u)URL.revokeObjectURL(ov._u);ov.remove();ov=null;removeEventListener('keydown',onKey,true);
  if(prevFocus&&prevFocus.isConnected)try{prevFocus.focus({preventScroll:true});}catch(e){}}
const onKey=e=>{if(e.key!=='Escape'||!ov||document.querySelector('.ai-ov'))return;e.preventDefault();e.stopImmediatePropagation();close();};
function open(file){
  close();prevFocus=document.activeElement;
  ov=document.createElement('div');ov.className='ctx-ov';ov.id='photoDlg';
  ov.innerHTML='<div class="ctx-dlg ph-dlg" role="dialog" aria-modal="true" aria-labelledby="phT">'+
    '<div class="ph-head"><span class="ph-gl"></span><div><div class="ctx-dt" id="phT">Photo → note</div>'+
    '<div class="ph-sub">Lecture du texte sur ton appareil (français + anglais). Rien n\'est envoyé.</div></div></div>'+
    '<div class="ph-pick" id="phPick">'+
      '<button type="button" class="tpl-b primary" data-ph="cam">📷 Prendre une photo</button>'+
      '<button type="button" class="tpl-b" data-ph="file">Choisir une image</button>'+
      '<div class="ph-hint">ou glisse-dépose / colle (Ctrl+V) une image ici</div></div>'+
    '<div class="ph-work" id="phWork" hidden><img class="ph-img" id="phImg" alt="photo à lire">'+
      '<div class="ph-right"><div class="ph-st" id="phSt" role="status" aria-live="polite"></div>'+
      '<label class="ai-l" for="phTxt">Texte lu (tu peux le corriger)</label><textarea id="phTxt" rows="9" spellcheck="true"></textarea>'+
      (window.ATT?'<label class="sh-opt"><input type="checkbox" id="phKeep" checked> garder la photo en pièce jointe</label>':'')+'</div></div>'+
    '<input type="file" id="phCam" accept="image/*" capture="environment" hidden><input type="file" id="phFile" accept="image/*" hidden>'+
    '<div class="ctx-db" id="phBtns"><button type="button" class="tpl-b" data-ph="x">Annuler</button></div></div>';
  document.body.appendChild(ov);addEventListener('keydown',onKey,true);
  const q=s=>ov.querySelector(s),g=GLYPH.create({size:64,kind:'photo'});q('.ph-gl').appendChild(g.el);ov._g=g;
  let cur=null,busy=false;
  const btns=h=>{q('#phBtns').innerHTML='<button type="button" class="tpl-b" data-ph="x">Annuler</button>'+h;};
  async function take(f){
    if(!f)return;
    if(!TYPES.test(f.type)){toast('Ce fichier n\'est pas une image (PNG, JPG, WEBP…)');return;}
    if(busy)return;busy=true;cur=f;
    q('#phPick').hidden=true;q('#phWork').hidden=false;
    if(ov._u)URL.revokeObjectURL(ov._u);ov._u=URL.createObjectURL(f);q('#phImg').src=ov._u;
    const st=q('#phSt'),ta=q('#phTxt');ta.value='';ta.disabled=true;btns('');
    g.set('download',{p:0});st.textContent='Préparation…';
    try{
      const t=await OCR(f,(label,p,pp)=>{if(!ov)return;st.textContent=label+(pp!=null&&isFinite(pp)?' — '+Math.round(pp*100)+' %':'');
        if(p!=null)g.progress(p);else if(pp!=null)g.set('download',{p:pp});});
      if(!ov)return;
      const txt=tidy(t);ta.value=txt;ta.disabled=false;g.set(txt?'done':'error');
      st.textContent=txt?txt.length+' caractères lus. Vérifie, puis crée la note.':'Aucun texte trouvé sur cette image. Tu peux l\'écrire toi-même.';
      btns('<button type="button" class="tpl-b" data-ph="ai" title="Structure en Markdown (titres, listes, formules) avec ton fournisseur d\'IA — aperçu avant envoi">Mettre au propre avec l\'IA</button>'+
        '<button type="button" class="tpl-b primary" data-ph="make">Créer la note</button>');
    }catch(e){if(!ov)return;g.set('error');ta.disabled=false;st.textContent='Lecture impossible : '+(e&&e.message||e)+'. Tu peux écrire le texte toi-même.';
      btns('<button type="button" class="tpl-b primary" data-ph="make">Créer la note</button>');}
    finally{busy=false;}
  }
  ov.addEventListener('click',async e=>{
    if(e.target===ov){if(!busy)close();return;}
    const b=e.target.closest('[data-ph]');if(!b)return;
    const keep=()=>!!(q('#phKeep')&&q('#phKeep').checked);
    switch(b.dataset.ph){
      case 'x':close();return;
      case 'cam':q('#phCam').click();return;
      case 'file':q('#phFile').click();return;
      case 'make':{const t=q('#phTxt').value.trim(),f=cur,k=keep();close();await makeNote(t,f,k);toast('Note créée depuis la photo');return;}
      case 'ai':{const t=q('#phTxt').value.trim();if(!t){toast('Rien à mettre au propre');return;}
        if(!window.AI){toast('IA indisponible ici');return;}
        const f=cur,k=keep();
        g.set('think');
        AI.run('ocrclean',{text:t,title:'Photo',useLabel:'Créer la note',onUse:async r=>{close();await makeNote(tidy(r)||t,f,k);toast('Note créée (mise au propre par l\'IA)');}});
        setTimeout(()=>{if(ov)g.set('done');},400);return;}
    }
  });
  ['phCam','phFile'].forEach(k=>q('#'+k).addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';take(f);}));
  const dlg=q('.ph-dlg');
  dlg.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files'))e.preventDefault();});
  dlg.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files[0];if(f){e.preventDefault();e.stopPropagation();take(f);}});
  dlg.addEventListener('paste',e=>{const f=e.clipboardData&&[...e.clipboardData.files].find(x=>TYPES.test(x.type));if(f){e.preventDefault();take(f);}});
  if(file)take(file);else q('[data-ph="cam"]').focus({preventScroll:true});
  return ov;
}
/* clic droit : sur une image (déjà gérée par ctxmenu : « Envoyer vers… ») → aussi « Photo → note » ;
   sur le fond de la liste du carnet → « Photo → note… » */
if(typeof CTX!=='undefined'){
  CTX.add(t=>{
    if(!t.closest('#list, #side .side-foot, #blank'))return null;
    if(t.closest('#list [data-id]'))return null;               // une note : son propre menu
    return{items:[{label:'📷 Photo → note…',run:()=>open()}],title:'Carnet'};
  },3);
}
/* boutons : carnet (#photoBtn) et accueil (#qPhoto) */
['photoBtn','qPhoto'].forEach(k=>{const b=document.getElementById(k);if(b){b.hidden=false;b.addEventListener('click',()=>open());}});
if(/^#photo$/.test(location.hash)&&document.getElementById('photoBtn'))setTimeout(()=>open(),300);
window.PHOTO={open,close,makeNote,titleOf,setEngine:f=>{OCR=f;},stop:()=>{if(worker){worker.terminate().catch(()=>{});worker=null;}}};
})();
