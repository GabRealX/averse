/* tools/encodage.js — DEV : Base64 (texte et fichiers), URL, JWT, UUID et QR code.
   Base64, URL et JWT étaient des onglets de « Hash & encodage » : ils ont maintenant chacun leur page,
   pour pouvoir les ouvrir directement (recherche, collage malin). */
(function(){
const {register,seg,out}=NOXE;
const te=new TextEncoder();

const b64enc=bytes=>{let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);};
const b64dec=str=>{
  let s=str.replace(/\s+/g,'').replace(/-/g,'+').replace(/_/g,'/');
  while(s.length%4)s+='=';
  return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
};
NOXE.b64enc=b64enc;NOXE.b64dec=b64dec;                     // utilisés aussi par detect.js et les tests

/* reconnaître un fichier à ses premiers octets (« nombre magique ») */
const MAGIC=[['89504e47','image/png','png'],['ffd8ff','image/jpeg','jpg'],['47494638','image/gif','gif'],
  ['25504446','application/pdf','pdf'],['504b0304','application/zip','zip'],['52494646','image/webp','webp']];
const sniff=u8=>{const h=[...u8.slice(0,4)].map(b=>b.toString(16).padStart(2,'0')).join('');
  const m=MAGIC.find(x=>h.startsWith(x[0]));return m?{type:m[1],ext:m[2]}:null;};

/* ===================== Base64 ===================== */
register({
  key:'base64',cat:'dev',title:'Base64',input:'b_in',
  words:'base64 encoder décoder data uri fichier image binaire btoa atob',
  desc:'Encode / décode du texte en Base64, transforme un fichier en Base64 (data URI), ou retrouve le fichier caché dans un Base64.',
  run(p){
    let takeFile=null;
    NOXE.tabs(p,[
      ['enc','Texte → Base64',host=>{
        let url=false;
        host.innerHTML=
          '<label class="check"><input type="checkbox" id="b_u"> Variante URL-safe</label>'+
          '<div class="field" style="margin-top:12px"><label>Texte</label><textarea id="b_in" style="min-height:90px" spellcheck="false"></textarea></div><div id="b_out"></div>';
        function render(){
          const t=$('b_in').value,o=$('b_out');
          NOXE.setResult(null);
          if(!t){o.innerHTML='';return;}
          let r=b64enc(te.encode(t));if(url)r=r.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
          o.innerHTML='<div class="codebox" data-copy="'+esc(r)+'">'+esc(r)+'</div>';
        }
        $('b_in').oninput=render;$('b_u').onchange=e=>{url=e.target.checked;render();};
        render();
      }],
      ['dec','Base64 → texte / fichier',host=>{
        host.innerHTML=
          '<div class="field"><label>Base64 ou data URI</label><textarea id="b_dec" style="min-height:90px" spellcheck="false" placeholder="SGVsbG8… ou data:image/png;base64,…"></textarea></div><div id="b_dout"></div>';
        function render(){NOXE.unurl(render.img);render.img=null;     // v4 : l'aperçu précédent est libéré

          let t=$('b_dec').value.trim(),o=$('b_dout'),type=null;$('b_dec').classList.remove('bad');NOXE.setResult(null);
          if(!t){o.innerHTML='';return;}
          const m=/^data:([\w.+\/-]*)(;[^,]*)?;base64,/i.exec(t);
          if(m){type=m[1]||null;t=t.slice(m[0].length);}
          let bytes;
          try{bytes=b64dec(t);}catch(e){$('b_dec').classList.add('bad');o.innerHTML='<div class="info bad">Base64 invalide.</div>';return;}
          const kind=sniff(bytes);
          if(!kind&&(!type||/^text\/|json|xml/.test(type))){
            try{
              const r=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
              o.innerHTML='<div class="codebox" data-copy="'+esc(r)+'">'+esc(r)+'</div>';return;
            }catch(e){}
          }
          /* ce n'est pas du texte : on propose le fichier */
          const ft=kind?kind.type:type||'application/octet-stream',ext=kind?kind.ext:(type&&type.split('/')[1]||'bin').replace(/[^\w]/g,'');
          const blob=new Blob([bytes],{type:ft});render.img=blob;
          o.innerHTML='<div class="info">Fichier binaire : <b>'+esc(ft)+'</b> · '+NOXE.bytes(bytes.length)+'</div>'+
            (/^image\//.test(ft)?'<div class="canvas-frame" style="margin-top:10px"><img id="b_img" alt="aperçu" src="'+NOXE.urlOf(blob)+'"></div>':'')+
            '<div class="btn-row"><button class="btn primary" id="b_dl">Télécharger fichier.'+esc(ext)+'</button></div>';
          $('b_dl').onclick=()=>NOXE.download(blob,'fichier.'+ext);
          NOXE.setResult({files:[new File([blob],'fichier.'+ext,{type:ft})]});   // un fichier retrouvé peut partir vers un autre outil
        }
        $('b_dec').oninput=render;render();
      }],
      ['file','Fichier → Base64',host=>{
        host.innerHTML=
          '<div class="btn-row" style="margin-top:0"><button class="btn primary" id="b_fb">Choisir un fichier…</button><input type="file" id="b_file" hidden></div><div id="b_fout"></div>';
        function take(f){
          if(!f)return;
          if(f.size>20e6){$('b_fout').innerHTML='<div class="info bad">Fichier trop gros (20 Mo maximum).</div>';return;}
          const r=new FileReader();
          r.onload=()=>{if(!$('b_fout'))return;const uri=r.result,b=uri.slice(uri.indexOf(',')+1);
            $('b_fout').innerHTML='<div class="info"><b>'+esc(f.name)+'</b> · '+NOXE.bytes(f.size)+' → '+NOXE.bytes(b.length)+' en Base64</div>'+
              '<div class="btn-row" style="margin-top:8px"><button class="btn primary" data-copy="'+esc(uri)+'">Copier le data URI</button><button class="btn ghost" data-copy="'+esc(b)+'">Copier le Base64</button></div>'+
              '<textarea readonly id="b_fres" style="min-height:90px;margin-top:10px" spellcheck="false">'+esc(b.length>200000?b.slice(0,200000)+'…':b)+'</textarea>';};
          r.readAsDataURL(f);
        }
        $('b_fb').onclick=()=>$('b_file').click();
        $('b_file').onchange=e=>take(e.target.files[0]);
        takeFile=take;
      }]
    ]);
    NOXE.onFiles(fs=>{NOXE._tabs.show('file');takeFile(fs[0]);});   // fichier déposé depuis l'accueil
  }
});

/* ===================== URL ===================== */
register({
  key:'url',cat:'dev',title:'URL',input:'u_in',
  words:'url encoder décoder pourcent percent query paramètres analyser lien adresse',
  desc:'Encode / décode un texte pour une URL (%20…) et découpe une adresse : protocole, hôte, chemin, paramètres.',
  run(p){
    p.innerHTML=
      '<div class="field"><label>Texte ou URL</label><textarea id="u_in" style="min-height:80px" spellcheck="false">https://exemple.fr/recherche?q=café noir&page=2#haut</textarea></div><div id="u_out"></div>';
    function render(){
      const t=$('u_in').value.trim(),o=$('u_out');
      if(!t){o.innerHTML='';return;}
      const rows=[['Encodé (composant)',encodeURIComponent(t)]];
      let dec;try{dec=decodeURIComponent(t);}catch(e){dec=null;}
      rows.push(['Décodé',dec==null?'(séquence % invalide)':dec]);
      let html=out(rows);
      try{
        const u=new URL(t);
        const parts=[['Protocole',u.protocol],['Hôte',u.hostname],['Port',u.port||'(par défaut)'],['Chemin',u.pathname],['Ancre',u.hash||'—']];
        const qs=[...u.searchParams.entries()];
        html+=out([['Analyse de l\'URL',null]].concat(parts,qs.length?[['Paramètres',null]].concat(qs.map(([k,v])=>[k,v])):[]));
      }catch(e){}
      o.innerHTML=html;
    }
    $('u_in').oninput=render;render();
  }
});

/* ===================== JWT ===================== */
register({
  key:'jwt',cat:'dev',title:'JWT',input:'w_in',mem:false,        // un jeton est un secret : on ne le garde pas
  words:'jwt token jeton json web décoder bearer expiration',
  desc:'Décode un jeton JWT : en-tête, contenu, dates d\'expiration. La signature n\'est pas vérifiée.',
  run(p){
    p.innerHTML=
      '<div class="field"><label>Jeton JWT</label><textarea id="w_in" style="min-height:90px" spellcheck="false" placeholder="eyJhbGciOi…"></textarea></div><div id="w_out"></div>'+
      '<div class="info">Le jeton est seulement décodé ici, sa signature n\'est <b>pas vérifiée</b>. Ne colle pas de jeton de production sur un site que tu ne maîtrises pas — celui-ci n\'envoie rien, mais prends l\'habitude.</div>';
    function render(){
      const t=$('w_in').value.trim(),o=$('w_out');$('w_in').classList.remove('bad');
      if(!t){o.innerHTML='';return;}
      try{
        const [h,pl]=t.split('.').slice(0,2).map(x=>JSON.parse(new TextDecoder().decode(b64dec(x))));
        const dates=['exp','iat','nbf'].filter(k=>typeof pl[k]==='number').map(k=>[({exp:'Expire le',iat:'Émis le',nbf:'Valide à partir du'})[k],new Date(pl[k]*1000).toLocaleString('fr-FR')]);
        let state='';
        if(typeof pl.exp==='number')state=pl.exp*1000<Date.now()?'<div class="info bad">✗ Jeton expiré.</div>':'<div class="info ok">✓ Jeton non expiré.</div>';
        o.innerHTML=state+(dates.length?out(dates):'')+'<div class="lbl" style="margin-top:14px">En-tête</div><div class="codebox" data-copy="'+esc(JSON.stringify(h,null,2))+'">'+esc(JSON.stringify(h,null,2))+'</div>'+
          '<div class="lbl" style="margin-top:14px">Contenu (payload)</div><div class="codebox" data-result data-copy="'+esc(JSON.stringify(pl,null,2))+'">'+esc(JSON.stringify(pl,null,2))+'</div>';
      }catch(e){$('w_in').classList.add('bad');o.innerHTML='<div class="info bad">Ce n\'est pas un JWT valide (trois parties séparées par des points).</div>';}
    }
    $('w_in').oninput=render;render();
  }
});

/* ===================== UUID ===================== */
/* UUID version 4 = 122 bits aléatoires ; crypto.randomUUID n'existe qu'en HTTPS / localhost, d'où le repli */
NOXE.uuid4=()=>{
  if(window.crypto&&crypto.randomUUID)return crypto.randomUUID();
  const b=crypto.getRandomValues(new Uint8Array(16));
  b[6]=(b[6]&0x0f)|0x40;                                     // version 4
  b[8]=(b[8]&0x3f)|0x80;                                     // variante RFC 4122
  const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
};
register({
  key:'uuid',cat:'dev',title:'UUID',
  words:'uuid guid identifiant unique v4 aléatoire générer id',
  desc:'Génère des UUID v4 aléatoires (un ou plusieurs d\'un coup) et vérifie le format d\'un UUID.',
  run(p){
    p.innerHTML=
      '<div class="group"><div class="row" style="align-items:flex-end"><div class="field" style="flex:none"><label>Combien</label><input type="number" id="id_n" min="1" max="500" value="5" style="width:110px"></div>'+
      '<label class="check" style="padding-bottom:10px"><input type="checkbox" id="id_up"> MAJUSCULES</label><label class="check" style="padding-bottom:10px"><input type="checkbox" id="id_nd"> Sans tirets</label></div></div>'+
      '<div class="btn-row"><button class="btn primary" id="id_go" data-main>Regénérer</button><button class="btn ghost" id="id_cp">Tout copier</button></div>'+
      '<div id="id_out"></div>'+
      '<div class="field" style="margin-top:22px"><label>Vérifier un UUID</label><input type="text" id="id_chk" spellcheck="false" placeholder="ex : 3f2b…"></div><div class="info" id="id_res"></div>';
    let list=[];
    function gen(){
      const n=Math.max(1,Math.min(500,parseInt($('id_n').value)||1));
      list=Array.from({length:n},()=>{let u=NOXE.uuid4();if($('id_nd').checked)u=u.replace(/-/g,'');return $('id_up').checked?u.toUpperCase():u;});
      $('id_out').innerHTML=out(list.map((u,i)=>[String(i+1),u]));
    }
    function check(){
      const v=$('id_chk').value.trim(),r=$('id_res');
      if(!v){r.textContent='';return;}
      const m=/^([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})$/i.exec(v);
      if(!m){r.innerHTML='<span class="bad">✗ Ce n\'est pas un UUID (32 chiffres hexadécimaux, tirets optionnels).</span>';return;}
      const ver=m[3][0],vr=parseInt(m[4][0],16);
      r.innerHTML='<span class="ok">✓ UUID valide</span> — version <b>'+ver+'</b>'+(vr>=8&&vr<=11?', variante RFC 4122':', variante non standard');
    }
    ['id_n','id_up','id_nd'].forEach(id=>$(id).addEventListener('change',gen));$('id_n').oninput=gen;
    $('id_go').onclick=gen;$('id_cp').onclick=()=>copy(list.join('\n'),list.length+' UUID copiés');
    $('id_chk').oninput=check;gen();
  }
});

/* ===================== QR code ===================== */
/* bibliothèque « qrcode-generator » de Kazuhiko Arase (licence MIT), copiée dans js/vendor/ : marche hors ligne */
const wifiEsc=s=>s.replace(/([\\;,:"])/g,'\\$1');
register({
  key:'qr',cat:'dev',title:'QR code',input:'q_in',
  words:'qr qrcode code barre wifi lien partager scanner téléphone',
  desc:'Crée un QR code (texte, lien ou Wi-Fi) à télécharger en PNG ou SVG. Fonctionne hors ligne.',
  run(p){
    let mode='txt',ready=false,svg='',ec='M';
    p.innerHTML=
      '<div class="field"><div class="segmented" id="q_m"><button data-v="txt" class="active">Texte / lien</button><button data-v="wifi">Wi-Fi</button></div></div>'+
      '<div id="q_txt" class="field" style="margin-top:12px"><label>Contenu</label><textarea id="q_in" style="min-height:80px" spellcheck="false" placeholder="https://…"></textarea></div>'+
      '<div id="q_wifi" style="display:none;margin-top:12px"><div class="row"><div class="field"><label>Nom du réseau (SSID)</label><input type="text" id="q_ssid" spellcheck="false"></div>'+
        '<div class="field"><label>Mot de passe</label><input type="text" id="q_pw" spellcheck="false" autocomplete="off"></div></div>'+
        '<div class="row"><div class="field"><label>Sécurité</label><select id="q_sec"><option value="WPA">WPA / WPA2 / WPA3</option><option value="WEP">WEP</option><option value="nopass">Aucune</option></select></div>'+
        '<label class="check"><input type="checkbox" id="q_hid"> Réseau caché</label></div></div>'+
      '<div class="group"><div class="row"><div class="field"><label>Correction d\'erreur</label><div class="segmented" id="q_ec"><button data-v="L">L 7 %</button><button data-v="M" class="active">M 15 %</button><button data-v="Q">Q 25 %</button><button data-v="H">H 30 %</button></div></div>'+
        '<div class="field"><label>Taille d\'un point <b id="q_szv">8</b> px</label><input type="range" id="q_sz" min="3" max="20" value="8"></div></div></div>'+
      '<div class="canvas-frame" style="background:#fff;padding:0;text-align:center"><canvas id="q_cv" width="1" height="1" style="max-width:100%;image-rendering:pixelated"></canvas></div>'+
      '<div class="info" id="q_info">Chargement de la bibliothèque QR…</div>'+
      '<div class="btn-row"><button class="btn primary" id="q_png" data-main>Télécharger PNG</button><button class="btn ghost" id="q_svg">Télécharger SVG</button></div>';
    const text=()=>{
      if(mode==='txt')return $('q_in').value;
      const s=$('q_ssid').value;if(!s)return'';
      const sec=$('q_sec').value;
      return'WIFI:T:'+sec+';S:'+wifiEsc(s)+';'+(sec!=='nopass'?'P:'+wifiEsc($('q_pw').value)+';':'')+($('q_hid').checked?'H:true;':'')+';';
    };
    function render(){
      if(!ready||!$('q_cv'))return;
      const t=text(),c=$('q_cv'),info=$('q_info'),cell=+$('q_sz').value;
      $('q_szv').textContent=cell;svg='';NOXE.setResult(null);
      if(!t){c.width=c.height=1;info.textContent='Écris quelque chose pour créer le QR code.';return;}
      let qr;
      try{
        qrcode.stringToBytes=qrcode.stringToBytesFuncs['UTF-8'];   // accents et emoji corrects
        qr=qrcode(0,ec);qr.addData(t,'Byte');qr.make();
      }catch(e){c.width=c.height=1;info.innerHTML='<span class="bad">Texte trop long pour un QR code (≈ 2900 octets max, moins avec une correction élevée).</span>';return;}
      const n=qr.getModuleCount(),m=4,size=(n+2*m)*cell,x=c.getContext('2d');
      c.width=c.height=size;
      x.fillStyle='#fff';x.fillRect(0,0,size,size);x.fillStyle='#000';
      for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(qr.isDark(r,k))x.fillRect((k+m)*cell,(r+m)*cell,cell,cell);
      svg=qr.createSvgTag(cell,m*cell);
      NOXE.setResult({get:()=>new Promise(ok=>c.toBlob(b=>ok(b?{files:[new File([b],'qrcode.png',{type:'image/png'})]}:null),'image/png'))});   // le QR est une image : → optimiser, PDF…
      info.innerHTML='<b>'+n+' × '+n+'</b> modules · '+size+' px · '+te.encode(t).length+' octets';
    }
    seg('q_m',v=>{mode=v;$('q_txt').style.display=v==='txt'?'':'none';$('q_wifi').style.display=v==='wifi'?'':'none';render();});
    seg('q_ec',v=>{ec=v;render();});
    p.addEventListener('input',render);p.addEventListener('change',render);
    $('q_png').onclick=()=>{if(!svg)return;$('q_cv').toBlob(b=>NOXE.download(b,'qrcode.png'),'image/png');};
    $('q_svg').onclick=()=>{if(svg)NOXE.download(new Blob([svg],{type:'image/svg+xml'}),'qrcode.svg');};
    NOXE.lib('js/vendor/qrcode.js').then(()=>{ready=true;render();},()=>{if($('q_info'))$('q_info').innerHTML='<span class="bad">Bibliothèque QR introuvable (js/vendor/qrcode.js).</span>';});
  }
});

})();
