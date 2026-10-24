/* tools/base.js — le « moteur » des outils : registre, fenêtre, dépôt de fichiers, aides communes.
   Chaque fichier de catégorie (image.js, reseau.js…) appelle NOXE.register({...}) :
   la carte sur la page et la fenêtre de l'outil sont créées automatiquement.
   (v2 : la « fenêtre » est maintenant une page entière, adresse #/clé — voir app.js pour le routage.)

   Un outil = { key, cat, title, desc, words?, run(conteneur, ...) }
     image:true  → l'outil demande UNE image : run(conteneur, img, fichier)
     multi:true  → l'outil demande PLUSIEURS images : run(conteneur, [fichiers])
     (ni l'un ni l'autre) → run(conteneur) directement
   Options v2 :
     accept:'application/pdf,.pdf' → types de fichiers acceptés par la zone de dépôt (images par défaut)
     input:'id'   → champ principal, rempli par le « collage malin » de l'accueil
     mem:false    → ne pas mémoriser les champs de cet outil
   Options v3 :
     data-main    → sur un bouton : c'est lui que Ctrl+Entrée « clique » (sinon Ctrl+Entrée relance le calcul)
     data-result  → sur un élément : c'est LE résultat (copié par Ctrl+Maj+C, envoyé par « → Envoyer vers… »)
     NOXE.setResult({files:[…]}) → le résultat est un (ou des) fichier(s) ; {get:async()=>({files})} s'il faut le fabriquer */

const NOXE={
  tools:[],
  /* familles, dans l'ordre d'affichage : [clé, nom] */
  cats:[['fichiers','Fichiers'],['dev','Dev'],['notes','Notes'],['reseau','Réseau'],['elec','Électronique'],['texte','Texte & dates'],['memo','Mémo']],
  main:['fichiers','dev','notes'],                           // familles de l'accueil ; les autres vont dans « Autres outils »
  register:t=>NOXE.tools.push(t)
};

(function(){
  const view=$('toolView')||$('overlay'),modal=$('modal');  // page d'outil (index.html) ou ancienne fenêtre (tests.html)
  const urls=[],closers=[];
  let current=null,fileHook=null;

  /* ---------- aides utilisées par les outils ---------- */
  NOXE.onClose=fn=>closers.push(fn);                         // appelé quand la fenêtre se ferme
  NOXE.onFiles=fn=>{fileHook=fn;};                           // l'outil accepte des fichiers déposés n'importe où (ex. hash)
  NOXE.current=()=>current;                                  // clé de l'outil ouvert (ou null)
  NOXE.wantsFiles=()=>!!fileHook;
  /* l'outil t accepte-t-il le fichier f ? (accept = « image/* », « application/pdf,.pdf »…) */
  NOXE.accepts=(t,f)=>(t.image||t.multi)&&(t.accept||'image/*').split(',').some(a=>
    a.endsWith('/*')?f.type.startsWith(a.slice(0,-1)):a[0]==='.'?f.name.toLowerCase().endsWith(a):f.type===a);
  /* charge un script une seule fois (bibliothèques lourdes chargées seulement quand on en a besoin) */
  const libs={};
  NOXE.lib=src=>libs[src]||(libs[src]=new Promise((ok,ko)=>{
    const s=document.createElement('script');s.src=src;s.onload=ok;
    s.onerror=()=>{delete libs[src];ko(new Error('Chargement impossible : '+src));};
    document.head.appendChild(s);
  }));
  /* ---------- regex dans un Worker, avec délai maximum (v4 : partagé par « Regex » et « Rechercher / remplacer ») ----------
     Une expression « catastrophique » comme (a+)+$ ne peut pas figer la page : au-delà de NOXE.RX_TIMEOUT ms,
     on tue le Worker (terminate) et on en recrée un neuf au prochain essai.
     const R=NOXE.rxRunner();  R.run({pat,flags,text,rep?,count?}) → Promise {ms:[…≤1000], count, rep}
     Erreurs : e.code==='timeout' (trop long) ou 'abort' (un nouveau calcul a remplacé celui-ci, ou R.stop()). */
  NOXE.RX_TIMEOUT=1000;
  function rxWorker(){                                       // ce code est copié dans le Worker (il n'a pas accès à la page)
    onmessage=e=>{
      const {id,pat,flags,text,rep,count}=e.data;
      try{
        const g=flags.includes('g'),reG=new RegExp(pat,g?flags:flags+'g'),ms=[];let n=0;
        for(const m of text.matchAll(reG)){
          if(ms.length<1000)ms.push({index:m.index,m0:m[0],g:[...m].slice(1),groups:m.groups||null});
          n++;if(!g||(!count&&ms.length>=1000))break;
        }
        postMessage({id,ms,count:n,rep:rep==null?null:text.replace(new RegExp(pat,flags),rep)});
      }catch(err){postMessage({id,error:String(err&&err.message||err)});}
    };
  }
  let rxURL=null;
  NOXE.rxRunner=()=>{
    let w=null,seq=0,timer=null,fail=null;
    const err=c=>Object.assign(new Error(c==='timeout'?'Calcul trop long':'Annulé'),{code:c});
    const stop=()=>{if(w)w.terminate();w=null;clearTimeout(timer);timer=null;if(fail){const f=fail;fail=null;f(err('abort'));}};
    const run=(job,ms)=>{
      if(fail)stop();                                        // un calcul tourne encore : on l'abandonne
      return new Promise((ok,ko)=>{
        if(!rxURL)rxURL=URL.createObjectURL(new Blob(['('+rxWorker+')()'],{type:'text/javascript'}));
        if(!w)w=new Worker(rxURL);
        const id=++seq;fail=ko;
        w.onmessage=e=>{if(e.data.id!==id)return;clearTimeout(timer);timer=null;fail=null;e.data.error?ko(new Error(e.data.error)):ok(e.data);};
        timer=setTimeout(()=>{fail=null;if(w)w.terminate();w=null;timer=null;ko(err('timeout'));},ms||NOXE.RX_TIMEOUT);
        w.postMessage(Object.assign({},job,{id}));
      });
    };
    return {run,stop};
  };
  /* URL d'aperçu d'un fichier : UNE seule par fichier (v4), libérée à la fermeture de l'outil ou par NOXE.unurl(fichier).
     (v3 en recréait une à chaque redessin : fuite mémoire tant que l'outil restait ouvert.) */
  const byBlob=new Map();
  NOXE.urlOf=blob=>{let u=byBlob.get(blob);if(!u){u=URL.createObjectURL(blob);byBlob.set(blob,u);}return u;};
  NOXE.unurl=blob=>{const u=blob&&byBlob.get(blob);if(u){URL.revokeObjectURL(u);byBlob.delete(blob);}};
  NOXE.liveUrls=()=>byBlob.size+urls.length;                  // pour les tests
  NOXE.stem=f=>f.name.replace(/\.[^.]+$/,'');                // nom de fichier sans extension
  NOXE.cv=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;};
  NOXE.url=blob=>{const u=URL.createObjectURL(blob);urls.push(u);return u;};
  NOXE.download=(blob,name)=>{
    const u=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),3000);
  };
  NOXE.imgP=file=>new Promise((ok,ko)=>{
    const img=new Image();
    img.onload=()=>ok(img);
    img.onerror=()=>ko(new Error('Image illisible : '+file.name));
    img.src=NOXE.url(file);
  });
  NOXE.toBlob=(c,type,q)=>new Promise(r=>c.toBlob(r,type,q));
  NOXE.bytes=n=>n<1000?n+' o':n<1e6?(n/1e3).toFixed(n<1e4?1:0)+' Ko':(n/1e6).toFixed(n<1e7?2:1)+' Mo';
  /* copie réduite d'une image/canvas (côté max = max px), sous forme de <canvas> */
  NOXE.scaled=(src,max)=>{
    const s=Math.min(1,max/Math.max(src.width,src.height)),c=NOXE.cv(src.width*s,src.height*s);
    c.getContext('2d').drawImage(src,0,0,c.width,c.height);
    return c;
  };
  /* groupe de boutons « segmenté » : un seul actif ; cb(valeur) à chaque clic. Chaque bouton porte data-v. */
  NOXE.seg=(el,cb)=>{
    const box=typeof el==='string'?$(el):el,bs=box.querySelectorAll('button');
    bs.forEach(b=>b.onclick=()=>{bs.forEach(x=>x.classList.remove('active'));b.classList.add('active');cb(b.dataset.v,b);});
  };
  /* onglets : list = [[clé, libellé, fonction(conteneur)], ...] ; renvoie {show, cur} */
  NOXE.tabs=(host,list,first)=>{
    host.innerHTML='<div class="segmented tabs">'+list.map(t=>'<button data-v="'+t[0]+'">'+t[1]+'</button>').join('')+'</div><div class="tab-body"></div>';
    const bar=host.querySelector('.tabs'),body=host.querySelector('.tab-body');
    let cur=null;
    const show=k=>{
      cur=k;
      bar.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.v===k));
      body.innerHTML='';list.find(t=>t[0]===k)[2](body);
      NOXE.restore(body);                                    // remet les dernières valeurs de cet onglet
    };
    bar.querySelectorAll('button').forEach(b=>b.onclick=()=>show(b.dataset.v));
    show(first||list[0][0]);
    NOXE._tabs={show,cur:()=>cur};                           // pour ouvrir un onglet précis depuis l'accueil
    return NOXE._tabs;
  };
  /* bloc de résultats : rows = [[étiquette, valeur], ...] ; un clic sur une ligne copie la valeur */
  NOXE.out=(rows,cls)=>'<div class="out'+(cls?' '+cls:'')+'">'+rows.map(r=>
    r[1]==null?'<div class="line head"><span>'+esc(r[0])+'</span><span></span></div>':
    '<div class="line" data-copy="'+esc(r[1])+'"><span>'+esc(r[0])+'</span><span>'+esc(r[1])+'</span></div>').join('')+'</div>';
  /* texte d'un panneau d'outil (entrées + résultats) en Markdown, pour le carnet */
  NOXE.extract=root=>{
    const t=el=>el.textContent.replace(/\s+/g,' ').trim(),parts=[],ins=[];
    root.querySelectorAll('.field').forEach(f=>{
      const lab=f.querySelector('label'),inp=f.querySelector('input,select,textarea');
      if(!lab||!inp||inp.type==='password'||inp.type==='range'||inp.type==='file'||inp.type==='checkbox')return;
      const v=inp.tagName==='SELECT'?inp.options[inp.selectedIndex].text:inp.value;
      if(!v||v.length>1500)return;
      ins.push(inp.tagName==='TEXTAREA'&&v.includes('\n')?'**'+t(lab)+'**\n```\n'+v+'\n```':'- '+t(lab)+' : '+v);
    });
    if(ins.length)parts.push('## Entrées\n'+ins.join('\n'));
    const res=[];
    root.querySelectorAll('.out').forEach(o=>res.push([...o.querySelectorAll('.line')].map(l=>{
      const c=l.children;return l.classList.contains('head')?'\n**'+t(c[0])+'**':'- '+t(c[0])+' : '+t(c[1]);}).join('\n')));
    root.querySelectorAll('.codebox').forEach(c=>res.push('```\n'+c.textContent.trim()+'\n```'));
    root.querySelectorAll('table.tbl').forEach(tb=>{
      const rows=[...tb.querySelectorAll('tr')].map(r=>[...r.children].map(c=>t(c).replace(/\|/g,'/')));
      if(!rows.length)return;
      res.push('| '+rows[0].join(' | ')+' |\n|'+rows[0].map(()=>'---').join('|')+'|\n'+rows.slice(1).map(r=>'| '+r.join(' | ')+' |').join('\n'));
    });
    root.querySelectorAll('textarea[readonly]').forEach(a=>{if(a.value.trim())res.push('```\n'+a.value.trim()+'\n```');});
    if(res.length)parts.push('## Résultat\n'+res.join('\n\n'));
    return parts.join('\n\n');
  };
  /* les données-à-copier : un clic sur n'importe quel élément portant data-copy copie sa valeur */
  modal.addEventListener('click',e=>{const el=e.target.closest('[data-copy]');if(el)copy(el.dataset.copy);});

  /* ---------- ZIP (sans compression, sans dépendance) ---------- */
  const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
  const crc32=u8=>{let c=0xFFFFFFFF;for(let i=0;i<u8.length;i++)c=crcT[(c^u8[i])&255]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};
  NOXE.zip=async entries=>{                                  // entries = [{name, blob}]
    const parts=[],central=[],te=new TextEncoder();let offset=0;
    const d=new Date(),dt=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),tm=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1);
    for(const e of entries){
      const data=new Uint8Array(await e.blob.arrayBuffer()),name=te.encode(e.name),crc=crc32(data);
      const lh=new DataView(new ArrayBuffer(30));
      lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);lh.setUint16(6,0x0800,true);lh.setUint16(10,tm,true);lh.setUint16(12,dt,true);
      lh.setUint32(14,crc,true);lh.setUint32(18,data.length,true);lh.setUint32(22,data.length,true);lh.setUint16(26,name.length,true);
      parts.push(lh.buffer,name,data);
      const ch=new DataView(new ArrayBuffer(46));
      ch.setUint32(0,0x02014b50,true);ch.setUint16(4,20,true);ch.setUint16(6,20,true);ch.setUint16(8,0x0800,true);ch.setUint16(12,tm,true);ch.setUint16(14,dt,true);
      ch.setUint32(16,crc,true);ch.setUint32(20,data.length,true);ch.setUint32(24,data.length,true);ch.setUint16(28,name.length,true);ch.setUint32(42,offset,true);
      central.push(ch.buffer,name);
      offset+=30+name.length+data.length;
    }
    const csize=central.reduce((a,b)=>a+b.byteLength,0),end=new DataView(new ArrayBuffer(22));
    end.setUint32(0,0x06054b50,true);end.setUint16(8,entries.length,true);end.setUint16(10,entries.length,true);end.setUint32(12,csize,true);end.setUint32(16,offset,true);
    return new Blob([...parts,...central,end.buffer],{type:'application/zip'});
  };

  /* ---------- favoris & récents (mémorisés dans le navigateur) ---------- */
  NOXE.favs=()=>getLS('averse-fav',[]);
  NOXE.isFav=k=>NOXE.favs().includes(k);
  NOXE.toggleFav=k=>{
    const f=NOXE.favs(),i=f.indexOf(k);
    if(i<0)f.push(k);else f.splice(i,1);
    setLS('averse-fav',f);return i<0;
  };
  NOXE.recents=()=>getLS('averse-recent',[]);
  const pushRecent=k=>{const r=NOXE.recents().filter(x=>x!==k);r.unshift(k);setLS('averse-recent',r.slice(0,8));};

  /* ---------- mémoire des champs : chaque outil retrouve ses dernières valeurs ----------
     stockage : averse-in = { cléOutil: { idDuChamp: valeur } }
     jamais mémorisés : mots de passe, fichiers, champs en lecture seule, champs autocomplete="off" (clés secrètes) */
  const MEM='averse-in',MAXLEN=20000;
  const skip=el=>!el.id||el.readOnly||/^(password|file|hidden|button|submit)$/.test(el.type)||el.autocomplete==='off';
  const memOn=()=>{const t=NOXE.tools.find(x=>x.key===current);return current&&!NOXE.noPersist&&!(t&&t.mem===false);};
  function remember(e){
    const el=e.target;
    if(!memOn()||!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||skip(el)||!el.closest('#toolBody'))return;
    const all=getLS(MEM,{}),m=all[current]||(all[current]={});
    const v=el.type==='checkbox'||el.type==='radio'?el.checked:el.value;
    delete m[el.id];                                         // supprimer puis remettre : l'ordre des clés = ordre des modifications
    if(!(typeof v==='string'&&v.length>MAXLEN))m[el.id]=v;
    setLS(MEM,all);
  }
  modal.addEventListener('input',remember);modal.addEventListener('change',remember);
  NOXE.restore=root=>{
    if(!memOn())return;
    const m=getLS(MEM,{})[current];if(!m)return;
    /* dans l'ordre où tu les as modifiés : le dernier champ touché gagne (ex. HEX puis RGB dans « Couleurs ») */
    Object.keys(m).forEach(id=>{
      const el=root.querySelector('#'+CSS.escape(id));
      if(!el||!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)||skip(el))return;
      const v=m[id];
      if(el.type==='checkbox'||el.type==='radio'){if(el.checked===!!v)return;el.checked=!!v;}
      else{
        if(el.value===String(v))return;
        if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===v))return;
        el.value=v;
      }
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    });
  };
  /* remplit un champ comme si on l'avait tapé (les outils réagissent à « input ») */
  NOXE.fill=(el,v)=>{
    if(typeof el==='string')el=$(el);if(!el)return false;
    el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  };

  /* ---------- le résultat principal d'un outil (v3) ----------
     sert à Ctrl+Maj+C (copier) et au chaînage « → Envoyer vers… ».
     Ordre : résultat donné par l'outil (fichiers) → [data-result] → zone de texte en lecture seule → codebox → première ligne copiable */
  let given=null,files=null;
  NOXE.setResult=r=>{given=r||null;};
  /* les fichiers affichés par l'outil, pour le clic droit (ctxmenu.js) : les éléments portent data-fi="index"
     spec = {get:i=>({file, out?:Blob produit, name?:nom d'export, pages?}), rename?:(i,nom), remove?:i} */
  NOXE.fileItems=spec=>{files=spec||null;};
  NOXE.fileSpec=()=>files;
  NOXE.result=async()=>{
    if(!current)return null;
    if(given){const r=given.get?await given.get():given;if(r&&r.files&&r.files.length)return{files:r.files};if(r&&r.text)return{text:r.text};}
    const body=$('toolBody');if(!body)return null;
    const val=el=>el.dataset.copy!=null&&el.dataset.copy!==''?el.dataset.copy:el.value!=null&&el.tagName!=='BUTTON'?el.value:el.textContent;
    const cands=[...body.querySelectorAll('[data-result]'),...body.querySelectorAll('textarea[readonly]'),...body.querySelectorAll('.codebox[data-copy]'),...body.querySelectorAll('.out .line[data-copy]')];
    for(const el of cands){const v=val(el);if(v&&v.trim()&&v.trim()!=='—')return{text:v};}
    return null;
  };
  /* où peut-on envoyer ce résultat ? [clé, options d'ouverture] */
  const CHAIN={
    text:[['json'],['base64',{tab:'enc'}],['url'],['encodage'],['regex'],['qr'],['carnet']],
    image:[['optimiser'],['convertir'],['editeur'],['ocr'],['pdf']],
    pdf:[['pdfoutils']]
  };
  const kindOf=r=>!r?null:r.text!=null?'text':r.files.every(f=>/^image\//.test(f.type))?'image':r.files.every(f=>f.type==='application/pdf'||/\.pdf$/i.test(f.name))?'pdf':'file';
  NOXE.chainTargets=r=>{
    const k=kindOf(r);
    if(k==='file')return[['encodage'],['base64']].filter(x=>x[0]!==current);
    return(CHAIN[k]||[]).filter(([key])=>{
      const t=NOXE.tools.find(x=>x.key===key);if(!t)return false;
      if(key===current&&key!=='pdfoutils')return false;     // pas vers soi-même (sauf PDF : fusionner puis découper)
      if(t.image&&r.files&&r.files.length>1)return false;   // l'éditeur ne prend qu'une image
      return true;
    });
  };
  NOXE.sendTo=async(key,r)=>{
    r=r||await NOXE.result();if(!r)return false;
    const c=CHAIN.text.find(x=>x[0]===key),t=NOXE.tools.find(x=>x.key===key);
    if(r.files)return openTool(key,{files:r.files});
    return openTool(key,Object.assign({text:r.text,input:t&&t.input},c&&c[1]||{}));
  };
  /* Ctrl+Entrée : le bouton principal de l'outil, sinon on relance le calcul du champ principal */
  NOXE.runMain=()=>{
    const body=$('toolBody');if(!current||!body)return false;
    const b=[...body.querySelectorAll('[data-main]')].find(x=>!x.disabled&&x.offsetParent!==null);
    if(b){b.click();return true;}
    const t=NOXE.tools.find(x=>x.key===current),a=document.activeElement;
    const el=a&&body.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)?a:t&&t.input&&$(t.input);
    if(el){el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return true;}
    return false;
  };
  /* Ctrl+Maj+C : copier le résultat principal */
  NOXE.copyMain=async()=>{
    const r=await NOXE.result();
    if(!r){toast('Pas encore de résultat à copier');return false;}
    if(r.files){toast('Le résultat est un fichier : utilise « → Envoyer vers… » ou Télécharger');return false;}
    copy(r.text,'Résultat copié');return true;
  };
  /* le menu « → Envoyer vers… » */
  function sendMenu(btn){
    let m=$('sendMenu');
    if(m){m.remove();btn.setAttribute('aria-expanded','false');return;}
    m=document.createElement('div');m.id='sendMenu';m.className='send-menu';m.setAttribute('role','menu');
    m.innerHTML='<div class="sm-title">…</div>';
    btn.parentNode.appendChild(m);btn.setAttribute('aria-expanded','true');
    NOXE.result().then(r=>{
      if(!m.isConnected)return;
      const list=r?NOXE.chainTargets(r):[];
      const what=!r?'':r.files?(r.files.length>1?r.files.length+' fichiers':r.files[0].name):'texte · '+r.text.length+' car.';
      m.innerHTML=!r?'<div class="sm-title">Pas encore de résultat à envoyer.</div>':
        '<div class="sm-title">Envoyer '+esc(what)+' vers :</div>'+(list.length?list.map(([k])=>{const t=NOXE.tools.find(x=>x.key===k);
          return'<button type="button" role="menuitem" data-send="'+k+'">'+esc(t.title)+'</button>';}).join(''):'<div class="sm-title">Aucun outil compatible.</div>');
      const f=m.querySelector('[data-send]');if(f)f.focus();
      m.onclick=e=>{const b=e.target.closest('[data-send]');if(b){m.remove();NOXE.sendTo(b.dataset.send,r);}};
      m.onkeydown=e=>{
        const bs=[...m.querySelectorAll('[data-send]')],i=bs.indexOf(document.activeElement);
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(bs.length)bs[(i+(e.key==='ArrowDown'?1:-1)+bs.length)%bs.length].focus();}
      };
    });
  }
  addEventListener('keydown',e=>{                            // Échap ferme d'abord le menu (sans fermer l'outil)
    const m=$('sendMenu');if(m&&e.key==='Escape'){e.preventDefault();e.stopPropagation();m.remove();const b=$('toSend');if(b)b.focus();}
  },true);
  document.addEventListener('click',e=>{const m=$('sendMenu');if(m&&!e.target.closest('#sendMenu,#toSend'))m.remove();});

  /* ---------- page d'outil ---------- */
  function cleanup(){
    closers.splice(0).forEach(f=>{try{f();}catch(e){}});
    urls.splice(0).forEach(u=>{try{URL.revokeObjectURL(u);}catch(e){}});
    byBlob.forEach(u=>{try{URL.revokeObjectURL(u);}catch(e){}});byBlob.clear();
    fileHook=null;NOXE._tabs=null;given=null;files=null;
  }
  function closeTool(){
    if(!current&&!view.classList.contains('on'))return;
    cleanup();current=null;
    view.classList.remove('on');modal.innerHTML='';
    document.body.classList.remove('in-tool');
    if(/^#\/./.test(location.hash)&&location.hash!=='#/autres')history.pushState(null,'','#/');
    if(NOXE.afterClose)NOXE.afterClose();                    // l'accueil reprend la main (app.js)
  }
  NOXE.close=closeTool;

  /* preset : [fichiers]  ou  {files, tab, text, input}  (tab = onglet à ouvrir, text = valeur du champ principal) */
  function openTool(key,preset){
    const t=NOXE.tools.find(x=>x.key===key);if(!t)return false;
    cleanup();current=key;
    view.classList.add('on');document.body.classList.add('in-tool');
    if(location.hash!=='#/'+key)history.pushState(null,'','#/'+key);
    pushRecent(key);
    const pre=Array.isArray(preset)?{files:preset}:preset||{};
    const cat=(NOXE.cats.find(c=>c[0]===t.cat)||['',''])[1],fav=NOXE.isFav(key);
    modal.innerHTML='<div class="modal-top"><div class="modal-eyebrow"><a href="#/">recherche</a> / '+esc(cat)+'</div><div class="modal-actions">'+
      '<button class="modal-star'+(fav?' on':'')+'" id="toStar" aria-pressed="'+fav+'" title="Favori">'+(fav?'★':'☆')+'</button>'+
      '<button class="modal-send" id="toSend" aria-haspopup="menu" aria-expanded="false" title="Envoyer le résultat vers un autre outil">→ Envoyer vers…</button>'+
      '<button class="modal-note" id="toNote" title="Envoyer le résultat dans le carnet">→ Carnet</button>'+
      '<button class="modal-close" aria-label="Retour à la recherche (Échap)" title="Retour à la recherche (Échap)">✕</button></div></div>'+
      '<h2>'+esc(t.title)+'</h2>'+
      '<p class="modal-description">'+esc(t.desc)+'</p><div id="toolBody"></div>';
    modal.querySelector('.modal-close').onclick=closeTool;
    const body=$('toolBody');
    $('toNote').onclick=()=>{
      const md=NOXE.extract(body);
      if(!md){toast('Rien à envoyer pour l\'instant');return;}
      const d=new Date().toLocaleDateString('fr-FR');
      addToNotebook(t.title+' — '+d,md,['outil']);
      toast('Ajouté au carnet — Ctrl+J pour le voir');
      if(NOXE.notesChanged)NOXE.notesChanged();              // rafraîchit le panneau Ctrl+J s'il est ouvert
    };
    $('toSend').onclick=e=>sendMenu(e.currentTarget);
    $('toStar').onclick=e=>{
      const on=NOXE.toggleFav(key),b=e.currentTarget;
      b.classList.toggle('on',on);b.textContent=on?'★':'☆';b.setAttribute('aria-pressed',on);
      toast(on?'Ajouté aux favoris':'Retiré des favoris');
    };
    body.onclick=e=>{if(e.target.closest('[data-again]'))openTool(key);};     // bouton « Autre image »

    try{
      if(t.image||t.multi){
        const many=!!t.multi,acc=t.accept||'image/*',isImg=acc==='image/*';
        const okType=f=>NOXE.accepts(t,f);
        body.innerHTML='<div class="dropzone" id="drop" tabindex="0" role="button"><p>Glisse '+(isImg?(many?'tes images':'une image'):(many?'tes fichiers':'un fichier'))+' ici ou <b>clique pour choisir</b></p>'+
          '<small>'+esc(t.hint||'PNG · JPG · WEBP · GIF')+' — les fichiers restent sur ton appareil</small></div>'+
          '<input type="file" id="file" accept="'+esc(acc)+'" '+(many?'multiple ':'')+'hidden><div class="tool-panel" id="prev"></div>';
        const drop=$('drop'),input=$('file');
        const take=list=>{
          const files=[...list].filter(okType);
          if(!files.length){toast(isImg?'Choisis un fichier image':'Type de fichier non accepté ici');return;}
          const start=async()=>{
            drop.style.display='none';
            const p=$('prev');p.classList.add('on');p.innerHTML='';
            try{
              if(many)await t.run(p,files);
              else{const img=await NOXE.imgP(files[0]);await t.run(p,img,files[0]);}
            }catch(err){console.error(err);toast(err.message||'Erreur dans l\'outil');}
          };
          start();
        };
        drop.onclick=()=>input.click();
        drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click();}};
        input.onchange=()=>take(input.files);
        ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('hot');}));
        ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('hot');}));
        drop.addEventListener('drop',e=>take(e.dataTransfer.files));
        if(pre.files&&pre.files.length)take(pre.files);        // fichiers déjà choisis (ex. depuis « Optimiser »)
        /* v4 : Ctrl+V d'une image (capture d'écran…) directement dans l'outil, hors champs de saisie */
        const onPaste=e=>{
          const tg=e.target;if(tg&&tg.closest&&tg.closest('input,textarea,[contenteditable]'))return;
          const fs=[...((e.clipboardData&&e.clipboardData.files)||[])].filter(okType);
          if(fs.length){e.preventDefault();openTool(key,{files:fs});}
        };
        document.addEventListener('paste',onPaste);NOXE.onClose(()=>document.removeEventListener('paste',onPaste));
      }else{
        body.classList.add('tool-panel','on');
        t.run(body);
        NOXE.restore(body);
        if(pre.tab&&NOXE._tabs)NOXE._tabs.show(pre.tab);
        if(pre.text!=null)NOXE.fill(pre.input||t.input,pre.text);   // le collage malin passe après la mémoire
        if(pre.files&&fileHook)fileHook(pre.files);
      }
    }catch(err){console.error(err);toast('Erreur dans l\'outil');}
    scrollTo(0,0);
    setTimeout(()=>{
      if(current!==key)return;
      const f=body.querySelector('textarea:not([readonly]),input[type=text],input[type=number],input:not([type]),#drop');
      (f||modal.querySelector('.modal-close')).focus({preventScroll:true});
    },20);
    return true;
  }
  NOXE.open=openTool;

  if(view.classList.contains('overlay'))view.addEventListener('click',e=>{if(e.target===view)closeTool();});
  addEventListener('keydown',e=>{
    if(!current)return;
    if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();closeTool();}
  });
})();
