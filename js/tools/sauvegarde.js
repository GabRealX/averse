/* tools/sauvegarde.js — NOTES : exporter / importer TOUT AVERSE en un fichier (la logique est dans backup.js) */
(function(){
const {register}=NOXE;
register({
  key:'sauvegarde',cat:'notes',title:'Sauvegarde complète',mem:false,
  words:'sauvegarde backup export import restaurer exporter importer tout transférer appareil json',
  desc:'Un seul fichier JSON avec tes notes, favoris, récents, champs mémorisés et réglages. Les secrets n\'y vont jamais.',
  run(p){
    const sum=()=>{
      const {data,skipped}=BACKUP.build(),n=Object.keys(data.notes).length,f=Object.values(data.fields).reduce((a,m)=>a+Object.keys(m).length,0);
      return'<b>'+n+'</b> note'+(n>1?'s':'')+' · <b>'+data.fav.length+'</b> favori'+(data.fav.length>1?'s':'')+' · <b>'+data.recent.length+'</b> récent'+(data.recent.length>1?'s':'')+
        ' · <b>'+f+'</b> champ'+(f>1?'s':'')+' mémorisé'+(f>1?'s':'')+' · style '+esc(data.settings.style)+', pluie '+esc(data.settings.rain)+
        (skipped?'<br><span style="color:var(--fg-soft)">'+skipped+' valeur'+(skipped>1?'s':'')+' secrète'+(skipped>1?'s':'')+' exclue'+(skipped>1?'s':'')+' (JWT, mots de passe, clés)</span>':'');
    };
    p.innerHTML=
      '<div class="lbl">Ce qui part dans le fichier</div><div class="info" id="sv_sum">'+sum()+'</div>'+
      '<div class="btn-row"><button class="btn primary" id="sv_out" data-main>Exporter la sauvegarde</button>'+
      '<label class="btn ghost" for="sv_file">Importer un fichier…</label><input type="file" id="sv_file" accept=".json,application/json" hidden></div>'+
      '<div class="info" id="sv_res">L\'import <b>fusionne</b> : la note la plus récente gagne, les favoris s\'ajoutent. Chaque entrée est vérifiée ; ce qui est suspect est refusé. Un export du carnet (notes.html) marche aussi.</div>';
    $('sv_out').onclick=()=>{BACKUP.download();};
    const imp=async f=>{
      const r=await BACKUP.importFile(f);
      if(!$('sv_res'))return;
      $('sv_res').innerHTML=r.ok?'✓ <b>'+r.notes+'</b> note(s) fusionnée(s)'+(r.full?', <b>'+r.fav+'</b> favori(s), <b>'+r.fields+'</b> champ(s)':'')+
        (r.rejected?' · <span class="bad">'+r.rejected+' entrée(s) refusée(s)</span>':''):'<span class="bad">'+esc(r.error)+'</span>';
      $('sv_sum').innerHTML=sum();
    };
    $('sv_file').onchange=e=>{const f=e.target.files[0];e.target.value='';if(f)imp(f);};
    NOXE.onFiles(files=>{const f=files.find(x=>/json/.test(x.type)||/\.json$/i.test(x.name));if(f)imp(f);});
  }
});
})();
