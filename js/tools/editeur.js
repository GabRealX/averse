/* tools/editeur.js — ÉDITEUR D'IMAGE : une seule image, plusieurs opérations à la suite.
   Chaque onglet agit sur l'image « en cours » ; « Appliquer » valide l'étape, « Annuler » revient en arrière,
   « Télécharger » exporte le résultat final. */
(function(){
const {register,seg,cv,toBlob,download,stem,scaled}=NOXE;
const lum=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const hex2rgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h);if(!m)return[255,255,255];const n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255];};

/* ---- réglages colorimétriques (calculés pixel par pixel : fonctionne sur tous les navigateurs) ---- */
function applyFx(imgData,st){
  const d=imgData.data,b=st.bri/100,k=st.con/100,s=st.sat/100;
  for(let i=0;i<d.length;i+=4){
    let r=d[i]*b,g=d[i+1]*b,bl=d[i+2]*b;
    r=(r-128)*k+128;g=(g-128)*k+128;bl=(bl-128)*k+128;
    const l=lum(r,g,bl);r=l+(r-l)*s;g=l+(g-l)*s;bl=l+(bl-l)*s;
    if(st.mode==='gray'){r=g=bl=lum(r,g,bl);}
    else if(st.mode==='sepia'){const nr=.393*r+.769*g+.189*bl,ng=.349*r+.686*g+.168*bl,nb=.272*r+.534*g+.131*bl;r=nr;g=ng;bl=nb;}
    else if(st.mode==='invert'){r=255-r;g=255-g;bl=255-bl;}
    d[i]=r;d[i+1]=g;d[i+2]=bl;
  }
}

/* ---- fond transparent : on part des bords et on efface ce qui ressemble à la couleur du fond ---- */
function boxBlur(src,w,h,r){
  const tmp=new Float32Array(w*h),out=new Float32Array(w*h),win=2*r+1;
  for(let y=0;y<h;y++){const row=y*w;let s=0;
    for(let k=-r;k<=r;k++)s+=src[row+Math.min(w-1,Math.max(0,k))];
    for(let x=0;x<w;x++){tmp[row+x]=s/win;s+=src[row+Math.min(w-1,x+r+1)]-src[row+Math.max(0,x-r)];}}
  for(let x=0;x<w;x++){let s=0;
    for(let k=-r;k<=r;k++)s+=tmp[Math.min(h-1,Math.max(0,k))*w+x];
    for(let y=0;y<h;y++){out[y*w+x]=s/win;s+=tmp[Math.min(h-1,y+r+1)*w+x]-tmp[Math.max(0,y-r)*w+x];}}
  return out;
}
function cutout(d,w,h,tol,feather,ref,seedPt){
  const out=new Uint8ClampedArray(d);let ar,ag,ab;
  if(ref){[ar,ag,ab]=ref;}
  else{let sr=0,sg=0,sb=0,n=0;const add=p=>{sr+=d[p*4];sg+=d[p*4+1];sb+=d[p*4+2];n++;};
    for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}
    ar=sr/n;ag=sg/n;ab=sb/n;}
  const t=tol*tol*3,vis=new Uint8Array(w*h),stack=[];
  const seed=p=>{if(vis[p])return;const i=p*4,dr=d[i]-ar,dg=d[i+1]-ag,db=d[i+2]-ab;if(dr*dr+dg*dg+db*db<=t){vis[p]=1;stack.push(p);}};
  for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
  if(seedPt!=null)seed(seedPt);
  while(stack.length){const p=stack.pop(),x=p%w,y=(p/w)|0;
    if(x>0)seed(p-1);if(x<w-1)seed(p+1);if(y>0)seed(p-w);if(y<h-1)seed(p+w);}
  let m=null;
  if(feather>0){m=new Float32Array(w*h);for(let p=0;p<w*h;p++)m[p]=vis[p];m=boxBlur(m,w,h,feather);}
  for(let p=0;p<w*h;p++){const a=m?1-m[p]:(vis[p]?0:1);out[p*4+3]=Math.round(d[p*4+3]*Math.max(0,Math.min(1,a)));}
  return out;
}

register({
  key:'editeur',cat:'fichiers',title:'Éditeur d\'image',image:true,
  words:'recadrer pivoter retourner miroir redimensionner luminosité contraste filtre noir blanc sépia filigrane fond transparent détourer',
  desc:'Recadre, redimensionne, pivote, règle les couleurs, ajoute un filigrane ou retire le fond — étape par étape, sur la même image.',
  run(p,img,file){
    let work=scaled(img,4096);                        // image en cours (limitée à 4096 px pour rester fluide)
    const hist=[];
    p.innerHTML=
      '<div id="etabs"></div>'+
      '<div class="btn-row" style="margin-top:22px;padding-top:16px;border-top:1px solid var(--line)">'+
        '<button class="btn ghost" id="eundo">Annuler</button>'+
        '<select id="efmt" style="width:auto"><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WEBP</option></select>'+
        '<button class="btn primary" id="edl" data-main>Télécharger</button><button class="btn ghost" data-again>Autre image</button></div>'+
      '<div class="info" id="einfo"></div>';
    const api={
      get:()=>work,
      set:c=>{hist.push(work);if(hist.length>8)hist.shift();work=c;refresh();}
    };
    let T;
    function refresh(){
      $('einfo').innerHTML='Image en cours : <b>'+work.width+' × '+work.height+'</b> px';
      $('eundo').disabled=!hist.length;
      T.show(T.cur());
    }
    const frame=(host,c)=>{host.insertAdjacentHTML('afterbegin','<div class="canvas-frame" id="eframe"></div>');$('eframe').appendChild(c);};

    /* ----- Recadrer ----- */
    function panelCrop(host){
      const sc=Math.min(1,600/work.width,360/work.height),cw=Math.max(1,Math.round(work.width*sc)),ch=Math.max(1,Math.round(work.height*sc));
      host.innerHTML=
        '<div class="canvas-frame crop-frame" id="cwrap"><canvas id="cropc"></canvas><div class="crop-sel" id="csel">'+['nw','n','ne','e','se','s','sw','w'].map(h=>'<i data-h="'+h+'"></i>').join('')+'</div></div>'+
        '<div class="group"><div class="field"><label>Ratio</label><div class="segmented" id="crs"><button data-v="0" class="active">Libre</button><button data-v="1">1:1</button><button data-v="1.3333">4:3</button><button data-v="1.7778">16:9</button><button data-v="0.75">3:4</button></div></div></div>'+
        '<div class="btn-row"><button class="btn primary" id="capply">Appliquer le recadrage</button></div><div class="info" id="cinf"></div>';
      const c=$('cropc'),wrap=$('cwrap'),sel=$('csel');
      c.width=cw;c.height=ch;c.getContext('2d').drawImage(work,0,0,cw,ch);
      let box={l:cw*.08,t:ch*.08,r:cw*.92,b:ch*.92},ratio=0,act=null;
      const MIN=10,TOL=16,clamp=(v,a,z)=>Math.max(a,Math.min(z,v));
      const toC=e=>{const r=c.getBoundingClientRect();return{x:clamp((e.clientX-r.left)*cw/r.width,0,cw),y:clamp((e.clientY-r.top)*ch/r.height,0,ch)};};
      const inside=pt=>pt.x>box.l&&pt.x<box.r&&pt.y>box.t&&pt.y<box.b;
      function hit(pt){
        const mx=(box.l+box.r)/2,my=(box.t+box.b)/2,k=cw/c.getBoundingClientRect().width;
        const hs={nw:[box.l,box.t],n:[mx,box.t],ne:[box.r,box.t],e:[box.r,my],se:[box.r,box.b],s:[mx,box.b],sw:[box.l,box.b],w:[box.l,my]};
        for(const n in hs)if(Math.hypot(pt.x-hs[n][0],pt.y-hs[n][1])<TOL*k)return n;return null;
      }
      function render(){
        if(!wrap.isConnected)return;
        const cr=c.getBoundingClientRect(),wr=wrap.getBoundingClientRect(),kx=cr.width/cw,ky=cr.height/ch;
        const ox=cr.left-wr.left-wrap.clientLeft,oy=cr.top-wr.top-wrap.clientTop;
        sel.style.left=(ox+box.l*kx)+'px';sel.style.top=(oy+box.t*ky)+'px';
        sel.style.width=((box.r-box.l)*kx)+'px';sel.style.height=((box.b-box.t)*ky)+'px';
        $('cinf').innerHTML='Zone : <b>'+Math.round((box.r-box.l)/sc)+' × '+Math.round((box.b-box.t)/sc)+'</b> px';
      }
      function fitRatio(){
        if(!ratio)return;
        const cx=(box.l+box.r)/2,cy=(box.t+box.b)/2;let w=box.r-box.l,h=w/ratio;
        if(h>box.b-box.t){h=box.b-box.t;w=h*ratio;}
        const k=Math.min(1,cw/w,ch/h);w*=k;h*=k;
        const l=clamp(cx-w/2,0,cw-w),t=clamp(cy-h/2,0,ch-h);box={l,t,r:l+w,b:t+h};
      }
      function resize(name,pt,s){
        if(!ratio){let{l,t,r,b}=s;
          if(name.includes('w'))l=Math.min(pt.x,s.r-MIN);if(name.includes('e'))r=Math.max(pt.x,s.l+MIN);
          if(name.includes('n'))t=Math.min(pt.y,s.b-MIN);if(name.includes('s'))b=Math.max(pt.y,s.t+MIN);
          box={l,t,r,b};return;}
        const fx=name.includes('w')?'r':name.includes('e')?'l':'c',fy=name.includes('n')?'b':name.includes('s')?'t':'c';
        const ax=fx==='r'?s.r:fx==='l'?s.l:(s.l+s.r)/2,ay=fy==='b'?s.b:fy==='t'?s.t:(s.t+s.b)/2;
        let w=Math.abs(pt.x-ax),h=Math.abs(pt.y-ay);
        if(fx==='c')w=h*ratio;else if(fy==='c')h=w/ratio;else{w=Math.max(w,h*ratio);h=w/ratio;}
        const maxW=fx==='r'?ax:fx==='l'?cw-ax:2*Math.min(ax,cw-ax),maxH=fy==='b'?ay:fy==='t'?ch-ay:2*Math.min(ay,ch-ay);
        const k=Math.min(1,maxW/w,maxH/h);w=Math.max(MIN,w*k);h=w/ratio;
        const l=fx==='r'?ax-w:fx==='l'?ax:ax-w/2,t=fy==='b'?ay-h:fy==='t'?ay:ay-h/2;box={l,t,r:l+w,b:t+h};
      }
      function newBox(pt){
        let dx=pt.x-act.x,dy=pt.y-act.y;
        if(ratio){const w=Math.max(Math.abs(dx),Math.abs(dy)*ratio),h=w/ratio||1;
          const k=Math.min(1,(dx<0?act.x:cw-act.x)/(w||1),(dy<0?act.y:ch-act.y)/h);
          dx=(dx<0?-1:1)*w*k;dy=(dy<0?-1:1)*h*k;}
        const x1=act.x+dx,y1=act.y+dy;box={l:Math.min(act.x,x1),r:Math.max(act.x,x1),t:Math.min(act.y,y1),b:Math.max(act.y,y1)};
      }
      wrap.onpointerdown=e=>{
        const pt=toC(e),h=hit(pt);
        act=h?{mode:'resize',name:h,s:{...box}}:inside(pt)?{mode:'move',x:pt.x,y:pt.y,s:{...box}}:{mode:'new',x:pt.x,y:pt.y,prev:{...box}};
        wrap.setPointerCapture(e.pointerId);e.preventDefault();
      };
      wrap.onpointermove=e=>{
        const pt=toC(e);
        if(!act){wrap.style.cursor=hit(pt)?'pointer':inside(pt)?'move':'crosshair';return;}
        if(act.mode==='move'){const dx=clamp(pt.x-act.x,-act.s.l,cw-act.s.r),dy=clamp(pt.y-act.y,-act.s.t,ch-act.s.b);box={l:act.s.l+dx,r:act.s.r+dx,t:act.s.t+dy,b:act.s.b+dy};}
        else if(act.mode==='resize')resize(act.name,pt,act.s);else newBox(pt);
        render();
      };
      wrap.onpointerup=wrap.onpointercancel=()=>{if(act&&act.mode==='new'&&(box.r-box.l<MIN||box.b-box.t<MIN))box=act.prev;act=null;render();};
      seg('crs',v=>{ratio=+v;fitRatio();render();});
      const onR=()=>render();addEventListener('resize',onR);NOXE.onClose(()=>removeEventListener('resize',onR));
      $('capply').onclick=()=>{
        const inv=1/sc,sx=Math.round(box.l*inv),sy=Math.round(box.t*inv);
        const sw=Math.max(1,Math.min(work.width-sx,Math.round((box.r-box.l)*inv))),sh=Math.max(1,Math.min(work.height-sy,Math.round((box.b-box.t)*inv)));
        const oc=cv(sw,sh);oc.getContext('2d').drawImage(work,sx,sy,sw,sh,0,0,sw,sh);api.set(oc);
      };
      render();
    }

    /* ----- Taille ----- */
    function panelSize(host){
      const W=work.width,H=work.height,ratio=W/H,MAX=8000;
      host.innerHTML=
        '<div class="group"><div class="row"><div class="field"><label>Largeur (px)</label><input type="number" id="rw" min="1" max="'+MAX+'" value="'+W+'"></div>'+
        '<div class="field"><label>Hauteur (px)</label><input type="number" id="rh" min="1" max="'+MAX+'" value="'+H+'"></div></div>'+
        '<label class="check"><input type="checkbox" id="lk" checked> Garder les proportions</label>'+
        '<div class="field"><label>Raccourcis</label><div class="segmented" id="pc"><button data-v="25">25 %</button><button data-v="50">50 %</button><button data-v="75">75 %</button><button data-v="200">200 %</button></div></div></div>'+
        '<div class="btn-row"><button class="btn primary" id="rapply">Appliquer la taille</button></div>';
      const rw=$('rw'),rh=$('rh'),lock=()=>$('lk').checked;
      rw.oninput=()=>{if(lock())rh.value=Math.max(1,Math.round(rw.value/ratio));};
      rh.oninput=()=>{if(lock())rw.value=Math.max(1,Math.round(rh.value*ratio));};
      seg('pc',v=>{rw.value=Math.max(1,Math.round(W*v/100));rh.value=Math.max(1,Math.round(H*v/100));});
      $('rapply').onclick=()=>{
        const w=Math.min(MAX,Math.max(1,Math.round(+rw.value))),h=Math.min(MAX,Math.max(1,Math.round(+rh.value)));
        const oc=cv(w,h),x=oc.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(work,0,0,w,h);api.set(oc);
      };
    }

    /* ----- Pivoter / miroir (s'applique tout de suite) ----- */
    function panelRotate(host){
      host.innerHTML='<div class="group"><div class="segmented"><button id="rl">↺ 90°</button><button id="rr">↻ 90°</button><button id="fh">⇋ Miroir horizontal</button><button id="fv">⇅ Miroir vertical</button></div></div>';
      frame(host,scaled(work,560));
      const rot=a=>{
        const w=work.width,h=work.height,oc=cv(h,w),x=oc.getContext('2d');
        x.translate(oc.width/2,oc.height/2);x.rotate(a*Math.PI/180);x.drawImage(work,-w/2,-h/2);api.set(oc);
      };
      const flip=(sx,sy)=>{
        const oc=cv(work.width,work.height),x=oc.getContext('2d');
        x.translate(oc.width/2,oc.height/2);x.scale(sx,sy);x.drawImage(work,-work.width/2,-work.height/2);api.set(oc);
      };
      $('rl').onclick=()=>rot(-90);$('rr').onclick=()=>rot(90);$('fh').onclick=()=>flip(-1,1);$('fv').onclick=()=>flip(1,-1);
    }

    /* ----- Couleurs ----- */
    function panelColors(host){
      const st={bri:100,con:100,sat:100,mode:''};
      host.innerHTML=
        '<div class="group"><div class="field"><label>Luminosité <b id="bv">100</b></label><input type="range" id="bri" min="0" max="200" value="100"></div>'+
        '<div class="field"><label>Contraste <b id="cv">100</b></label><input type="range" id="con" min="0" max="200" value="100"></div>'+
        '<div class="field"><label>Saturation <b id="sv">100</b></label><input type="range" id="sat" min="0" max="200" value="100"></div>'+
        '<div class="field"><label>Filtre</label><div class="segmented" id="pre"><button data-v="" class="active">Aucun</button><button data-v="gray">Noir &amp; blanc</button><button data-v="sepia">Sépia</button><button data-v="invert">Négatif</button></div></div></div>'+
        '<div class="btn-row"><button class="btn primary" id="aapply">Appliquer les couleurs</button></div>';
      const src=scaled(work,560),c=cv(src.width,src.height),base=src.getContext('2d').getImageData(0,0,src.width,src.height);
      frame(host,c);
      let raf=false;
      const render=()=>{const d=new ImageData(new Uint8ClampedArray(base.data),base.width,base.height);applyFx(d,st);c.getContext('2d').putImageData(d,0,0);};
      const later=()=>{if(raf)return;raf=true;requestAnimationFrame(()=>{raf=false;render();});};
      [['bri','bv'],['con','cv'],['sat','sv']].forEach(([id,lab])=>$(id).oninput=e=>{st[id]=+e.target.value;$(lab).textContent=e.target.value;later();});
      seg('pre',v=>{st.mode=v;later();});
      $('aapply').onclick=()=>{
        const oc=cv(work.width,work.height),x=oc.getContext('2d');x.drawImage(work,0,0);
        const d=x.getImageData(0,0,oc.width,oc.height);applyFx(d,st);x.putImageData(d,0,0);api.set(oc);
      };
      render();
    }

    /* ----- Filigrane ----- */
    function panelMark(host){
      const st={text:'© Averse',size:5,op:40,pos:'br',color:'#ffffff'};
      host.innerHTML=
        '<div class="group"><div class="field"><label>Texte</label><input type="text" id="wt" value="© Averse"></div>'+
        '<div class="row"><div class="field"><label>Taille <b id="wsv">5</b>%</label><input type="range" id="ws" min="2" max="20" value="5"></div>'+
        '<div class="field"><label>Opacité <b id="wov">40</b>%</label><input type="range" id="wo" min="5" max="100" value="40"></div></div>'+
        '<div class="row"><div class="field" style="flex:none"><label>Couleur</label><input type="color" id="wc" value="#ffffff"></div>'+
        '<div class="field"><label>Position</label><div class="segmented" id="wp"><button data-v="br" class="active">Coin</button><button data-v="center">Centre</button><button data-v="tile">Mosaïque</button></div></div></div></div>'+
        '<div class="btn-row"><button class="btn primary" id="wapply">Appliquer le filigrane</button></div>';
      const view=scaled(work,560),c=cv(view.width,view.height);frame(host,c);
      function paint(x,src,W,H){
        x.clearRect(0,0,W,H);x.drawImage(src,0,0,W,H);
        const fs=Math.max(8,W*st.size/100),rgb=hex2rgb(st.color);
        x.font='600 '+fs+'px "JetBrains Mono", monospace';x.fillStyle='rgba('+rgb.join(',')+','+st.op/100+')';x.textBaseline='middle';
        if(st.pos==='tile'){x.save();x.translate(W/2,H/2);x.rotate(-.4);x.textAlign='center';
          const sx=x.measureText(st.text).width+fs*2,sy=fs*3.2;
          for(let yy=-H;yy<H;yy+=sy)for(let xx=-W;xx<W;xx+=sx)x.fillText(st.text,xx,yy);x.restore();}
        else if(st.pos==='center'){x.textAlign='center';x.fillText(st.text,W/2,H/2);}
        else{x.textAlign='right';const m=fs*.7;x.fillText(st.text,W-m,H-m);}
      }
      const render=()=>paint(c.getContext('2d'),view,c.width,c.height);
      $('wt').oninput=e=>{st.text=e.target.value;render();};
      $('ws').oninput=e=>{st.size=+e.target.value;$('wsv').textContent=e.target.value;render();};
      $('wo').oninput=e=>{st.op=+e.target.value;$('wov').textContent=e.target.value;render();};
      $('wc').oninput=e=>{st.color=e.target.value;render();};
      seg('wp',v=>{st.pos=v;render();});
      $('wapply').onclick=()=>{const oc=cv(work.width,work.height);paint(oc.getContext('2d'),work,oc.width,oc.height);api.set(oc);};
      render();
    }

    /* ----- Fond transparent ----- */
    function panelBg(host){
      const st={tol:42,feather:2,ref:null,seed:null};
      const src=scaled(work,800),w=src.width,h=src.height,base=src.getContext('2d').getImageData(0,0,w,h);
      host.innerHTML=
        '<div class="group"><div class="field"><label>Tolérance <b id="tv">42</b></label><input type="range" id="tol" min="8" max="120" value="42"></div>'+
        '<div class="field"><label>Adoucir les contours <b id="fv2">2</b></label><input type="range" id="fea" min="0" max="6" value="2"></div></div>'+
        '<div class="btn-row"><button class="btn primary" id="bapply">Retirer le fond</button><button class="btn ghost" id="bauto">Fond automatique</button></div>'+
        '<div class="info">Clique sur l\'image pour choisir la couleur du fond (par défaut : la couleur des bords). Marche surtout sur un fond uni. Exporte en PNG pour garder la transparence.</div>';
      const c=cv(w,h);c.style.cursor='crosshair';frame(host,c);
      const x=c.getContext('2d');let raf=false;
      const render=()=>x.putImageData(new ImageData(cutout(base.data,w,h,st.tol,st.feather,st.ref,st.seed),w,h),0,0);
      const later=()=>{if(raf)return;raf=true;requestAnimationFrame(()=>{raf=false;render();});};
      $('tol').oninput=e=>{st.tol=+e.target.value;$('tv').textContent=e.target.value;later();};
      $('fea').oninput=e=>{st.feather=+e.target.value;$('fv2').textContent=e.target.value;later();};
      c.onclick=e=>{
        const r=c.getBoundingClientRect(),px=Math.min(w-1,Math.max(0,Math.floor((e.clientX-r.left)*w/r.width))),py=Math.min(h-1,Math.max(0,Math.floor((e.clientY-r.top)*h/r.height)));
        const i=(py*w+px)*4;st.ref=[base.data[i],base.data[i+1],base.data[i+2]];st.seed=py*w+px;later();
      };
      $('bauto').onclick=()=>{st.ref=null;st.seed=null;later();};
      $('bapply').onclick=()=>{
        toast('Calcul…');
        setTimeout(()=>{
          const big=scaled(work,3000),bw=big.width,bh=big.height,bd=big.getContext('2d').getImageData(0,0,bw,bh);
          const f=st.feather?Math.max(1,Math.round(st.feather*bw/w)):0;
          const seed=st.seed==null?null:Math.min(bh-1,Math.round((Math.floor(st.seed/w))*bh/h))*bw+Math.min(bw-1,Math.round((st.seed%w)*bw/w));
          const out=cutout(bd.data,bw,bh,st.tol,f,st.ref,seed),oc=cv(bw,bh);
          oc.getContext('2d').putImageData(new ImageData(out,bw,bh),0,0);
          $('efmt').value='image/png';api.set(oc);
        },30);
      };
      render();
    }

    T=NOXE.tabs($('etabs'),[['crop','Recadrer',panelCrop],['size','Taille',panelSize],['rot','Pivoter',panelRotate],['col','Couleurs',panelColors],['mark','Filigrane',panelMark],['bg','Fond',panelBg]]);
    $('eundo').onclick=()=>{if(hist.length){work=hist.pop();refresh();}};
    /* résultat pour « → Envoyer vers… » : l'image telle qu'elle est maintenant, en PNG */
    NOXE.setResult({get:async()=>{const c=cv(work.width,work.height);c.getContext('2d').drawImage(work,0,0);
      const b=await toBlob(c,'image/png');return b?{files:[new File([b],stem(file)+'-edit.png',{type:'image/png'})]}:null;}});
    $('edl').onclick=async()=>{
      const type=$('efmt').value,c=cv(work.width,work.height),x=c.getContext('2d');
      if(type==='image/jpeg'){x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);}
      x.drawImage(work,0,0);
      const blob=await toBlob(c,type,.92);
      if(!blob||blob.type!==type){toast('Format non supporté par ce navigateur');return;}
      download(blob,stem(file)+'-edit.'+({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[type]));toast('Image exportée');
    };
    refresh();
  }
});

})();
