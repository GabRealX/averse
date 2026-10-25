/* ai-notes.js — v7 : l'IA dans le carnet (notes.html). Tout ici est LOCAL (embeddings, js/ai.js) sauf
   les actions du menu « IA ✦ » qui ouvrent la fenêtre d'envoi (rien ne part sans le bouton « Envoyer »).
   - « Notes liées » sous les rétroliens de la note ouverte (les plus proches par le sens) ;
   - « Par le sens » sous les résultats quand tu cherches (même sans mot en commun) ;
   - graphe : bouton « ≈ sens » = liens suggérés en pointillés (paires très proches). */
const AINOTES=(function(){
const on=()=>window.AI&&AI.local();
let relTok=0,semTok=0,semT=0;
function box(host,id,cls){let b=document.getElementById(id);if(!b){b=document.createElement('div');b.id=id;b.className=cls;host.insertAdjacentElement('afterend',b);}return b;}
async function related(n,host){
  const tok=++relTok,old=document.getElementById('aiRelated');
  if(!on()||!n){if(old)old.remove();return;}
  const b=box(host,'aiRelated','backlinks ai-rel');
  if(!b.dataset.id||b.dataset.id!==n.id)b.innerHTML='<div class="bl-head">Notes liées (par le sens)</div><div class="none">calcul local…</div>';
  b.dataset.id=n.id;
  /* v10 : plus de « 80 % » trompeur — seulement les notes NETTEMENT plus proches que le reste du carnet, avec un libellé */
  try{const r=await AI.related(n.id,4);if(tok!==relTok)return;
    const by=notesDebug.data.notes,list=r.filter(x=>by[x.id]);
    b.innerHTML='<div class="bl-head">Notes liées (par le sens)</div>'+(list.length?list.map(x=>'<a data-id="'+esc(x.id)+'" data-rel="'+(x.label==='très proche'?'2':'1')+'" title="'+esc(x.label)+(x.tags?' · tag en commun':'')+'">'+esc(by[x.id].title||'Sans titre')+
      ' <small class="rel-l">'+esc(x.label)+'</small></a>').join(''):'<div class="none">Aucune note vraiment proche.</div>');
  }catch(e){if(tok===relTok)b.innerHTML='<div class="bl-head">Notes liées (par le sens)</div><div class="none">indisponible : '+esc(e.message)+'</div>';}
}
function semantic(q,host,shown){
  const tok=++semTok;clearTimeout(semT);
  const old=document.getElementById('aiSem');if(old)old.remove();
  q=String(q||'').trim();if(!on()||q.length<3)return;
  semT=setTimeout(async()=>{
    try{const r=await AI.search(q,8);if(tok!==semTok)return;
      const by=notesDebug.data.notes,skip=new Set(shown),list=r.filter(x=>by[x.id]&&!skip.has(x.id)&&x.ok).slice(0,5);
      if(!list.length)return;
      const b=document.createElement('div');b.id='aiSem';b.className='ai-sem';
      b.innerHTML='<div class="ai-sem-h">≈ Par le sens</div>'+list.map(x=>'<div class="note-item" data-id="'+esc(x.id)+'"><h4>'+esc(by[x.id].title||'Sans titre')+'</h4><div class="meta"><span>'+esc(x.label)+'</span></div></div>').join('');
      host.appendChild(b);
    }catch(e){}
  },250);
}
/* graphe : paires nettement proches (au plus 2 par note) */
let semOn=false;
async function graphSem(){
  const G=notesDebug.G;if(!semOn||!on()){G.semIds=[];notesDebug.draw&&redrawSafe();return;}
  G.semIds=await AI.semPairs();redrawSafe();                  // v10 : calibré sur le carnet (voir ai.js)
}
function redrawSafe(){try{if(typeof redraw==='function')redraw();}catch(e){}}
function syncUi(){
  const b=document.getElementById('graphSem');if(b){b.hidden=!on();b.setAttribute('aria-pressed',String(semOn&&on()));}
}
document.addEventListener('click',e=>{
  if(e.target.closest('#graphSem')){semOn=!semOn;syncUi();graphSem();return;}
  if(e.target.closest('#aiBtn')){e.preventDefault();menu(e.target.closest('#aiBtn'));return;}
  const it=e.target.closest('#aiSem [data-id], #aiRelated [data-id]');
  if(it&&typeof openNote==='function'){e.preventDefault();openNote(it.dataset.id);}
});
function menu(btn){
  const d=notesDebug.data,n=d.notes[d.openId],r=btn.getBoundingClientRect();
  const o=n?{text:(n.title?'# '+n.title+'\n\n':'')+(n.body||''),title:n.title||'Sans titre'}:null;
  const items=[
    {label:'Résumer cette note',disabled:!o,run:()=>AI.run('summary',o)},
    {label:'Flashcards depuis cette note',disabled:!o,run:()=>AI.run('flashcards',o)},
    {label:'Reformuler / corriger cette note',disabled:!o,run:()=>AI.run('rewrite',Object.assign({},o,{text:n.body||'',useLabel:'Remplacer le texte de la note',onUse:t=>{
      const x=JSON.parse(JSON.stringify(d.notes[n.id]));x.body=t;x.updated=Date.now();NOTE_OPS.save(n.id,x);toast('Note mise à jour');}}))},
    {label:'Demander à mes notes…',run:()=>AI.run('ask',{})},
    '-',
    {label:'Réglages IA…',run:()=>AI.settings()}];
  CTX.open(r.left,r.bottom+4,items,'IA ✦');
}
if(window.AI){AI.onState(()=>{syncUi();});}
document.addEventListener('DOMContentLoaded',syncUi);syncUi();
return{related,semantic,graphSem,semOn:()=>semOn,setSem:v=>{semOn=!!v;syncUi();return graphSem();}};
})();
window.AINOTES=AINOTES;
document.addEventListener('DOMContentLoaded',()=>{if(window.AI&&AI.local()&&typeof renderEditor==='function')try{renderEditor();}catch(e){}});
