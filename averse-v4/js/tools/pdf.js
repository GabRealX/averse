/* tools/pdf.js — PDF : fusionner plusieurs PDF, ou extraire / découper des pages.
   Utilise pdf-lib (licence MIT), copiée dans js/vendor/ : chargée seulement quand on ouvre l'outil, et marche hors ligne. */
(function(){
const {register,seg,bytes,download,zip,stem}=NOXE;
const LIB='js/vendor/pdf-lib.min.js';

/* « 1-3, 5, 8- » → [0,1,2,4,7,8,…] (index à partir de 0) ; vide = toutes les pages ; renvoie null si invalide */
NOXE.pageRanges=(str,max)=>{
  const s=str.replace(/\s+/g,'');
  if(!s)return Array.from({length:max},(_,i)=>i);
  const res=[];
  for(const part of s.split(/[,;]/)){
    if(!part)continue;
    const m=/^(\d*)(-?)(\d*)$/.exec(part);if(!m||(!m[1]&&!m[3]))return null;
    const a=m[1]?+m[1]:1,b=m[2]?(m[3]?+m[3]:max):a;
    if(a<1||b>max||a>b)return null;
    for(let i=a;i<=b;i++)res.push(i-1);
  }
  return res.length?res:null;
};

register({
  key:'pdfoutils',cat:'fichiers',title:'Fusionner / découper des PDF',multi:true,accept:'application/pdf,.pdf',hint:'PDF',
  words:'pdf fusionner assembler joindre combiner découper séparer extraire pages diviser merge split',
  desc:'Assemble plusieurs PDF en un seul (dans l\'ordre que tu veux), ou extrais des pages (1-3, 5…). Tout se fait dans ton navigateur.',
  async run(p,files){
    p.innerHTML='<div class="info">Chargement de pdf-lib…</div>';
    await NOXE.lib(LIB);
    const {PDFDocument}=window.PDFLib;
    const docs=[],bad=[];
    for(const f of files){
      try{const doc=await PDFDocument.load(await f.arrayBuffer(),{ignoreEncryption:true});docs.push({file:f,doc,pages:doc.getPageCount()});}
      catch(e){bad.push(f.name);}
    }
    if(!$('prev'))return;                                    // la page a été quittée pendant le chargement
    p.innerHTML=(bad.length?'<div class="info bad">Illisible(s) : '+esc(bad.join(', '))+'</div>':'')+'<div id="pd_tabs"></div>'+
      '<div class="btn-row"><button class="btn ghost" data-again>Autres PDF</button></div><div class="info" id="pd_info"></div>';
    if(!docs.length)return;
    const info=t=>{if($('pd_info'))$('pd_info').innerHTML=t;};
    const save=async(doc,name)=>{const b=new Blob([await doc.save()],{type:'application/pdf'});download(b,name);
      NOXE.setResult({files:[new File([b],name,{type:'application/pdf'})]});   // le PDF obtenu peut repartir vers un autre outil
      return b;};

    NOXE.tabs($('pd_tabs'),[
      ['merge','Fusionner',host=>{
        const list=docs.slice();
        host.innerHTML='<div class="out" id="pd_list"></div><div class="btn-row"><button class="btn primary" id="pd_go" data-main>Fusionner</button></div>';
        function draw(){
          const total=list.reduce((a,d)=>a+d.pages,0);
          $('pd_list').innerHTML=list.map((d,i)=>
            '<div class="line" data-fi="'+i+'"><span style="text-transform:none;letter-spacing:0;font-size:.78rem;color:var(--fg)">'+(i+1)+'. '+esc(d.file.name)+' <span class="dim">· '+d.pages+' p.</span></span>'+
            '<span style="display:flex;gap:6px"><button class="btn ghost" style="padding:4px 9px" data-up="'+i+'">↑</button><button class="btn ghost" style="padding:4px 9px" data-dn="'+i+'">↓</button>'+
            '<button class="btn ghost" style="padding:4px 9px" data-rm="'+i+'">✕</button></span></div>').join('');
          $('pd_go').textContent='Fusionner ('+total+' page'+(total>1?'s':'')+')';
          $('pd_go').disabled=list.length<1;
        }
        NOXE.fileItems({                                   // clic droit sur un PDF de la liste (ctxmenu.js)
          get:i=>list[i]&&{file:list[i].file,name:list[i].file.name,pages:list[i].pages},
          rename:(i,n)=>{const d=list[i];d.file=new File([d.file],n,{type:'application/pdf'});draw();   // sert aussi au nom des extraits
            const o=$('pd_f')&&$('pd_f').options[docs.indexOf(d)];if(o)o.textContent=n+' ('+d.pages+' p.)';},
          remove:i=>{list.splice(i,1);draw();}
        });
        $('pd_list').onclick=e=>{
          const b=e.target.closest('button');if(!b)return;
          const sw=(i,j)=>{if(j>=0&&j<list.length)[list[i],list[j]]=[list[j],list[i]];};
          if(b.dataset.up!=null)sw(+b.dataset.up,+b.dataset.up-1);
          else if(b.dataset.dn!=null)sw(+b.dataset.dn,+b.dataset.dn+1);
          else if(b.dataset.rm!=null)list.splice(+b.dataset.rm,1);
          draw();
        };
        $('pd_go').onclick=async()=>{
          $('pd_go').disabled=true;info('Fusion…');
          try{
            const out=await PDFDocument.create();
            for(const d of list){(await out.copyPages(d.doc,d.doc.getPageIndices())).forEach(pg=>out.addPage(pg));}
            const b=await save(out,'fusion.pdf');
            info('<b>fusion.pdf</b> · '+out.getPageCount()+' pages · '+bytes(b.size));
          }catch(e){console.error(e);info('<span class="bad">Fusion impossible : '+esc(e.message)+'</span>');}
          if($('pd_go'))$('pd_go').disabled=false;
        };
        draw();
      }],
      ['split','Extraire / découper',host=>{
        let mode='one';
        host.innerHTML=
          '<div class="row"><div class="field"><label>Fichier</label><select id="pd_f">'+docs.map((d,i)=>'<option value="'+i+'">'+esc(d.file.name)+' ('+d.pages+' p.)</option>').join('')+'</select></div>'+
          '<div class="field"><label>Pages (vide = toutes)</label><input type="text" id="pd_r" spellcheck="false" placeholder="ex : 1-3, 5, 8-"></div></div>'+
          '<div class="field" style="margin-top:12px"><label>Résultat</label><div class="segmented" id="pd_m"><button data-v="one" class="active">Un seul PDF avec ces pages</button><button data-v="each">Un PDF par page (ZIP)</button></div></div>'+
          '<div class="info" id="pd_sel"></div><div class="btn-row"><button class="btn primary" id="pd_cut" data-main>Extraire</button></div>';
        const cur=()=>docs[+$('pd_f').value]||docs[0];
        function check(){
          const d=cur(),r=NOXE.pageRanges($('pd_r').value,d.pages);
          $('pd_r').classList.toggle('bad',!r);
          $('pd_sel').innerHTML=r?r.length+' page'+(r.length>1?'s':'')+' sélectionnée'+(r.length>1?'s':''):'<span class="bad">Pages invalides (le fichier en a '+d.pages+').</span>';
          $('pd_cut').disabled=!r;return r;
        }
        seg('pd_m',v=>{mode=v;});
        $('pd_f').onchange=check;$('pd_r').oninput=check;
        $('pd_cut').onclick=async()=>{
          const d=cur(),r=check();if(!r)return;
          $('pd_cut').disabled=true;info('Extraction…');
          try{
            if(mode==='one'){
              const out=await PDFDocument.create();
              (await out.copyPages(d.doc,r)).forEach(pg=>out.addPage(pg));
              const b=await save(out,stem(d.file)+'-extrait.pdf');
              info('<b>'+r.length+' pages</b> · '+bytes(b.size));
            }else{
              const entries=[];
              for(const i of r){
                const out=await PDFDocument.create();out.addPage((await out.copyPages(d.doc,[i]))[0]);
                entries.push({name:stem(d.file)+'-p'+String(i+1).padStart(3,'0')+'.pdf',blob:new Blob([await out.save()],{type:'application/pdf'})});
              }
              download(await zip(entries),stem(d.file)+'-pages.zip');info('<b>'+entries.length+' PDF</b> dans le ZIP');
            }
          }catch(e){console.error(e);info('<span class="bad">Extraction impossible : '+esc(e.message)+'</span>');}
          if($('pd_cut'))$('pd_cut').disabled=false;
        };
        check();
      }]
    ],docs.length>1?'merge':'split');
  }
});
})();
