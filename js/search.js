/* search.js — v6 : la recherche GLOBALE de l'accueil (et Ctrl+K) dans les NOTES et le MÉMO
   (les outils restent notés par app.js). Pur JS, hors ligne.
   - Insensible aux accents et à la casse : fold() garde la MÊME LONGUEUR que le texte d'origine (1 caractère → 1 caractère),
     donc une position trouvée dans le texte « plié » est aussi la bonne dans le vrai texte → extrait surligné exact.
   - Rapide avec 500+ notes : le texte plié de chaque note est PRÉCALCULÉ et gardé en mémoire ; il n'est recalculé
     que pour les notes modifiées (date « updated » changée) quand le carnet change (comparaison du texte stocké,
     événement « storage » des autres onglets). Une recherche = quelques includes() sur des chaînes prêtes.
   - Extrait : ~40 caractères avant la 1re occurrence, ~110 après, tout échappé, mots trouvés dans <mark>. */
const SEARCH=(function(){
const KEY='noxe-notes',CM=/[\u0300-\u036f]/g,ch=new Map();
/* un caractère non ASCII → sa version minuscule sans accent, SEULEMENT si ça reste 1 caractère (sinon minuscule, sinon tel quel) */
function foldChar(c){
  let r=ch.get(c);if(r!==undefined)return r;
  const lc=c.toLowerCase();r=lc.length===1?lc:c;
  let d=r.normalize('NFD').replace(CM,'');if(d.length===1){const l=d.toLowerCase();r=l.length===1?l:d;}
  ch.set(c,r);return r;
}
const fold=s=>String(s==null?'':s).replace(/[A-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+32)).replace(/[^\x00-\x7f]/g,foldChar);
const nfc=s=>String(s==null?'':s).normalize('NFC');

/* ---------- index des notes ---------- */
let rawStr=null,idx=[];const cache=new Map();   // id → {u, title, ft, body, fb, tags, ftags}
const stats={builds:0,folded:0,ms:0};
function entry(n){
  const c=cache.get(n.id);
  if(c&&c.u===n.updated&&c.title===(n.title||''))return c;
  const title=nfc(n.title||''),body=nfc(n.body||''),tags=(Array.isArray(n.tags)?n.tags:[]).map(String);
  const e={id:n.id,u:n.updated,title:n.title||'',t:title,ft:fold(title),body,fb:fold(body),tags,ftags:fold(tags.join(' ')),pinned:!!n.pinned};
  cache.set(n.id,e);stats.folded++;return e;
}
function ensure(){
  let s=null;try{s=localStorage.getItem(KEY);}catch(e){}
  if(s===rawStr)return idx;
  const t0=performance.now();rawStr=s;
  let d=null;try{d=JSON.parse(s||'null');}catch(e){}
  const ns=d&&d.notes&&typeof d.notes==='object'?Object.values(d.notes).filter(n=>n&&typeof n.id==='string'):[];
  const seen=new Set();idx=ns.map(n=>{seen.add(n.id);return entry(n);});
  for(const k of cache.keys())if(!seen.has(k))cache.delete(k);   // notes supprimées
  stats.builds++;stats.ms=performance.now()-t0;
  return idx;
}
addEventListener('storage',e=>{if(e.key===KEY||e.key===null)ensure();});

const words=q=>[...new Set(fold(nfc(q)).trim().split(/\s+/).filter(Boolean))].sort((a,b)=>b.length-a.length);
/* surligne tous les mots dans raw (ft = fold(raw)) ; renvoie du HTML sûr */
function highlight(raw,f,ws){
  const iv=[];
  ws.forEach(w=>{let p=0;while((p=f.indexOf(w,p))>-1&&iv.length<200){iv.push([p,p+w.length]);p+=w.length;}});
  iv.sort((a,b)=>a[0]-b[0]);
  let out='',pos=0;
  for(const [a,b] of iv){if(b<=pos)continue;const s=Math.max(a,pos);out+=esc(raw.slice(pos,s))+'<mark>'+esc(raw.slice(s,b))+'</mark>';pos=b;}
  return out+esc(raw.slice(pos));
}
/* extrait autour de la 1re occurrence d'un des mots dans le corps */
function snippet(e,ws){
  let p=-1,w='';
  for(const x of ws){const i=e.fb.indexOf(x);if(i>-1&&(p<0||i<p)){p=i;w=x;}}
  let a,b;
  if(p<0){a=0;b=Math.min(e.body.length,140);}
  else{a=Math.max(0,p-40);b=Math.min(e.body.length,p+w.length+110);
    if(a>0){const sp=e.body.lastIndexOf(' ',p);const sp2=e.body.indexOf(' ',a);if(sp2>-1&&sp2<p)a=sp2+1;else if(sp>a)a=sp+1;}}
  const raw=e.body.slice(a,b),f=e.fb.slice(a,b);
  /* espaces / retours à la ligne repliés APRÈS le surlignage (les positions restent justes) */
  const html=highlight(raw,f,ws).replace(/\s+/g,' ').trim();
  return(a>0?'…':'')+html+(b<e.body.length?'…':'');
}
/* notes : [{id,title,titleHtml,snip,s,inBody}] + total */
function notes(q,limit){
  const ws=words(q);if(!ws.length)return{list:[],total:0};
  const out=[];
  for(const e of ensure()){
    let ok=true,s=0,tAll=true;
    for(const w of ws){
      const inT=e.ft.includes(w),inG=!inT&&e.ftags.includes(w),inB=!inT&&!inG&&e.fb.includes(w);
      if(!inT&&!inG&&!inB){ok=false;break;}
      if(!inT)tAll=false;
      s+=inT?(e.ft.startsWith(w)?30:20):inG?12:5;
    }
    if(!ok)continue;
    if(tAll)s+=20;if(e.pinned)s+=2;
    out.push({e,s});
  }
  out.sort((a,b)=>b.s-a.s||(b.e.u||0)-(a.e.u||0));
  return{total:out.length,list:out.slice(0,limit||8).map(({e,s})=>({type:'note',id:e.id,title:e.title||'Sans titre',
    titleHtml:highlight(e.t||'Sans titre',e.t?e.ft:fold('Sans titre'),ws),snip:snippet(e,ws),tags:e.tags,s}))};
}
/* mémo (NOXE.memo = sections de tools/memo.js) */
let memoIdx=null;
function memo(q,limit){
  const ws=words(q);if(!ws.length||typeof NOXE==='undefined'||!NOXE.memo)return{list:[],total:0};
  if(!memoIdx){memoIdx=[];NOXE.memo.forEach(([k,name,rows])=>rows.forEach(([d,v])=>memoIdx.push({k,name,d,v,fd:fold(d),fv:fold(v)})));}
  const out=[];
  for(const m of memoIdx){
    let s=0,ok=true;
    for(const w of ws){const a=m.fd.indexOf(w),b=m.fv.indexOf(w);
      if(a<0&&b<0){ok=false;break;}
      s+=a===0||b===0?12:(a>0&&/[^a-z0-9]/.test(m.fd[a-1]))?8:4;}
    if(ok)out.push({type:'memo',key:'memo',section:m.name,title:m.d,value:m.v,
      titleHtml:highlight(m.d,m.fd,ws),valueHtml:highlight(m.v,m.fv,ws),hint:'Mémo · '+m.name,s});
  }
  out.sort((a,b)=>b.s-a.s);
  return{total:out.length,list:out.slice(0,limit||6)};
}
return{fold,words,highlight,snippet,notes,memo,ensure,stats,reset:()=>{rawStr=null;cache.clear();memoIdx=null;}};
})();
window.SEARCH=SEARCH;   // accessible aussi comme propriété de window (tests du carnet : la CSP y interdit eval)
