/* tools/carnet.js — NOTES : la note rapide (le carnet complet reste notes.html, le panneau Ctrl+J est dans panel.js) */
(function(){
const {register}=NOXE;
register({
  key:'carnet',cat:'notes',title:'Note rapide',input:'nq_b',
  words:'note carnet écrire idée todo mémo markdown brouillon noter',
  desc:'Écris une note en deux secondes : elle part dans le carnet. Ctrl+J ouvre le panneau des notes partout.',
  run(p){
    p.innerHTML=
      '<div class="field"><label>Titre (optionnel)</label><input type="text" id="nq_t" spellcheck="false" placeholder="Sans titre"></div>'+
      '<div class="field" style="margin-top:12px"><label>Note (Markdown)</label><textarea id="nq_b" style="min-height:160px" placeholder="- [ ] acheter du café&#10;Idée : …"></textarea></div>'+
      '<div class="field" style="margin-top:12px"><label>Tags (séparés par des virgules)</label><input type="text" id="nq_tags" spellcheck="false" placeholder="cours, à faire"></div>'+
      '<div class="btn-row"><button class="btn primary" id="nq_go" data-main>Ajouter au carnet</button><a class="btn ghost" href="notes.html">Ouvrir le carnet</a><button class="btn ghost" id="nq_pan">Panneau (Ctrl+J)</button></div>'+
      '<div class="info" id="nq_info">Le brouillon est gardé si tu quittes la page.</div>';
    $('nq_go').onclick=()=>{
      const b=$('nq_b').value.trim(),title=$('nq_t').value.trim()||b.split('\n')[0].replace(/^#+\s*/,'').slice(0,60)||'Sans titre';
      if(!b&&!$('nq_t').value.trim()){toast('Écris d\'abord quelque chose');return;}
      const tags=$('nq_tags').value.split(',').map(s=>s.trim()).filter(Boolean);
      const id=addToNotebook(title,b,tags);
      ['nq_t','nq_b'].forEach(i=>NOXE.fill(i,''));          // vide aussi le brouillon mémorisé
      $('nq_info').innerHTML='✓ Ajoutée : <a href="notes.html#'+encodeURIComponent(id)+'">'+esc(title)+'</a>';
      if(NOXE.notesChanged)NOXE.notesChanged();
      $('nq_b').focus();
    };
    $('nq_pan').onclick=()=>{if(window.notePanel)notePanel.open();};
  }
});
})();
