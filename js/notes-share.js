/* notes-share.js — v10 : « Partager vers AVERSE » crée une NOTE.
   Android (Chrome, appli installée) : menu Partager d'une autre appli → AVERSE. sw.js reçoit le POST (manifest
   « share_target »), range titre / texte / lien / fichiers dans le cache « averse-share » et ouvre notes.html?share=1.
   Ici, on en fait une note (tag « partage ») :
   - un LIEN : le titre de la page s'il a été fourni AVEC le partage (Chrome l'envoie), sinon l'adresse elle-même.
     AUCUNE requête vers le site partagé ni vers un tiers pour deviner le titre (vie privée, hors ligne) ;
   - du TEXTE : le corps de la note (titre = 1re ligne) ;
   - des IMAGES : jointes à la note (attach.js : chiffrées pour la synchro) et affichées ; bouton « Lire le texte (OCR) »
     — sur l'appareil (photo.js / Tesseract), seulement si tu cliques ;
   - un PDF : joint à la note ; un .txt / .md : son texte dans la note ; un .json : dans un bloc de code.
   iOS (Safari) ne gère pas share_target : voir README (raccourci iOS ou copier-coller). */
(function(){
const MAXT=100000;
const isUrl=s=>/^https?:\/\/[^\s]+$/i.test(String(s||'').trim());
const firstUrl=s=>(String(s||'').match(/https?:\/\/[^\s<>"]+/i)||[''])[0];
/* calcul pur (testé) : meta {title,text,url} + fichiers texte déjà lus → {title, body} */
function compose(meta,texts){
  meta=meta||{};const title0=String(meta.title||'').trim().slice(0,200),text=String(meta.text||'').trim().slice(0,MAXT);
  const link=String(meta.url||'').trim()||(isUrl(text)?text:firstUrl(text));
  let title='',body='';
  const rest=link&&text.trim()===link?'':text;
  if(link){
    title=title0&&title0!==link&&!isUrl(title0)?title0:link;        // titre fourni par le partage, sinon l'adresse
    body=(rest?rest+'\n\n':'')+(title!==link?'['+title.replace(/[\[\]]/g,'')+']('+link+')':'<'+link+'>');
  }else{
    const l=rest.split('\n').map(x=>x.replace(/^#+\s*/,'').trim()).find(x=>x);
    title=title0||(l?l.slice(0,80):'');body=rest;
  }
  (texts||[]).forEach(t=>{const json=/json$/i.test(t.type)||/\.json$/i.test(t.name);
    body+=(body?'\n\n':'')+(json?'```json\n'+t.text+'\n```':t.text);if(!title)title=t.name.replace(/\.[^.]+$/,'');});
  if(!title)title='Partage du '+new Date().toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
  return{title:title.slice(0,120),body};
}
/* lit (et VIDE) le cache de partage */
async function read(){
  if(!('caches' in window))return null;
  const c=await caches.open('averse-share'),m=await c.match('./__share/meta');if(!m)return null;
  const meta=await m.json().catch(()=>({})),files=[];
  for(let i=0;i<(meta.files|0)&&i<20;i++){const r=await c.match('./__share/'+i);if(!r)continue;const b=await r.blob();
    files.push(new File([b],decodeURIComponent(r.headers.get('x-name')||'fichier'),{type:b.type||r.headers.get('content-type')||''}));}
  for(const k of await c.keys())await c.delete(k);           // une seule fois
  return{meta,files};
}
const isText=f=>/^text\/|json$/.test(f.type)||/\.(txt|md|markdown|csv|json)$/i.test(f.name||'');
async function take(){
  const s=await read();if(!s)return null;
  const texts=[],att=[];
  for(const f of s.files){if(isText(f)&&f.size<=MAXT)texts.push({name:f.name||'texte.txt',type:f.type,text:(await f.text()).replace(/\r/g,'').trim()});else att.push(f);}
  const n=compose(s.meta,texts);
  const id=notesApi.create(n.title,n.body,['partage']);
  const imgs=[],bad=[];
  for(const f of att){
    if(!window.ATT){bad.push(f.name);continue;}
    try{const m=await ATT.add(id,f);if(/^image\//.test(m.type))imgs.push({m,f});
      notesApi.update(id,x=>{x.body=(x.body?x.body+'\n\n':'')+(/^image\//.test(m.type)?'!['+m.name.replace(/[\[\]()]/g,'')+'](att:'+m.id+')':'📎 '+m.name+' (pièce jointe)');});}
    catch(e){bad.push((f.name||'fichier')+' : '+(e&&e.message||e));}
  }
  notesApi.open(id);
  if(window.notesAtt)notesAtt.render();
  banner(id,imgs,bad);
  return id;
}
/* le bandeau sous la note : ce qui a été fait + OCR proposé pour les images */
function banner(id,imgs,bad){
  const host=document.getElementById('attBox');if(!host)return;
  const old=document.getElementById('shareIn');if(old)old.remove();
  const b=document.createElement('div');b.id='shareIn';b.className='share-in';b.setAttribute('role','status');
  b.innerHTML='<span>Partage reçu : nouvelle note'+(imgs.length?' · '+imgs.length+' image'+(imgs.length>1?'s':'')+' jointe'+(imgs.length>1?'s':''):'')+'.</span>'+
    (bad.length?'<span class="bad">Non joint : '+esc(bad.join(' · '))+'</span>':'')+
    (imgs.length&&window.PHOTO&&PHOTO.read?'<button type="button" class="ico-btn" data-sh="ocr">Lire le texte de '+(imgs.length>1?'ces images':'l\'image')+' (OCR, sur l\'appareil)</button>':'')+
    '<button type="button" class="ico-btn" data-sh="x" aria-label="Fermer">✕</button>';
  host.parentNode.insertBefore(b,host);
  b.addEventListener('click',async e=>{const k=e.target.closest('[data-sh]');if(!k)return;
    if(k.dataset.sh==='x'){b.remove();return;}
    k.disabled=true;k.textContent='Lecture…';
    try{const out=[];for(const x of imgs)out.push(await PHOTO.read(x.f,(l,p)=>{k.textContent=l+(p!=null?' '+Math.round(p*100)+' %':'');}));
      const t=out.filter(Boolean).join('\n\n');
      if(t)notesApi.update(id,n=>{n.body=(n.body||'')+'\n\n**Texte lu (OCR) :**\n\n'+t;});
      if(notesApi.current()===id)notesApi.open(id);
      k.remove();toast(t?'Texte ajouté à la note':'Aucun texte trouvé');}
    catch(err){k.disabled=false;k.textContent='OCR impossible : '+(err&&err.message||err);}});
}
const params=new URLSearchParams(location.search);
if(params.has('share')){
  const ok=params.get('share')!=='0';
  history.replaceState(null,'',location.pathname+location.hash);
  if(!ok)setTimeout(()=>toast('Partage reçu, mais illisible'),0);
  else setTimeout(()=>take().catch(e=>toast('Partage impossible : '+(e&&e.message||e))),0);
}
window.notesShare={compose,take};
})();
