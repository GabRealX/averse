/* notes-tpl.js — v6 : l'interface des MODÈLES dans le carnet (les données : templates.js).
   - liste « Nouvelle note » : Note vide · modèles AVERSE · mes modèles · « Gérer mes modèles… »
   - bouton « Modèle » dans l'en-tête d'une note : enregistrer la note comme modèle
   - fenêtre de gestion : créer, modifier, supprimer, copier un modèle AVERSE ; éditeur avec les variables cliquables.
   Utilise notes.js (data, newNote, save, renderAll) : chargé APRÈS lui. */
(function(){
if(typeof TPL==='undefined')return;
const sel=$('tplSel');
/* la liste déroulante */
function tplRefresh(){
  if(!sel)return;
  const mine=TPL.list();
  sel.innerHTML='<option value="">Note vide</option><optgroup label="Modèles AVERSE">'+
    TPL.BUILTIN.map(b=>'<option value="'+esc(b.id)+'">Modèle : '+esc(b.name)+'</option>').join('')+'</optgroup>'+
    (mine.length?'<optgroup label="Mes modèles">'+mine.map(t=>'<option value="u:'+esc(t.id)+'">'+esc(t.name)+'</option>').join('')+'</optgroup>':'')+
    '<option value="__manage">Gérer mes modèles…</option>';
}
window.tplRefresh=tplRefresh;
tplRefresh();
if(sel)sel.addEventListener('change',()=>{if(sel.value==='__manage'){sel.value='';manage();}});
/* chaque modification part dans la synchro (fichier lié + Gist), comme une note */
TPL.onChange=()=>{tplRefresh();if(typeof fsLater==='function')fsLater();if(window.cloudLater)cloudLater();};
addEventListener('storage',e=>{if(e.key===TPL.KEY)tplRefresh();});

/* ---------- petite fenêtre (même style que les boîtes du clic droit) ---------- */
let ov=null,prev=null;
function box(html,onClick){
  closeBox();prev=document.activeElement;
  ov=document.createElement('div');ov.className='ctx-ov';ov.id='tplDlg';
  ov.innerHTML='<form class="ctx-dlg tpl-dlg" role="dialog" aria-modal="true" aria-labelledby="tplT">'+html+'</form>';
  document.body.appendChild(ov);
  const f=ov.firstChild;
  f.addEventListener('click',e=>{const b=e.target.closest('[data-t]');if(b){e.preventDefault();onClick(b.dataset.t,b,f);}});
  f.addEventListener('submit',e=>{e.preventDefault();onClick('submit',null,f);});
  ov.addEventListener('click',e=>{if(e.target===ov)closeBox();});
  addEventListener('keydown',key,true);
  const first=f.querySelector('input,textarea,button');if(first)first.focus();
  return f;
}
const key=e=>{if(e.key==='Escape'&&ov){e.preventDefault();e.stopImmediatePropagation();closeBox();}};
function closeBox(){if(!ov)return;ov.remove();ov=null;removeEventListener('keydown',key,true);if(prev&&prev.isConnected&&prev.focus)prev.focus({preventScroll:true});}

/* ---------- gérer ---------- */
function manage(){
  const mine=TPL.list();
  const row=(t,own)=>'<li><span class="tpl-n">'+esc(t.name)+'<small>'+esc(t.title||'(titre vide)')+(t.tags&&t.tags.length?' · #'+t.tags.map(esc).join(' #'):'')+'</small></span>'+
    '<span class="tpl-a"><button type="button" class="tpl-b" data-t="use:'+(own?'u:':'')+esc(t.id)+'">Utiliser</button>'+
    (own?'<button type="button" class="tpl-b" data-t="edit:'+esc(t.id)+'">Modifier</button><button type="button" class="tpl-b danger" data-t="del:'+esc(t.id)+'">Supprimer</button>'
        :'<button type="button" class="tpl-b" data-t="copy:'+esc(t.id)+'" title="Copier dans mes modèles pour le modifier">Copier</button>')+'</span></li>';
  box('<div class="ctx-dt" id="tplT">Mes modèles</div>'+
    (mine.length?'<ul class="tpl-list">'+mine.map(t=>row(t,true)).join('')+'</ul>':'<p class="ctx-msg">Aucun modèle à toi pour l\'instant. Crée-en un, ou ouvre une note et clique « Modèle » pour l\'enregistrer comme modèle.</p>')+
    '<div class="tpl-sub">Modèles AVERSE</div><ul class="tpl-list">'+TPL.BUILTIN.map(t=>row(t,false)).join('')+'</ul>'+
    '<div class="ctx-db"><button type="button" class="tpl-b" data-t="x">Fermer</button><button type="button" class="tpl-b primary" data-t="new">+ Nouveau modèle</button></div>',
  async(a)=>{
    const [k,id]=a.split(/:(.*)/);
    if(k==='x')closeBox();
    else if(k==='new')edit({name:'',title:'',tags:[],body:''});
    else if(k==='edit'){const t=TPL.get(id);if(t)edit(t);}
    else if(k==='copy'){const b=TPL.builtin(id);if(b)edit({name:b.name+' (à moi)',title:b.title,tags:b.tags,body:b.body});}
    else if(k==='use'){closeBox();newNote(null,id);}
    else if(k==='del'){const t=TPL.get(id);if(!t)return;closeBox();
      const ok=typeof confirmBox==='function'?await confirmBox('Supprimer le modèle « '+t.name+' » ? Les notes déjà créées ne changent pas.','Supprimer'):true;
      if(ok){TPL.remove(id);toast('Modèle supprimé');}manage();}
  });
}
/* ---------- éditeur ---------- */
function edit(t){
  const f=box('<div class="ctx-dt" id="tplT">'+(t.id?'Modifier le modèle':'Nouveau modèle')+'</div>'+
    '<label class="tpl-l" for="tplName">Nom du modèle</label><input id="tplName" maxlength="80" required value="'+esc(t.name)+'" placeholder="ex. Réunion d\'équipe">'+
    '<label class="tpl-l" for="tplTitle">Titre de la note</label><input id="tplTitle" maxlength="300" value="'+esc(t.title)+'" placeholder="ex. Réunion du {{date}}">'+
    '<label class="tpl-l" for="tplTags">Tags</label><input id="tplTags" value="'+esc((t.tags||[]).join(', '))+'" placeholder="séparés par des virgules">'+
    '<label class="tpl-l" for="tplBody">Contenu</label><textarea id="tplBody" rows="9" spellcheck="false">'+esc(t.body)+'</textarea>'+
    '<div class="tpl-vars">Variables (clic = insérer) : '+TPL.VARS.map(([v,d])=>'<button type="button" class="tpl-v" data-t="var:'+esc(v)+'" title="'+esc(d)+'">'+esc(v)+'</button>').join('')+'</div>'+
    '<p class="tpl-prev" id="tplPrev" aria-live="polite"></p>'+
    '<div class="ctx-db"><button type="button" class="tpl-b" data-t="back">Annuler</button><button type="submit" class="tpl-b primary">Enregistrer</button></div>',
  (a,b,f)=>{
    if(a==='back'){manage();return;}
    if(a.startsWith('var:')){const v=a.slice(4),el=f._last||f.querySelector('#tplBody');
      const s=el.selectionStart??el.value.length,e=el.selectionEnd??s;el.value=el.value.slice(0,s)+v+el.value.slice(e);
      el.focus();el.setSelectionRange(s+v.length,s+v.length);upd();return;}
    if(a==='submit'){
      const name=f.querySelector('#tplName').value.trim();if(!name){f.querySelector('#tplName').focus();return;}
      const r=TPL.save({id:t.id,name,title:f.querySelector('#tplTitle').value,body:f.querySelector('#tplBody').value,
        tags:f.querySelector('#tplTags').value.split(',').map(x=>x.trim()).filter(Boolean)});
      if(r){toast('Modèle « '+r.name+' » enregistré');manage();}
    }
  });
  const upd=()=>{const x=TPL.expand({title:f.querySelector('#tplTitle').value,body:''});f.querySelector('#tplPrev').textContent='Aperçu du titre : '+x.title;};
  ['#tplTitle','#tplBody'].forEach(s=>{const el=f.querySelector(s);el.addEventListener('focus',()=>{f._last=el;});el.addEventListener('input',upd);});
  upd();
}
/* « Modèle » dans l'en-tête : la note ouverte devient un modèle */
function fromNote(){
  const n=data.notes[data.openId];if(!n)return;
  edit({name:(n.title||'Mon modèle').slice(0,80),title:n.title||'',tags:(n.tags||[]).slice(),body:n.body||''});
}
const btn=$('tplSaveBtn');if(btn)btn.addEventListener('click',fromNote);
window.notesTpl={manage,edit,fromNote,refresh:tplRefresh,close:closeBox};
})();
