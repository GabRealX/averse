/* notes-att.js — v9 : les pièces jointes dans l'éditeur du carnet (le stockage et la synchro : attach.js).
   Bouton « + Joindre », glisser-déposer sur l'éditeur, coller une image (Ctrl+V) : l'image est jointe ET appelée
   dans le texte (![nom](att:ID)) pour l'aperçu ; un PDF est seulement joint (Ouvrir / Télécharger). */
(function(){
if(typeof ATT==='undefined'||typeof notesApi==='undefined')return;
const box=$('attBox');if(!box)return;
const inp=document.createElement('input');inp.type='file';inp.multiple=true;inp.accept='image/png,image/jpeg,image/webp,image/gif,application/pdf';inp.hidden=true;inp.id='attFile';
document.body.appendChild(inp);
const isImg=t=>/^image\//.test(t);
const isDraw=t=>t===ATT.DRAWT;                               // v10 : dessin (draw.js)
async function render(){
  const id=notesApi.current(),l=id?ATT.list(id):[],u=ATT.used();
  const have=await ATT.haveIds();
  if(id!==notesApi.current())return;                          // une autre note ouverte entre-temps
  box.innerHTML='<div class="att-h"><b>Pièces jointes</b><span class="att-n">'+(l.length?l.length+' · ':'')+'total '+ATT.mo(u.bytes)+' / 50 Mo</span>'+
    (window.DRAW?'<button type="button" class="ico-btn" id="drawAdd" title="Dessiner à main levée (doigt, stylet, souris) — le dessin est joint à la note">✎ Dessin</button>':'')+
    '<button type="button" class="ico-btn" id="attAdd" title="Joindre une image ou un PDF (5 Mo max) — ou glisse-dépose / colle sur la note">+ Joindre</button>'+
    '<label class="att-c" title="Les photos (JPG/PNG de plus de 200 Ko) sont recompressées en WebP si c\'est plus léger"><input type="checkbox" id="attWebp"'+(ATT.pref()?' checked':'')+'> compresser les photos (WebP)</label></div>'+
    (l.length?'<ul class="att-l">'+l.map(x=>'<li class="att-it" data-att-id="'+esc(x.id)+'">'+
      (isImg(x.type)||isDraw(x.type)?'<img class="att-th'+(isDraw(x.type)?' draw':'')+'" alt="" data-thumb="'+esc(x.id)+'">':'<span class="att-th pdf" aria-hidden="true">PDF</span>')+
      '<span class="att-nm" title="'+esc(x.name)+'">'+esc(x.name)+'<small>'+ATT.mo(x.size)+(have.has(x.id)?'':' · pas encore reçue ici')+'</small></span>'+
      (isImg(x.type)||isDraw(x.type)?'<button type="button" class="ico-btn" data-att-act="ins" title="Insérer dans le texte">Insérer</button>':'')+
      (isDraw(x.type)?'<button type="button" class="ico-btn" data-att-act="edit">Modifier</button><button type="button" class="ico-btn" data-att-act="png" title="Exporter le dessin en image PNG">PNG</button>':
      '<button type="button" class="ico-btn" data-att-act="open">Ouvrir</button>')+'<button type="button" class="ico-btn" data-att-act="dl">Télécharger</button>'+
      '<button type="button" class="ico-btn danger" data-att-act="rm" aria-label="Supprimer la pièce jointe '+esc(x.name)+'">Supprimer</button></li>').join('')+'</ul>':
      '<div class="att-e">Glisse-dépose une image ou un PDF ici, colle une capture (Ctrl+V), ou « + Joindre ».</div>')+
    '<div class="att-s">Synchro : chiffrées avec tes notes. Les liens de partage n\'incluent pas les pièces jointes.</div>';
  box.querySelectorAll('img[data-thumb]').forEach(async im=>{const id=im.dataset.thumb,m=ATT.get(id);
    if(m&&isDraw(m.type)){const d=await DRAW.load(id);if(d){im.src=DRAW.svgUrl(d);im.onload=()=>URL.revokeObjectURL(im.src);}return;}
    const u=await ATT.url(id);if(u)im.src=u;});
}
async function addFiles(files,o){
  const id=notesApi.current();if(!id){toast('Ouvre d\'abord une note');return [];}
  const out=[];
  for(const f of files){
    try{const m=await ATT.add(id,f);out.push(m);
      if(isImg(m.type)&&(!o||o.insert!==false))notesApi.insert('!['+m.name.replace(/[\[\]()]/g,'')+'](att:'+m.id+')');}
    catch(e){toast(e instanceof ATT.AttError?e.message:'Pièce jointe impossible : '+(e&&e.message||e));}
  }
  if(out.length)toast(out.length>1?out.length+' pièces jointes ajoutées':'Pièce jointe ajoutée : '+out[0].name);
  render();return out;
}
box.addEventListener('click',async e=>{
  if(e.target.closest('#attAdd')){inp.click();return;}
  if(e.target.closest('#drawAdd')){DRAW.newIn();return;}
  const b=e.target.closest('[data-att-act]');if(!b)return;
  const id=b.closest('[data-att-id]').dataset.attId,m=ATT.get(id);if(!m)return;
  switch(b.dataset.attAct){
    case 'ins':notesApi.insert('!['+m.name.replace(/[\[\]()]/g,'')+'](att:'+id+')');return;
    case 'open':ATT.open(id);return;
    case 'edit':DRAW.edit(id);return;
    case 'png':{const d=await DRAW.load(id);if(!d){toast('Dessin pas encore reçu sur cet appareil');return;}
      const bl=await DRAW.png(d),u=URL.createObjectURL(bl),a=document.createElement('a');a.href=u;a.download=m.name.replace(/\.json$/,'')+'.png';
      document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);return;}
    case 'dl':ATT.download(id);return;
    case 'rm':{const ok=typeof confirmBox==='function'?await confirmBox('Supprimer la pièce jointe « '+m.name+' » ? Elle disparaît aussi de tes autres appareils.','Supprimer'):true;
      if(!ok)return;await ATT.remove(id);toast('Pièce jointe supprimée');}}
});
box.addEventListener('change',e=>{if(e.target.id==='attWebp')ATT.setPref(e.target.checked);});
inp.addEventListener('change',()=>{const f=[...inp.files];inp.value='';if(f.length)addFiles(f);});
/* glisser-déposer sur l'éditeur */
const ed=document.querySelector('#main .editor');
if(ed){
  ed.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){e.preventDefault();ed.classList.add('att-drop');}});
  ed.addEventListener('dragleave',e=>{if(!ed.contains(e.relatedTarget))ed.classList.remove('att-drop');});
  ed.addEventListener('drop',e=>{ed.classList.remove('att-drop');const f=e.dataTransfer&&[...e.dataTransfer.files];if(!f||!f.length)return;e.preventDefault();addFiles(f);});
}
/* coller une image dans le texte */
const body=$('bodyIn');
if(body)body.addEventListener('paste',e=>{const f=e.clipboardData&&[...e.clipboardData.files].filter(x=>ATT.TYPES[x.type]);if(!f||!f.length)return;e.preventDefault();addFiles(f);});
ATT.on(why=>{render();                                       // reçue d'un autre appareil / supprimée → l'aperçu se met à jour
  if(why==='merge'||why==='remove'||why==='import'){const n=notesApi.get(notesApi.current());if(n&&/\(att:/.test(n.body||''))notesApi.preview();}});
/* v10 : toucher un dessin dans l'aperçu le rouvre */
const prev=$('preview');
if(prev&&window.DRAW){const go=e=>{const im=e.target.closest&&e.target.closest('img.att-draw[data-att]');if(!im)return;
    if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();DRAW.edit(im.dataset.att);};
  prev.addEventListener('click',go);prev.addEventListener('keydown',go);}
window.notesAtt={render,addFiles};
render();
})();
