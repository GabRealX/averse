/* tools/dev.js — DEV & SÉCURITÉ : JSON, regex, encodage & hash, mots de passe, couleurs
   (v2 : Base64, URL, JWT, UUID et QR code sont dans encodage.js ; la regex tourne dans un Worker) */
(function(){
const {register,seg,out,scaled}=NOXE;
const te=new TextEncoder();
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
const secure=()=>window.crypto&&crypto.subtle;

/* ===================== JSON ===================== */
function sortKeys(v){
  if(Array.isArray(v))return v.map(sortKeys);
  if(v&&typeof v==='object'){const o={};Object.keys(v).sort().forEach(k=>o[k]=sortKeys(v[k]));return o;}
  return v;
}
/* Petit analyseur JSON qui localise l'erreur (les navigateurs ne donnent pas toujours la position) */
function jsonCheck(t){
  let i=0;const n=t.length;
  const err=m=>{throw{pos:i,msg:m};};
  const ws=()=>{while(i<n&&' \t\n\r'.includes(t[i]))i++;};
  function str(){
    i++;
    for(;;){
      if(i>=n)err('chaîne non terminée');
      const c=t[i];
      if(c==='"'){i++;return;}
      if(c==='\n')err('retour à la ligne interdit dans une chaîne');
      if(c==='\\'){i+=2;continue;}
      i++;
    }
  }
  function val(){
    ws();const c=t[i];
    if(c==='{'){
      i++;ws();if(t[i]==='}'){i++;return;}
      for(;;){ws();if(t[i]!=='"')err('clé entre guillemets attendue');str();ws();if(t[i]!==':')err('« : » attendu');i++;val();ws();
        if(t[i]===','){i++;continue;}if(t[i]==='}'){i++;return;}err('« , » ou « } » attendu');}
    }
    if(c==='['){
      i++;ws();if(t[i]===']'){i++;return;}
      for(;;){val();ws();if(t[i]===','){i++;continue;}if(t[i]===']'){i++;return;}err('« , » ou « ] » attendu');}
    }
    if(c==='"'){str();return;}
    for(const lit of ['true','false','null'])if(t.startsWith(lit,i)){i+=lit.length;return;}
    const re=/-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;re.lastIndex=i;
    const m=re.exec(t);if(m&&m[0]){i+=m[0].length;return;}
    err(i>=n?'fin inattendue du texte':'valeur attendue');
  }
  try{val();ws();if(i<n)err('texte inattendu après la fin du JSON');}catch(e){if(e&&e.pos!=null)return e;throw e;}
  return null;
}
function errPos(text,pos){const before=text.slice(0,pos).split('\n');return{line:before.length,col:before[before.length-1].length+1};}
register({
  key:'json',cat:'dev',title:'JSON',input:'j_in',
  words:'formater valider minifier indenter trier clés parse',
  desc:'Valide, formate, minifie et trie un JSON. Les erreurs sont localisées (ligne / colonne).',
  run(p){
    let mode='2';
    p.innerHTML=
      '<div class="field"><label>JSON</label><textarea id="j_in" style="min-height:170px" spellcheck="false" placeholder=\'{"nom": "test", "liste": [1, 2, 3]}\'></textarea></div>'+
      '<div class="group"><div class="row" style="align-items:flex-end"><div class="field"><label>Mise en forme</label><div class="segmented" id="j_m"><button data-v="2" class="active">2 espaces</button><button data-v="4">4 espaces</button><button data-v="tab">Tabulation</button><button data-v="min">Minifié</button></div></div>'+
      '<label class="check" style="padding-bottom:10px"><input type="checkbox" id="j_sort"> Trier les clés</label></div></div>'+
      '<div class="info" id="j_st"></div>'+
      '<div class="field" style="margin-top:12px"><label>Résultat</label><textarea id="j_out" readonly style="min-height:170px" spellcheck="false"></textarea></div>'+
      '<div class="btn-row"><button class="btn primary" id="j_cp">Copier</button><button class="btn ghost" id="j_use">Remplacer l\'entrée</button></div>';
    function render(){
      const t=$('j_in').value,st=$('j_st');
      $('j_in').classList.remove('bad');
      if(!t.trim()){$('j_out').value='';st.textContent='';return;}
      try{
        let v=JSON.parse(t);if($('j_sort').checked)v=sortKeys(v);
        const s=mode==='min'?JSON.stringify(v):JSON.stringify(v,null,mode==='tab'?'\t':+mode);
        $('j_out').value=s;
        const kind=Array.isArray(v)?'tableau de '+v.length+' élément'+(v.length>1?'s':''):v&&typeof v==='object'?'objet de '+Object.keys(v).length+' clé'+(Object.keys(v).length>1?'s':''):typeof v;
        st.innerHTML='<span class="ok">✓ JSON valide</span> — '+kind+' · '+NOXE.bytes(te.encode(s).length);
      }catch(e){
        $('j_in').classList.add('bad');$('j_out').value='';
        const c=jsonCheck(t),pos=c?errPos(t,c.pos):null;
        st.innerHTML='<span class="bad">✗ '+esc(c?c.msg:e.message)+(pos?' — ligne '+pos.line+', colonne '+pos.col:'')+'</span>';
      }
    }
    $('j_in').oninput=render;$('j_sort').onchange=render;seg('j_m',v=>{mode=v;render();});
    $('j_cp').onclick=()=>{if($('j_out').value)copy($('j_out').value);};
    $('j_use').onclick=()=>{if($('j_out').value){$('j_in').value=$('j_out').value;render();}};
  }
});

/* ===================== Regex ===================== */
/* La recherche tourne dans un Worker avec délai maximum : voir NOXE.rxRunner (tools/base.js). */
register({
  key:'regex',cat:'dev',title:'Testeur de regex',input:'r_t',
  words:'expression régulière regexp match remplacer groupes',
  desc:'Teste une expression régulière sur ton texte : correspondances surlignées, groupes, remplacement.',
  run(p){
    p.innerHTML=
      '<div class="group"><div class="row"><div class="field" style="flex:3"><label>Expression</label><input type="text" id="r_p" value="(\\w+)@(\\w+)\\.com" spellcheck="false"></div>'+
      '<div class="field"><label>Drapeaux</label><div class="inline" style="flex-wrap:wrap;gap:12px;padding-top:6px">'+
      ['g','i','m','s','u'].map(f=>'<label class="check" title="'+f+'"><input type="checkbox" data-f="'+f+'"'+(f==='g'?' checked':'')+'>'+f+'</label>').join('')+'</div></div></div>'+
      '<div class="field"><label>Texte de test</label><textarea id="r_t" spellcheck="false" style="min-height:100px">contact: alice@example.com, bob@test.com</textarea></div>'+
      '<div class="field"><label>Remplacer par (optionnel — $1, $2, $&amp;)</label><input type="text" id="r_r" spellcheck="false" placeholder="ex : $2 (de $1)"></div></div>'+
      '<div id="r_out"></div>';
    const R=NOXE.rxRunner();let deb=null,job=null;
    NOXE.onClose(()=>{R.stop();clearTimeout(deb);});
    function show(r){
      const o=$('r_out');if(!o)return;
      const {text}=job,ms=r.ms;
      let last=0,html='';
      for(const m of ms){
        html+=esc(text.slice(last,m.index));
        if(m.m0!=='')html+='<mark>'+esc(m.m0)+'</mark>';
        last=m.index+m.m0.length;
      }
      html+=esc(text.slice(last));
      let res='<div class="info" style="margin-top:14px"><b>'+ms.length+'</b> correspondance'+(ms.length>1?'s':'')+(ms.length>=1000?' (limitées à 1000)':'')+'</div>';
      res+='<div class="hl">'+html+'</div>';
      if(ms.length){
        res+='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Position</th><th>Correspondance</th><th>Groupes</th></tr></thead><tbody>'+
          ms.slice(0,100).map((m,i)=>{
            const g=m.g.map((x,k)=>'$'+(k+1)+' = '+(x==null?'∅':'« '+x+' »')).concat(m.groups?Object.entries(m.groups).map(([k,v])=>k+' = '+(v==null?'∅':'« '+v+' »')):[]);
            return'<tr><td class="dim">'+(i+1)+'</td><td class="dim">'+m.index+'</td><td>'+esc(m.m0)+'</td><td class="dim">'+esc(g.join('  ·  '))+'</td></tr>';
          }).join('')+'</tbody></table></div>';
      }
      if(r.rep!=null){
        res+='<div class="lbl" style="margin-top:16px">Résultat du remplacement</div><div class="codebox" data-copy="'+esc(r.rep)+'">'+esc(r.rep)+'</div>';
      }
      o.innerHTML=res;
    }
    function render(){
      const pat=$('r_p').value,text=$('r_t').value,flags=[...p.querySelectorAll('[data-f]:checked')].map(c=>c.dataset.f).join('');
      const o=$('r_out');$('r_p').classList.remove('bad');
      if(!pat){R.stop();o.innerHTML='';return;}
      try{new RegExp(pat,flags);}                            // compiler ne coûte rien : on vérifie la syntaxe tout de suite
      catch(e){R.stop();$('r_p').classList.add('bad');o.innerHTML='<div class="info bad">'+esc(e.message)+'</div>';return;}
      const mine=job={text,flags},rep=$('r_r').value;
      R.run({pat,flags,text,rep:rep===''?null:rep}).then(r=>{if(job===mine)show(r);}).catch(e=>{
        if(e.code==='abort'||!$('r_out'))return;
        $('r_out').innerHTML=e.code==='timeout'?'<div class="info bad" id="r_slow">⏱ Calcul arrêté après '+NOXE.RX_TIMEOUT/1000+' s : cette expression part en « retour arrière catastrophique » '+
          '(ex. <code>(a+)+$</code>). Évite les quantificateurs imbriqués comme <code>(x+)+</code> ou <code>(x|x)*</code>.</div>':'<div class="info bad">'+esc(e.message)+'</div>';
      });
    }
    const later=()=>{clearTimeout(deb);deb=setTimeout(()=>{if($('r_p'))render();},120);};   // l'outil a pu être fermé entre-temps
    p.addEventListener('input',later);p.addEventListener('change',later);render();
  }
});

/* ===================== Hash (Base64, URL et JWT sont dans encodage.js) ===================== */
register({
  key:'encodage',cat:'dev',title:'Hash',input:'h_in',
  words:'sha256 sha1 sha512 hmac md5 empreinte checksum fichier vérifier intégrité',
  desc:'Hash de texte ou de fichier (vérifie un téléchargement). Base64, URL et JWT ont maintenant leur propre outil.',
  run(p){
    {
        const host=p;
        let algo='SHA-256',file=null,run=0;
        host.innerHTML=
          '<div class="field"><label>Texte</label><textarea id="h_in" style="min-height:90px" spellcheck="false" placeholder="Écris du texte… ou choisis un fichier ci-dessous"></textarea></div>'+
          '<div class="btn-row" style="margin-top:8px"><button class="btn ghost" id="h_fb">Hacher un fichier…</button><span class="info" id="h_fn" style="margin:0"></span><input type="file" id="h_file" hidden></div>'+
          '<div class="group"><div class="field"><label>Algorithme</label><div class="segmented" id="h_a"><button data-v="SHA-256" class="active">SHA-256</button><button data-v="SHA-512">SHA-512</button><button data-v="SHA-384">SHA-384</button><button data-v="SHA-1">SHA-1</button></div></div>'+
          '<div class="field"><label>Clé HMAC (optionnel)</label><input type="text" id="h_key" spellcheck="false" autocomplete="off"></div></div>'+
          '<div class="codebox" id="h_out" data-copy="">—</div>'+
          '<div class="field" style="margin-top:14px"><label>Comparer avec un hash attendu</label><input type="text" id="h_cmp" spellcheck="false" placeholder="colle ici le hash fourni par le site"></div><div class="info" id="h_res"></div>'+
          '<div class="info">SHA-1 est cassé : ne l\'utilise pas pour la sécurité. Tout est calculé dans ton navigateur.</div>';
        async function calc(){
          const id=++run,out=$('h_out');
          if(!secure()){out.textContent='Le hash demande une page en HTTPS ou en localhost.';return;}
          let data;
          if(file)data=await file.arrayBuffer();else{const t=$('h_in').value;if(!t){out.textContent='—';out.dataset.copy='';compare();return;}data=te.encode(t);}
          const key=$('h_key').value;let r;
          try{
            if(key){const k=await crypto.subtle.importKey('raw',te.encode(key),{name:'HMAC',hash:algo},false,['sign']);r=hex(await crypto.subtle.sign('HMAC',k,data));}
            else r=hex(await crypto.subtle.digest(algo,data));
          }catch(e){r='Erreur de calcul';}
          if(id!==run||!$('h_out'))return;
          out.textContent=r;out.dataset.copy=/^[0-9a-f]+$/.test(r)?r:'';compare();
        }
        function compare(){
          const want=$('h_cmp').value.trim().toLowerCase().replace(/\s+/g,''),got=$('h_out').dataset.copy;
          $('h_res').innerHTML=!want||!got?'':want===got?'<span class="ok">✓ Identique : le fichier / texte n\'a pas été modifié.</span>':'<span class="bad">✗ Différent !</span>';
        }
        $('h_in').oninput=()=>{file=null;$('h_fn').textContent='';calc();};
        $('h_key').oninput=calc;$('h_cmp').oninput=compare;
        seg('h_a',v=>{algo=v;calc();});
        $('h_fb').onclick=()=>$('h_file').click();
        $('h_file').onchange=e=>{file=e.target.files[0]||null;if(file){$('h_fn').textContent=file.name+' · '+NOXE.bytes(file.size);$('h_in').value='';}calc();};
        NOXE.onFiles(fs=>{file=fs[0];$('h_fn').textContent=file.name+' · '+NOXE.bytes(file.size);$('h_in').value='';calc();});   // fichier déposé depuis l'accueil
        calc();
    }
  }
});

/* ===================== Mots de passe ===================== */
const COMMON=['123456','password','12345678','qwerty','azerty','123456789','12345','1234','111111','1234567','dragon','123123','baseball','abc123','football','monkey','letmein','696969','shadow','master','666666','qwertyuiop','123321','mustang','1234567890','michael','654321','superman','1qaz2wsx','trustno1','iloveyou','000000','motdepasse','soleil','doudou','azerty123','admin','welcome','login','passw0rd','princess','solo','starwars','bonjour','marseille','loulou','chouchou','boubou','nicolas','jetaime'];
const SEQ=['abcdefghijklmnopqrstuvwxyz','0123456789','azertyuiop','qsdfghjklm','wxcvbn','qwertyuiop','asdfghjkl','zxcvbnm'];
function hasSeq(s){
  s=s.toLowerCase();
  for(const q of SEQ){for(let i=0;i+4<=q.length;i++){const a=q.slice(i,i+4);if(s.includes(a)||s.includes([...a].reverse().join('')))return true;}}
  return false;
}
function crack(bits,rate){
  const s=Math.pow(2,bits-1)/rate;
  if(s<1)return'instantané';
  let v=s;
  if(v<60)return Math.round(v)+' secondes';
  v/=60;if(v<60)return Math.round(v)+' minutes';
  v/=60;if(v<24)return Math.round(v)+' heures';
  v/=24;if(v<365)return Math.round(v)+' jours';
  v/=365;
  if(v<1e3)return Math.round(v)+' ans';
  if(v<1e6)return Math.round(v/1e3)+' milliers d\'années';
  if(v<1e9)return Math.round(v/1e6)+' millions d\'années';
  return'des milliards d\'années';
}
register({
  key:'mdp',cat:'dev',title:'Mots de passe',
  words:'générer tester force entropie fuite pwned haveibeenpwned sécurité',
  desc:'Génère un mot de passe solide, teste la force du tien et vérifie s\'il a déjà fuité.',
  run(p){
    NOXE.tabs(p,[
      ['gen','Générer',host=>{
        const SETS={a:'abcdefghijklmnopqrstuvwxyz',b:'ABCDEFGHIJKLMNOPQRSTUVWXYZ',c:'0123456789',d:'!@#$%^&*()-_=+[]{};:,.?'};
        const AMB='0O1lI';                                       // caractères qu'on confond facilement
        host.innerHTML=
          '<div class="codebox" id="g_out" style="font-size:1.05rem;margin-top:0">—</div><div class="info" id="g_info"></div>'+
          '<div class="group"><div class="field"><label>Longueur <b id="g_lv">20</b></label><input type="range" id="g_l" min="8" max="64" value="20"></div>'+
          '<label class="check"><input type="checkbox" id="g_a" checked> Minuscules</label><label class="check"><input type="checkbox" id="g_b" checked> Majuscules</label>'+
          '<label class="check"><input type="checkbox" id="g_c" checked> Chiffres</label><label class="check"><input type="checkbox" id="g_d" checked> Symboles</label>'+
          '<label class="check"><input type="checkbox" id="g_e" checked> Éviter les caractères ambigus (0 O l I 1)</label></div>'+
          '<div class="btn-row"><button class="btn primary" id="g_go" data-main>Régénérer</button><button class="btn ghost" id="g_cp">Copier</button></div>';
        const rnd=n=>{const lim=Math.floor(0x100000000/n)*n,a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=lim);return a[0]%n;};   // tirage sans biais
        function gen(){
          const noAmb=$('g_e').checked,pools=[];
          ['a','b','c','d'].forEach(k=>{if($('g_'+k).checked){const s=noAmb?[...SETS[k]].filter(ch=>!AMB.includes(ch)).join(''):SETS[k];if(s)pools.push(s);}});
          if(!pools.length){$('g_out').textContent='Coche au moins un type';$('g_info').textContent='';return;}
          const len=+$('g_l').value,all=pools.join(''),o=[];
          pools.forEach(s=>o.push(s[rnd(s.length)]));
          while(o.length<len)o.push(all[rnd(all.length)]);
          for(let i=o.length-1;i>0;i--){const j=rnd(i+1);[o[i],o[j]]=[o[j],o[i]];}
          $('g_out').textContent=o.join('');$('g_out').dataset.copy=o.join('');
          const bits=Math.round(len*Math.log2(all.length));
          $('g_info').innerHTML='Entropie : <b>~'+bits+' bits</b> — '+(bits<60?'faible':bits<80?'correct':bits<110?'fort':'très fort');
        }
        $('g_l').oninput=e=>{$('g_lv').textContent=e.target.value;gen();};
        ['a','b','c','d','e'].forEach(k=>$('g_'+k).onchange=gen);
        $('g_go').onclick=gen;$('g_cp').onclick=()=>{const t=$('g_out').dataset.copy;if(t)copy(t,'Mot de passe copié');};
        gen();
      }],
      ['test','Tester',host=>{
        host.innerHTML=
          '<div class="field"><label>Ton mot de passe (reste dans ton navigateur)</label><input type="password" id="t_in" autocomplete="off" spellcheck="false"></div>'+
          '<label class="check" style="margin-top:10px"><input type="checkbox" id="t_show"> Afficher</label><div id="t_out"></div>';
        function analyse(pw){
          let pool=0;
          if(/[a-z]/.test(pw))pool+=26;if(/[A-Z]/.test(pw))pool+=26;if(/\d/.test(pw))pool+=10;if(/[^a-zA-Z0-9]/.test(pw))pool+=32;
          let bits=pw.length*Math.log2(pool||1);const notes=[];
          const low=pw.toLowerCase().replace(/[^a-z0-9]/g,'');
          if(COMMON.some(c=>low===c||(c.length>=6&&low.includes(c)))){bits=Math.min(bits,12);notes.push('Ressemble à un mot de passe très courant.');}
          if(/(.)\1{2,}/.test(pw)){bits*=.75;notes.push('Caractères répétés (aaa).');}
          if(hasSeq(pw)){bits*=.75;notes.push('Suite de touches ou de lettres prévisible (abcd, 1234, azerty).');}
          if(/(19|20)\d\d$/.test(pw)){bits-=6;notes.push('Se termine par une année.');}
          if(pw.length<12)notes.push('Moins de 12 caractères : vise plus long.');
          if(pool<=36&&pw.length)notes.push('Peu de variété : ajoute majuscules, chiffres ou symboles — ou, mieux, rallonge.');
          return{bits:Math.max(0,bits),notes};
        }
        function render(){
          const pw=$('t_in').value,o=$('t_out');
          if(!pw){o.innerHTML='';return;}
          const a=analyse(pw),b=a.bits,lvl=b<40?['Très faible','bad']:b<60?['Faible','bad']:b<80?['Moyen','']:b<100?['Fort','ok']:['Très fort','ok'];
          o.innerHTML='<div class="info" style="font-size:.9rem;margin-top:14px"><span class="'+lvl[1]+'"><b>'+lvl[0]+'</b></span> · ~'+Math.round(b)+' bits · '+pw.length+' caractères</div>'+
            '<div class="bar"><i style="width:'+Math.min(100,b/1.2)+'%"></i></div>'+
            out([['Attaque en ligne (1 000 essais/s)',crack(b,1e3)],['Hash rapide volé (10 milliards/s)',crack(b,1e10)]])+
            (a.notes.length?'<div class="info">'+a.notes.map(n=>'• '+esc(n)).join('<br>')+'</div>':'')+
            '<div class="btn-row"><button class="btn ghost" id="t_leak">Vérifier dans les fuites connues</button></div>'+
            '<div class="info" id="t_leakres">Envoie uniquement les 5 premiers caractères de l\'empreinte SHA-1 à haveibeenpwned.com (le mot de passe ne quitte jamais cette page).</div>';
          $('t_leak').onclick=async()=>{
            const r=$('t_leakres');
            if(!secure()){r.textContent='Indisponible : la page doit être en HTTPS ou localhost.';return;}
            r.textContent='Vérification…';
            try{
              const h=hex(await crypto.subtle.digest('SHA-1',te.encode($('t_in').value))).toUpperCase();
              const res=await fetch('https://api.pwnedpasswords.com/range/'+h.slice(0,5));
              if(!res.ok)throw 0;
              const line=(await res.text()).split(/\r?\n/).find(l=>l.startsWith(h.slice(5)+':'));
              if(!$('t_leakres'))return;
              $('t_leakres').innerHTML=line?'<span class="bad">✗ Ce mot de passe apparaît dans <b>'+(+line.split(':')[1]).toLocaleString('fr-FR')+'</b> fuites. Ne l\'utilise plus.</span>':'<span class="ok">✓ Pas trouvé dans les fuites connues.</span>';
            }catch(e){if($('t_leakres'))$('t_leakres').textContent='Impossible de contacter le service (connexion ?).';}
          };
        }
        $('t_in').oninput=render;$('t_show').onchange=e=>{$('t_in').type=e.target.checked?'text':'password';};
      }]
    ]);
  }
});

/* ===================== Couleurs ===================== */
const h2rgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(String(h).trim());if(!m)return null;const n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255];};
const rgb2hex=c=>'#'+c.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('').toUpperCase();
function rgb2hsl(c){
  const r=c[0]/255,g=c[1]/255,b=c[2]/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b);let h=0,s=0;const l=(mx+mn)/2;
  if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6;}
  return[Math.round(h*360),Math.round(s*100),Math.round(l*100)];
}
function hsl2hex(h,s,l){
  h=((h%360)+360)%360/360;s/=100;l/=100;let r,g,b;
  if(s===0){r=g=b=l;}else{
    const q=l<.5?l*(1+s):l+s-l*s,pp=2*l-q;
    const f=t=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return pp+(q-pp)*6*t;if(t<1/2)return q;if(t<2/3)return pp+(q-pp)*(2/3-t)*6;return pp;};
    r=f(h+1/3);g=f(h);b=f(h-1/3);
  }
  return rgb2hex([r*255,g*255,b*255]);
}
const swatches=list=>'<div class="swatches">'+list.map(h=>'<button class="swatch" data-copy="'+h+'"><i style="background:'+h+'"></i><span>'+h+'</span></button>').join('')+'</div>';

/* palette dominante (médiane coupée) */
function bounds(px){const lo=[255,255,255],hi=[0,0,0];for(const q of px)for(let k=0;k<3;k++){if(q[k]<lo[k])lo[k]=q[k];if(q[k]>hi[k])hi[k]=q[k];}return[lo,hi];}
const spread=px=>{const[lo,hi]=bounds(px);return Math.max(hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]);};
function widest(px){const[lo,hi]=bounds(px),g=[hi[0]-lo[0],hi[1]-lo[1],hi[2]-lo[2]];return g.indexOf(Math.max(...g));}
const average=px=>{const s=[0,0,0];for(const q of px)for(let k=0;k<3;k++)s[k]+=q[k];return s.map(v=>Math.round(v/px.length));};
function palette(canvas,n){
  const c=scaled(canvas,150),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,px=[];
  for(let i=0;i<d.length;i+=4)if(d[i+3]>=125)px.push([d[i],d[i+1],d[i+2]]);
  if(!px.length)return[];
  const boxes=[px];
  while(boxes.length<n){
    boxes.sort((a,b)=>spread(b)-spread(a));const b=boxes.shift();
    if(b.length<2){boxes.unshift(b);break;}
    const ch=widest(b);b.sort((u,v)=>u[ch]-v[ch]);const m=b.length>>1;boxes.push(b.slice(0,m),b.slice(m));
  }
  return boxes.map(average).sort((a,b)=>(b[0]+b[1]+b[2])-(a[0]+a[1]+a[2])).map(rgb2hex);
}

register({
  key:'couleurs',cat:'dev',title:'Couleurs',input:'k_hex',
  words:'hex rgb hsl harmonie contraste accessibilité palette pipette wcag',
  desc:'Conversion HEX / RGB / HSL, harmonies, contraste d\'accessibilité, et palette ou pipette depuis une image.',
  run(p){
    NOXE.tabs(p,[
      ['conv','Conversion',host=>{
        host.innerHTML=
          '<div class="row"><div class="field" style="flex:none"><label>Sélecteur</label><input type="color" id="k_p" value="#c7bce4" style="width:80px"></div>'+
          '<div class="field"><label>HEX</label><input type="text" id="k_hex" spellcheck="false"></div></div>'+
          '<div class="group"><div class="row"><div class="field"><label>RGB</label><input type="text" id="k_rgb" spellcheck="false"></div><div class="field"><label>HSL</label><input type="text" id="k_hsl" spellcheck="false"></div></div></div>'+
          '<div class="preview-box" id="k_prev">Aperçu</div>';
        let cur=[199,188,228];
        const sRgb=()=>'rgb('+cur.join(', ')+')',sHsl=()=>{const h=rgb2hsl(cur);return'hsl('+h[0]+', '+h[1]+'%, '+h[2]+'%)';};
        function paint(from){
          const h=rgb2hex(cur);$('k_prev').style.background=h;$('k_p').value=h.toLowerCase();
          if(from!=='hex')$('k_hex').value=h;if(from!=='rgb')$('k_rgb').value=sRgb();if(from!=='hsl')$('k_hsl').value=sHsl();
          ['k_hex','k_rgb','k_hsl'].forEach(id=>$(id).dataset.copy=$(id).value);
        }
        const nums=s=>{const m=s.match(/(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/);return m?[+m[1],+m[2],+m[3]]:null;};
        $('k_p').oninput=e=>{cur=h2rgb(e.target.value);paint('pick');};
        $('k_hex').oninput=()=>{const c=h2rgb($('k_hex').value);$('k_hex').classList.toggle('bad',!c);if(c){cur=c;paint('hex');}};
        $('k_rgb').oninput=()=>{const n=nums($('k_rgb').value);$('k_rgb').classList.toggle('bad',!n);if(n){cur=n.map(v=>Math.min(255,v));paint('rgb');}};
        $('k_hsl').oninput=()=>{const n=nums($('k_hsl').value);$('k_hsl').classList.toggle('bad',!n);if(n){cur=h2rgb(hsl2hex(n[0]%360,Math.min(100,n[1]),Math.min(100,n[2])));paint('hsl');}};
        paint('init');
        host.insertAdjacentHTML('beforeend','<div class="btn-row"><button class="btn ghost" id="k_c1">Copier HEX</button><button class="btn ghost" id="k_c2">Copier RGB</button><button class="btn ghost" id="k_c3">Copier HSL</button></div>');
        $('k_c1').onclick=()=>copy(rgb2hex(cur));$('k_c2').onclick=()=>copy(sRgb());$('k_c3').onclick=()=>copy(sHsl());
      }],
      ['harm','Harmonies',host=>{
        host.innerHTML='<div class="row"><div class="field" style="flex:none"><label>Base</label><input type="color" id="m_p" value="#c7bce4" style="width:80px"></div><div class="field"><label>HEX</label><input type="text" id="m_t" value="#C7BCE4" spellcheck="false"></div></div><div id="m_out"></div>';
        function render(hx){
          const rgb=h2rgb(hx);if(!rgb)return;
          const[H,S,L]=rgb2hsl(rgb),up=rgb2hex(rgb),rot=d=>hsl2hex(H+d,S,L);
          const row=(t,c)=>'<div class="lbl" style="margin-top:16px">'+t+'</div>'+swatches(c);
          $('m_out').innerHTML=row('Complémentaire',[up,rot(180)])+row('Analogues',[rot(-30),up,rot(30)])+row('Triadique',[up,rot(120),rot(240)])+row('Tétradique',[up,rot(90),rot(180),rot(270)])+
            row('Nuances',[hsl2hex(H,S,Math.max(8,L-30)),hsl2hex(H,S,Math.max(8,L-15)),up,hsl2hex(H,S,Math.min(95,L+15)),hsl2hex(H,S,Math.min(95,L+30))]);
        }
        $('m_p').oninput=e=>{$('m_t').value=e.target.value.toUpperCase();render(e.target.value);};
        $('m_t').oninput=e=>{const ok=!!h2rgb(e.target.value);e.target.classList.toggle('bad',!ok);if(ok){$('m_p').value=rgb2hex(h2rgb(e.target.value)).toLowerCase();render(e.target.value);}};
        render('#C7BCE4');
      }],
      ['ctr','Contraste',host=>{
        host.innerHTML=
          '<div class="row"><div class="field"><label>Texte</label><div class="inline"><input type="color" id="x_t" value="#c7bce4"><input type="text" id="x_tt" value="#C7BCE4" spellcheck="false"></div></div>'+
          '<div class="field"><label>Fond</label><div class="inline"><input type="color" id="x_b" value="#06060a"><input type="text" id="x_bt" value="#06060A" spellcheck="false"></div></div></div>'+
          '<div class="preview-box" id="x_prev"><div style="font-family:var(--display);font-size:1.8rem;text-transform:uppercase">Texte normal</div><div style="font-size:.85rem;margin-top:6px">Petit texte d\'exemple — 0123456789</div></div><div id="x_out"></div>';
        const L=c=>{const a=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4);});return .2126*a[0]+.7152*a[1]+.0722*a[2];};
        function render(){
          const t=h2rgb($('x_tt').value),b=h2rgb($('x_bt').value);if(!t||!b)return;
          const l1=L(t),l2=L(b),r=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),ok=v=>'<span class="'+(v?'ok':'bad')+'">'+(v?'✓ conforme':'✗ insuffisant')+'</span>';
          $('x_prev').style.background=rgb2hex(b);$('x_prev').style.color=rgb2hex(t);
          $('x_out').innerHTML='<div class="out"><div class="line"><span>Ratio</span><span>'+r.toFixed(2)+' : 1</span></div><div class="line"><span>AA · texte normal (≥ 4,5)</span><span>'+ok(r>=4.5)+'</span></div>'+
            '<div class="line"><span>AAA · texte normal (≥ 7)</span><span>'+ok(r>=7)+'</span></div><div class="line"><span>AA · grand texte (≥ 3)</span><span>'+ok(r>=3)+'</span></div></div>';
        }
        [['x_t','x_tt'],['x_b','x_bt']].forEach(([a,b])=>{
          $(a).oninput=e=>{$(b).value=e.target.value.toUpperCase();render();};
          $(b).oninput=()=>{const ok=!!h2rgb($(b).value);$(b).classList.toggle('bad',!ok);if(ok){$(a).value=$(b).value.toLowerCase();render();}};
        });
        render();
      }],
      ['img','Depuis une image',host=>{
        host.innerHTML='<div class="btn-row" style="margin-top:0"><button class="btn ghost" id="i_pick">Choisir une image…</button><input type="file" id="i_file" accept="image/*" hidden></div><div id="i_out"></div>';
        $('i_pick').onclick=()=>$('i_file').click();
        $('i_file').onchange=async e=>{
          const f=e.target.files[0];if(!f)return;
          try{
            const img=await NOXE.imgP(f),view=scaled(img,640),o=$('i_out');
            o.innerHTML='<div class="info" style="margin-bottom:8px">Clique sur l\'image pour pipetter une couleur.</div><div class="canvas-frame" id="i_fr"></div><div id="i_pip"></div><div class="lbl" style="margin-top:16px">Couleurs dominantes</div><div id="i_pal"></div>';
            view.style.cursor='crosshair';$('i_fr').appendChild(view);
            $('i_pal').innerHTML=swatches(palette(view,8));
            view.onclick=ev=>{
              const r=view.getBoundingClientRect(),px=Math.min(view.width-1,Math.max(0,Math.floor((ev.clientX-r.left)*view.width/r.width))),py=Math.min(view.height-1,Math.max(0,Math.floor((ev.clientY-r.top)*view.height/r.height)));
              const d=view.getContext('2d').getImageData(px,py,1,1).data,h=rgb2hex([d[0],d[1],d[2]]);
              $('i_pip').innerHTML='<div class="info" style="margin-top:10px">Couleur choisie :</div>'+swatches([h]);
            };
          }catch(err){toast(err.message);}
        };
      }]
    ]);
  }
});

})();
