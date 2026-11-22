/* ai-bar.js — v8 : l'IA directement dans la barre de recherche de l'accueil.
   - Quand le texte ressemble à une question (« comment… », « … ? », 5 mots ou plus), ou si tu le demandes
     (préfixe « ? », touche Tab, bouton Glyph à droite de la barre), des options « IA » s'affichent EN TÊTE des résultats :
       Demander à l'IA (question libre) · Demander à mes notes (RAG) · Chercher par le sens (local, si activé).
     Elles ne prennent la sélection que si tu les forces : Entrée ouvre toujours le premier outil / la première note sinon.
   - AUCUNE requête au fil de la frappe : seul Entrée / clic sur une option, puis « Envoyer », passe par AI.fire().
     Question libre : petite confirmation (désactivable : « ne plus demander »). Extraits de notes : confirmation TOUJOURS.
   - Pas de clé : l'option mène aux réglages IA. La recherche par le sens (100 % locale) reste disponible si activée.
   v12 : plus d'animation gros/petit du Glyph de l'accueil pendant une demande. Un petit indicateur
     (AIMARK, 24 px) à côté du statut : un X qui tourne, puis un « ? », puis une forme selon l'étape.
   - Des étapes RÉELLES s'enchaînent dans le panneau : « Je lis ta question », « Je cherche dans tes 42 notes »,
     « 3 notes trouvées : X, Y, Z » (puces cliquables), « J'envoie à Gemini », « Gemini réfléchit », « Je rédige ».
     Chaque étape ne passe à la suivante que quand le travail est VRAIMENT fait (pas de fausse barre de progression) ;
     le temps écoulé de l'étape en cours s'affiche (vrai chronomètre).
   - Squelette de réponse tout de suite, puis texte qui s'écrit en douceur (au rythme de ce qui arrive), petite transition à la fin.
   - Pendant que tu tapes une question : son vecteur est calculé à l'avance (100 % local, aucun réseau) -> la recherche démarre aussitôt.
   - Hors ligne : message clair (ce qui marche sans réseau, ce qui ne marche pas) et, SEULEMENT si tu cliques
     « Envoyer quand le réseau revient », la demande attend le retour du réseau (en mémoire : fermer l'onglet l'oublie). */
(function(){
if(typeof AI==='undefined'||typeof GLYPH==='undefined'||typeof AIMARK==='undefined'||typeof NOXE==='undefined')return;
const q=$('q'),P=$('aiPanel'),btn=$('qAi'),HV=$('homeView');if(!q||!P||!btn)return;

/* ---------- est-ce une question ? (simple et prudent) ---------- */
const QW=/^(?:comment|pourquoi|quel(?:le)?s?|qu['’]est|que|quoi|combien|où|quand|qui|est-ce|explique|expliquer|résume|resume|traduis|traduire|écris|ecris|donne|peux-tu|peut-on|dois-je|faut-il|c['’]est|how|what|why|which|when|where|who|can|could|should|is|are|does|do|explain|write|tell|translate)(?=[\s'’?,]|$)/i;
const isQuestion=v=>{v=String(v||'').trim();if(!v)return false;
  return /^\?/.test(v)||/\?$/.test(v)||QW.test(v)||v.split(/\s+/).length>=5;};
const cut=s=>s.length>60?s.slice(0,59)+'…':s;
const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- icônes : petit Glyph au repos dans la barre ; pendant une demande, le petit AIMARK du panneau ---------- */
const small=matchMedia('(max-width:560px)').matches;
const barG=GLYPH.create({size:small?38:46,kind:'ask',dim:true});btn.appendChild(barG.el);btn.hidden=false;
const g=AIMARK.create({size:24,pause:true});g.el.classList.add('aip-gl');
function aiMode(v){if(!HV)return;if(v)HV.dataset.ai=v;else{delete HV.dataset.ai;if(NOXE.homeMood)NOXE.homeMood();}}
/* v12 : si tu as défilé jusqu'au bouton « Envoyer », on remonte le haut du panneau (là où est le petit indicateur) */
function panelInView(){if(P.hidden)return;const el=P.querySelector('.aip-h')||P;
  const nav=document.querySelector('body>nav'),top=nav?Math.max(0,nav.getBoundingClientRect().bottom):0;
  const r=el.getBoundingClientRect();if(r.top>=top-1&&r.bottom<=innerHeight+1)return;
  el.scrollIntoView({block:'start',behavior:reduce()?'auto':'smooth'});}
let cur=null;                                     // la demande en cours : {mode, q, phase, ctl, result, extracts, t0}
function rest(){if(cur&&cur.phase==='busy')return;g.set('idle');barG.set('idle',{dim:!(AI.hasKey()||AI.local()),kind:'ask'});}
rest();
AI.ready.then(()=>{rest();if(q.value.trim()&&NOXE.refreshHome)NOXE.refreshHome();});
AI.onState(()=>{if(!cur)rest();});

/* ---------- les options en tête des résultats (appelées par app.js) ---------- */
NOXE.searchLead=(v,forced)=>{
  const raw=String(v||'').trim(),pre=/^\?/.test(raw),qq=raw.replace(/^\?\s*/,'').trim();
  if(pre&&!qq)return[{type:'ai',act:'hint',title:'Écris ta question après le « ? » (Entrée pour la poser)',hint:'IA',run:()=>q.focus()},
    {type:'ai',act:'keys',title:'Afficher les raccourcis clavier',hint:'Aide',run:()=>{if(window.keysHelp)keysHelp.open();}}];
  if(!qq||(!forced&&!pre&&!isQuestion(raw)))return[];
  const out=[],P0=AI.provider(),off=!AI.online();
  if(AI.hasKey())out.push(
    {type:'ai',act:'free',title:'Demander à l\'IA : « '+cut(qq)+' »',hint:(off?'Hors ligne · ':'Question libre · ')+P0.short,run:()=>ask('free',qq)},
    {type:'ai',act:'notes',title:'Demander à mes notes : « '+cut(qq)+' »',hint:(off?'Hors ligne · ':'Extraits -> ')+P0.short,run:()=>ask('notes',qq)});
  else out.push({type:'ai',act:'setup',title:'Demander à l\'IA : ajoute d\'abord ta clé d\'API…',hint:'Réglages IA',run:()=>{close();AI.settings();}});
  if(AI.local())out.push({type:'ai',act:'sem',title:'Chercher par le sens dans mes notes : « '+cut(qq)+' »',hint:off?'Local · marche hors ligne':'Local',run:()=>ask('sem',qq)});
  return out;
};
NOXE.isQuestion=isQuestion;

/* ---------- le panneau : en-tête, étapes, corps, boutons ---------- */
const B=(act,label,cls)=>'<button type="button" class="btn '+(cls||'ghost')+'" data-p="'+act+'">'+esc(label)+'</button>';
function frame(title,sub){
  P.classList.remove('aip-arrive');
  P.innerHTML='<div class="aip-h"><span class="aip-glw"></span><b>'+esc(title)+'</b><span class="aip-sub">'+esc(sub)+'</span>'+
    '<button type="button" class="aip-x" data-p="x" aria-label="Fermer (Échap)" title="Fermer (Échap)">x</button></div>'+
    '<ol class="aip-steps" aria-live="polite"></ol><div class="aip-b"></div><div class="aip-a"></div>';
  P.querySelector('.aip-glw').appendChild(g.el);
  P.hidden=false;
}
const body=h=>{const b=P.querySelector('.aip-b');if(b)b.innerHTML=h;return b;};
const btns=h=>{const a=P.querySelector('.aip-a');if(a)a.innerHTML=h;};
function show(title,sub,html,bt){frame(title,sub);body(html);btns(bt);}            // (compatibilité : panneau d'un coup)

/* étapes : step(clé, html, état) — 'now' (en cours, avec chrono), 'ok', 'bad'. Ajouter une étape termine la précédente. */
let tick=0;
function step(k,html,st){
  const ol=P.querySelector('.aip-steps');if(!ol)return;
  let li=ol.querySelector('[data-k="'+k+'"]');
  if(!li){ol.querySelectorAll('li.now').forEach(x=>{x.className='ok';x.querySelector('.aip-t').textContent=x.dataset.t||'';});
    li=document.createElement('li');li.dataset.k=k;li.dataset.s=performance.now();li.innerHTML='<span class="aip-d"></span><span class="aip-st"></span><span class="aip-t"></span>';ol.appendChild(li);}
  li.className=st||'now';if(html!=null)li.querySelector('.aip-st').innerHTML=html;
  if(li.className!=='now'){const s=(performance.now()-li.dataset.s)/1000;li.dataset.t=s>=.3?fmtS(s):'';li.querySelector('.aip-t').textContent=li.dataset.t;}
  if(!tick)tick=setInterval(()=>{const n=P.querySelectorAll('.aip-steps li.now');if(!n.length||P.hidden){clearInterval(tick);tick=0;return;}
    n.forEach(x=>{const s=(performance.now()-x.dataset.s)/1000;x.querySelector('.aip-t').textContent=s>=.8?fmtS(s):'';});},200);
}
const stepsDone=()=>P.querySelectorAll('.aip-steps li.now').forEach(x=>step(x.dataset.k,null,'ok'));
const fmtS=s=>(s<10?s.toFixed(1):Math.round(s)).toString().replace('.',',')+' s';
const nNotes=()=>Object.values(notesById()).filter(n=>n&&n.id&&!n.deleted).length;
const chips=list=>{const seen=new Set(),by=notesById();
  return list.filter(x=>!seen.has(x.id)&&seen.add(x.id)).map(x=>'<a class="aip-chip" href="notes.html#'+encodeURIComponent(x.id)+'" data-note="'+esc(x.id)+'">'+esc(x.title||(by[x.id]&&by[x.id].title)||'Sans titre')+'</a>').join(' ');};
const plural=(n,a,b)=>n+' '+(n>1?b:a);

function close(){
  if(cur&&cur.ctl)cur.ctl.abort();
  cur=null;P.hidden=true;P.innerHTML='';P.classList.remove('aip-arrive');aiMode('');rest();
}
function warnHtml(kind,len){const p=AI.provider();
  return'<div class="ai-warn">[!] '+(kind==='notes'?'Ta question <b>et les extraits ci-dessus</b>':'Ta question')+' ('+len+' caractères) <b>part chez '+esc(p.name)+'</b> ('+esc(AI.host())+', modèle '+esc(AI.model())+
    ') avec ta clé. AVERSE n\'envoie rien d\'autre, nulle part. Évite les données sensibles.'+
    '<details><summary>Voir exactement ce qui sera envoyé</summary><pre class="ai-pre"></pre></details></div>';}

/* recherche locale avec ses étapes : je lis ta question -> je cherche dans tes N notes. Renvoie le résultat de fn(). */
async function localSteps(c,qq,fn){
  const n=nNotes();
  if(AI.local()){
    step('read',AI.t('read')+' <small>('+(AI.uiLang()==='en'?'on this device':'sur ton appareil')+')</small>');g.set('read');
    await AI.embedQ(qq);if(cur!==c)return null;
  }
  step('look',AI.t(AI.local()?'look':'lookKw',{n:n}));
  g.set('search');
  if(AI.local())await AI.indexNotes(p=>{if(cur===c)step('look',AI.t('look',{n:n})+' <small>'+Math.round(p*100)+' %</small>');});
  if(cur!==c)return null;
  return fn();
}

async function ask(mode,qq){
  close();
  const c=cur={mode,q:qq,phase:'confirm',ctl:null,result:'',extracts:null};
  const p=AI.provider();
  if(mode==='free'){
    if(!AI.hasKey()){close();AI.settings();return;}
    aiMode('busy');
    if(AI.cfg().skipFree){send();return;}                         // tu as choisi « ne plus demander » (questions libres seulement)
    show('IA · Question libre',p.name,warnHtml('free',qq.length)+offHtml()+
      '<label class="ai-chk"><input type="checkbox" id="aipSkip"> Ne plus demander pour les questions libres <small>(jamais pour tes notes)</small></label>',
      B('x','Annuler')+B('send','Envoyer à '+p.short,'primary'));
    P.querySelector('.ai-pre').textContent=qq;
    P.querySelector('[data-p="send"]').focus();return;
  }
  /* notes / sens : d'abord une recherche 100 % locale */
  c.phase='busy';aiMode('busy');
  frame(mode==='sem'?'Recherche par le sens':'IA · Demander à mes notes',mode==='sem'?'100 % locale':p.name);
  body('<p class="aip-note">Rien n\'est envoyé à cette étape : tout se passe sur ton appareil.</p>');btns(B('x','Annuler'));
  try{
    if(mode==='sem'){
      const r=await localSteps(c,qq,()=>AI.search(qq,6));if(cur!==c||!r)return;
      const by=notesById(),list=r.filter(x=>by[x.id]&&x.ok!==false).slice(0,6);
      c.phase='answer';g.set(list.length?'done':'error',{kind:'embed'});aiMode('answer');
      step('found',list.length?AI.t('found',{n:list.length,s:list.length>1?'s':''}):AI.t('foundNone'),list.length?'ok':'bad');
      body(list.length?'<ol class="ai-ex aip-sem">'+list.map(x=>'<li><a href="notes.html#'+encodeURIComponent(x.id)+'" data-note="'+esc(x.id)+'">'+esc(by[x.id].title||'Sans titre')+'</a> <small>'+esc(x.label||'')+'</small></li>').join('')+'</ol>'
        :'<p class="aip-note">Aucune note trouvée.</p>');btns(B('x','Fermer'));arrive();
      return;
    }
    const ex=await localSteps(c,qq,()=>AI.retrieve(qq));if(cur!==c||!ex)return;
    if(!ex.length){c.phase='error';g.set('error');aiMode('answer');step('found',AI.t('foundNone'),'bad');
      body('<p class="ai-err">'+esc(AI.t('foundNoneSent'))+'</p>');
      btns(B('x','Fermer')+(AI.hasKey()?B('asfree','Poser comme question libre'):''));return;}
    const nn=new Set(ex.map(x=>x.id)).size;
    step('found',AI.t('found',{n:nn,s:nn>1?'s':''})+' : '+chips(ex),'ok');
    c.extracts=ex;c.phase='confirm';g.set('idle',{kind:'ask'});
    const txt=AI.askPayload(qq,ex);
    body('<div class="ai-l">Extraits retenus (seuls eux seront envoyés)</div><ol class="ai-ex">'+
      ex.map(x=>'<li><b>'+esc(x.title)+'</b> — '+esc(x.t.slice(0,140))+(x.t.length>140?'…':'')+'</li>').join('')+'</ol>'+warnHtml('notes',txt.length)+offHtml());
    btns(B('x','Annuler')+B('send','Envoyer à '+p.short,'primary'));
    P.querySelector('.ai-pre').textContent=txt;
    P.querySelector('[data-p="send"]').focus();
  }catch(e){if(cur!==c)return;c.phase='error';g.set('error');aiMode('answer');stepsDone();
    body('<p class="ai-err">'+esc(AI.t('errLocal',{m:e.message}))+'</p>');btns(B('x','Fermer')+B('cfg','Réglages IA…'));}
}
const notesById=()=>{const d=getLS('noxe-notes',null);return d&&d.notes||{};};
/* v10 : hors ligne, dit d'avance ce qui marche et ce qui ne marche pas */
const offHtml=()=>AI.online()?'':'<p class="aip-off">Hors ligne : l\'IA par clé ('+esc(AI.provider().short)+') a besoin du réseau.'+
  (AI.local()?' La recherche par le sens, elle, marche sans réseau.':'')+'</p>';

/* ---------- texte qui s'écrit en douceur : on affiche ce qui est ARRIVÉ, un peu plus vite si du retard s'accumule ---------- */
function streamer(out){return AI.streamView(out);}
const SKEL='<div class="aip-skel" aria-hidden="true"><i></i><i></i><i></i></div>';
function arrive(){if(reduce())return;P.classList.remove('aip-arrive');void P.offsetWidth;P.classList.add('aip-arrive');setTimeout(()=>P.classList.remove('aip-arrive'),900);}

/* l'envoi : UNIQUEMENT depuis « Envoyer » (clic / Entrée sur le bouton) ou Entrée sur l'option si « ne plus demander »,
   ou au retour du réseau si tu as cliqué « Envoyer quand le réseau revient » */
async function send(){
  const c=cur;if(!c)return;
  const task=c.mode==='notes'?'ask':'free',txt=c.mode==='notes'?AI.askPayload(c.q,c.extracts):c.q,p=AI.provider();
  c.phase='busy';c.result='';c.queued=false;aiMode('busy');requestAnimationFrame(panelInView);
  const keep=P.querySelector('.aip-steps')&&!P.hidden?P.querySelector('.aip-steps').innerHTML:'';
  frame(c.mode==='notes'?'IA · Demander à mes notes':'IA · Question libre',p.name+' · '+AI.host());
  if(keep)P.querySelector('.aip-steps').innerHTML=keep;
  P.querySelectorAll('.aip-steps li[data-k="send"],.aip-steps li[data-k="wait"],.aip-steps li[data-k="think"],.aip-steps li[data-k="write"]').forEach(x=>x.remove());
  body('<p class="aip-q">'+esc(c.q)+'</p><div class="ai-out aip-out" aria-live="polite" aria-busy="true">'+SKEL+'</div><p class="ai-err" hidden></p>');
  btns(B('stop','Arrêter'));
  const out=P.querySelector('.aip-out');
  if(!AI.online())return offline(c,out);
  c.ctl=new AbortController();
  step('send',AI.t(c.mode==='notes'?'sendNotes':'sendQ',{name:p.short})+' <small>('+esc(AI.model())+')</small>');
  g.set('think');
  const S=streamer(out);let first=true;
  const onPhase=k=>{if(cur!==c)return;
    if(k==='headers'){step('think',AI.t('think',{name:p.short}));g.set('think');}
    if(k==='first'){step('write',AI.t('write'));g.set('write');}};
  try{
    await AI.fire(task,txt,(ch,all)=>{if(cur!==c||c.ctl.signal.aborted)return;
      if(first){first=false;out.removeAttribute('aria-busy');if(!P.querySelector('[data-k="write"]'))step('write',AI.t('write'));g.set('write');}
      c.result=all;g.token(ch.length);S.push(all);},c.ctl.signal,onPhase);
    if(cur!==c)return;
    await S.end();if(cur!==c)return;
    out.removeAttribute('aria-busy');out.innerHTML=AI.md(c.result||'(réponse vide)');
    if(c.extracts)out.insertAdjacentHTML('beforeend','<div class="ai-src">'+c.extracts.map((x,i)=>'<a href="notes.html#'+encodeURIComponent(x.id)+'" data-note="'+esc(x.id)+'">['+(i+1)+'] '+esc(x.title)+'</a>').join(' ')+'</div>');
    const tm=AI.timing();
    stepsDone();step('done',AI.t('done')+(tm.done?' <small>('+fmtS(tm.done/1000)+(tm.first?', '+AI.t('firstAt',{t:fmtS(tm.first/1000)}):'')+')</small>':''),'ok');
    c.phase='answer';c.ctl=null;g.set('done');aiMode('answer');arrive();
    btns(B('copy','Copier')+B('note','Enregistrer en note')+B('x','Fermer','primary'));
  }catch(e){S.stop();if(cur!==c)return;
    if(e&&e.name==='OfflineError'&&!c.result){c.ctl=null;return offline(c,out);}
    c.phase='error';c.ctl=null;g.set('error');aiMode('answer');
    P.querySelectorAll('.aip-steps li.now').forEach(x=>step(x.dataset.k,null,'bad'));
    const er=P.querySelector('.aip-b .ai-err');er.hidden=false;er.textContent=e.name==='AbortError'?AI.t('errStop'):(AI.uiLang()==='en'?'Failed: ':'Échec : ')+e.message;
    out.removeAttribute('aria-busy');out.innerHTML=c.result?AI.md(c.result):'';if(!c.result)out.hidden=true;
    btns((c.result?B('copy','Copier'):'')+B('cfg','Réglages IA…')+B('x','Fermer','primary'));
  }
}
/* hors ligne : rien ne part. File d'attente SEULEMENT si tu la demandes (clic), gardée en mémoire (pas sur le disque) */
function offline(c,out){
  c.phase='offline';c.ctl=null;g.set('error');aiMode('answer');
  step('send','Hors ligne : '+esc(AI.provider().short)+' est injoignable','bad');
  out.hidden=true;
  const er=P.querySelector('.aip-b .ai-err');er.hidden=false;
  er.textContent=AI.t('offline');
  btns(B('x','Fermer')+(AI.local()?B('sem','Chercher par le sens (local)'):'')+B('queue','Envoyer quand le réseau revient','primary'));
}
function queue(){const c=cur;if(!c)return;c.queued=true;c.phase='queued';g.set('think',{kind:'ask'});
  step('wait',AI.t('queue'));
  const er=P.querySelector('.aip-b .ai-err');if(er)er.hidden=true;
  btns(B('x','Annuler l\'envoi'));}
addEventListener('online',()=>{if(cur&&cur.queued)send();});
addEventListener('offline',()=>{if(NOXE.refreshHome&&q.value.trim())NOXE.refreshHome();});

function saveNote(){
  const c=cur;if(!c||!c.result)return;
  let body='**Question :** '+c.q+'\n\n'+c.result;
  if(c.extracts)body+='\n\nSources : '+c.extracts.map(x=>'[['+x.title+']]').join(' · ');
  addToNotebook(('Réponse IA — '+c.q).slice(0,80),body,['ia']);
  toast('Enregistré dans le carnet');
  if(NOXE.notesChanged)NOXE.notesChanged();
}

P.addEventListener('click',e=>{
  const a=e.target.closest('a[data-note]');
  if(a&&window.notePanel&&!e.ctrlKey&&!e.metaKey){e.preventDefault();notePanel.open(a.dataset.note);return;}
  const b=e.target.closest('[data-p]');if(!b)return;
  switch(b.dataset.p){
    case 'x':close();q.focus();return;
    case 'stop':if(cur&&cur.ctl)cur.ctl.abort();return;
    case 'send':{const s=P.querySelector('#aipSkip');if(s&&s.checked)AI.setPref('skipFree',true);send();return;}
    case 'copy':if(cur)copy(cur.result,'Réponse copiée');return;
    case 'note':saveNote();return;
    case 'cfg':close();AI.settings();return;
    case 'queue':queue();return;
    case 'sem':if(cur)ask('sem',cur.q);return;
    case 'asfree':if(cur)ask('free',cur.q);return;
  }
});
/* Échap ferme le panneau (avant que la barre ne s'efface) — sauf si une fenêtre (réglages, aide) est ouverte */
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||P.hidden)return;
  if(AI.isOpen()||(window.keysHelp&&keysHelp.isOpen())||document.querySelector('.ctx-ov,[aria-modal="true"]'))return;
  e.preventDefault();e.stopPropagation();close();q.focus();
},true);
/* taper autre chose annule une confirmation en attente (jamais une réponse déjà reçue) */
/* clé ajoutée / retirée entre-temps (réglages) : le Glyph au repos s'allume ou se tamise — seulement si ça change */
const resync=()=>{if(cur)return;const d=!(AI.hasKey()||AI.local());if(g.state()!=='idle'||(g.el.dataset.dim==='1')!==d)rest();};
/* v10 : vecteur de la question préparé pendant la frappe (local, sans réseau), 350 ms après la dernière touche */
let prepT=0;
q.addEventListener('input',()=>{if(cur&&(cur.phase==='confirm'||cur.phase==='offline'))close();resync();
  clearTimeout(prepT);if(!AI.local())return;const v=q.value;
  prepT=setTimeout(()=>{const qq=v.replace(/^\?\s*/,'').trim();if(isQuestion(v)&&qq.length>=3&&q.value===v)AI.prepare(qq);},350);});
q.addEventListener('focus',resync);
btn.addEventListener('click',()=>{
  if(!q.value.trim()){q.value='? ';q.focus();q.dispatchEvent(new Event('input',{bubbles:true}));return;}
  q.focus();NOXE.forceLead();
});
window.AIBAR={isQuestion,close,glyph:g,panelMark:g,state:()=>cur?cur.phase:'rest',open:()=>!P.hidden,ask,steps:()=>[...P.querySelectorAll('.aip-steps li')].map(x=>x.dataset.k+':'+x.className)};
})();
