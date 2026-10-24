/* backup.js — la sauvegarde COMPLÈTE d'AVERSE dans un seul fichier JSON :
   notes (+ pierres tombales), favoris, récents, champs mémorisés des outils, réglages (style, pluie, couleur d'accent v6),
   et (v6) tes modèles de note (templates.js).
   Jamais dedans : les secrets (outil JWT, champs mot de passe / clé / jeton, valeurs qui ressemblent à un JWT).
   À l'import, TOUT est revérifié (on ne fait pas confiance au fichier) puis fusionné — rien n'est écrasé à l'aveugle.
   Utilisé par l'outil « Sauvegarde » (tools/sauvegarde.js) et par le carnet (notes.html). */
const BACKUP=(function(){
const K={notes:'noxe-notes',fav:'averse-fav',recent:'averse-recent',fields:'averse-in',style:'averse-style',rain:'averse-rain',accent:'averse-accent'};
const RE_HEX=/^#[0-9a-f]{6}$/i;
const RE_ID=/^[\w-]{1,40}$/,MAXLEN=20000;
const ID={test:k=>RE_ID.test(k)&&!/^(__proto__|constructor|prototype)$/.test(k)};   // jamais de clé qui toucherait au prototype
const raw=k=>{try{return localStorage.getItem(k);}catch(e){return null;}};
const tools=()=>typeof NOXE!=='undefined'&&NOXE.tools?NOXE.tools:null;
const known=k=>{const t=tools();return!t||t.some(x=>x.key===k);};        // sans le registre (carnet), on vérifie juste la forme
const noMem=k=>{const t=tools(),x=t&&t.find(y=>y.key===k);return k==='jwt'||!!(x&&x.mem===false);};

/* est-ce un secret ? (on préfère en exclure un de trop) */
const SECRET_ID=/(pw|pass|secret|key|token|hmac|pin|auth|cred)/i;
const looksJWT=v=>typeof v==='string'&&/\beyJ[\w-]{4,}\.[\w-]{4,}\.?[\w-]*/.test(v);
function isSecret(tool,id,v){return noMem(tool)||SECRET_ID.test(id)||looksJWT(v);}

/* ---------- export ---------- */
function build(){
  let skipped=0;
  const nd=getLS(K.notes,null)||{notes:{},deleted:{}};
  const fields={},src=getLS(K.fields,{});
  Object.keys(src||{}).forEach(t=>{
    if(!ID.test(t)||!src[t]||typeof src[t]!=='object')return;
    Object.keys(src[t]).forEach(id=>{
      const v=src[t][id];
      if(isSecret(t,id,v)){skipped++;return;}
      (fields[t]||(fields[t]={}))[id]=v;
    });
  });
  const data={app:'averse',kind:'sauvegarde',version:1,date:new Date().toISOString(),
    notes:nd.notes||{},deleted:nd.deleted||{},
    fav:getLS(K.fav,[]),recent:getLS(K.recent,[]),fields,
    settings:{style:raw(K.style)==='normal'?'normal':'ascii',rain:raw(K.rain)==='on'?'on':'off'}};
  /* v6 : couleur d'accent (absente = violet d'origine) et modèles */
  const acc=raw(K.accent);if(acc&&RE_HEX.test(acc))data.settings.accent=acc.toLowerCase();
  if(typeof TPL!=='undefined'){const t=TPL.payload();if(Object.keys(t.items).length||Object.keys(t.deleted).length)data.templates=t;}
  return{data,skipped};
}
function download(){
  const {data,skipped}=build();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const name='averse-sauvegarde-'+data.date.slice(0,10)+'.json';
  if(typeof NOXE!=='undefined'&&NOXE.download)NOXE.download(blob,name);
  else{const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2000);}
  toast('Sauvegarde exportée'+(skipped?' ('+skipped+' secret'+(skipped>1?'s':'')+' exclu'+(skipped>1?'s':'')+')':''));
  return{data,skipped,name};
}

/* ---------- vérification d'un fichier importé ----------
   renvoie {ok:false,error} ou {ok:true,clean,rejected} ; « clean » ne contient que des valeurs sûres */
function validate(d){
  if(!d||typeof d!=='object'||Array.isArray(d))return{ok:false,error:'Ce n\'est pas une sauvegarde AVERSE'};
  const full=d.app==='averse'&&d.kind==='sauvegarde';
  if(full&&d.version!==1)return{ok:false,error:'Version de sauvegarde inconnue ('+esc(String(d.version))+')'};
  if(!full&&!(d.notes&&typeof d.notes==='object'))return{ok:false,error:'Ce n\'est pas une sauvegarde AVERSE'};
  let rejected=0;
  const clean={notes:Object.create(null),deleted:Object.create(null),fav:[],recent:[],fields:Object.create(null),settings:{}};
  const notes=d.notes&&typeof d.notes==='object'?Object.values(d.notes):[];
  notes.slice(0,5000).forEach(n=>{const s=sanitizeNote(n);if(s)clean.notes[s.id]=s;else rejected++;});
  if(d.deleted&&typeof d.deleted==='object')Object.entries(d.deleted).forEach(([id,t])=>{
    if(/^[\w-]{1,64}$/.test(id)&&!/^(__proto__|constructor|prototype)$/.test(id)&&isFinite(+t)&&+t>0)clean.deleted[id]=Math.min(+t,Date.now());else rejected++;});
  if(full){
    const keys=a=>{if(!Array.isArray(a))return[];const o=[];a.forEach(k=>{if(typeof k==='string'&&ID.test(k)&&known(k)){if(!o.includes(k))o.push(k);}else rejected++;});return o;};
    clean.fav=keys(d.fav).slice(0,100);clean.recent=keys(d.recent).slice(0,8);
    if(d.fields&&typeof d.fields==='object'&&!Array.isArray(d.fields))Object.keys(d.fields).forEach(t=>{
      const m=d.fields[t];
      if(!ID.test(t)||!known(t)||!m||typeof m!=='object'||Array.isArray(m)){rejected++;return;}
      Object.keys(m).forEach(id=>{
        const v=m[id];
        if(!ID.test(id)||!(typeof v==='boolean'||typeof v==='string'&&v.length<=MAXLEN)||isSecret(t,id,v)){rejected++;return;}
        (clean.fields[t]||(clean.fields[t]=Object.create(null)))[id]=v;
      });
    });
    const st=d.settings||{};
    if(st.style==='ascii'||st.style==='normal')clean.settings.style=st.style;else if(st.style!=null)rejected++;
    if(st.rain==='on'||st.rain==='off')clean.settings.rain=st.rain;else if(st.rain!=null)rejected++;
    if(typeof st.accent==='string'&&RE_HEX.test(st.accent))clean.settings.accent=st.accent.toLowerCase();else if(st.accent!=null)rejected++;
    /* v6 : modèles — chaque modèle est revérifié (TPL.clean) ; on n'en garde que des propres */
    const tp=d.templates;
    if(tp&&typeof tp==='object'&&typeof TPL!=='undefined'){
      clean.templates={items:Object.create(null),deleted:Object.create(null)};
      if(tp.items&&typeof tp.items==='object')Object.keys(tp.items).slice(0,500).forEach(k=>{const c=TPL.clean(tp.items[k]);if(c&&c.id===k)clean.templates.items[k]=c;else rejected++;});
      if(tp.deleted&&typeof tp.deleted==='object')Object.keys(tp.deleted).forEach(k=>{const v=+tp.deleted[k];
        if(/^[\w-]{1,48}$/.test(k)&&!/^(__proto__|constructor|prototype)$/.test(k)&&isFinite(v)&&v>0)clean.templates.deleted[k]=Math.min(v,Date.now());else rejected++;});
    }else if(tp!=null&&typeof TPL!=='undefined')rejected++;
  }
  return{ok:true,full,clean,rejected};
}

/* ---------- application : on FUSIONNE avec ce qui existe ---------- */
function apply(clean){
  const nd=getLS(K.notes,null)||{notes:{},openId:null,deleted:{}};
  if(!nd.notes||typeof nd.notes!=='object')nd.notes={};
  const del=nd.deleted&&typeof nd.deleted==='object'?nd.deleted:(nd.deleted={});
  let notes=0;
  Object.values(clean.notes).forEach(n=>{
    const old=nd.notes[n.id];
    if(del[n.id]){delete del[n.id];n.updated=Math.max(n.updated,Date.now());}   // réimportée exprès : elle gagne sur la pierre tombale
    if(!old||n.updated>(old.updated||0)){nd.notes[n.id]=n;notes++;}           // sinon la plus récente gagne
  });
  Object.entries(clean.deleted).forEach(([id,t])=>{
    if(clean.notes[id])return;                                 // présente dans la sauvegarde : elle reste
    if(t>(del[id]||0))del[id]=t;
    const x=nd.notes[id];if(x&&(x.updated||0)<=t)delete nd.notes[id];
  });
  if(!nd.openId||!nd.notes[nd.openId])nd.openId=Object.keys(nd.notes)[0]||null;
  setLS(K.notes,nd);
  const union=(a,b)=>a.concat(b.filter(x=>!a.includes(x)));
  const fav=union(getLS(K.fav,[]).filter(x=>typeof x==='string'),clean.fav);setLS(K.fav,fav);
  setLS(K.recent,union(getLS(K.recent,[]).filter(x=>typeof x==='string'),clean.recent).slice(0,8));
  let fields=0;const f=getLS(K.fields,{})||{};
  Object.keys(clean.fields).forEach(t=>{f[t]=Object.assign(f[t]&&typeof f[t]==='object'?f[t]:{},clean.fields[t]);fields+=Object.keys(clean.fields[t]).length;});
  setLS(K.fields,f);
  const s=clean.settings;
  if(s.style){
    const ascii=document.documentElement.dataset.theme==='ascii';
    if((s.style==='ascii')!==ascii)toggleStyle();else try{localStorage.setItem(K.style,s.style);}catch(e){}
    if(window.rainSetColor)rainSetColor();
  }
  if(s.rain){if(window.rainToggle)rainToggle(s.rain==='on');else try{localStorage.setItem(K.rain,s.rain);}catch(e){}}
  if(s.accent){if(typeof ACCENT!=='undefined')ACCENT.set(s.accent);else try{localStorage.setItem(K.accent,s.accent);}catch(e){}}
  let templates=0;
  if(clean.templates&&typeof TPL!=='undefined'){templates=TPL.merge(clean.templates);if(window.tplRefresh)tplRefresh();}
  if(typeof NOXE!=='undefined'&&NOXE.notesChanged)NOXE.notesChanged();
  return{notes,fav:clean.fav.length,fields,templates};
}

/* lire un fichier → vérifier → fusionner ; renvoie le compte rendu */
async function importFile(file){
  let d;
  try{d=JSON.parse(await(file.text?file.text():new Response(file).text()));}catch(e){toast('Fichier illisible (JSON invalide)');return{ok:false,error:'JSON invalide'};}
  const v=validate(d);
  if(!v.ok){toast(v.error);return v;}
  const r=apply(v.clean);
  const res=Object.assign({ok:true,full:v.full,rejected:v.rejected},r);
  toast(r.notes+' note(s) fusionnée(s)'+(v.full?', '+r.fav+' favori(s), '+r.fields+' champ(s)':'')+(r.templates?', '+r.templates+' modèle(s)':'')+(v.rejected?' · '+v.rejected+' entrée(s) refusée(s)':''));
  return res;
}
return{build,download,validate,apply,importFile,isSecret};
})();
