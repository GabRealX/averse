/* ai-bar.js — v8 : l'IA directement dans la barre de recherche de l'accueil.
   - Quand le texte ressemble à une question (« comment… », « … ? », 5 mots ou plus), ou si tu le demandes
     (préfixe « ? », touche Tab, bouton Glyph à droite de la barre), des options « IA » s'affichent EN TÊTE des résultats :
       Demander à l'IA (question libre) · Demander à mes notes (RAG) · Chercher par le sens (local, si activé).
     Elles ne prennent la sélection que si tu les forces : Entrée ouvre toujours le premier outil / la première note sinon.
   - AUCUNE requête au fil de la frappe : seul Entrée / clic sur une option, puis « Envoyer », passe par AI.fire().
     Question libre : petite confirmation (désactivable : « ne plus demander »). Extraits de notes : confirmation TOUJOURS.
   - Pas de clé : l'option mène aux réglages IA. La recherche par le sens (100 % locale) reste disponible si activée.
   - Le Glyph de la barre : discret au repos (statique, atténué si rien n'est configuré), puis search / think / write /
     error / done selon l'étape. Réponse dans un panneau sous la barre (Markdown nettoyé par md.js), Échap le ferme. */
(function(){
if(typeof AI==='undefined'||typeof GLYPH==='undefined'||typeof NOXE==='undefined')return;
const q=$('q'),P=$('aiPanel'),btn=$('qAi');if(!q||!P||!btn)return;

/* ---------- est-ce une question ? (simple et prudent) ---------- */
const QW=/^(?:comment|pourquoi|quel(?:le)?s?|qu['’]est|que|quoi|combien|où|quand|qui|est-ce|explique|expliquer|résume|resume|traduis|traduire|écris|ecris|donne|peux-tu|peut-on|dois-je|faut-il|c['’]est|how|what|why|which|when|where|who|can|could|should|is|are|does|do|explain|write|tell|translate)(?=[\s'’?,]|$)/i;
const isQuestion=v=>{v=String(v||'').trim();if(!v)return false;
  return /^\?/.test(v)||/\?$/.test(v)||QW.test(v)||v.split(/\s+/).length>=5;};
const cut=s=>s.length>60?s.slice(0,59)+'…':s;

/* ---------- le Glyph de la barre ---------- */
/* v9 : plus grand (46 px, 15 × 15 points ; 38 px sur mobile) + un 2e Glyph, plus grand, dans le panneau de réponse, qui suit le même état */
const small=matchMedia('(max-width:560px)').matches;
const g=GLYPH.create({size:small?38:46,kind:'ask',dim:true});btn.appendChild(g.el);btn.hidden=false;
const gp=GLYPH.create({size:small?48:64,kind:'ask'});gp.el.classList.add('aip-gl');
{const s0=g.set,t0=g.token;g.set=(s,o)=>{gp.set(s,o);return s0(s,o);};g.token=n=>{gp.token(n);return t0(n);};}
let cur=null;                                     // la demande en cours : {mode, q, phase, ctl, result, extracts}
function rest(){if(cur&&cur.phase==='busy')return;g.set('idle',{dim:!(AI.hasKey()||AI.local()),kind:'ask'});}
rest();
AI.ready.then(()=>{rest();if(q.value.trim()&&NOXE.refreshHome)NOXE.refreshHome();});
AI.onState(()=>{if(!cur)rest();});

/* ---------- les options en tête des résultats (appelées par app.js) ---------- */
NOXE.searchLead=(v,forced)=>{
  const raw=String(v||'').trim(),pre=/^\?/.test(raw),qq=raw.replace(/^\?\s*/,'').trim();
  if(pre&&!qq)return[{type:'ai',act:'hint',title:'Écris ta question après le « ? » (Entrée pour la poser)',hint:'IA',run:()=>q.focus()},
    {type:'ai',act:'keys',title:'Afficher les raccourcis clavier',hint:'Aide',run:()=>{if(window.keysHelp)keysHelp.open();}}];
  if(!qq||(!forced&&!pre&&!isQuestion(raw)))return[];
  const out=[],P0=AI.provider();
  if(AI.hasKey())out.push(
    {type:'ai',act:'free',title:'Demander à l\'IA : « '+cut(qq)+' »',hint:'Question libre · '+P0.short,run:()=>ask('free',qq)},
    {type:'ai',act:'notes',title:'Demander à mes notes : « '+cut(qq)+' »',hint:'Extraits → '+P0.short,run:()=>ask('notes',qq)});
  else out.push({type:'ai',act:'setup',title:'Demander à l\'IA : ajoute d\'abord ta clé d\'API…',hint:'Réglages IA',run:()=>{close();AI.settings();}});
  if(AI.local())out.push({type:'ai',act:'sem',title:'Chercher par le sens dans mes notes : « '+cut(qq)+' »',hint:'Local',run:()=>ask('sem',qq)});
  return out;
};
NOXE.isQuestion=isQuestion;

/* ---------- le panneau sous la barre ---------- */
const B=(act,label,cls)=>'<button type="button" class="btn '+(cls||'ghost')+'" data-p="'+act+'">'+esc(label)+'</button>';
function show(title,sub,body,btns){
  P.innerHTML='<div class="aip-h"><span class="aip-glw"></span><b>'+esc(title)+'</b><span class="aip-sub">'+esc(sub)+'</span>'+
    '<button type="button" class="aip-x" data-p="x" aria-label="Fermer (Échap)" title="Fermer (Échap)">✕</button></div>'+
    '<div class="aip-b">'+body+'</div><div class="aip-a">'+btns+'</div>';
  P.querySelector('.aip-glw').appendChild(gp.el);gp.frame(0);
  P.hidden=false;
}
const btns=h=>{const a=P.querySelector('.aip-a');if(a)a.innerHTML=h;};
function close(){
  if(cur&&cur.ctl)cur.ctl.abort();
  cur=null;P.hidden=true;P.innerHTML='';rest();
}
function warnHtml(kind,len){const p=AI.provider();
  return'<div class="ai-warn">⚠ '+(kind==='notes'?'Ta question <b>et les extraits ci-dessus</b>':'Ta question')+' ('+len+' caractères) <b>part chez '+esc(p.name)+'</b> ('+esc(AI.host())+', modèle '+esc(AI.model())+
    ') avec ta clé. AVERSE n\'envoie rien d\'autre, nulle part. Évite les données sensibles.'+
    '<details><summary>Voir exactement ce qui sera envoyé</summary><pre class="ai-pre"></pre></details></div>';}

async function ask(mode,qq){
  close();
  const c=cur={mode,q:qq,phase:'confirm',ctl:null,result:'',extracts:null};
  const p=AI.provider();
  if(mode==='free'){
    if(!AI.hasKey()){close();AI.settings();return;}
    if(AI.cfg().skipFree){send();return;}                         // tu as choisi « ne plus demander » (questions libres seulement)
    show('IA · Question libre',p.name,warnHtml('free',qq.length)+
      '<label class="ai-chk"><input type="checkbox" id="aipSkip"> Ne plus demander pour les questions libres <small>(jamais pour tes notes)</small></label>',
      B('x','Annuler')+B('send','Envoyer à '+p.short,'primary'));
    P.querySelector('.ai-pre').textContent=qq;
    P.querySelector('[data-p="send"]').focus();return;
  }
  /* notes / sens : d'abord une recherche 100 % locale */
  c.phase='busy';g.set('search',{kind:mode==='sem'?'embed':'ask'});
  show(mode==='sem'?'Recherche par le sens':'IA · Demander à mes notes',mode==='sem'?'100 % locale':p.name,
    '<p class="aip-note">Recherche dans tes notes, sur ton appareil… Rien n\'est envoyé à cette étape.</p>',B('x','Annuler'));
  try{
    if(mode==='sem'){
      const r=await AI.search(qq,6);if(cur!==c)return;
      const by=notesById(),list=r.filter(x=>by[x.id]).slice(0,6);
      c.phase='answer';g.set(list.length?'done':'error',{kind:'embed'});
      show('Recherche par le sens','100 % locale',list.length?'<ol class="ai-ex aip-sem">'+list.map(x=>'<li><a href="notes.html#'+encodeURIComponent(x.id)+'" data-note="'+esc(x.id)+'">'+esc(by[x.id].title||'Sans titre')+'</a> <small>'+Math.round(x.s*100)+' %</small></li>').join('')+'</ol>'
        :'<p class="aip-note">Aucune note trouvée.</p>',B('x','Fermer'));
      return;
    }
    const ex=await AI.retrieve(qq);if(cur!==c)return;
    if(!ex.length){c.phase='error';g.set('error');show('IA · Demander à mes notes',p.name,'<p class="ai-err">Aucune note ne semble parler de ça. Rien n\'a été envoyé.</p>',B('x','Fermer'));return;}
    c.extracts=ex;c.phase='confirm';g.set('idle',{kind:'ask'});
    const txt=AI.askPayload(qq,ex);
    show('IA · Demander à mes notes',p.name,'<div class="ai-l">Extraits retenus (seuls eux seront envoyés)</div><ol class="ai-ex">'+
      ex.map(x=>'<li><b>'+esc(x.title)+'</b> — '+esc(x.t.slice(0,140))+(x.t.length>140?'…':'')+'</li>').join('')+'</ol>'+warnHtml('notes',txt.length),
      B('x','Annuler')+B('send','Envoyer à '+p.short,'primary'));
    P.querySelector('.ai-pre').textContent=txt;
    P.querySelector('[data-p="send"]').focus();
  }catch(e){if(cur!==c)return;c.phase='error';g.set('error');
    show('IA','',  '<p class="ai-err">Recherche locale impossible : '+esc(e.message)+'</p>',B('x','Fermer')+B('cfg','Réglages IA…'));}
}
const notesById=()=>{const d=getLS('noxe-notes',null);return d&&d.notes||{};};

/* l'envoi : UNIQUEMENT depuis « Envoyer » (clic / Entrée sur le bouton) ou Entrée sur l'option si « ne plus demander » */
async function send(){
  const c=cur;if(!c)return;
  const task=c.mode==='notes'?'ask':'free',txt=c.mode==='notes'?AI.askPayload(c.q,c.extracts):c.q,p=AI.provider();
  c.phase='busy';c.result='';c.ctl=new AbortController();
  show(c.mode==='notes'?'IA · Demander à mes notes':'IA · Question libre',p.name+' · '+AI.host(),
    '<p class="aip-q">'+esc(c.q)+'</p><div class="ai-out aip-out" aria-live="polite"></div><p class="ai-err" hidden></p>',B('stop','Arrêter'));
  const out=P.querySelector('.aip-out');
  g.set('think',{kind:'ask'});let tm=0;
  try{
    await AI.fire(task,txt,(ch,all)=>{if(cur!==c||c.ctl.signal.aborted)return;c.result=all;g.token(ch.length);
      if(!tm)tm=setTimeout(()=>{tm=0;if(cur===c){out.innerHTML=AI.md(c.result);out.scrollTop=out.scrollHeight;}},70);},c.ctl.signal);
    clearTimeout(tm);if(cur!==c)return;
    out.innerHTML=AI.md(c.result||'(réponse vide)');
    if(c.extracts)out.insertAdjacentHTML('beforeend','<div class="ai-src">'+c.extracts.map((x,i)=>'<a href="notes.html#'+encodeURIComponent(x.id)+'" data-note="'+esc(x.id)+'">['+(i+1)+'] '+esc(x.title)+'</a>').join(' ')+'</div>');
    c.phase='answer';c.ctl=null;g.set('done');
    btns(B('copy','Copier')+B('note','Enregistrer en note')+B('x','Fermer','primary'));
  }catch(e){clearTimeout(tm);if(cur!==c)return;
    c.phase='error';c.ctl=null;g.set('error');
    const er=P.querySelector('.aip-b .ai-err');er.hidden=false;er.textContent=e.name==='AbortError'?'Arrêté.':'Échec : '+e.message;
    if(c.result)out.innerHTML=AI.md(c.result);
    btns((c.result?B('copy','Copier'):'')+B('cfg','Réglages IA…')+B('x','Fermer','primary'));
  }
}
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
q.addEventListener('input',()=>{if(cur&&cur.phase==='confirm')close();resync();});
q.addEventListener('focus',resync);
btn.addEventListener('click',()=>{
  if(!q.value.trim()){q.value='? ';q.focus();q.dispatchEvent(new Event('input',{bubbles:true}));return;}
  q.focus();NOXE.forceLead();
});
window.AIBAR={isQuestion,close,glyph:g,panelGlyph:gp,state:()=>cur?cur.phase:'rest',open:()=>!P.hidden,ask};
})();
