/* conflict.js — v9 : régler une copie de conflit (tag « conflit ») en comparant les deux versions côte à côte.
   · La copie est créée par la synchro (notes.js, conflictCopy) : son id = ('c' + id d'origine)[0..48] + '-' + date,
     son titre dit de quel côté elle vient (« version de cet appareil » / « version de l'autre appareil »).
   · Différence ligne par ligne (plus longue sous-suite commune, LCS), lignes changées surlignées, en 2 colonnes
     alignées ; sur téléphone (< 800 px) : des onglets « La mienne » / « L'autre ».
   · Garder la mienne / Garder l'autre / Fusionner (éditeur avec des marqueurs <<<<<<< ======= >>>>>>>),
     puis la copie est supprimée proprement (pierre tombale : elle disparaît aussi sur les autres appareils). */
(function(){
const MINE='<<<<<<< la mienne',SEP='=======',OTHER=">>>>>>> l'autre";
/* ---------- différence ligne par ligne ---------- */
function diff(a,b){
  const A=String(a||'').replace(/\r/g,'').split('\n'),B=String(b||'').replace(/\r/g,'').split('\n');
  let s=0;while(s<A.length&&s<B.length&&A[s]===B[s])s++;                 // début commun
  let e=0;while(e<A.length-s&&e<B.length-s&&A[A.length-1-e]===B[B.length-1-e])e++;   // fin commune
  const a2=A.slice(s,A.length-e),b2=B.slice(s,B.length-e),n=a2.length,m=b2.length,ops=[];
  for(let i=0;i<s;i++)ops.push({t:'=',a:A[i],b:B[i]});
  if(n*m>4e6){a2.forEach(x=>ops.push({t:'-',a:x}));b2.forEach(x=>ops.push({t:'+',b:x}));}   // énorme : bloc entier
  else{
    const L=new Uint32Array((n+1)*(m+1)),W=m+1;                  // L[i][j] = LCS de a2[i..] et b2[j..]
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)L[i*W+j]=a2[i]===b2[j]?L[(i+1)*W+j+1]+1:Math.max(L[(i+1)*W+j],L[i*W+j+1]);
    let i=0,j=0;
    while(i<n&&j<m){if(a2[i]===b2[j]){ops.push({t:'=',a:a2[i],b:b2[j]});i++;j++;}
      else if(L[(i+1)*W+j]>=L[i*W+j+1])ops.push({t:'-',a:a2[i++]});else ops.push({t:'+',b:b2[j++]});}
    while(i<n)ops.push({t:'-',a:a2[i++]});while(j<m)ops.push({t:'+',b:b2[j++]});
  }
  for(let i=A.length-e;i<A.length;i++)ops.push({t:'=',a:A[i],b:B[i-A.length+B.length]});
  return ops;
}
/* lignes alignées pour 2 colonnes : un bloc « - » suivi d'un bloc « + » = lignes modifiées, face à face */
function rows(ops){
  const R=[];let k=0;
  while(k<ops.length){
    if(ops[k].t==='='){R.push({t:'=',a:ops[k].a,b:ops[k].b});k++;continue;}
    const del=[],add=[];
    while(k<ops.length&&ops[k].t!=='='){if(ops[k].t==='-')del.push(ops[k].a);else add.push(ops[k].b);k++;}
    for(let i=0;i<Math.max(del.length,add.length);i++)R.push({t:i<del.length&&i<add.length?'~':i<del.length?'-':'+',a:i<del.length?del[i]:null,b:i<add.length?add[i]:null});
  }
  return R;
}
/* texte de fusion : commun tel quel, chaque bloc différent entre marqueurs */
function mergeText(a,b){
  const ops=diff(a,b),out=[];let k=0;
  while(k<ops.length){
    if(ops[k].t==='='){out.push(ops[k].a);k++;continue;}
    const del=[],add=[];
    while(k<ops.length&&ops[k].t!=='='){if(ops[k].t==='-')del.push(ops[k].a);else add.push(ops[k].b);k++;}
    out.push(MINE,...del,SEP,...add,OTHER);
  }
  return out.join('\n');
}
const hasMarkers=t=>/^(<{7}|={7}|>{7})( |$)/m.test(t);
/* ---------- retrouver les deux côtés ---------- */
const isCopy=n=>!!n&&(n.tags||[]).includes('conflit');
const baseTitle=t=>String(t||'').replace(/ \(conflit — [^)]*\)$/,'');
function pair(copyId){
  const c=notesApi.get(copyId);if(!isCopy(c))return null;
  const k=copyId.lastIndexOf('-'),pre=k>0?copyId.slice(0,k):'';
  let o=null;
  if(pre[0]==='c'){o=notesApi.get(pre.slice(1));
    if(!o||isCopy(o))o=Object.values(notesApi.all()).find(n=>n.id!==copyId&&!isCopy(n)&&('c'+n.id).slice(0,48)===pre)||null;}
  if(!o){const t=baseTitle(c.title);o=Object.values(notesApi.all()).find(n=>n.id!==copyId&&!isCopy(n)&&n.title===t)||null;}
  const copyIsMine=/version de cet appareil|modifiée ici/.test(c.title);
  const copyIsOther=/version de l'autre appareil|modifiée sur l'autre/.test(c.title);
  return{copy:c,orig:o,copyIsMine:copyIsMine||!copyIsOther};   // inconnu : la copie = « la mienne » (gardée ici)
}
/* ---------- bandeau dans l'éditeur ---------- */
function check(n){
  const bar=$('cfBar');if(!bar)return;
  if(!isCopy(n)){bar.hidden=true;bar.innerHTML='';return;}
  const p=pair(n.id);bar.hidden=false;
  bar.innerHTML=p&&p.orig?'<span>⚠ Copie de conflit : deux versions de « '+esc(p.orig.title||'Sans titre')+' » ont été modifiées en même temps.</span>'+
    '<button type="button" class="ico-btn" id="cfOpen">Comparer et régler</button>':
    '<span>⚠ Copie de conflit : '+esc((/\(conflit — ([^)]*)\)$/.exec(n.title)||[,'gardée pour ne rien perdre'])[1])+'. La note d\'origine n\'existe plus.</span>'+
    '<button type="button" class="ico-btn" id="cfKeep">Garder cette note</button>';
  const o=$('cfOpen');if(o)o.onclick=()=>open(n.id);
  const kp=$('cfKeep');if(kp)kp.onclick=()=>{notesApi.update(n.id,x=>{x.title=baseTitle(x.title);x.tags=(x.tags||[]).filter(t=>t!=='conflit');});toast('Conflit réglé');};
}
/* ---------- la fenêtre de comparaison ---------- */
let ov=null,prevFocus=null;
function close(){if(!ov)return;ov.remove();ov=null;removeEventListener('keydown',onKey,true);if(prevFocus&&prevFocus.isConnected)prevFocus.focus({preventScroll:true});}
const onKey=e=>{if(e.key==='Escape'&&ov){e.preventDefault();e.stopImmediatePropagation();if(ov.querySelector('.cf-merge:not([hidden])'))showMerge(false);else close();}};
function sideOf(p){                                          // {mine:{title,body,tags}, other:{…}}
  const c={title:baseTitle(p.copy.title),body:p.copy.body||'',tags:(p.copy.tags||[]).filter(t=>t!=='conflit')};
  const o={title:p.orig.title,body:p.orig.body||'',tags:(p.orig.tags||[]).slice()};
  return p.copyIsMine?{mine:c,other:o}:{mine:o,other:c};
}
function cell(t,x,cls){return x==null?'<div class="cf-c cf-'+cls+' empty"></div>':'<div class="cf-c cf-'+cls+(t!=='='?' cf-'+(cls==='a'?'del':'add'):'')+'">'+(esc(x)||'&nbsp;')+'</div>';}
function open(copyId){
  const p=pair(copyId);if(!p||!p.orig){toast('Note d\'origine introuvable');return;}
  close();prevFocus=document.activeElement;
  const S=sideOf(p),R=rows(diff(S.mine.body,S.other.body)),nd=R.filter(r=>r.t!=='=').length;
  const titleDiff=S.mine.title!==S.other.title;
  ov=document.createElement('div');ov.className='ctx-ov';ov.id='cfDlg';
  ov.innerHTML='<div class="ctx-dlg cf-dlg" role="dialog" aria-modal="true" aria-labelledby="cfT">'+
    '<div class="ctx-dt" id="cfT">Conflit : « '+esc(S.other.title||'Sans titre')+' »</div>'+
    '<p class="ctx-msg">'+(nd?nd+' ligne(s) différente(s)':'Textes identiques')+(titleDiff?' · titres différents':'')+'. Choisis la version à garder, ou fusionne. La copie de conflit est ensuite supprimée (aussi sur tes autres appareils).</p>'+
    '<div class="cf-tabs" role="tablist"><button type="button" class="active" data-cf-tab="a" role="tab">La mienne</button><button type="button" data-cf-tab="b" role="tab">L\'autre</button></div>'+
    '<div class="cf-grid" data-show="a">'+
      '<div class="cf-hd cf-a">La mienne <small>(cet appareil)</small>'+(titleDiff?'<em>'+esc(S.mine.title)+'</em>':'')+'</div>'+
      '<div class="cf-hd cf-b">L\'autre <small>(autre appareil)</small>'+(titleDiff?'<em>'+esc(S.other.title)+'</em>':'')+'</div>'+
      R.map(r=>cell(r.t,r.a,'a')+cell(r.t,r.b,'b')).join('')+
    '</div>'+
    '<div class="cf-merge" hidden><label for="cfTxt">Fusion — garde ce que tu veux, enlève les marqueurs <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> <code>=======</code> <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code></label>'+
      '<textarea id="cfTxt" spellcheck="false"></textarea><div class="cf-warn" id="cfWarn" hidden></div></div>'+
    '<div class="ctx-db cf-acts">'+
      '<button type="button" class="tpl-b" data-cf="mine">Garder la mienne</button>'+
      '<button type="button" class="tpl-b" data-cf="other">Garder l\'autre</button>'+
      '<button type="button" class="tpl-b" data-cf="merge">Fusionner…</button>'+
      '<button type="button" class="tpl-b primary" data-cf="save" hidden>Enregistrer la fusion</button>'+
      '<button type="button" class="tpl-b" data-cf="close">Fermer</button></div></div>';
  document.body.appendChild(ov);addEventListener('keydown',onKey,true);
  const q=s=>ov.querySelector(s);
  ov.addEventListener('click',e=>{
    if(e.target===ov){close();return;}
    const tb=e.target.closest('[data-cf-tab]');
    if(tb){ov.querySelectorAll('[data-cf-tab]').forEach(x=>x.classList.toggle('active',x===tb));q('.cf-grid').dataset.show=tb.dataset.cfTab;return;}
    const b=e.target.closest('[data-cf]');if(!b)return;
    const a=b.dataset.cf;
    if(a==='close')close();
    else if(a==='mine')resolve(p,S.mine);
    else if(a==='other')resolve(p,S.other);
    else if(a==='merge')showMerge(true,S);
    else if(a==='save'){const t=q('#cfTxt').value;
      if(hasMarkers(t)&&!b.dataset.sure){const w=q('#cfWarn');w.hidden=false;w.textContent='Il reste des marqueurs de conflit. Clique encore sur « Enregistrer la fusion » pour enregistrer quand même.';b.dataset.sure='1';return;}
      resolve(p,{title:S.other.title===S.mine.title?S.mine.title:S.mine.title,body:t,tags:[...new Set(S.mine.tags.concat(S.other.tags))]});}
  });
  q('[data-cf="mine"]').focus({preventScroll:true});
}
function showMerge(on,S){
  if(!ov)return;const q=s=>ov.querySelector(s);
  q('.cf-merge').hidden=!on;q('.cf-grid').hidden=on;q('.cf-tabs').hidden=on;
  q('[data-cf="save"]').hidden=!on;['mine','other','merge'].forEach(k=>q('[data-cf="'+k+'"]').hidden=on);
  if(on){const t=q('#cfTxt');if(!t.value)t.value=mergeText(S.mine.body,S.other.body);t.focus();}
}
function resolve(p,v){
  notesApi.update(p.orig.id,n=>{n.title=v.title||n.title;n.body=v.body;n.tags=(v.tags||[]).filter(t=>t!=='conflit').slice(0,40);});
  notesApi.remove(p.copy.id);                                 // pierre tombale (data.deleted) → supprimée partout
  close();notesApi.open(p.orig.id);toast('Conflit réglé — copie supprimée');
}
window.CONFLICT={diff,rows,mergeText,hasMarkers,pair,check,open,close,resolve};
})();
