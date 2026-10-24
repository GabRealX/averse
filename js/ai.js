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
  gemini:{name:'Google Gemini',short:'Gemini',model:'gemini-2.5-flash',base:'https://generativelanguage.googleapis.com/v1beta',keyUrl:'https://aistudio.google.com/apikey'},
  openai:{name:'Service OpenAI-compatible',short:'OpenAI-compatible',model:'gpt-4o-mini',base:'https://api.openai.com/v1',keyUrl:'https://platform.openai.com/api-keys'}
};
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
async function send(system,prompt,onText,signal){
  if(!armed)throw new Error('aucune requête sans action explicite');
  armed=false;
  const key=KEYS[cfg.provider];if(!key)throw new Error('pas de clé d\'API');
  let url,headers={'content-type':'application/json'},body;
  if(cfg.provider==='gemini'){
    url=base()+'/models/'+encodeURIComponent(model())+':streamGenerateContent?alt=sse';headers['x-goog-api-key']=key;
    body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:.3}};
  }else{
    url=base()+'/chat/completions';headers.authorization='Bearer '+key;
    body={model:model(),stream:true,temperature:.3,messages:[{role:'system',content:system},{role:'user',content:prompt}]};
  }
  stats.calls++;
  const res=await window.fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store',mode:'cors'});
  if(!res.ok){let msg='';try{const j=await res.json();msg=(j.error&&(j.error.message||j.error.status))||'';}catch(e){}
    throw new Error(({400:'requête refusée',401:'clé refusée',403:'clé refusée ou service non autorisé',404:'modèle introuvable',429:'quota dépassé (réessaie plus tard)'}[res.status]||'erreur '+res.status)+(msg?' — '+String(msg).slice(0,160):''));}
  const rd=res.body.getReader(),td=new TextDecoder();let buf='',all='';
  const line=l=>{l=l.trim();if(!l.startsWith('data:'))return;const d=l.slice(5).trim();if(!d||d==='[DONE]')return;
    let j;try{j=JSON.parse(d);}catch(e){return;}
    const t=cfg.provider==='gemini'?((j.candidates&&j.candidates[0]&&j.candidates[0].content&&j.candidates[0].content.parts)||[]).map(p=>p.text||'').join('')
      :((j.choices&&j.choices[0]&&j.choices[0].delta&&j.choices[0].delta.content)||'');
    if(t){all+=t;onText(t,all);}};
  for(;;){const {done,value}=await rd.read();if(done)break;
    if(signal&&signal.aborted){try{rd.cancel();}catch(e){}throw new DOMException('arrêté','AbortError');}buf+=td.decode(value,{stream:true});
    const parts=buf.split('\n');buf=parts.pop();parts.forEach(line);}
  if(buf)line(buf);
  return all;
}

/* ---------- A) embeddings locaux (Worker) ---------- */
const E={w:null,seq:0,wait:new Map(),state:'off',p:0,subs:new Set(),err:''};
let workerFactory=()=>new Worker('js/ai-worker.js',{type:'module'});
const emit=()=>E.subs.forEach(f=>{try{f(E);}catch(e){}});
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
async function enableLocal(){cfg.local=true;saveCfg();E.err='';await loadModel();await indexNotes();}
async function disableLocal(){
  cfg.local=false;saveCfg();if(E.w){E.w.terminate();E.w=null;}E.state='off';E.p=0;E.wait.clear();VEC.clear();vecLoaded=false;
  try{await idb('vec','readwrite',s=>s.clear());}catch(e){}
  try{await caches.delete('transformers-cache');await caches.delete('averse-ai-1');}catch(e){}
  emit();
}

/* v8 : modèle multilingue (français + anglais). Les vecteurs d'un AUTRE modèle ne sont pas comparables :
   si la version d'index change, on vide les vecteurs et l'ancien modèle (cache), puis tout est recalculé. */
const IDX='e5s-1';                                   // multilingual-e5-small q8 (voir ai-worker.js)
const PFX={q:'query: ',p:'passage: '};               // préfixes attendus par la famille E5 (seulement pour elle)
async function migrate(){
  if(cfg.idx===IDX)return;
  try{await idb('vec','readwrite',s=>s.clear());}catch(e){}
  VEC.clear();vecLoaded=false;
  if(cfg.idx||cfg.local){try{const c=await caches.open('transformers-cache');
    for(const r of await c.keys())if(/all-MiniLM-L6-v2/.test(r.url))await c.delete(r);}catch(e){}}
  cfg.idx=IDX;saveCfg();
}
/* vecteurs des notes : {id → {h, v}} ; h = empreinte du texte (on ne recalcule que ce qui a changé) */
const VEC=new Map();let vecLoaded=false;
const fnv=s=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(36);};
const notes=()=>{const d=getLS(NKEY,null);return d&&d.notes?Object.values(d.notes).filter(n=>n&&n.id):[];};
const noteText=n=>((n.title||'')+'\n'+(n.tags||[]).join(', ')+'\n'+(n.body||'')).slice(0,1600);
const dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
let indexing=null;
async function indexNotes(onP){
  if(indexing)return indexing;
  indexing=(async()=>{
    await migrate();
    if(!vecLoaded){try{const all=await idb('vec','readonly',s=>s.getAll()),ks=await idb('vec','readonly',s=>s.getAllKeys());
      ks.forEach((k,i)=>VEC.set(k,all[i]));}catch(e){}vecLoaded=true;}
    const ns=notes(),live=new Set(ns.map(n=>n.id));
    for(const k of [...VEC.keys()])if(!live.has(k))VEC.delete(k);
    const todo=ns.filter(n=>{const v=VEC.get(n.id);return!v||v.h!==fnv(noteText(n));});
    for(let i=0;i<todo.length;i+=16){
      const part=todo.slice(i,i+16),vs=await embed(part.map(noteText),'p');
      for(let k=0;k<part.length;k++){const o={h:fnv(noteText(part[k])),v:vs[k]};VEC.set(part[k].id,o);idb('vec','readwrite',s=>s.put(o,part[k].id)).catch(()=>{});}
      if(onP)onP((i+part.length)/todo.length);
    }
    return VEC;
  })();
  try{return await indexing;}finally{indexing=null;}
}
async function similarTo(id,k){await indexNotes();const me=VEC.get(id);if(!me)return[];
  return[...VEC].filter(([x])=>x!==id).map(([x,o])=>({id:x,s:dot(me.v,o.v)})).sort((a,b)=>b.s-a.s).slice(0,k||5);}
async function search(q,k){await indexNotes();const [v]=await embed([q]);
  return[...VEC].map(([x,o])=>({id:x,s:dot(v,o.v)})).sort((a,b)=>b.s-a.s).slice(0,k||8);}
/* RAG : les meilleurs EXTRAITS (paragraphes) pour une question — calcul 100 % local */
function chunks(n){const out=[],ps=String(n.body||'').split(/\n\s*\n/);let cur='';
  for(const p of ps){if((cur+'\n\n'+p).length>700&&cur){out.push(cur);cur=p;}else cur=cur?cur+'\n\n'+p:p;}
  if(cur.trim())out.push(cur);return out.map(t=>t.slice(0,900));}
/* seuil de pertinence du RAG, par modèle. Mesuré dans Chromium avec E5 (8 notes FR/EN, 10 questions, voir README) :
   ses scores sont serrés — meilleure note SANS rapport ≈ .76–.81, extrait pertinent ≈ .82–.88.
   On garde ce qui est au-dessus de « min » ET à moins de « gap » du meilleur. */
const RELS={'Xenova/multilingual-e5-small':{min:.815,gap:.03}};
const relOf=()=>RELS[E.model]||{min:.25,ratio:.8};           // autre modèle (ou faux Worker des tests) : seuil v7 relatif
async function retrieve(q,max){
  max=max||3500;
  const by=Object.fromEntries(notes().map(n=>[n.id,n]));
  let cand;
  if(cfg.local){const [qv]=await embed([q]);await indexNotes();
    const top=[...VEC].map(([x,o])=>({id:x,s:dot(qv,o.v)})).sort((a,b)=>b.s-a.s).slice(0,6).filter(r=>by[r.id]);
    const parts=[];top.forEach(r=>chunks(by[r.id]).forEach(t=>parts.push({id:r.id,t})));
    const vs=parts.length?await embed(parts.map(p=>(by[p.id].title||'')+'\n'+p.t),'p'):[];
    cand=parts.map((p,i)=>({id:p.id,t:p.t,s:dot(qv,vs[i])})).sort((a,b)=>b.s-a.s);
  }else{                                                     // repli sans modèle : mots en commun (moins bon, mais local)
    const ws=String(q).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').split(/\W+/).filter(w=>w.length>2);
    cand=[];Object.values(by).forEach(n=>chunks(n).forEach(t=>{const tt=((n.title||'')+' '+t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      const s=ws.reduce((a,w)=>a+(tt.includes(w)?1:0),0)/Math.max(1,ws.length);if(s>0)cand.push({id:n.id,t,s});}));
    cand.sort((a,b)=>b.s-a.s);
  }
  /* seulement ce qui est vraiment proche : rien d'une note sans rapport ne doit partir chez le fournisseur */
  const best=cand.length?cand[0].s:0;const R0=relOf();
  cand=cand.filter(c=>c.s>=(cfg.local?Math.max(R0.min,R0.gap!=null?best-R0.gap:best*R0.ratio):Math.max(.34,best*.5)));
  const out=[];let len=0;
  for(const c of cand){if(out.length>=6||len+c.t.length>max)continue;out.push({id:c.id,title:by[c.id].title||'Sans titre',t:c.t,s:c.s});len+=c.t.length;}
  return out;
}

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
  const f=ov.firstChild,$i=id=>f.querySelector('#'+id),g=GLYPH.create({size:46,kind:T.kind});f.querySelector('.ai-gl').appendChild(g.el);
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
    '<h3 class="ai-h">1 · Recherche par le sens <small>(100 % locale)</small></h3>'+
    '<p class="ai-p">Un modèle multilingue (multilingual-e5-small quantifié : français et anglais, une question en anglais retrouve une note en français) tourne <b>dans ton navigateur</b> : recherche par le sens, notes liées, liens dans le graphe, « demander à mes notes ». '+
    'Téléchargement unique ≈ 155 Mo à l\'activation — prévois du Wi-Fi (moteur 21 Mo depuis cdn.jsdelivr.net, vérifié par empreinte SHA-384 ; modèle 118 Mo + vocabulaire 17 Mo depuis huggingface.co), puis hors ligne. Tes notes ne quittent pas l\'appareil.</p>'+
    '<div class="ai-row"><span id="aiLoc"></span><span class="ai-bt" id="aiLocBt"></span></div>'+
    '<h3 class="ai-h">2 · Assistant <small>(ta clé d\'API)</small></h3>'+
    '<div class="ai-provs">'+P('gemini')+P('openai')+'</div>'+
    '<div class="ai-grid"><label for="aiModel">Modèle</label><input id="aiModel" spellcheck="false" maxlength="80">'+
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
  const f=ov.firstChild,$i=id=>f.querySelector('#'+id),g=GLYPH.create({size:46,kind:'model'});f.querySelector('.ai-gl').appendChild(g.el);
  let closed=false;
  const close=()=>{closed=true;E.subs.delete(loc);g.destroy();ov.remove();OPEN=null;document.removeEventListener('keydown',onKey,true);};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}};
  document.addEventListener('keydown',onKey,true);
  ov.addEventListener('mousedown',e=>{if(e.target===ov)close();});
  function loc(){
    const s=E.state,st=$i('aiLoc'),bt=$i('aiLocBt');
    if(!cfg.local){st.textContent='Désactivée';bt.innerHTML='<button type="button" class="btn primary" data-s="on">Activer (≈ 155 Mo)</button>';g.set('idle');return;}
    if(s==='download'){st.textContent='Téléchargement / chargement… '+Math.round(E.p*100)+' %';g.progress(E.p);bt.innerHTML='';return;}
    if(s==='error'){st.textContent='Erreur : '+E.err;g.set('error');}
    else if(s==='ready'){st.textContent=indexing?'Prête ✓ — indexation de tes notes…':'Prête ✓ ('+VEC.size+' note(s) indexée(s))';if(g.state()!=='done')g.set('done');}
    else st.textContent='Activée (modèle chargé à la première utilisation)';
    bt.innerHTML=(s!=='ready'?'<button type="button" class="btn ghost" data-s="on">Charger</button> ':'')+'<button type="button" class="btn ghost" data-s="off">Désactiver et supprimer le modèle</button>';
  }
  E.subs.add(loc);
  function prov(){
    const p=PROV[cfg.provider];$i('aiModel').value=cfg.model[cfg.provider]||'';$i('aiModel').placeholder=p.model;
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
  prov();loc();
  OPEN={close,glyph:g,el:f};
  return OPEN;
}
function setPref(k,v){if(k==='lang')cfg.lang=['fr','en'].includes(v)?v:'auto';else if(k==='skipFree')cfg.skipFree=!!v;else return;saveCfg();}
/* v8 : la barre de l'accueil (ai-bar.js) a sa propre interface ; elle passe par CETTE porte, appelée uniquement
   depuis un clic ou un Entrée sur « Envoyer » / l'option « Demander à l'IA » (jamais au fil de la frappe). */
function fire(task,txt,onText,signal){if(!TASKS[task])return Promise.reject(new Error('demande inconnue'));armed=true;
  return send(sysFor(task),txt,onText,signal).finally(()=>{armed=false;});}
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

return{PROV,TASKS,run,settings,ready,hasKey,fire,sysFor,setPref,askPayload,md,host,model,provider:()=>PROV[cfg.provider],IDX,rel:relOf,setKey,syncPart,syncReceive,embed,enableLocal,disableLocal,indexNotes,similarTo,search,retrieve,ctxItems,
  cfg:()=>JSON.parse(JSON.stringify(cfg)),local:()=>cfg.local,state:()=>E.state,stats,
  set workerFactory(f){workerFactory=f;},onState(f){E.subs.add(f);return()=>E.subs.delete(f);},isOpen:()=>!!OPEN,close:()=>OPEN&&OPEN.close(),
  forget:async ids=>{for(const id of ids){VEC.delete(id);try{await idb('vec','readwrite',s=>s.delete(id));}catch(e){}}}};   // tests : retire des vecteurs précis
})();
window.AI=AI;
