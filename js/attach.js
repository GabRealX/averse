/* attach.js — v9 : PIÈCES JOINTES d'une note (images, PDF).
   - Ajout : bouton « + Joindre », glisser-déposer sur l'éditeur, coller (Ctrl+V) une image, ou Photo → note (photo.js).
   - Stockage local : le fichier dans IndexedDB (base « averse-att »), la liste (nom, type, taille, note) dans localStorage
     « averse-att » avec ses pierres tombales — comme les notes, en clair SUR l'appareil.
   - Synchro (cloud.js) : la liste voyage DANS le coffre chiffré des notes ; chaque fichier part dans un 2e Gist secret
     (« AVERSE — pièces jointes ») sous la forme a-<id>.bin = base64( iv | AES-GCM(fichier) ) chiffré avec la clé de
     données de la synchro (celle des notes), lié à son identifiant (AAD). GitHub ne voit ni le contenu, ni le nom.
     2e Gist : le Gist des notes reste léger (GitHub renvoie le contenu de TOUS les fichiers à chaque lecture).
   - Limites : 5 Mo par pièce (après compression), 50 Mo au total, 200 pièces : refus propre au-delà, total affiché.
     Photos : compression WebP optionnelle (réglage « compresser les photos », activé par défaut).
   - Suppression synchronisée (pierres tombales), incluse dans la Sauvegarde complète (backup.js) et l'Export.
   - Le lien de partage d'une note N'inclut PAS les pièces jointes (dit dans la fenêtre Partager).
   - Dans le texte : ![nom](att:ID) affiche l'image dans l'aperçu (md.js) ; rien d'autre n'est chargé. */
const ATT=(function(){
const TEST=sessionStorage.getItem('averse-tests')==='1';
const MKEY='averse-att',SKEY='averse-att-sync',PKEY='averse-att-webp',DBN=TEST?'averse-tests-att':'averse-att';
const MAX=5*1024*1024,TOTAL=50*1024*1024,MAXN=200;
const DRAWT='application/vnd.averse.draw+json';            // v10 : dessin (draw.js) = JSON vectoriel, rendu en SVG PAR AVERSE
const TYPES={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','application/pdf':'pdf',[DRAWT]:'json'};   // pas de SVG importé (scripts)
const RE_ID=/^a[\w-]{6,40}$/;
const te=new TextEncoder();
const now=()=>Date.now();
const mo=n=>!n?'0 Mo':n<1e6?Math.max(1,Math.round(n/1e3))+' Ko':(n/1048576).toFixed(1).replace('.',',')+' Mo';

/* ---------- la liste (métadonnées) ---------- */
function meta(){const m=getLS(MKEY,null)||{};return{gist:m.gist&&typeof m.gist==='object'?m.gist:null,items:m.items&&typeof m.items==='object'?m.items:{},deleted:m.deleted&&typeof m.deleted==='object'?m.deleted:{}};}
function putMeta(m){setLS(MKEY,m);}
function clean(x){                                          // on ne fait pas confiance à ce qui arrive (synchro, sauvegarde)
  if(!x||typeof x!=='object'||typeof x.id!=='string'||!RE_ID.test(x.id)||!TYPES[x.type])return null;
  const n=v=>(v=+v,isFinite(v)&&v>0?Math.min(v,now()+864e5):0);
  if(typeof x.note!=='string'||!/^[\w-]{1,64}$/.test(x.note))return null;
  const size=n(x.size);if(!size||size>MAX)return null;
  return{id:x.id,note:x.note,name:String(x.name||'fichier').replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').slice(0,120),type:x.type,size,created:n(x.created)||n(x.updated)||now(),updated:n(x.updated)||now()};
}
const listen=[];
function changed(why){listen.forEach(f=>{try{f(why);}catch(e){}});if(why!=='merge'&&window.cloudLater)cloudLater();}

/* ---------- les fichiers (IndexedDB) ---------- */
let dbp=null;
const db=()=>dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open(DBN,1);r.onupgradeneeded=()=>r.result.createObjectStore('blob');r.onsuccess=()=>res(r.result);r.onerror=()=>{dbp=null;rej(r.error);};}));
const tx=async(mode,fn)=>{const d=await db();return new Promise((res,rej)=>{const t=d.transaction('blob',mode),s=t.objectStore('blob');let out;const q=fn(s);if(q)q.onsuccess=()=>{out=q.result;};
  t.oncomplete=()=>res(out);t.onerror=e=>{e.preventDefault();};t.onabort=()=>rej(t.error||new Error('IndexedDB : écriture refusée (espace plein ?)'));});};
/* on range des OCTETS (ArrayBuffer + type), pas des Blob : Safari en navigation privée (et WebKit « éphémère »)
   refuse les Blob dans IndexedDB (« Error preparing Blob/File data… ») */
const putBlob=async(id,b)=>{const rec={type:b.type||'',buf:await b.arrayBuffer()};return tx('readwrite',s=>s.put(rec,id));};
const getBlob=id=>tx('readonly',s=>s.get(id)).then(r=>!r?null:r instanceof Blob?r:new Blob([r.buf],{type:r.type})).catch(()=>null);
const delBlob=id=>tx('readwrite',s=>s.delete(id)).catch(()=>{});
const haveIds=()=>tx('readonly',s=>s.getAllKeys()).then(k=>new Set(k||[])).catch(()=>new Set());

/* ---------- ajout ---------- */
const pref=()=>localStorage.getItem(PKEY)!=='off';
function setPref(on){try{localStorage.setItem(PKEY,on?'on':'off');}catch(e){}}
/* photo → WebP (si le navigateur sait l'encoder et si c'est plus petit) ; max 2560 px de côté */
async function compress(f){
  if(!/^image\/(jpeg|png)$/.test(f.type)||f.size<200*1024||typeof createImageBitmap!=='function')return f;
  try{const bm=await createImageBitmap(f),k=Math.min(1,2560/Math.max(bm.width,bm.height));
    const c=document.createElement('canvas');c.width=Math.round(bm.width*k);c.height=Math.round(bm.height*k);c.getContext('2d').drawImage(bm,0,0,c.width,c.height);if(bm.close)bm.close();
    const b=await new Promise(r=>c.toBlob(r,'image/webp',.82));
    if(b&&b.type==='image/webp'&&b.size<f.size)return new File([b],String(f.name||'photo').replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp'});
  }catch(e){}
  return f;                                                  // Safari (pas d'encodeur WebP) : l'original
}
function used(){const m=meta(),l=Object.values(m.items);return{n:l.length,bytes:l.reduce((a,x)=>a+(x.size||0),0)};}
class AttError extends Error{}
async function add(noteId,file,o){
  o=o||{};
  if(!file)throw new AttError('aucun fichier');
  let type=file.type||(/\.pdf$/i.test(file.name||'')?'application/pdf':'');
  if(!TYPES[type])throw new AttError('« '+(file.name||'fichier')+' » : seulement les images (PNG, JPG, WebP, GIF) et les PDF');
  let f=file;if(type!==file.type)f=new File([file],file.name||'fichier',{type});
  if((o.compress==null?pref():o.compress)&&/^image\//.test(type))f=await compress(f);
  if(f.size>MAX)throw new AttError('« '+(file.name||'fichier')+' » fait '+mo(f.size)+' : 5 Mo maximum par pièce jointe'+(/^image\//.test(type)?' (même compressée)':''));
  const u=used();
  if(u.n>=MAXN)throw new AttError('200 pièces jointes au maximum');
  if(u.bytes+f.size>TOTAL)throw new AttError('plus de place : '+mo(u.bytes)+' déjà utilisés sur 50 Mo (supprime des pièces jointes)');
  const id='a'+now().toString(36)+[...crypto.getRandomValues(new Uint8Array(6))].map(x=>x.toString(36).padStart(2,'0')).join('').slice(0,10);
  await putBlob(id,new Blob([await f.arrayBuffer()],{type:f.type}));
  const m=meta(),t=now();
  m.items[id]={id,note:noteId,name:String(f.name||('fichier.'+TYPES[f.type])).replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'-').slice(0,120),type:f.type,size:f.size,created:t,updated:t};
  putMeta(m);changed('add');
  return m.items[id];
}
async function remove(id){
  const m=meta();if(!m.items[id])return false;
  delete m.items[id];m.deleted[id]=now();putMeta(m);await delBlob(id);revoke(id);changed('remove');return true;
}
async function removeNote(noteId){const l=list(noteId);for(const x of l)await remove(x.id);return l.length;}
const list=noteId=>Object.values(meta().items).filter(x=>!noteId||x.note===noteId).sort((a,b)=>a.created-b.created||(a.id<b.id?-1:1));
const get=id=>meta().items[id]||null;

/* adresses blob: pour l'aperçu (gardées tant que la page vit) */
const URLS={};
async function url(id){if(URLS[id])return URLS[id];const b=await getBlob(id);if(!b)return null;return URLS[id]=URL.createObjectURL(b);}
function revoke(id){if(URLS[id]){URL.revokeObjectURL(URLS[id]);delete URLS[id];}}
/* les <img data-att> produites par md.js : on y met l'image (ou un message si elle n'est pas encore là) */
function resolve(root){
  if(!root)return;
  root.querySelectorAll('img[data-att]').forEach(async im=>{const id=im.dataset.att,m=get(id);
    if(m&&m.type===DRAWT&&window.DRAW){const d=await DRAW.load(id);                 // v10 : dessin → SVG généré ici (que des <path>)
      if(d){if(im.dataset.u)URL.revokeObjectURL(im.dataset.u);const u=DRAW.svgUrl(d);im.dataset.u=u;im.src=u;im.classList.add('att-draw');im.title='Dessin — toucher pour le modifier';
        im.alt=im.alt||'dessin';im.tabIndex=0;im.setAttribute('role','button');return;}}
    const u=m&&/^image\//.test(m.type)?await url(id):null;
    if(u){im.src=u;im.title=m.name;}
    else{const s=document.createElement('span');s.className='att-miss';s.textContent=m?'[pièce jointe « '+m.name+' » : pas encore reçue sur cet appareil]':'[pièce jointe introuvable]';im.replaceWith(s);}});
}
async function open(id){const u=await url(id);if(!u){toast('Fichier pas encore reçu sur cet appareil');return;}window.open(u,'_blank','noopener');}
async function download(id){const m=get(id),b=await getBlob(id);if(!m||!b){toast('Fichier pas encore reçu sur cet appareil');return;}
  const u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=m.name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}

/* ---------- synchro : la liste (dans le coffre chiffré des notes) ---------- */
function payload(){
  const m=meta(),items={},deleted={};
  Object.keys(m.items).sort().forEach(k=>{const c=clean(m.items[k]);if(c)items[k]=c;});
  Object.keys(m.deleted).sort().forEach(k=>{deleted[k]=m.deleted[k];});
  if(!Object.keys(items).length&&!Object.keys(deleted).length&&!m.gist)return null;   // pas de pièce jointe : coffre identique à la v8
  const o={items,deleted};if(m.gist)o.gist={id:m.gist.id,t:m.gist.t};return o;
}
/* fusion : la plus récente gagne, pierres tombales ; le Gist des pièces : le plus ancien créé (les deux appareils convergent) */
function merge(d){
  if(!d||typeof d!=='object')return 0;
  const m=meta();let n=0;
  if(d.gist&&typeof d.gist.id==='string'&&/^[0-9a-f]{20,40}$/.test(d.gist.id)){const g={id:d.gist.id,t:+d.gist.t||0};
    if(!m.gist||g.t<m.gist.t||g.t===m.gist.t&&g.id<m.gist.id){if(!m.gist||m.gist.id!==g.id)n++;m.gist=g;}}
  if(d.deleted&&typeof d.deleted==='object')Object.entries(d.deleted).forEach(([id,t])=>{t=+t||0;if(RE_ID.test(id)&&t>(m.deleted[id]||0)){m.deleted[id]=Math.min(t,now()+864e5);}});
  if(d.items&&typeof d.items==='object')Object.values(d.items).forEach(x=>{const c=clean(x);if(!c)return;
    if((m.deleted[c.id]||0)>=c.updated)return;
    const l=m.items[c.id];if(!l||c.updated>l.updated){m.items[c.id]=c;n++;}});
  const gone=[];
  Object.keys(m.deleted).forEach(id=>{const x=m.items[id];if(x&&x.updated<=m.deleted[id]){delete m.items[id];gone.push(id);n++;}});
  Object.keys(m.deleted).forEach(id=>{if(now()-m.deleted[id]>90*864e5)delete m.deleted[id];});
  putMeta(m);gone.forEach(id=>{delBlob(id);revoke(id);});
  if(n)changed('merge');
  return n;
}

/* ---------- synchro : les fichiers (2e Gist), appelée par cloud.js APRÈS la synchro des notes ----------
   ctx = {gh(method, path, body, opt), raw(url) → texte, key (clé de données, AES-GCM non exportable)}
   « empreinte » de l'état : si rien n'a bougé depuis la dernière fois → AUCUNE requête. */
const fnv=s=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return(h>>>0).toString(36)+'.'+s.length;};
const FNAME=id=>'a-'+id+'.bin';
const README='Pièces jointes du carnet AVERSE, chiffrées (AES-GCM) avec la clé de ta synchro. Ne pas modifier à la main.';
async function sig(have){have=have||await haveIds();const m=meta();
  return fnv(JSON.stringify([m.gist&&m.gist.id,Object.keys(m.items).sort(),Object.keys(m.deleted).filter(k=>!m.items[k]).sort(),[...have].filter(k=>m.items[k]).sort()]));}
const ss=()=>getLS(SKEY,null)||{};
const putSS=s=>setLS(SKEY,s);
function b64(u){let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s);}
function unb64(s){const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;}
async function seal(key,id,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:te.encode('averse-att|'+id)},key,bytes));return'AVATT1.'+b64(iv)+'.'+b64(ct);}
async function unseal(key,id,txt){const p=String(txt||'').trim().split('.');if(p[0]!=='AVATT1'||p.length!==3)throw new AttError('format');
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p[1]),additionalData:te.encode('averse-att|'+id)},key,unb64(p[2])));}
let busy=null;
function syncBlobs(ctx,force){if(busy)return busy;busy=run(ctx,force).finally(()=>{busy=null;});return busy;}
async function run(ctx,force){
  const out={req:0,up:0,down:0,del:0,err:0};
  const have=await haveIds(),s=ss(),m0=meta();
  const sg=await sig(have);if(!force&&s.sig===sg&&s.gist===(m0.gist&&m0.gist.id))return out;   // rien de neuf : pas de requête
  const live=Object.values(m0.items),mine=live.filter(x=>have.has(x.id)),missing=live.filter(x=>!have.has(x.id));
  let gid=m0.gist&&m0.gist.id;
  if(!gid){
    if(!mine.length){putSS({sig:sg});return out;}            // rien à envoyer (et rien à recevoir sans Gist)
    const r=await ctx.gh('POST','/gists',{description:'AVERSE — pièces jointes chiffrées (ne pas modifier à la main)',public:false,files:{'LISEZMOI.txt':{content:README}}});out.req++;
    const m=meta();if(!m.gist){m.gist={id:r.json.id,t:now()};putMeta(m);changed('gist');}   // la liste (avec l'adresse du Gist) repart avec les notes
    gid=meta().gist.id;
  }
  /* l'état du Gist (lecture conditionnelle : 304 s'il n'a pas bougé) ; sans etag si un fichier qu'on sait là-bas manque ici */
  const known=new Set(s.gist===gid?(s.files||[]):[]),needBody=missing.some(x=>known.has(FNAME(x.id)));
  const r=await ctx.gh('GET','/gists/'+gid,null,{etag:!needBody&&s.gist===gid&&s.etag||null,notFound:'Gist des pièces jointes introuvable'});out.req++;
  let files;
  if(r.status===304)files=s.files||[];
  else{files=Object.keys(r.json.files||{});s.etag=r.etag||null;}
  const remote=new Set(files.filter(f=>/^a-.+\.bin$/.test(f)).map(f=>f.slice(2,-4)));
  /* 1. réception de ce qui manque ici */
  for(const x of missing){if(!remote.has(x.id)||r.status===304)continue;
    try{const f=r.json.files[FNAME(x.id)];let txt=f.content;
      if(f.truncated||txt==null){txt=await ctx.raw(f.raw_url);out.req++;}
      const bytes=await unseal(ctx.key,x.id,txt);
      if(get(x.id)){await putBlob(x.id,new Blob([bytes],{type:x.type}));out.down++;}
    }catch(e){out.err++;}}
  /* 2. envoi de ce qui manque là-bas (une pièce par écriture : requêtes de taille raisonnable) */
  for(const x of mine){if(remote.has(x.id))continue;
    const b=await getBlob(x.id);if(!b||!get(x.id))continue;
    const txt=await seal(ctx.key,x.id,new Uint8Array(await b.arrayBuffer()));
    await ctx.gh('PATCH','/gists/'+gid,{files:{[FNAME(x.id)]:{content:txt}}});out.req++;out.up++;remote.add(x.id);s.etag=null;}
  /* 3. suppressions (pierres tombales) : les fichiers quittent aussi le Gist (une seule écriture) */
  const m=meta(),gone=[...remote].filter(id=>!m.items[id]&&m.deleted[id]);
  if(gone.length){const f={};gone.forEach(id=>{f[FNAME(id)]=null;remote.delete(id);});
    await ctx.gh('PATCH','/gists/'+gid,{files:f});out.req++;out.del+=gone.length;s.etag=null;}
  /* encore des fichiers attendus de l'autre appareil : on revérifiera (304 tant que son Gist ne bouge pas) */
  const have2=await haveIds(),left=Object.values(meta().items).some(x=>!have2.has(x.id));
  s.files=[...remote].map(FNAME);s.gist=gid;s.sig=out.err||left?'':await sig();putSS(s);
  if(out.down)changed('merge');
  return out;
}

/* ---------- sauvegarde / export : tout, fichiers compris (base64) ---------- */
async function exportAll(){
  const p=payload();if(!p)return null;
  const blobs={};for(const id of Object.keys(p.items)){const b=await getBlob(id);if(b)blobs[id]=b64(new Uint8Array(await b.arrayBuffer()));}
  return{items:p.items,deleted:p.deleted,blobs};
}
function validate(a){                                        // une sauvegarde importée : revérifiée entièrement
  if(!a||typeof a!=='object')return null;
  const o={items:{},deleted:{},blobs:{}};let rej=0;
  if(a.items&&typeof a.items==='object')Object.values(a.items).slice(0,MAXN).forEach(x=>{const c=clean(x);if(c)o.items[c.id]=c;else rej++;});
  if(a.deleted&&typeof a.deleted==='object')Object.entries(a.deleted).forEach(([id,t])=>{if(RE_ID.test(id)&&isFinite(+t)&&+t>0)o.deleted[id]=Math.min(+t,now());else rej++;});
  if(a.blobs&&typeof a.blobs==='object')Object.keys(a.blobs).forEach(id=>{const v=a.blobs[id];
    if(o.items[id]&&typeof v==='string'&&v.length<=Math.ceil(MAX/3)*4+8&&/^[A-Za-z0-9+/=]*$/.test(v))o.blobs[id]=v;else rej++;});
  o.rejected=rej;return o;
}
async function importAll(v){
  if(!v)return 0;let n=0;
  const have=await haveIds();
  for(const id of Object.keys(v.blobs)){if(have.has(id))continue;const x=v.items[id];
    const u=unb64(v.blobs[id]);if(u.length!==x.size)continue;await putBlob(id,new Blob([u],{type:x.type}));n++;}
  const m=meta();
  Object.values(v.items).forEach(x=>{if(m.deleted[x.id]){delete m.deleted[x.id];x.updated=Math.max(x.updated,now());}});   // réimportée exprès
  putMeta(m);merge({items:v.items,deleted:v.deleted});changed('import');
  return n;
}

return{blob:getBlob,DRAWT,add,remove,removeNote,list,get,used,url,open,download,resolve,payload,merge,syncBlobs,sig,exportAll,validate,importAll,
  pref,setPref,on:f=>listen.push(f),mo,MAX,TOTAL,MAXN,TYPES,AttError,getBlob,haveIds,
  _seal:seal,_unseal:unseal,_dropBlob:id=>delBlob(id).then(()=>revoke(id)),_reset:async()=>{Object.keys(URLS).forEach(revoke);try{const d=await db();d.close();}catch(e){}dbp=null;}};
})();
window.ATT=ATT;
