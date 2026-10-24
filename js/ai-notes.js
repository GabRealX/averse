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
  try{const r=await AI.similarTo(n.id,5);if(tok!==relTok)return;
    const by=notesDebug.data.notes,list=r.filter(x=>by[x.id]&&x.s>.25);
    b.innerHTML='<div class="bl-head">Notes liées (par le sens)</div>'+(list.length?list.map(x=>'<a data-id="'+esc(x.id)+'" title="similarité '+x.s.toFixed(2)+'">'+esc(by[x.id].title||'Sans titre')+
      ' <small>'+Math.round(x.s*100)+' %</small></a>').join(''):'<div class="none">Rien de proche pour l\'instant.</div>');
  }catch(e){if(tok===relTok)b.innerHTML='<div class="bl-head">Notes liées (par le sens)</div><div class="none">indisponible : '+esc(e.message)+'</div>';}
}
function semantic(q,host,shown){
  const tok=++semTok;clearTimeout(semT);
  const old=document.getElementById('aiSem');if(old)old.remove();
  q=String(q||'').trim();if(!on()||q.length<3)return;
  semT=setTimeout(async()=>{
    try{const r=await AI.search(q,8);if(tok!==semTok)return;
      const by=notesDebug.data.notes,skip=new Set(shown),list=r.filter(x=>by[x.id]&&!skip.has(x.id)&&x.s>.2).slice(0,5);
      if(!list.length)return;
      const b=document.createElement('div');b.id='aiSem';b.className='ai-sem';
      b.innerHTML='<div class="ai-sem-h">≈ Par le sens</div>'+list.map(x=>'<div class="note-item" data-id="'+esc(x.id)+'"><h4>'+esc(by[x.id].title||'Sans titre')+'</h4><div class="meta"><span>'+Math.round(x.s*100)+' % proche</span></div></div>').join('');
      host.appendChild(b);
    }catch(e){}
  },250);
}
/* graphe : paires proches (au plus 2 par note, similarité > 0,5) */
let semOn=false;
async function graphSem(){
  const G=notesDebug.G;if(!semOn||!on()){G.semIds=[];notesDebug.draw&&redrawSafe();return;}
  const V=await AI.indexNotes(),ids=[...V.keys()],pairs=[],seen=new Set();
  ids.forEach(a=>{const va=V.get(a).v;ids.filter(b=>b!==a).map(b=>[b,dotp(va,V.get(b).v)]).sort((x,y)=>y[1]-x[1]).slice(0,2)
    .forEach(([b,s])=>{const k=a<b?a+'|'+b:b+'|'+a;if(s>.5&&!seen.has(k)){seen.add(k);pairs.push([a,b,s]);}});});
  G.semIds=pairs;redrawSafe();
}
const dotp=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s;};
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
