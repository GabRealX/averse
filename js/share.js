/* share.js — v6 : partager UNE note, sans serveur.
   LIEN CHIFFRÉ : share.html#n1.<clé>.<données>
     · la note {v,t,b,g} est compressée (deflate-raw, CompressionStream) puis chiffrée (AES-GCM 128 bits, clé tirée au hasard) ;
     · tout est dans le FRAGMENT (après #) : un navigateur ne l'envoie JAMAIS au serveur (ni GitHub Pages ni personne
       ne voit la note) ; la clé n'existe que dans le lien. Option « clé à part » : le lien n'a pas la clé
       (share.html#n1..<données>) et tu l'envoies par un autre canal : le lien seul ne suffit plus.
     · limites : > 8 000 caractères, certaines messageries coupent le lien (avertissement) ; > 60 000 : refusé → fichier .md.
   AUTRES : fichier .md (déjà là), PDF (déjà là), partage du téléphone (Web Share API) quand il existe.
   Côté réception (share.html + share-view.js) : tout est revérifié (format, tailles, JSON) puis rendu par md.js qui échappe tout.
   Les fonctions encode/decode sont aussi testées seules (tests.html). */
const SHARE=(function(){
const WARN=8000,MAX=60000,MAXIN=400000,MAXOUT=1500000;   // MAXOUT : limite après décompression (anti « bombe »)
const te=new TextEncoder(),td=new TextDecoder();
const b64u=u8=>{let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64u=s=>{if(!/^[\w-]*$/.test(s))throw new Error('format');s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';
  const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;};
const hasCS=()=>typeof CompressionStream==='function'&&typeof DecompressionStream==='function';
async function pipe(u8,stream,limit){
  const r=new Blob([u8]).stream().pipeThrough(stream).getReader(),parts=[];let n=0;
  for(;;){const {done,value}=await r.read();if(done)break;n+=value.length;if(limit&&n>limit){r.cancel().catch(()=>{});throw new Error('trop gros');}parts.push(value);}
  const o=new Uint8Array(n);let p=0;parts.forEach(x=>{o.set(x,p);p+=x.length;});return o;
}
/* nettoie une note reçue (ou à envoyer) */
function clean(o){
  if(!o||typeof o!=='object'||o.v!==1)throw new Error('format');
  const t=typeof o.t==='string'?o.t.slice(0,300):'',b=typeof o.b==='string'?o.b.slice(0,200000):'';
  const g=Array.isArray(o.g)?o.g.filter(x=>typeof x==='string').map(x=>x.slice(0,60)).slice(0,20):[];
  return{v:1,t:t||'Note partagée',b,g};
}
/* note → {frag, key} ; frag = « n1.<clé>.<données> » (ou sans la clé si apart) */
async function encode(note,apart){
  const p=clean({v:1,t:note.title,b:note.body,g:note.tags});
  let raw=te.encode(JSON.stringify(p)),flag=0;
  if(hasCS()){const z=await pipe(raw,new CompressionStream('deflate-raw'));if(z.length<raw.length){raw=z;flag=1;}}
  const plain=new Uint8Array(raw.length+1);plain[0]=flag;plain.set(raw,1);   // 1er octet : 1 = compressé, 0 = brut
  const kb=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const k=await crypto.subtle.importKey('raw',kb,'AES-GCM',false,['encrypt']);
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,plain));
  const all=new Uint8Array(12+ct.length);all.set(iv);all.set(ct,12);
  const key=b64u(kb),data=b64u(all);
  return{frag:'n1.'+(apart?'':key)+'.'+data,key};
}
/* fragment (avec ou sans #) [+ clé donnée à part] → note propre. Erreurs : 'format' | 'clé' | 'trop gros' */
function parse(frag){
  frag=String(frag||'').replace(/^#/,'').trim();
  if(frag.length>MAXIN)throw new Error('trop gros');
  const m=/^n1\.([\w-]{22})?\.([\w-]{40,})$/.exec(frag);
  if(!m)throw new Error('format');
  return{key:m[1]||null,data:m[2]};
}
async function decode(frag,keyGiven){
  const p=parse(frag),ks=(p.key||String(keyGiven||'').trim());
  if(!/^[\w-]{22}$/.test(ks))throw new Error('clé');
  const kb=unb64u(ks),all=unb64u(p.data);if(kb.length!==16||all.length<30)throw new Error('format');
  let plain;
  try{const k=await crypto.subtle.importKey('raw',kb,'AES-GCM',false,['decrypt']);
    plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:all.subarray(0,12)},k,all.subarray(12)));}
  catch(e){throw new Error('clé');}                       // mauvaise clé OU lien abîmé (GCM vérifie l'intégrité)
  let raw=plain.subarray(1);
  if(plain[0]===1){if(!hasCS())throw new Error('navigateur');raw=await pipe(raw,new DecompressionStream('deflate-raw'),MAXOUT);}
  else if(plain[0]!==0)throw new Error('format');
  if(raw.length>MAXOUT)throw new Error('trop gros');
  let o;try{o=JSON.parse(td.decode(raw));}catch(e){throw new Error('format');}
  return clean(o);
}
const linkFor=frag=>new URL('share.html',location.href).href.split('#')[0]+'#'+frag;
const fileName=t=>(String(t||'note').replace(/[\\/:*?"<>|#]+/g,' ').replace(/\s+/g,' ').trim().slice(0,80)||'note')+'.md';
const mdText=n=>'# '+(n.title||'')+'\n'+((n.tags||[]).length?'\nTags : '+n.tags.map(x=>'#'+x).join(' ')+'\n':'')+'\n'+(n.body||'');

/* ---------- la fenêtre « Partager » (page carnet) ---------- */
let ov=null,prevFocus=null;
function close(){if(!ov)return;ov.remove();ov=null;removeEventListener('keydown',onKey,true);if(prevFocus&&prevFocus.isConnected)prevFocus.focus({preventScroll:true});}
const onKey=e=>{if(e.key==='Escape'&&ov){e.preventDefault();e.stopImmediatePropagation();close();}};
async function dialog(note){
  close();prevFocus=document.activeElement;
  ov=document.createElement('div');ov.className='ctx-ov';ov.id='shareDlg';
  const canShare=typeof navigator.share==='function';
  ov.innerHTML='<div class="ctx-dlg share-dlg" role="dialog" aria-modal="true" aria-labelledby="shT">'+
    '<div class="ctx-dt" id="shT">Partager « '+esc(note.title||'Sans titre')+' »</div>'+
    '<p class="ctx-msg">Lien chiffré : la note est <b>dans le lien</b> (après le #), chiffrée avec une clé tirée au hasard. Aucun serveur ne la voit ; qui a le lien peut la lire (en lecture seule) et l\'importer dans son carnet.</p>'+
    '<label class="sh-opt"><input type="checkbox" id="shApart"> envoyer la clé à part (le lien seul ne suffit plus)</label>'+
    '<textarea id="shLink" class="sh-link" readonly rows="3" aria-label="Lien de partage"></textarea>'+
    '<div class="sh-key" id="shKeyRow" hidden>Clé : <code id="shKey"></code> <button type="button" class="tpl-b" data-a="copykey">Copier la clé</button></div>'+
    '<p class="sh-info" id="shInfo" aria-live="polite">Préparation…</p>'+
    '<div class="ctx-db sh-btns">'+
      '<button type="button" class="tpl-b primary" data-a="copy" id="shCopy">Copier le lien</button>'+
      (canShare?'<button type="button" class="tpl-b" data-a="native" id="shNative">Partager…</button>':'')+
      '<button type="button" class="tpl-b" data-a="md">Fichier .md</button>'+
      '<button type="button" class="tpl-b" data-a="pdf">PDF</button>'+
      '<button type="button" class="tpl-b" data-a="x">Fermer</button></div></div>';
  document.body.appendChild(ov);
  addEventListener('keydown',onKey,true);
  ov.addEventListener('click',e=>{if(e.target===ov)close();});
  const $q=s=>ov.querySelector(s);let cur=null;
  async function build(){
    const info=$q('#shInfo');cur=null;
    try{
      const r=await encode(note,$q('#shApart').checked),url=linkFor(r.frag);
      if(!ov)return;
      $q('#shKeyRow').hidden=!$q('#shApart').checked;$q('#shKey').textContent=r.key;
      if(url.length>MAX){
        $q('#shLink').value='';$q('#shCopy').disabled=true;
        info.className='sh-info bad';info.textContent='Note trop longue pour un lien ('+url.length.toLocaleString('fr-FR')+' caractères, limite '+MAX.toLocaleString('fr-FR')+'). Envoie plutôt le fichier .md (bouton ci-dessous'+(canShare?', ou « Partager… »':'')+').';
        return;}
      cur={url,key:r.key};$q('#shLink').value=url;$q('#shCopy').disabled=false;
      info.className='sh-info'+(url.length>WARN?' warn':'');
      info.textContent=url.length.toLocaleString('fr-FR')+' caractères'+(url.length>WARN?' — lien long : certaines messageries le coupent. Si ça ne marche pas, envoie le fichier .md.':' — chiffré (AES-GCM), lecture seule.');
    }catch(e){info.className='sh-info bad';info.textContent='Impossible de créer le lien ici ('+e.message+'). Utilise le fichier .md.';$q('#shCopy').disabled=true;}
  }
  $q('#shApart').addEventListener('change',build);
  ov.addEventListener('click',async e=>{
    const b=e.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
    if(a==='x')close();
    else if(a==='copy'&&cur){await copyText(cur.url);toast($q('#shApart').checked?'Lien copié — envoie la clé par un autre moyen':'Lien copié');}
    else if(a==='copykey'&&cur){await copyText(cur.key);toast('Clé copiée');}
    else if(a==='md'){download(fileName(note.title),mdText(note),'text/markdown');}
    else if(a==='pdf'){close();if(typeof printNote==='function')printNote();}
    else if(a==='native'){
      try{
        if(cur)await navigator.share({title:note.title||'Note',text:'Note partagée depuis AVERSE (chiffrée, lecture seule)',url:cur.url});
        else{const f=new File([mdText(note)],fileName(note.title),{type:'text/markdown'});
          if(navigator.canShare&&navigator.canShare({files:[f]}))await navigator.share({files:[f],title:note.title||'Note'});
          else download(fileName(note.title),mdText(note),'text/markdown');}
      }catch(err){if(err&&err.name!=='AbortError')toast('Partage impossible : '+err.message);}
    }
  });
  $q('#shCopy').focus();
  await build();
}
async function copyText(s){
  try{await navigator.clipboard.writeText(s);}
  catch(e){const t=ov&&ov.querySelector('#shLink');if(t){t.select();try{document.execCommand('copy');}catch(_){}}}
}
function download(name,text,type){
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:type+';charset=utf-8'}));
  a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
}
/* bouton « Partager » du carnet */
if(typeof document!=='undefined'){const b=document.getElementById('shareBtn');
  if(b&&typeof data!=='undefined')b.addEventListener('click',()=>{const n=data.notes[data.openId];if(n)dialog(n);});}
return{encode,decode,parse,clean,linkFor,dialog,close,WARN,MAX,hasCS};
})();
window.SHARE=SHARE;   // accessible aussi comme propriété de window (tests du carnet : la CSP y interdit eval)
