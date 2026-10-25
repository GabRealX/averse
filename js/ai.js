/* ai.js — v7 : l'IA d'AVERSE, en deux parties INDÉPENDANTES, toutes deux désactivées par défaut.

   A) LOCALE — « recherche par le sens » : un modèle multilingue FR+EN (multilingual-e5-small ; v7 : all-MiniLM-L6-v2) transforme chaque note en vecteur,
      dans un Web Worker (js/ai-worker.js). Téléchargé une seule fois, et seulement quand tu cliques « Activer ».
      Rien de tes notes ne sort de l'appareil. Vecteurs gardés dans IndexedDB (base « averse-ai »).
   B) ASSISTANT — avec TA clé d'API (Google Gemini en priorité : offre gratuite ; ou tout service « OpenAI-compatible »).
      - La clé est chiffrée (AES-GCM, vault.js) avec une clé d'appareil NON EXPORTABLE gardée dans IndexedDB :
        localStorage ne contient que {iv, ct}. Avec la synchro Gist, elle voyage DANS le coffre chiffré de bout en bout.
        Jamais dans la Sauvegarde, jamais dans le fichier lié, jamais dans la console.
      - Elle n'est envoyée qu'au fournisseur choisi (en-tête x-goog-api-key ou Authorization), rien d'autre.
      - AUCUN appel sans action explicite : seul le bouton « Envoyer à … » de la fenêtre IA déclenche une requête,
        après t'avoir montré exactement le texte qui part (aperçu) et chez qui.
   Fonctions : résumer une note, flashcards, expliquer / écrire une regex, expliquer du JSON, reformuler / corriger,
   « demander à mes notes » (RAG : recherche locale par le sens, puis envoi des SEULS extraits retenus).
   Accès : clic droit (sélection, note), palette de recherche (« ia … »), bouton IA du carnet, outils JSON et regex. */
const AI=(function(){
const CFG='averse-ai',SEC='averse-ai-sec',NKEY='noxe-notes';
const PROV={
  gemini:{name:'Google Gemini',short:'Gemini',model:'gemini-3.5-flash-lite',base:'https://generativelanguage.googleapis.com/v1beta',keyUrl:'https://aistudio.google.com/apikey'},
  openai:{name:'Service OpenAI-compatible',short:'OpenAI-compatible',model:'gpt-4o-mini',base:'https://api.openai.com/v1',keyUrl:'https://platform.openai.com/api-keys'}
};
/* v10 : modèles proposés (on peut toujours en taper un autre). Le plus rapide par défaut : la réponse commence plus tôt. */
const MODELS={gemini:[['gemini-3.5-flash-lite','rapide (par défaut)'],['gemini-3.6-flash','équilibré'],['gemini-3.8-flash','plus fort, plus lent'],['gemini-2.5-flash-lite','ancien, rapide']],openai:[]};
/* v10 : « réflexion » au minimum pour les modèles qui l'acceptent (sinon Gemini réfléchit plusieurs secondes avant le 1er mot).
   Gemini 3 : thinkingLevel (minimal / low) ; Gemini 2.5 Flash : thinkingBudget 0. Modèle inconnu : on n'envoie rien (pas d'erreur 400). */
function thinkFor(m){m=String(m||'');
  if(/^gemini-3(\.\d+)?-flash-lite/.test(m)||/^gemini-3(\.[0-6])?-flash($|-preview)/.test(m))return{thinkingLevel:'minimal'};
  if(/^gemini-3\.[7-9]-flash($|-)/.test(m)||/^gemini-4/.test(m))return{thinkingLevel:'low'};
  if(/^gemini-2\.5-flash/.test(m))return{thinkingBudget:0};
  return null;}
const okBase=u=>/^https:\/\/[a-z0-9.-]+(:\d+)?(\/[\w.~\/-]*)?$/i.test(u)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w.~\/-]*)?$/i.test(u);
const okKey=k=>typeof k==='string'&&/^[\x21-\x7e]{8,400}$/.test(k);
function readCfg(){const c=getLS(CFG,{})||{};return{provider:PROV[c.provider]?c.provider:'gemini',
  model:{gemini:String(c.model&&c.model.gemini||'').slice(0,80),openai:String(c.model&&c.model.openai||'').slice(0,80)},
  base:typeof c.base==='string'&&okBase(c.base)?c.base:'',local:c.local===true,
  lang:['fr','en'].includes(c.lang)?c.lang:'auto',             // v8 : langue des réponses (Auto = celle de la question / de la note)
  skipFree:c.skipFree===true,                                   // v8 : « ne plus demander » pour les questions LIBRES (jamais pour les extraits de notes)
  idx:typeof c.idx==='string'?c.idx:''};}                       // v8 : version de l'index des vecteurs (modèle utilisé)
let cfg=readCfg();
const saveCfg=()=>setLS(CFG,cfg);
const model=()=>cfg.model[cfg.provider]||PROV[cfg.provider].model;
const base=()=>(cfg.provider==='openai'&&cfg.base?cfg.base:PROV[cfg.provider].base).replace(/\/+$/,'');
const host=()=>{try{return new URL(base()).host;}catch(e){return'?';}};

/* ---------- IndexedDB : clé d'appareil (kv) et vecteurs (vec) ---------- */
let dbp=null;
function db(){return dbp||(dbp=new Promise((res,rej)=>{const r=indexedDB.open('averse-ai',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('kv');r.result.createObjectStore('vec');};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);}));}
async function idb(store,mode,fn){const d=await db();return new Promise((res,rej)=>{const t=d.transaction(store,mode),s=t.objectStore(store),q=fn(s);
  t.oncomplete=()=>res(q&&q.result);t.onerror=()=>rej(t.error);});}

/* ---------- clés d'API : en mémoire seulement une fois déchiffrées ---------- */
let KEYS={},KAT=0,DEVK=null;
async function devKey(){if(DEVK)return DEVK;
  let k=await idb('kv','readonly',s=>s.get('device'));
  if(!k){k=await VAULT.deviceKey();await idb('kv','readwrite',s=>s.put(k,'device'));}
  return DEVK=k;}
const ready=(async()=>{
  try{const box=getLS(SEC,null);if(!box||!box.ct||typeof VAULT==='undefined')return;
    const o=JSON.parse(await VAULT.openSecret(await devKey(),box,'averse-ai-keys'));
    KAT=+o.at||0;KEYS={};for(const p in PROV)if(okKey(o.keys&&o.keys[p]))KEYS[p]=o.keys[p];
  }catch(e){KEYS={};}                                       // illisible (autre navigateur, données effacées) : on oublie
})();
async function storeKeys(push,keys,at){
  keys=keys||KEYS;at=at||KAT;
  const box=await VAULT.sealSecret(await devKey(),JSON.stringify({at,keys}),'averse-ai-keys');
  setLS(SEC,box);
  if(push&&window.cloudLater)cloudLater();                   // synchro Gist (chiffrée) si elle est active
}
async function setKey(p,k){await ready;if(!PROV[p])return false;if(k&&!okKey(k))return false;
  const nk=Object.assign({},KEYS),at=Date.now();if(k)nk[p]=k;else delete nk[p];
  await storeKeys(false,nk,at);KEYS=nk;KAT=at;                 // en mémoire seulement une fois enregistrée (chiffrée)
  if(window.cloudLater)cloudLater();return true;}
const hasKey=p=>!!KEYS[p||cfg.provider];
/* pour la synchro (notes.js → notesApi.payload, puis chiffré par cloud.js) */
function syncPart(){if(!KAT)return null;const keys={};Object.keys(KEYS).sort().forEach(p=>{keys[p]=KEYS[p];});return{at:KAT,keys};}
function syncReceive(r){if(!r||typeof r!=='object'||!(+r.at>KAT))return;
  const keys={};for(const p in PROV)if(r.keys&&okKey(r.keys[p]))keys[p]=r.keys[p];
  KEYS=keys;KAT=+r.at;storeKeys(false).catch(()=>{});}

/* ---------- B) appel du fournisseur (streaming) ---------- */
let armed=false;                     // mis à true UNIQUEMENT par un clic sur « Envoyer » (voir dialogue) ; consommé par send()
const stats={calls:0};
/* v10 : hors ligne → erreur claire (l'IA locale, elle, marche sans réseau) */
class OfflineError extends Error{constructor(){super('hors ligne : l\'IA par clé a besoin du réseau');this.name='OfflineError';}}
const online=()=>navigator.onLine!==false;
async function send(system,prompt,onText,signal,onPhase){
  if(!armed)throw new Error('aucune requête sans action explicite');
  armed=false;
  if(!online())throw new OfflineError();
  const ph=(k)=>{TIME[k]=Math.round(performance.now()-TIME.t0);if(onPhase)try{onPhase(k);}catch(e){}};TIME.t0=performance.now();
  const key=KEYS[cfg.provider];if(!key)throw new Error('pas de clé d\'API');
  let url,headers={'content-type':'application/json'},body;
  if(cfg.provider==='gemini'){
    url=base()+'/models/'+encodeURIComponent(model())+':streamGenerateContent?alt=sse';headers['x-goog-api-key']=key;
    body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.3}};
    const th=thinkFor(model());if(th)body.generationConfig.thinkingConfig=th;
  }else{
    url=base()+'/chat/completions';headers.authorization='Bearer '+key;
    body={model:model(),stream:true,temperature:.3,messages:[{role:'system',content:system},{role:'user',content:prompt}]};
  }
  stats.calls++;
  ph('sent');let res;
  try{res=await window.fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',mode:'cors'});}
  catch(e){if(e&&e.name==='AbortError')throw e;if(!online())throw new OfflineError();throw new Error('réseau indisponible ('+host()+' injoignable)');}
  ph('headers');
  if(!res.ok){let msg='';try{const j=await res.json();msg=(j.error&&(j.error.message||j.error.status))||'';}catch(e){}
    throw new Error(({400:'requête refusée',401:'clé refusée',403:'clé refusée ou service non autorisé',404:'modèle introuvable',429:'quota dépassé (réessaie plus tard)'}[res.status]||'erreur '+res.status)+(msg?' — '+String(msg).slice(0,160):''));}
  const rd=res.body.getReader(),td=new TextDecoder();let buf='',all='';
  const line=l=>{l=l.trim();if(!l.startsWith('data:'))return;const d=l.slice(5).trim();if(!d||d==='[DONE]')return;
    let j;try{j=JSON.parse(d);}catch(e){return;}
    const t=cfg.provider==='gemini'?((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(p=>p.text||'').join('')
      :((j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content)||'');
    if(t){if(!all)ph('first');all+=t;onText(t,all);}};
  for(;;){const {done,value}=await rd.read();if(done)break;
    if(signal&&signal.aborted){try{rd.cancel();}catch(e){}throw new DOMException('arrêté','AbortError');}buf+=td.decode(value,{stream:true});
    const parts=buf.split('\n');buf=parts.pop();parts.forEach(line);}
  if(buf)line(buf);
  ph('done');
  return all;
}

/* ---------- A) embeddings locaux (Worker) ---------- */
const E={w:null,seq:0,wait:new Map(),state:'off',p:0,subs:new Set(),err:''};
let workerFactory=()=>new Worker('js/ai-worker.js',{type:'module'});
const emit=()=>E.subs.forEach(f=>{try{f(E);}catch(e){}});
/* v10 : le Worker reste vivant toute la vie de la page (jamais arrêté entre deux questions) */
function worker(){
  if(E.w)return E.w;
  E.w=workerFactory();
  E.w.onmessage=e=>{const m=e.data||{};
    if(m.type==='progress'){E.state='download';E.p=m.p;emit();}
    else if(m.type==='ready'){E.state='ready';E.model=m.model||'';E.p=1;emit();const r=E.wait.get('load');if(r){E.wait.delete('load');r.res();}}
    else if(m.type==='vecs'){const r=E.wait.get(m.id);if(r){E.wait.delete(m.id);r.res(m.vecs);}}
    else if(m.type==='error'){const r=E.wait.get(m.id==null?'load':m.id);E.err=m.message;if(m.id==null){E.state='error';emit();}
      if(r){E.wait.delete(m.id==null?'load':m.id);r.rej(new Error(m.message));}}};
  E.w.onerror=e=>{E.state='error';E.err=e.message||'worker';emit();E.wait.forEach(r=>r.rej(new Error(E.err)));E.wait.clear();};
  return E.w;
}
function loadModel(){if(E.state==='ready')return Promise.resolve();
  return new Promise((res,rej)=>{const prev=E.wait.get('load');
    E.wait.set('load',prev?{res:()=>{prev.res();res();},rej:e=>{prev.rej(e);rej(e);}}:{res,rej});
    if(!prev){if(E.state!=='download'){E.state='download';E.p=0;emit();}worker().postMessage({type:'load'});}});}
async function embed(texts,role){
  if(!cfg.local)throw new Error('recherche par le sens désactivée');
  await migrate();await loadModel();
  if(/e5/i.test(E.model||''))texts=texts.map(t=>PFX[role||'q']+t);                     // 'q' : une question / recherche · 'p' : un passage de note
  const id=++E.seq;
  return new Promise((res,rej)=>{E.wait.set(id,{res,rej});worker().postMessage({type:'embed',id,texts});});
}
async function enableLocal(){cfg.local=true;saveCfg();E.err='';await loadModel();warmed=true;await indexNotes();}
async function disableLocal(){
  cfg.local=false;saveCfg();if(E.w){E.w.terminate();E.w=null;}E.state='off';E.p=0;E.wait.clear();VEC.clear();vecLoaded=false;vecModel='';QC.clear();VERS++;warmed=false;
  try{await idb('vec','readwrite',s=>s.clear());}catch(e){}
  try{await caches.delete('transformers-cache');await caches.delete('averse-ai-1');}catch(e){}
  emit();
}

/* v8 : modèle multilingue (français + anglais). Les vecteurs d'un AUTRE modèle (ou d'une autre façon de découper) ne sont pas
   comparables : si la version d'index change, on vide les vecteurs (et l'ancien modèle v7 du cache), puis tout est recalculé.
   v10 (e5s-2) : titre + texte NETTOYÉ du Markdown, découpé en passages (6 au plus par note) ; vecteur de note = moyenne des passages. */
const IDX='e5s-2';
const PFX={q:'query: ',p:'passage: '};               // préfixes attendus par la famille E5 (seulement pour elle)
async function migrate(){
  if(cfg.idx===IDX)return;
  try{await idb('vec','readwrite',s=>s.clear());}catch(e){}
  VEC.clear();vecLoaded=false;vecModel='';VERS++;
  if(cfg.idx||cfg.local){try{const c=await caches.open('transformers-cache');
    for(const r of await c.keys())if(/all-MiniLM-L6-v2/.test(r.url))await c.delete(r);}catch(e){}}
  cfg.idx=IDX;saveCfg();
}
/* vecteurs des notes, gardés dans IndexedDB : {id → {h, v, c:[vecteurs des passages]}} ;
   h = empreinte des passages : seules les notes MODIFIÉES sont recalculées (aussi d'une visite à l'autre). */
const VEC=new Map();let vecLoaded=false,VERS=0,vecModel='';   // vecModel : modèle qui a calculé les vecteurs gardés (IndexedDB)
const fnv=s=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
const notes=()=>{const d=getLS(NKEY,null);return d&&d.notes?Object.values(d.notes).filter(n=>n&&n.id):[];};
const dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
/* Markdown → texte simple (le modèle n'a que faire des #, **, liens, adresses, pièces jointes…) */
function plain(md){
  return String(md||'').replace(/\r/g,'')
    .replace(/```[\w+-]*\n?/g,'')                                   // blocs de code : on garde le code, pas les clôtures
    .replace(/!\[[^\]]*\]\([^)]*\)/g,' ')                           // images, pièces jointes, dessins
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(m,a,b)=>b||a)       // [[lien|texte]]
    .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1')                         // [texte](adresse)
    .replace(/https?:\/\/\S+/g,' ').replace(/<[^>]{0,200}>/g,' ')
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}.*$/gm,'').replace(/\|/g,' ')     // tableaux
    .replace(/^[ \t]{0,3}(?:#{1,6}|>|[-*+]|\d+[.)]|- \[[ x]\])[ \t]+/gim,'')
    .replace(/\*\*|__|~~|`/g,'').replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|[.,;:!?]|$)/g,'$1$2')
    .replace(/\$\$?/g,' ').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
const CHMAX=6,CHLEN=600;
const SKIPTAG=new Set(['conflit','ia','photo','partage','dessin']);
/* passages d'une note : t = le texte (montré / envoyé pour le RAG), e = ce qui est vectorisé (titre et tags devant) */
function passages(n){
  const title=String(n.title||'').trim(),tags=(n.tags||[]).filter(t=>!SKIPTAG.has(t)).join(', ');
  const head=(title?title+(/[.!?:]$/.test(title)?' ':'. '):'')+(tags?'('+tags+') ':'');
  const out=[];let cur='';
  const push=s=>{s=s.trim();if(s)out.push(s);};
  for(let p of plain(n.body).split(/\n\s*\n/)){
    while(p.length>CHLEN*1.5){const cut=Math.max(p.lastIndexOf('. ',CHLEN),p.lastIndexOf('\n',CHLEN));const k=cut>CHLEN/3?cut+1:CHLEN;
      if(cur){push(cur);cur='';}push(p.slice(0,k));p=p.slice(k);}
    if(cur&&(cur+'\n\n'+p).length>CHLEN){push(cur);cur=p;}else cur=cur?cur+'\n\n'+p:p;
  }
  push(cur);
  const L=(out.length?out:['']).slice(0,CHMAX);
  return L.map(t=>({t,e:(head+t).slice(0,1200)||' '}));
}
const mean=vs=>{const d=vs[0].length,m=new Float32Array(d);vs.forEach(v=>{for(let i=0;i<d;i++)m[i]+=v[i];});let n=0;for(let i=0;i<d;i++)n+=m[i]*m[i];n=Math.sqrt(n)||1;for(let i=0;i<d;i++)m[i]/=n;return m;};
let indexing=null;const IXP={done:0,total:0};          // v9 : progression de l'indexation (affichée dans les réglages)
async function loadVecs(){if(vecLoaded)return;
  try{const all=await idb('vec','readonly',s=>s.getAll()),ks=await idb('vec','readonly',s=>s.getAllKeys());
    /* v10 : chaque vecteur garde le nom du modèle (r.m) → la calibration est la bonne MÊME si le Worker n'est pas encore lancé
       (index entièrement relu depuis IndexedDB). Un vecteur sans nom de modèle est recalculé (une seule fois). */
    ks.forEach((k,i)=>{const r=all[i];if(r&&r.v&&Array.isArray(r.c)&&r.m){VEC.set(k,r);if(!vecModel)vecModel=r.m;}});}catch(e){}
  vecLoaded=true;VERS++;}
async function indexNotes(onP){
  if(indexing)return indexing;
  indexing=(async()=>{
    const t0=performance.now();
    await migrate();await loadVecs();
    const ns=notes(),live=new Set(ns.map(n=>n.id));
    for(const k of [...VEC.keys()])if(!live.has(k)){VEC.delete(k);VERS++;idb('vec','readwrite',s=>s.delete(k)).catch(()=>{});}
    const todo=[];ns.forEach(n=>{const ps=passages(n),h=fnv(ps.map(p=>p.e).join('\u0001')),v=VEC.get(n.id);if(!v||v.h!==h)todo.push({n,ps,h});});
    IXP.done=0;IXP.total=todo.length;if(todo.length)emit();
    /* par paquets d'environ 16 passages */
    for(let i=0;i<todo.length;){
      const part=[];let np=0;while(i<todo.length&&(np<16||!part.length)){part.push(todo[i]);np+=todo[i].ps.length;i++;}
      const vs=await embed([].concat(...part.map(x=>x.ps.map(p=>p.e))),'p');let o=0;
      for(const x of part){const c=vs.slice(o,o+x.ps.length);o+=x.ps.length;const r={h:x.h,v:mean(c),c,m:E.model||''};VEC.set(x.n.id,r);vecModel=r.m;
        idb('vec','readwrite',s=>s.put(r,x.n.id)).catch(()=>{});}
      VERS++;IXP.done=i;emit();if(onP)onP(i/todo.length);
    }
    TIME.index=Math.round(performance.now()-t0);TIME.indexed=todo.length;
    return VEC;
  })();
  try{return await indexing;}finally{indexing=null;IXP.total=0;emit();}
}

/* ---------- v10 : calibration des scores ----------
   E5 « tasse » ses cosinus (deux notes SANS rapport ≈ 0,75–0,82) : afficher le cosinus brut (« 80 % ») faisait croire à un lien.
   On compare donc chaque score à la DISTRIBUTION du carnet lui-même : z = (s − moyenne) / écart-type des paires du carnet,
   estimées sur tes notes et « tirées » vers des valeurs a priori mesurées (jeu d'évaluation, voir README) tant qu'il y a peu de notes.
   On n'affiche que ce qui est NETTEMENT au-dessus du lot (z ≥ seuil ET cosinus ≥ plancher), au plus 4, avec un libellé
   (« très proche » / « proche ») au lieu d'un faux pourcentage. Rien plutôt que du bruit. Même principe pour le RAG. */
/* valeurs mesurées sur le jeu d'évaluation (25 notes FR/EN, README) : paires du carnet ≈ 0,779 ± 0,032 ;
   question ↔ passages : la moyenne varie beaucoup d'une question à l'autre (0,70–0,79) → a priori faible (K=8) */
const CAL={'Xenova/multilingual-e5-small':{nn:{mu:.779,sd:.032,floor:.81,z:2.2,hi:3.2},qp:{mu:.745,sd:.032,floor:.76,z:1.9,gap:.04},tag:.6}};
const CAL0={nn:{mu:0,sd:.15,floor:.25,z:2.0,hi:3.5},qp:{mu:0,sd:.12,floor:.2,z:2.0,gap:.2},tag:.6};   // autre modèle (faux Worker des tests)
const calOf=()=>CAL[E.model||vecModel]||CAL0;
const K0=30;                                                     // poids de l'a priori (en « paires »)
function shrink(vals,p,K){K=K==null?K0:K;const n=vals.length;let m=0;vals.forEach(v=>m+=v);m=n?m/n:p.mu;let q=0;vals.forEach(v=>q+=(v-m)*(v-m));const va=n>1?q/(n-1):p.sd*p.sd;
  const mu=(n*m+K*p.mu)/(n+K),sd=Math.sqrt((n*va+K*p.sd*p.sd)/(n+K));return{mu,sd:Math.max(sd,.008),n};}
let NNS=null;
function nnStats(){const C=calOf();if(NNS&&NNS.vers===VERS&&NNS.cal===C)return NNS;
  const ids=[...VEC.keys()].sort().slice(0,300),vals=[];
  for(let i=0;i<ids.length;i++){const a=VEC.get(ids[i]).v;for(let j=i+1;j<ids.length;j++)vals.push(dot(a,VEC.get(ids[j]).v));}
  NNS=Object.assign(shrink(vals,C.nn),{vers:VERS,cal:C});return NNS;}
const tagsOf=n=>new Set((n&&n.tags||[]).filter(t=>!SKIPTAG.has(t)).map(t=>String(t).toLowerCase()));
const label=(z,hi)=>z>=hi?'très proche':'proche';
/* notes liées à une note : [{id, s, z, label, tags}] — déjà filtrées (peut être vide) */
async function related(id,k){await indexNotes();const me=VEC.get(id);if(!me)return[];
  const C=calOf(),st=nnStats(),by=Object.fromEntries(notes().map(n=>[n.id,n])),mt=tagsOf(by[id]);
  return[...VEC].filter(([x])=>x!==id&&by[x]).map(([x,o])=>{const s=dot(me.v,o.v),ct=[...tagsOf(by[x])].filter(t=>mt.has(t)).length;
      const z=(s-st.mu)/st.sd+C.tag*Math.min(2,ct);return{id:x,s,z,tags:ct};})
    .filter(r=>r.z>=C.nn.z&&r.s>=C.nn.floor-(r.tags?.02:0)).sort((a,b)=>b.z-a.z).slice(0,k||4).map(r=>Object.assign(r,{label:label(r.z,C.nn.hi)}));}
/* brut (compatibilité, tests) : cosinus des vecteurs de notes */
async function similarTo(id,k){await indexNotes();const me=VEC.get(id);if(!me)return[];
  return[...VEC].filter(([x])=>x!==id).map(([x,o])=>({id:x,s:dot(me.v,o.v)})).sort((a,b)=>b.s-a.s).slice(0,k||5);}
/* paires du graphe « ≈ sens » : au plus 2 par note, nettement au-dessus du lot */
async function semPairs(){await indexNotes();const C=calOf(),st=nnStats(),ids=[...VEC.keys()],pairs=[],seen=new Set();
  ids.forEach(a=>{const va=VEC.get(a).v;ids.filter(b=>b!==a).map(b=>[b,dot(va,VEC.get(b).v)]).sort((x,y)=>y[1]-x[1]).slice(0,2)
    .forEach(([b,s])=>{const kk=a<b?a+'|'+b:b+'|'+a,z=(s-st.mu)/st.sd;if(z>=C.nn.z+.3&&s>=C.nn.floor&&!seen.has(kk)){seen.add(kk);pairs.push([a,b,s]);}});});
  return pairs;}

/* ---------- v10 : vecteur de la question calculé EN AVANCE (pendant la frappe, sans réseau), gardé en mémoire ---------- */
const QC=new Map();
const normQ=q=>String(q||'').replace(/^\s*\?\s*/,'').trim().replace(/\s+/g,' ').slice(0,500);
function qvec(q){q=normQ(q);let p=QC.get(q);
  if(p){QC.delete(q);QC.set(q,p);p.hit=true;return p;}
  p=embed([q],'q').then(v=>v[0]);p.catch(()=>QC.delete(q));QC.set(q,p);
  while(QC.size>40)QC.delete(QC.keys().next().value);return p;}
/* appelé (avec un délai) pendant que tu tapes une question : 100 % local, aucun appel réseau */
function prepare(q){q=normQ(q);if(!cfg.local||q.length<3||E.state==='error')return false;
  qvec(q).catch(()=>{});if(!vecLoaded&&!indexing)indexNotes().catch(()=>{});return true;}
/* ---------- v10 : pré-chauffage quand l'IA locale est activée : Worker + modèle + index, quand la page n'a rien d'autre à faire ---------- */
let warmed=false,warmP=null;
function prewarm(){if(!cfg.local)return Promise.resolve(false);if(warmP)return warmP;
  warmP=new Promise(res=>{const go=async()=>{try{const t0=performance.now();await loadModel();TIME.load=Math.round(performance.now()-t0);
      await embed(['ok'],'q');warmed=true;TIME.warm=Math.round(performance.now()-t0);await indexNotes();res(true);}catch(e){warmP=null;res(false);}};
    (window.requestIdleCallback?f=>requestIdleCallback(f,{timeout:3000}):f=>setTimeout(f,200))(go);});
  return warmP;}
if(cfg.local&&sessionStorage.getItem('averse-tests')!=='1'){          // (les tests appellent AI.prewarm() eux-mêmes, avec un faux Worker)
  const kick=()=>setTimeout(prewarm,400);if(document.readyState==='complete')kick();else window.addEventListener('load',kick,{once:true});}

/* temps mesurés de la dernière demande (ms) — affichés nulle part, utiles pour mesurer (README) */
const TIME={};
async function search(q,k){const t0=performance.now();await indexNotes();const t1=performance.now();const v=await qvec(q);const t2=performance.now();
  const C=calOf(),all=[...VEC].map(([x,o])=>{let s=dot(v,o.v);o.c.forEach(c=>{const y=dot(v,c);if(y>s)s=y;});return{id:x,s};});
  const st=shrink(all.map(r=>r.s),C.qp,8);
  const out=all.map(r=>Object.assign(r,{z:(r.s-st.mu)/st.sd})).sort((a,b)=>b.s-a.s);
  out.forEach(r=>{r.ok=r.z>=C.qp.z-.5&&r.s>=C.qp.floor;r.label=label(r.z,C.qp.z+1.2);});
  Object.assign(TIME,{index:Math.round(t1-t0),qEmbed:Math.round(t2-t1),search:Math.round(performance.now()-t2)});
  return out.slice(0,k||8);}
/* RAG : les meilleurs PASSAGES pour une question — calcul 100 % local */
function chunks(n){return passages(n).map(p=>p.t).filter(Boolean);}
async function retrieve(q,max){
  max=max||3500;const T0=performance.now();
  const by=Object.fromEntries(notes().map(n=>[n.id,n]));
  let cand,keep;
  if(cfg.local){
    const pq=qvec(q),hit=!!pq.hit;await indexNotes();const t1=performance.now();const qv=await pq;const t2=performance.now();
    cand=[];for(const [id,o] of VEC){if(!by[id])continue;const ps=passages(by[id]);o.c.forEach((c,i)=>{if(ps[i]&&ps[i].t)cand.push({id,t:ps[i].t,s:dot(qv,c)});});}
    cand.sort((a,b)=>b.s-a.s);
    const C=calOf().qp,st=shrink(cand.map(c=>c.s),C,8),best=cand.length?cand[0].s:0;
    keep=c=>c.s>=C.floor&&(c.s-st.mu)/st.sd>=C.z&&c.s>=best-C.gap;
    Object.assign(TIME,{index:Math.round(t1-T0),qEmbed:Math.round(t2-t1),qHit:hit,search:Math.round(performance.now()-t2)});
  }else{                                                     // repli sans modèle : mots en commun (moins bon, mais local)
    const ws=String(q).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\W+/).filter(w=>w.length>2);
    cand=[];Object.values(by).forEach(n=>chunks(n).forEach(t=>{const tt=((n.title||'')+' '+t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const s=ws.reduce((a,w)=>a+(tt.includes(w)?1:0),0)/Math.max(1,ws.length);if(s>0)cand.push({id:n.id,t,s});}));
    cand.sort((a,b)=>b.s-a.s);const best=cand.length?cand[0].s:0;keep=c=>c.s>=Math.max(.34,best*.5);
  }
  /* seulement ce qui est vraiment proche : rien d'une note sans rapport ne doit partir chez le fournisseur */
  const out=[];let len=0;
  for(const c of cand.filter(keep)){if(out.length>=6||len+c.t.length>max)continue;out.push({id:c.id,title:by[c.id].title||'Sans titre',t:c.t,s:c.s});len+=c.t.length;}
  return out;
}
const relOf=()=>calOf();

/* ---------- langue des réponses (v8) ---------- */
const LANG={
  fr:'Réponds en français.',
  en:'Answer in English.',
  q:'Réponds dans la langue de la question (français ou anglais).',
  t:'Réponds dans la langue du texte fourni (français ou anglais).',
  ui:'Réponds en français.'};
/* task.lang : 'q' (question) · 't' (texte / note) · 'ui' (explication technique sans question : français par défaut) · 'keep' (reformuler : jamais de traduction) */
function sysFor(task){const T=TASKS[task];if(!T)return'';
  if(T.lang==='keep')return T.sys;
  return T.sys+' '+(cfg.lang!=='auto'?LANG[cfg.lang]:LANG[T.lang||'q']);}
/* ---------- les demandes ---------- */
const TASKS={
  summary:{label:'Résumer',kind:'summary',lang:'t',sys:'Tu es un assistant de prise de notes. Résume le texte fourni en Markdown : 3 à 6 puces courtes, puis une phrase de synthèse. N\'invente rien.'},
  flashcards:{label:'Flashcards',kind:'flashcards',lang:'t',sys:'Crée de 4 à 12 flashcards de révision à partir du texte fourni, dans la langue de ce texte. Réponds UNIQUEMENT avec des blocs de deux lignes « Q: … » puis « R: … » (toujours ces deux étiquettes, même en anglais), séparés par une ligne vide.'},
  regexExplain:{label:'Expliquer la regex',kind:'regex',lang:'ui',sys:'Explique cette expression régulière JavaScript pas à pas, en Markdown (liste à puces). Signale les pièges éventuels (retour arrière catastrophique, drapeaux).'},
  regexWrite:{label:'Écrire une regex',kind:'regex',lang:'q',input:'Décris ce que la regex doit trouver',sys:'Écris UNE expression régulière JavaScript pour la demande. Première ligne : la regex seule, au format /motif/drapeaux. Ensuite une explication courte.'},
  json:{label:'Expliquer le JSON',kind:'json',lang:'ui',sys:'Explique ce JSON en Markdown : à quoi il sert probablement, la structure, les champs importants et leurs types, les anomalies éventuelles. Sois concis.'},
  rewrite:{label:'Reformuler / corriger',kind:'rewrite',lang:'keep',sys:'Corrige l\'orthographe, la grammaire et la ponctuation du texte fourni et reformule-le pour qu\'il soit clair, sans changer le sens ni la langue (un texte anglais reste en anglais, un texte français reste en français). Réponds UNIQUEMENT avec le texte corrigé.'},
  ask:{label:'Demander à mes notes',kind:'ask',lang:'q',input:'Ta question',sys:'Réponds à la question UNIQUEMENT à partir des extraits de notes fournis, en Markdown. Cite les sources sous la forme [1], [2]. Si les extraits ne suffisent pas, dis-le clairement.'},
  ocrclean:{label:'Mettre au propre (photo)',kind:'photo',lang:'keep',sys:'Le texte fourni vient d\'une photo lue par OCR (il peut contenir des erreurs de lecture, des coupures de ligne au mauvais endroit, des caractères parasites). Remets-le au propre en Markdown, SANS le traduire (garde sa langue) et SANS rien inventer : titres (#, ##) si le document en a, listes à puces ou numérotées, tableaux simples si c\'est un tableau, et formules mathématiques en KaTeX ($…$ en ligne, $$…$$ en bloc) s\'il y a des maths. Corrige seulement les erreurs de lecture évidentes. Si un passage est illisible, écris [illisible]. Réponds UNIQUEMENT avec la note en Markdown.'},
  free:{label:'Question libre',kind:'ask',lang:'q',sys:'Tu es l\'assistant d\'AVERSE, une boîte à outils. Réponds en Markdown, de façon concise et exacte. Si tu ne sais pas, dis-le.'}
};

/* rendu Markdown : celui du carnet s'il est là (md.js), sinon une version minimale sûre */
function md(t){
  if(window.MD&&MD.render)return MD.render(t,{exists:()=>false});
  return esc(t).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .split('\n').map(l=>/^\s*[-*] /.test(l)?'<li>'+l.replace(/^\s*[-*] /,'')+'</li>':/^#{1,4} /.test(l)?'<b>'+l.replace(/^#+ /,'')+'</b><br>':l+'<br>').join('');
}
const askPayload=(q,ex)=>'Question : '+q+'\n\nExtraits de mes notes :\n'+ex.map((x,i)=>'['+(i+1)+'] '+x.title+'\n'+x.t).join('\n\n');
const flashCount=t=>(String(t).match(/^\s*Q\s*:/gim)||[]).length;

/* ---------- fenêtre d'une demande ---------- */
let OPEN=null;
function run(task,o){
  o=o||{};const T0=TASKS[task];if(!T0)return;
  /* pas de texte fourni (palette) : on le demande dans la fenêtre */
  const T=!T0.input&&!o.text&&task!=='ask'?Object.assign({},T0,{input:task==='json'?'JSON à expliquer':task==='regexExplain'?'Regex à expliquer':'Texte',free:true}):T0;
  if(OPEN)OPEN.close();
  const ov=document.createElement('div');ov.className='ctx-ov ai-ov';
  ov.innerHTML='<form class="ctx-dlg ai-dlg" role="dialog" aria-modal="true" aria-labelledby="aiT" novalidate>'+
    '<div class="ai-head"><span class="ai-gl"></span><div><div class="ctx-dt" id="aiT">IA · '+esc(T.label)+'</div>'+
    '<div class="ai-sub">'+esc(o.title?'« '+String(o.title).slice(0,70)+' »':PROV[cfg.provider].name)+'</div></div></div>'+
    (T.input?'<label class="ai-l" for="aiIn">'+esc(T.input)+'</label><textarea id="aiIn" rows="2" maxlength="2000"></textarea>':'')+
    '<div class="ai-ctx" id="aiCtx"></div>'+
    '<div class="ai-warn" id="aiWarn"></div>'+
    '<div class="ai-out" id="aiOut" aria-live="polite" hidden></div>'+
    '<div class="ai-err" id="aiErr" role="alert" hidden></div>'+
    '<div class="ctx-db" id="aiBtns"></div></form>';
  document.body.appendChild(ov);
  const f=ov.firstChild,$i=id=>f.querySelector('#'+id),g=GLYPH.create({size:64,kind:T.kind});f.querySelector('.ai-gl').appendChild(g.el);
  let ctl=null,result='',extracts=null,closed=false;
  const prev=document.activeElement;
  const close=()=>{if(closed)return;closed=true;if(ctl)ctl.abort();g.destroy();ov.remove();OPEN=null;document.removeEventListener('keydown',onKey,true);if(prev&&prev.focus)try{prev.focus();}catch(e){}};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',onKey,true);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  const btns=h=>{$i('aiBtns').innerHTML=h;};
  const B=(act,label,cls)=>'<button type="button" class="btn '+(cls||'ghost')+'" data-ai="'+act+'">'+esc(label)+'</button>';
  /* le texte EXACT qui partira (montré avant l'envoi) */
  function payload(){
    const extra=T.input?($i('aiIn').value||'').trim():'';
    if(task==='ask')return extracts?askPayload(extra,extracts):'';
    if(T.free)return extra.slice(0,12000);
    if(task==='regexWrite')return extra+(o.text?'\n\nExemple de texte à analyser :\n'+String(o.text).slice(0,1500):'');
    return String(o.text||'').slice(0,12000);
  }
  function warn(){
    const w=$i('aiWarn'),p=PROV[cfg.provider],txt=payload();
    if(!hasKey()){w.className='ai-warn none';w.innerHTML='Aucune clé d\'API enregistrée pour <b>'+esc(p.name)+'</b>. Rien n\'est envoyé tant que tu n\'en as pas mis une.';
      btns(B('x','Fermer')+B('cfg','Réglages IA…','primary'));return;}
    w.className='ai-warn';
    w.innerHTML='⚠ En cliquant sur « Envoyer », <b>ce texte ('+txt.length+' caractères) part chez '+esc(p.name)+'</b> ('+esc(host())+', modèle '+esc(model())+') avec ta clé, '+
      'et y est traité selon ses conditions. AVERSE n\'envoie rien d\'autre, nulle part. Évite les données sensibles.'+
      '<details><summary>Voir exactement ce qui sera envoyé</summary><pre class="ai-pre" id="aiPre"></pre></details>';
    w.querySelector('#aiPre').textContent=txt||'(vide)';
    if(!online())w.insertAdjacentHTML('afterbegin','<b class="ai-offl">Hors ligne : l\'envoi échouera tant que le réseau n\'est pas revenu (rien ne part).</b><br>');
    btns(B('x','Annuler')+(task==='ask'&&!extracts?B('find','Chercher dans mes notes','primary'):B('send','Envoyer à '+p.short,'primary')));
    if(task==='ask'&&!extracts)w.innerHTML='Étape 1 : AVERSE cherche les extraits utiles <b>sur ton appareil</b>'+(cfg.local?' (recherche par le sens)':' (mots en commun — active la recherche par le sens pour mieux faire)')+
      '. Rien n\'est envoyé à cette étape.';
  }
  async function find(){
    const q=($i('aiIn').value||'').trim();if(!q){$i('aiIn').focus();return;}
    g.set('search');$i('aiErr').hidden=true;
    try{extracts=await retrieve(q);
      if(!extracts.length){g.set('error');$i('aiErr').hidden=false;$i('aiErr').textContent='Aucune note ne semble parler de ça.';extracts=null;return;}
      $i('aiCtx').innerHTML='<div class="ai-l">Extraits retenus (seuls eux seront envoyés)</div><ol class="ai-ex">'+extracts.map(x=>'<li><b>'+esc(x.title)+'</b> — '+esc(x.t.slice(0,140))+(x.t.length>140?'…':'')+'</li>').join('')+'</ol>';
      g.set('idle');warn();
    }catch(e){g.set('error');$i('aiErr').hidden=false;$i('aiErr').textContent='Recherche locale impossible : '+e.message;}
  }
  async function go(){
    const txt=payload();if(!txt.trim()){$i('aiErr').hidden=false;$i('aiErr').textContent='Rien à envoyer.';return;}
    $i('aiErr').hidden=true;const out=$i('aiOut');out.hidden=false;out.innerHTML='';result='';
    f.querySelectorAll('#aiWarn details').forEach(d=>d.open=false);     // place à la réponse
    g.set('think');btns(B('stop','Arrêter'));
    ctl=new AbortController();let tm=0;
    armed=true;                                            // ← la SEULE porte d'entrée vers le réseau
    try{
      await send(sysFor(task),txt,(chunk,all)=>{result=all;g.token(chunk.length);
        if(!tm)tm=setTimeout(()=>{tm=0;out.innerHTML=md(result);out.scrollTop=out.scrollHeight;},70);},ctl.signal);
      clearTimeout(tm);out.innerHTML=md(result||'(réponse vide)');
      if(task==='ask')out.innerHTML+='<div class="ai-src">'+extracts.map((x,i)=>'<a href="notes.html#'+encodeURIComponent(x.id)+'" data-open="'+esc(x.id)+'">['+(i+1)+'] '+esc(x.title)+'</a>').join(' ')+'</div>';
      if(task==='flashcards')out.insertAdjacentHTML('afterbegin','<div class="ai-l">'+flashCount(result)+' carte(s)</div>');
      g.set('done');after();
    }catch(e){clearTimeout(tm);armed=false;
      if(closed)return;
      g.set('error');$i('aiErr').hidden=false;$i('aiErr').textContent=e.name==='AbortError'?'Arrêté.':'Échec : '+e.message;
      btns(B('x','Fermer')+B('cfg','Réglages IA…')+(result?B('copy','Copier'):''));
    }finally{ctl=null;}
  }
  function after(){
    let h=B('x','Fermer')+B('copy','Copier');
    if(task==='summary'||task==='flashcards'||task==='ask')h+=B('note','Créer une note');
    if(o.onUse)h+=B('use',o.useLabel||'Utiliser','primary');
    btns(h);
  }
  f.addEventListener('click',async e=>{
    const b=e.target.closest('[data-ai]');
    const a=e.target.closest('a[data-open]');
    if(a&&typeof openNote==='function'){e.preventDefault();close();openNote(a.dataset.open);return;}
    if(!b)return;
    switch(b.dataset.ai){
      case 'x':close();return;
      case 'stop':if(ctl)ctl.abort();return;
      case 'cfg':close();settings();return;
      case 'find':find();return;
      case 'send':go();return;
      case 'copy':copy(result,'Réponse copiée');return;
      case 'use':{const r=result;close();o.onUse(r);return;}
      case 'note':{const title=(task==='flashcards'?'Flashcards — ':task==='ask'?'Réponse — ':'Résumé — ')+(o.title||($i('aiIn')&&$i('aiIn').value)||'IA').slice(0,60);
        const tags=task==='flashcards'?['flashcards','ia']:['ia'];
        const id=addToNotebook(title,result,tags);toast('Note créée');close();
        if(typeof window.notesReloadFromStorage==='function'){notesReloadFromStorage();if(typeof openNote==='function')openNote(id);}
        if(typeof NOXE!=='undefined'&&NOXE.notesChanged)NOXE.notesChanged();return;}
    }
  });
  f.addEventListener('submit',e=>e.preventDefault());
  if(T.input){$i('aiIn').value=o.input||'';$i('aiIn').addEventListener('input',()=>{if(task==='ask'){extracts=null;$i('aiCtx').innerHTML='';}warn();});}
  ready.then(()=>{if(!closed)warn();});
  warn();
  setTimeout(()=>{const t=T.input?$i('aiIn'):f.querySelector('[data-ai="send"],[data-ai="cfg"]');if(t)t.focus();},0);
  OPEN={close,glyph:g,el:f};
  return OPEN;
}

/* ---------- réglages ---------- */
function settings(){
  if(OPEN)OPEN.close();
  const ov=document.createElement('div');ov.className='ctx-ov ai-ov';
  const P=k=>'<label class="ai-radio"><input type="radio" name="aiProv" value="'+k+'"'+(cfg.provider===k?' checked':'')+'> '+esc(PROV[k].name)+(k==='gemini'?' <small>(offre gratuite)</small>':'')+'</label>';
  ov.innerHTML='<form class="ctx-dlg ai-dlg ai-set" role="dialog" aria-modal="true" aria-labelledby="aiST" novalidate>'+
    '<div class="ai-head"><span class="ai-gl"></span><div><div class="ctx-dt" id="aiST">IA — réglages</div><div class="ai-sub">Tout est désactivé par défaut. Rien ne part sans ton clic.</div></div></div>'+
    '<p class="ai-net" id="aiNet" role="status"></p>'+
    '<h3 class="ai-h">1 · Recherche par le sens <small>(100 % locale)</small></h3>'+
    '<p class="ai-p">Un modèle multilingue (multilingual-e5-small quantifié : français et anglais, une question en anglais retrouve une note en français) tourne <b>dans ton navigateur</b> : recherche par le sens, notes liées, liens dans le graphe, « demander à mes notes ». '+
    'Téléchargement unique ≈ 155 Mo à l\'activation — prévois du Wi-Fi (moteur 21 Mo depuis cdn.jsdelivr.net, vérifié par empreinte SHA-384 ; modèle 118 Mo + vocabulaire 17 Mo depuis huggingface.co), puis hors ligne. Tes notes ne quittent pas l\'appareil.</p>'+
    '<div class="ai-row"><span id="aiLoc"></span><span class="ai-bt" id="aiLocBt"></span></div>'+
    '<h3 class="ai-h">2 · Assistant <small>(ta clé d\'API)</small></h3>'+
    '<div class="ai-provs">'+P('gemini')+P('openai')+'</div>'+
    '<div class="ai-grid"><label for="aiModel">Modèle</label><input id="aiModel" spellcheck="false" maxlength="80" list="aiModels" autocomplete="off"><datalist id="aiModels"></datalist>'+
    '<label for="aiBase" class="ai-ob">Adresse de l\'API</label><input id="aiBase" class="ai-ob" spellcheck="false" placeholder="https://api.openai.com/v1">'+
    '<label for="aiKey">Clé d\'API</label><input id="aiKey" type="password" autocomplete="off" spellcheck="false" maxlength="400"></div>'+
    '<div class="ai-grid ai-lang"><label for="aiLang">Langue des réponses</label><select id="aiLang">'+
      '<option value="auto">Auto (celle de ta question / de la note)</option><option value="fr">Français</option><option value="en">English</option></select></div>'+
    '<label class="ai-chk"><input type="checkbox" id="aiSkip"> Questions libres de la barre d\'accueil : ne plus demander de confirmation <small>(l\'envoi d\'extraits de notes est toujours confirmé)</small></label>'+
    '<div class="ai-row"><span id="aiKeySt" class="ai-p"></span><span><button type="button" class="btn ghost" data-s="clear">Effacer la clé</button> <button type="button" class="btn primary" data-s="save">Enregistrer</button></span></div>'+
    '<p class="ai-p ai-warn">⚠ La clé est <b>chiffrée</b> sur cet appareil (et dans la synchro, chiffrée de bout en bout) ; elle n\'est envoyée qu\'à '+
    '<span id="aiHost"></span>. Quand tu cliques « Envoyer » dans une fenêtre IA, <b>le texte affiché part chez ce fournisseur</b>. '+
    'Avec l\'offre gratuite de Gemini, Google peut utiliser ces textes pour améliorer ses services : évite les données sensibles. '+
    '<a id="aiGet" target="_blank" rel="noopener noreferrer">Obtenir une clé</a>. Sur le carnet, la page n\'autorise que Gemini, OpenAI, OpenRouter, Mistral, Groq et localhost (CSP).</p>'+
    '<div class="ctx-db"><button type="button" class="btn primary" data-s="x">Fermer</button></div></form>';
  document.body.appendChild(ov);
  const f=ov.firstChild,$i=id=>f.querySelector('#'+id),g=GLYPH.create({size:64,kind:'model'});f.querySelector('.ai-gl').appendChild(g.el);
  let closed=false;
  const close=()=>{closed=true;E.subs.delete(loc);E.subs.delete(net);removeEventListener('online',net);removeEventListener('offline',net);g.destroy();ov.remove();OPEN=null;document.removeEventListener('keydown',onKey,true);};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',onKey,true);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  function loc(){
    const s=E.state,st=$i('aiLoc'),bt=$i('aiLocBt');
    if(!cfg.local){st.textContent='Désactivée';bt.innerHTML='<button type="button" class="btn primary" data-s="on">Activer (≈ 155 Mo)</button>';g.set('idle');return;}
    if(s==='download'){st.textContent='Téléchargement / chargement… '+Math.round(E.p*100)+' %';g.progress(E.p);bt.innerHTML='';return;}
    if(s==='error'){st.textContent='Erreur : '+E.err;g.set('error');}
    else if(s==='ready'){
      /* v9 : plus de « 0 note(s) indexée(s) » trompeur : on lance l'indexation et on montre où elle en est */
      if(!indexing&&!vecLoaded)indexNotes().catch(()=>{});
      if(indexing||!vecLoaded){st.textContent='Prête ✓ — indexation de tes notes'+(IXP.total?' : '+IXP.done+' / '+IXP.total:'…');if(IXP.total)g.progress(IXP.done/IXP.total);}
      else{const n=VEC.size;st.textContent='Prête ✓ ('+n+' note'+(n>1?'s':'')+' indexée'+(n>1?'s':'')+')';if(g.state()!=='done')g.set('done');}}
    else st.textContent='Activée (modèle chargé à la première utilisation)';
    bt.innerHTML=(s!=='ready'?'<button type="button" class="btn ghost" data-s="on">Charger</button> ':'')+'<button type="button" class="btn ghost" data-s="off">Désactiver et supprimer le modèle</button>';
  }
  E.subs.add(loc);
  /* v10 : ce qui marche sans réseau, dit clairement */
  function net(){const n=$i('aiNet');if(!n)return;const on=online(),ok=cfg.local&&(E.state==='ready'||vecLoaded);
    n.className='ai-net '+(on?'on':'off');
    n.innerHTML=on?'● En ligne : tout est disponible.'
      :'○ Hors ligne · recherche par le sens : '+(cfg.local?(ok?'<b>marche</b> (modèle sur l\'appareil)':'marche si le modèle a déjà été téléchargé'):'désactivée')+
       ' · assistant par clé : <b>indisponible</b> (il a besoin du réseau).';}
  addEventListener('online',net);addEventListener('offline',net);E.subs.add(net);
  function prov(){
    const p=PROV[cfg.provider];$i('aiModel').value=cfg.model[cfg.provider]||'';$i('aiModel').placeholder=p.model+' (rapide)';
    $i('aiModels').innerHTML=(MODELS[cfg.provider]||[]).map(m=>'<option value="'+esc(m[0])+'" label="'+esc(m[1])+'">').join('');
    f.querySelectorAll('.ai-ob').forEach(x=>x.hidden=cfg.provider!=='openai');$i('aiBase').value=cfg.base||'';
    $i('aiHost').textContent=p.name+' ('+host()+')';$i('aiGet').href=p.keyUrl;$i('aiKey').value='';
    $i('aiKey').placeholder=hasKey()?'•••••••• (enregistrée — tape pour remplacer)':'colle ta clé ici';
    $i('aiKeySt').textContent=hasKey()?'Clé enregistrée (chiffrée).':'Aucune clé.';
    $i('aiLang').value=cfg.lang;$i('aiSkip').checked=cfg.skipFree;
  }
  f.addEventListener('change',e=>{
    if(e.target.name==='aiProv'){cfg.provider=e.target.value;saveCfg();prov();}
    if(e.target.id==='aiLang'){setPref('lang',e.target.value);}
    if(e.target.id==='aiSkip'){setPref('skipFree',e.target.checked);}
    if(e.target.id==='aiModel'){cfg.model[cfg.provider]=e.target.value.trim().replace(/[^\w.:\/-]/g,'').slice(0,80);saveCfg();}
    if(e.target.id==='aiBase'){const v=e.target.value.trim();if(!v||okBase(v)){cfg.base=v;saveCfg();prov();}else $i('aiKeySt').textContent='Adresse refusée (https:// obligatoire, ou http://localhost).';}
  });
  f.addEventListener('click',async e=>{
    const b=e.target.closest('[data-s]');if(!b)return;
    switch(b.dataset.s){
      case 'x':close();return;
      case 'on':enableLocal().catch(()=>{}).then(()=>{if(!closed)loc();});loc();return;
      case 'off':await disableLocal();if(!closed)loc();toast('Recherche par le sens désactivée, modèle supprimé');refreshNotes();return;
      case 'save':{const k=$i('aiKey').value.trim();if(!k){$i('aiKeySt').textContent='Colle d\'abord une clé.';return;}
        if(!(await setKey(cfg.provider,k))){$i('aiKeySt').textContent='Clé refusée (caractères invalides ?).';return;}
        $i('aiKey').value='';prov();toast('Clé chiffrée et enregistrée');return;}
      case 'clear':await setKey(cfg.provider,'');prov();toast('Clé effacée');return;
    }
  });
  f.addEventListener('submit',e=>e.preventDefault());
  ready.then(()=>{if(!closed)prov();});
  prov();loc();net();
  OPEN={close,glyph:g,el:f};
  return OPEN;
}
function setPref(k,v){if(k==='lang')cfg.lang=['fr','en'].includes(v)?v:'auto';else if(k==='skipFree')cfg.skipFree=!!v;else return;saveCfg();}
/* v8 : la barre de l'accueil (ai-bar.js) a sa propre interface ; elle passe par CETTE porte, appelée uniquement
   depuis un clic ou un Entrée sur « Envoyer » / l'option « Demander à l'IA » (jamais au fil de la frappe). */
function fire(task,txt,onText,signal,onPhase){if(!TASKS[task])return Promise.reject(new Error('demande inconnue'));armed=true;
  return send(sysFor(task),txt,onText,signal,onPhase).finally(()=>{armed=false;});}
function refreshNotes(){if(typeof renderAll==='function')try{renderAll();}catch(e){}}

/* ---------- points d'entrée : palette, clic droit ---------- */
const detect=t=>{t=String(t).trim();if(/^[\[{]/.test(t)){try{JSON.parse(t);return'json';}catch(e){}}
  if(/^\/.+\/[dgimsuy]*$/.test(t))return'regex';return'';};
function ctxItems(items){
  const out=[];
  if(items&&items.noteId){const n=items.noteGet(items.noteId);if(n){const o={text:(n.title?'# '+n.title+'\n\n':'')+(n.body||''),title:n.title||'Sans titre'};
    out.push({label:'Résumer la note',run:()=>run('summary',o)},{label:'Flashcards depuis la note',run:()=>run('flashcards',o)});}}
  if(items&&items.text){const t=items.text,d=detect(t);
    out.push({label:'Reformuler / corriger',run:()=>run('rewrite',{text:t})},{label:'Résumer',run:()=>run('summary',{text:t})});
    if(d==='json')out.push({label:'Expliquer ce JSON',run:()=>run('json',{text:t})});
    if(d==='regex')out.push({label:'Expliquer cette regex',run:()=>run('regexExplain',{text:t})});}
  out.push({label:'Demander à mes notes…',run:()=>run('ask',{})},{label:'Réglages IA…',run:settings});
  return['-',{label:'IA ✦',sub:()=>out}];
}
if(typeof NOXE!=='undefined'&&NOXE.cmds)NOXE.cmds.push(
  {id:'ai-ask',title:'IA : demander à mes notes',words:'ia ai demander question notes rag assistant chercher sens',run:()=>run('ask',{})},
  {id:'ai-regex',title:'IA : écrire une regex',words:'ia ai regex regexp expression reguliere ecrire generer',run:()=>run('regexWrite',{})},
  {id:'ai-rewrite',title:'IA : reformuler / corriger un texte',words:'ia ai reformuler corriger orthographe texte grammaire',run:()=>run('rewrite',{})},
  {id:'ai-settings',title:'IA : réglages (clé d\'API, recherche par le sens)',words:'ia ai reglages cle api gemini openai modele sens embeddings intelligence artificielle',run:settings});
document.addEventListener('click',e=>{const b=e.target.closest('[data-ai-settings]');if(b){e.preventDefault();settings();}});

return{PROV,MODELS,thinkFor,online,OfflineError,prepare,prewarm,warmed:()=>warmed,related,semPairs,plain,passages,timing:()=>Object.assign({},TIME),qCache:()=>QC.size,_vecs:()=>VEC,_nn:()=>nnStats(),_qvec:q=>qvec(q),embedQ:q=>qvec(q),
  TASKS,run,settings,ready,hasKey,fire,sysFor,setPref,askPayload,md,host,model,provider:()=>PROV[cfg.provider],IDX,rel:relOf,setKey,syncPart,syncReceive,embed,enableLocal,disableLocal,indexNotes,similarTo,search,retrieve,ctxItems,
  cfg:()=>JSON.parse(JSON.stringify(cfg)),local:()=>cfg.local,state:()=>E.state,stats,
  set workerFactory(f){workerFactory=f;},onState(f){E.subs.add(f);return()=>E.subs.delete(f);},isOpen:()=>!!OPEN,close:()=>OPEN&&OPEN.close(),
  forget:async ids=>{for(const id of ids){VEC.delete(id);try{await idb('vec','readwrite',s=>s.delete(id));}catch(e){}}}};   // tests : retire des vecteurs précis
})();
window.AI=AI;
