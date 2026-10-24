/* tools/ocr.js — OCR : lire le texte d'une image (photo de document, capture d'écran…), 100 % sur l'appareil.
   Moteur : Tesseract.js, copié dans js/vendor/tesseract/ (rien n'est envoyé sur Internet).
   - chargé SEULEMENT quand on ouvre cet outil (≈ 4 à 8 Mo selon les langues : inutile de le faire payer à tout le monde) ;
   - le service worker le garde dans un cache à part (« averse-ocr-1 ») dès la première utilisation → ensuite hors-ligne ;
   - le moteur tourne dans un Worker : la page reste fluide pendant la lecture. */
(function(){
const {register,seg}=NOXE;
const DIR='js/vendor/tesseract/';
const abs=p=>new URL(DIR+p,location.href).href;             // adresses complètes : marche aussi sous /averse/ (GitHub Pages)
const LANGS=[['fra','Français'],['eng','Anglais'],['fra+eng','Les deux']];
const SIZE={fra:707406,eng:2952873};                         // taille des modèles de langue (fichiers .gz)
const CORE=3.9e6+174268;                                     // moteur wasm (une variante) + scripts
let worker=null,wLang='',busy=null;

/* le moteur pour cette langue (on le garde tant que l'outil reste ouvert) */
async function engine(lang,log){
  if(worker&&wLang===lang)return worker;
  if(worker){const w=worker;worker=null;wLang='';await w.terminate().catch(()=>{});}
  await NOXE.lib(DIR+'tesseract.min.js');
  worker=await Tesseract.createWorker(lang.split('+'),1,{    // 1 = LSTM seulement (le moteur moderne, le seul qu'on fournit)
    workerPath:abs('worker.min.js'),
    corePath:abs('core/'),                                   // dossier : le worker choisit la variante (simd ou non) adaptée
    langPath:abs('lang'),gzip:true,
    cacheMethod:'none',                                      // pas de 2e copie dans IndexedDB : le cache du SW suffit
    workerBlobURL:false,                                     // vrai fichier → ses téléchargements passent par le SW (hors-ligne)
    logger:log
  });
  wLang=lang;
  return worker;
}
function stop(){if(worker){worker.terminate().catch(()=>{});worker=null;wLang='';}}
/* déjà disponible hors-ligne ? (le moteur + les modèles de cette langue sont dans le cache) */
async function offline(lang){
  if(!('caches' in window))return false;
  try{
    const c=await caches.open('averse-ocr-1'),keys=(await c.keys()).map(r=>r.url);
    return keys.some(u=>/\/core\/tesseract-core-.*\.wasm\.js$/.test(u))&&lang.split('+').every(l=>keys.some(u=>u.endsWith('/lang/'+l+'.traineddata.gz')));
  }catch(e){return false;}
}
const mo=n=>(n/1e6).toFixed(1).replace('.',',')+' Mo';
const STEP={'loading tesseract core':'chargement du moteur','initializing tesseract':'démarrage du moteur','loading language traineddata':'chargement de la langue',
  'initializing api':'préparation','recognizing text':'lecture du texte'};

register({
  key:'ocr',cat:'fichiers',title:'Texte d\'une image (OCR)',image:true,
  words:'ocr texte image scanner reconnaître lire photo document capture extraire copier tesseract',
  desc:'Lit le texte d\'une photo, d\'un scan ou d\'une capture d\'écran (français, anglais). Tout se passe sur ton appareil.',
  hint:'PNG · JPG · WEBP — glisse, colle (Ctrl+V) ou clic droit sur une image → Envoyer vers… → OCR',
  run(p,img,file){
    let lang=localStorage.getItem('averse-ocr-lang')||'fra';if(!LANGS.some(l=>l[0]===lang))lang='fra';
    p.innerHTML=
      '<div class="row" style="gap:16px;align-items:flex-start;flex-wrap:wrap">'+
        '<img id="ocr_img" alt="image à lire" style="max-width:min(320px,100%);max-height:260px;border:1px solid var(--line-2);object-fit:contain">'+
        '<div style="flex:1;min-width:220px">'+
          '<div class="lbl">Langue du texte</div>'+
          '<div class="segmented" id="ocr_lang">'+LANGS.map(l=>'<button data-v="'+l[0]+'"'+(l[0]===lang?' class="active"':'')+'>'+l[1]+'</button>').join('')+'</div>'+
          '<div class="info" id="ocr_off" style="margin-top:10px"></div>'+
          '<div class="info" id="ocr_st" role="status" aria-live="polite" style="margin-top:6px">…</div>'+
          '<progress id="ocr_pg" max="1" value="0" style="width:100%;margin-top:6px"></progress>'+
        '</div></div>'+
      '<div class="field" style="margin-top:16px"><label for="ocr_out">Texte reconnu</label>'+
        '<textarea id="ocr_out" readonly data-result rows="10" spellcheck="false" placeholder="Le texte lu apparaîtra ici."></textarea></div>'+
      '<div class="btn-row"><button class="btn primary" id="ocr_cp" data-main>Copier</button>'+
        '<button class="btn ghost" id="ocr_nb">→ Carnet</button><button class="btn ghost" id="ocr_go">Relire</button>'+
        '<button class="btn ghost" data-again>Autre image</button></div>';
    $('ocr_img').src=NOXE.urlOf(file);
    const st=$('ocr_st'),pg=$('ocr_pg'),out=$('ocr_out');
    const showOff=async()=>{
      const ok=await offline(lang),need=CORE+lang.split('+').reduce((a,l)=>a+SIZE[l],0);
      const el=$('ocr_off');if(!el)return;                  // v5 : outil fermé entre-temps (téléphone lent) → rien à afficher
      el.textContent=ok?'✓ Disponible hors-ligne (déjà téléchargé).':'Premier usage : ~'+mo(need)+' à télécharger une seule fois, ensuite hors-ligne.';
    };
    const log=m=>{if(!m||!m.status)return;st.textContent=(STEP[m.status]||m.status)+(m.progress?' — '+Math.round(m.progress*100)+' %':'');pg.value=m.progress||0;};
    let token=0;
    async function read(){
      const my=++token;
      out.value='';st.textContent='chargement du moteur…';pg.value=0;
      const t0=performance.now();
      try{
        const w=await engine(lang,log);
        if(my!==token)return;
        busy=w.recognize(file);
        const r=await busy;
        if(my!==token)return;
        const txt=(r.data.text||'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
        out.value=txt;
        const conf=Math.round(r.data.confidence||0);
        st.textContent=txt?'Terminé en '+((performance.now()-t0)/1000).toFixed(1).replace('.',',')+' s — confiance moyenne '+conf+' %':'Aucun texte trouvé dans cette image.';
        pg.value=1;showOff();
      }catch(e){
        if(my!==token)return;
        console.error(e);
        st.textContent='Erreur : '+(e&&e.message||e)+(navigator.onLine?'':' (hors-ligne et moteur pas encore téléchargé ?)');
        stop();
      }
    }
    seg('ocr_lang',v=>{lang=v;try{localStorage.setItem('averse-ocr-lang',v);}catch(e){}showOff();read();});
    $('ocr_cp').onclick=()=>{if(out.value)copy(out.value,'Texte copié');else toast('Pas encore de texte');};
    $('ocr_nb').onclick=()=>{
      if(!out.value){toast('Pas encore de texte');return;}
      addToNotebook('OCR — '+(file.name||'image'),out.value,['ocr']);
      toast('Ajouté au carnet — Ctrl+J pour le voir');if(NOXE.notesChanged)NOXE.notesChanged();
    };
    $('ocr_go').onclick=read;
    NOXE.onClose(()=>{token++;stop();});
    showOff();read();
  }
});
NOXE.ocrStop=stop;                                           // pour les tests
})();
