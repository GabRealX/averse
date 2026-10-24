/* tools/image.js — IMAGES en lot : optimiser (poids, taille, format), convertir et assembler en PDF.
   (L'édition d'une seule image — recadrer, pivoter, retoucher… — est dans editeur.js.) */
(function(){
const {register,seg,imgP,toBlob,cv,bytes,download,zip,stem}=NOXE;
const EXT={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const pct=(after,before)=>{const d=Math.round((1-after/before)*100);return d>=0?'−'+d+' %':'+'+(-d)+' %';};
const load=f=>createImageBitmap(f).catch(()=>imgP(f));          // createImageBitmap respecte l'orientation EXIF

/* ===================== Optimiser des images ===================== */
/* o = réglages de départ {fmt, q, max} : « Optimiser » et « Convertir » partagent le même code */
function optimise(p,files,o){
    let fmt=o.fmt,q=o.q,max=o.max,token=0,timer,results=[],names=[];   // names[i] = nom d'export choisi (clic droit → Renommer)
    p.innerHTML=
      '<div class="group"><div class="row">'+
        '<div class="field"><label>Format</label><div class="segmented" id="ofmt"><button data-v="auto" class="active">Identique</button>'+
          '<button data-v="image/jpeg">JPG</button><button data-v="image/webp">WEBP</button><button data-v="image/png">PNG</button></div></div>'+
        '<div class="field"><label>Côté le plus long (px)</label><input type="number" id="omax" min="0" max="12000" value="2000"></div></div>'+
        '<div class="field" id="oq"><label>Qualité <b id="oqv">82</b></label><input type="range" id="oqr" min="30" max="100" value="82"></div></div>'+
      '<div class="info">Taille 0 = garder les dimensions d\'origine. Une image n\'est jamais agrandie.</div>'+
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Fichier</th><th>Avant</th><th>Après</th><th></th></tr></thead><tbody id="orows"></tbody></table></div>'+
      '<div class="info" id="osum"></div><div id="ocmp"></div>'+
      '<div class="btn-row"><button class="btn primary" id="ozip" data-main>Télécharger</button><button class="btn ghost" data-again>Autres images</button></div>';
    p.querySelectorAll('#ofmt button').forEach(b=>b.classList.toggle('active',b.dataset.v===fmt));   // réglages de départ
    $('omax').value=max;$('oqr').value=q;$('oqv').textContent=q;$('oq').style.display=fmt==='image/png'?'none':'flex';

    function draw(){
      const body=$('orows');if(!body)return;
      body.innerHTML=files.map((f,i)=>{
        const r=results[i];
        const after=!r?'<td class="dim">…</td>':r.err?'<td class="bad">'+esc(r.err)+'</td>':
          '<td>'+bytes(r.after)+' <span class="dim">'+(r.kept?'(déjà optimal)':r.before?'('+pct(r.after,r.before)+')':'')+'</span></td>';
        if(r&&r.blob&&!r.url)r.url=NOXE.urlOf(r.blob);           // une seule URL par fichier (libérée plus bas)
        const th=r&&r.url?'<img src="'+r.url+'" alt="" data-cmp="'+i+'" style="width:44px;height:44px;object-fit:cover;border:1px solid var(--line-2);cursor:zoom-in">':'';
        return'<tr data-fi="'+i+'"><td>'+th+'</td><td>'+esc(r&&r.name?r.name:f.name)+'</td><td class="dim">'+bytes(f.size)+'</td>'+after+
          '<td>'+(r&&r.blob?'<button class="btn ghost" style="padding:5px 9px" data-i="'+i+'">↓</button>':'')+'</td></tr>';
      }).join('');
      const ok=results.filter(r=>r&&r.blob);
      const b=ok.reduce((a,r)=>a+r.before,0),a=ok.reduce((s,r)=>s+r.after,0);
      $('osum').innerHTML=ok.length?'Total : <b>'+bytes(b)+'</b> → <b>'+bytes(a)+'</b>'+(b?' ('+pct(a,b)+')':''):'';
      $('ozip').textContent=ok.length>1?'Tout télécharger (.zip)':'Télécharger';
      $('ozip').disabled=!ok.length;
    }
    async function process(){
      if(!$('orows'))return;                                 // outil fermé pendant l'attente
      const my=++token,mine=new Array(files.length).fill(null);
      results.forEach(r=>{if(r&&r.blob&&!files.includes(r.blob))NOXE.unurl(r.blob);});   // v4 : les anciens résultats libèrent leur aperçu
      results=mine;draw();
      for(let i=0;i<files.length;i++){
        if(my!==token||!$('orows'))return;
        const f=files[i];
        try{
          const bmp=await load(f),longest=Math.max(bmp.width,bmp.height),scale=max>0&&longest>max?max/longest:1;
          let type=fmt==='auto'?(EXT[f.type]?f.type:'image/png'):fmt;
          const c=cv(bmp.width*scale,bmp.height*scale),x=c.getContext('2d');
          if(type==='image/jpeg'){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);}      // le JPG n'a pas de transparence
          x.imageSmoothingQuality='high';x.drawImage(bmp,0,0,c.width,c.height);
          if(bmp.close)bmp.close();
          let blob=await toBlob(c,type,q/100),kept=false;
          if(my!==token)return;
          if(!blob||blob.type!==type){mine[i]={err:'format non supporté ici'};}
          else{
            if(scale===1&&type===f.type&&blob.size>=f.size){blob=f;kept=true;}
            mine[i]={blob,kept,name:names[i]||stem(f)+'.'+EXT[type],before:f.size,after:blob.size};
          }
        }catch(e){if(my===token)mine[i]={err:/hei[cf]/i.test(f.type+f.name)?'HEIC illisible ici (seul Safari sait le lire)':'illisible'};}
        if(my===token)draw();
      }
    }
    const later=()=>{clearTimeout(timer);timer=setTimeout(process,250);};
    /* clic droit sur une ligne (ctxmenu.js) */
    NOXE.fileItems({
      get:i=>files[i]&&{file:files[i],out:results[i]&&results[i].blob,name:results[i]&&results[i].name||files[i].name},
      rename:(i,n)=>{names[i]=n;if(results[i]&&results[i].blob)results[i].name=n;draw();},
      remove:i=>{NOXE.unurl(files[i]);files.splice(i,1);names.splice(i,1);process();}
    });
    seg('ofmt',v=>{fmt=v;$('oq').style.display=v==='image/png'?'none':'flex';later();});
    $('omax').oninput=e=>{max=Math.max(0,+e.target.value||0);later();};
    $('oqr').oninput=e=>{q=+e.target.value;$('oqv').textContent=q;later();};
    function compare(i){
      const r=results[i],f=files[i];if(!r||!r.url)return;
      const o=NOXE.urlOf(f),box=$('ocmp');
      box.innerHTML='<div class="row" style="margin-top:14px;gap:10px">'+
        '<div class="field"><label>Avant <b>'+bytes(f.size)+'</b></label><div class="canvas-frame"><img src="'+o+'" alt=""></div></div>'+
        '<div class="field"><label>Après <b>'+bytes(r.after)+'</b></label><div class="canvas-frame"><img src="'+r.url+'" alt=""></div></div></div>'+
        '<div class="btn-row"><button class="btn ghost" id="oed">Ouvrir dans l\'éditeur</button><button class="btn ghost" id="ocl">Fermer</button></div>';
      $('ocl').onclick=()=>{box.innerHTML='';};
      $('oed').onclick=()=>NOXE.open('editeur',[new File([r.blob],r.name,{type:r.blob.type})]);
    }
    $('orows').onclick=e=>{const m=e.target.closest('[data-cmp]');if(m){compare(+m.dataset.cmp);return;}const b=e.target.closest('[data-i]');if(!b)return;const r=results[+b.dataset.i];if(r&&r.blob)download(r.blob,r.name);};
    NOXE.setResult({get:()=>({files:results.filter(r=>r&&r.blob).map(r=>new File([r.blob],r.name,{type:r.blob.type}))})});   // pour le chaînage
    $('ozip').onclick=async()=>{
      const ok=results.filter(r=>r&&r.blob);
      if(ok.length===1){download(ok[0].blob,ok[0].name);return;}
      const seen={},entries=ok.map(r=>{
        let n=r.name;if(seen[n]){const m=/^(.*)(\.[^.]+)$/.exec(n);n=m[1]+'-'+(++seen[r.name])+m[2];}else seen[n]=1;
        return{name:n,blob:r.blob};
      });
      download(await zip(entries),'images-optimisees.zip');toast(entries.length+' images dans le ZIP');
    };
    process();
}
register({
  key:'optimiser',cat:'fichiers',title:'Optimiser des images',multi:true,
  words:'compresser redimensionner jpg png webp poids taille zip lot',
  desc:'Réduis le poids et la taille de plusieurs images d\'un coup, ou change leur format. Résultat en ZIP.',
  run(p,files){optimise(p,files,{fmt:'auto',q:82,max:2000});}
});
/* ===================== Convertir des images ===================== */
register({
  key:'convertir',cat:'fichiers',title:'Convertir des images',multi:true,
  words:'convertir format png jpg jpeg webp heic transformer extension',
  desc:'Change le format de tes images (PNG, JPG, WEBP) sans les redimensionner. HEIC : seulement si ton navigateur sait le lire (Safari).',
  run(p,files){optimise(p,files,{fmt:'image/png',q:92,max:0});}
});

/* ===================== Images en PDF ===================== */
register({
  key:'pdf',cat:'fichiers',title:'Images en PDF',multi:true,
  words:'pdf scan documents photos assembler',
  desc:'Assemble des images (scans, photos de cours…) en un seul PDF. Réordonne les pages comme tu veux.',
  run(p,files){
    let pv=0,list=files.slice(),size='a4',margin=10,quality=85;
    p.innerHTML=
      '<div class="out" id="plist"></div>'+
      '<div class="lbl" style="margin-top:18px">Aperçu des pages</div><div id="pprev" style="display:flex;gap:12px;flex-wrap:wrap;margin-top:8px"></div>'+
      '<div class="group"><div class="row">'+
        '<div class="field"><label>Page</label><div class="segmented" id="psz"><button data-v="a4" class="active">A4</button><button data-v="letter">Lettre</button><button data-v="img">Taille de l\'image</button></div></div>'+
        '<div class="field"><label>Marge</label><div class="segmented" id="pmg"><button data-v="0">0</button><button data-v="10" class="active">10 mm</button><button data-v="20">20 mm</button></div></div></div>'+
        '<div class="field"><label>Qualité des images <b id="pqv">85</b></label><input type="range" id="pq" min="50" max="100" value="85"></div></div>'+
      '<div class="btn-row"><button class="btn primary" id="pgo" data-main>Créer le PDF</button><button class="btn ghost" data-again>Autres images</button></div>'+
      '<div class="info" id="pinfo"></div>';

    function draw(){
      $('plist').innerHTML=list.map((f,i)=>
        '<div class="line" data-fi="'+i+'"><span style="display:flex;align-items:center;gap:10px;text-transform:none;letter-spacing:0;font-size:.78rem;color:var(--fg)">'+
          '<img src="'+NOXE.urlOf(f)+'" alt="" style="width:34px;height:34px;object-fit:cover;border:1px solid var(--line-2)">'+(i+1)+'. '+esc(f.name)+'</span>'+
        '<span style="display:flex;gap:6px"><button class="btn ghost" style="padding:4px 9px" data-up="'+i+'">↑</button><button class="btn ghost" style="padding:4px 9px" data-dn="'+i+'">↓</button>'+
        '<button class="btn ghost" style="padding:4px 9px" data-rm="'+i+'">✕</button></span></div>').join('');
      $('pgo').disabled=!list.length;
      preview();
    }
    NOXE.fileItems({                                       // clic droit sur une page (ctxmenu.js)
      get:i=>list[i]&&{file:list[i],name:list[i].name},
      rename:(i,n)=>{NOXE.unurl(list[i]);list[i]=new File([list[i]],n,{type:list[i].type,lastModified:list[i].lastModified});draw();},
      remove:i=>{NOXE.unurl(list[i]);list.splice(i,1);draw();}
    });
    const dims=new Map();
    const dimOf=f=>dims.has(f)?Promise.resolve(dims.get(f)):load(f).then(b=>{const d=[b.width,b.height];if(b.close)b.close();dims.set(f,d);return d;});
    async function preview(){
      const my=++pv,box=$('pprev');if(!box)return;
      const ds=await Promise.all(list.map(dimOf).map(pr=>pr.catch(()=>[1,1])));
      if(my!==pv||!$('pprev'))return;
      box.innerHTML=list.map((f,i)=>{
        const [w,h]=ds[i];let PW,PH;
        if(size==='img'){PW=w+margin*3.78*2;PH=h+margin*3.78*2;}
        else{[PW,PH]=size==='a4'?[210,297]:[215.9,279.4];if(w>h)[PW,PH]=[PH,PW];}
        const W=size==='img'?Math.min(120,Math.max(70,PW/PH*130)):(PW>PH?130:92),m=size==='img'?margin*3.78:margin;
        return'<div data-fi="'+i+'" style="text-align:center"><div style="width:'+W+'px;aspect-ratio:'+PW+'/'+PH+';background:#fff;padding:'+(m/PW*100)+'%;box-sizing:border-box;display:flex;border:1px solid var(--line-2)">'+
          '<img src="'+NOXE.urlOf(f)+'" alt="" style="width:100%;height:100%;object-fit:contain"></div><div class="info" style="margin-top:4px">'+(i+1)+'</div></div>';
      }).join('');
    }
    $('plist').onclick=e=>{
      const b=e.target.closest('button');if(!b)return;
      const sw=(i,j)=>{if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];};
      if(b.dataset.up!=null)sw(+b.dataset.up,+b.dataset.up-1);
      else if(b.dataset.dn!=null)sw(+b.dataset.dn,+b.dataset.dn+1);
      else if(b.dataset.rm!=null){NOXE.unurl(list[+b.dataset.rm]);list.splice(+b.dataset.rm,1);}
      draw();
    };
    seg('psz',v=>{size=v;preview();});seg('pmg',v=>{margin=+v;preview();});
    $('pq').oninput=e=>{quality=+e.target.value;$('pqv').textContent=quality;};

    async function build(){
      const MM=72/25.4,pages=[];
      for(const f of list){
        const bmp=await load(f),sc=Math.min(1,2400/Math.max(bmp.width,bmp.height));
        const c=cv(bmp.width*sc,bmp.height*sc),x=c.getContext('2d');
        x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(bmp,0,0,c.width,c.height);
        if(bmp.close)bmp.close();
        const blob=await toBlob(c,'image/jpeg',quality/100);
        pages.push({w:c.width,h:c.height,data:new Uint8Array(await blob.arrayBuffer())});
      }
      const enc=new TextEncoder(),chunks=[],offs=[];let len=0;
      const add=x=>{const u=typeof x==='string'?enc.encode(x):x;chunks.push(u);len+=u.length;};
      const obj=(n,fn)=>{offs[n]=len;add(n+' 0 obj\n');fn();add('endobj\n');};
      const n=pages.length,f2=v=>v.toFixed(2);
      add('%PDF-1.4\n');
      obj(1,()=>add('<</Type/Catalog/Pages 2 0 R>>\n'));
      obj(2,()=>add('<</Type/Pages/Kids['+pages.map((_,i)=>(5+i*3)+' 0 R').join(' ')+']/Count '+n+'>>\n'));
      pages.forEach((pg,i)=>{
        const m=margin*MM;
        let PW,PH;
        if(size==='img'){PW=pg.w*.75+2*m;PH=pg.h*.75+2*m;}
        else{[PW,PH]=size==='a4'?[595.276,841.89]:[612,792];if(pg.w>pg.h)[PW,PH]=[PH,PW];}
        const sc=Math.min((PW-2*m)/pg.w,(PH-2*m)/pg.h),dw=pg.w*sc,dh=pg.h*sc,x=(PW-dw)/2,y=(PH-dh)/2;
        const im=3+i*3,ct=4+i*3,pgN=5+i*3,stream='q '+f2(dw)+' 0 0 '+f2(dh)+' '+f2(x)+' '+f2(y)+' cm /Im0 Do Q';
        obj(im,()=>{add('<</Type/XObject/Subtype/Image/Width '+pg.w+'/Height '+pg.h+'/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length '+pg.data.length+'>>\nstream\n');add(pg.data);add('\nendstream\n');});
        obj(ct,()=>add('<</Length '+stream.length+'>>\nstream\n'+stream+'\nendstream\n'));
        obj(pgN,()=>add('<</Type/Page/Parent 2 0 R/MediaBox[0 0 '+f2(PW)+' '+f2(PH)+']/Resources<</XObject<</Im0 '+im+' 0 R>>>>/Contents '+ct+' 0 R>>\n'));
      });
      const xref=len,total=3+3*n;
      let t='xref\n0 '+total+'\n0000000000 65535 f \n';
      for(let i=1;i<total;i++)t+=String(offs[i]).padStart(10,'0')+' 00000 n \n';
      add(t+'trailer\n<</Size '+total+'/Root 1 0 R>>\nstartxref\n'+xref+'\n%%EOF');
      return new Blob(chunks,{type:'application/pdf'});
    }
    NOXE.setResult({get:async()=>list.length?{files:[new File([await build()],'images.pdf',{type:'application/pdf'})]}:null});   // pour le chaînage
    $('pgo').onclick=async()=>{
      if(!list.length)return;
      $('pgo').disabled=true;$('pinfo').textContent='Création du PDF…';
      try{
        const blob=await build();
        download(blob,'images.pdf');
        if($('pinfo'))$('pinfo').innerHTML='<b>'+list.length+' page'+(list.length>1?'s':'')+'</b> · '+bytes(blob.size);
      }catch(e){console.error(e);toast('Création impossible');if($('pinfo'))$('pinfo').textContent='';}
      if($('pgo'))$('pgo').disabled=!list.length;
    };
    draw();
  }
});

})();
