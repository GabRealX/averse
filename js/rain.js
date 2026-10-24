/* =====================================================================
   rain.js — la pluie en arrière-plan (fichier indépendant, tu peux l'ignorer)
   Effets : profondeur de champ (flou réel sur le plan lointain),
   traînées en dégradé avec tête nette, vent en rafales, éclaboussures
   avec gouttelettes soumises à la gravité, et gouttes de premier plan
   floues facon objectif. Cale ses temps sur le delta-time (fluide quel
   que soit le taux de rafraîchissement). N'a besoin que de <canvas id="rain">.
   v2 : désactivée par défaut (bouton « pluie » en bas de l'accueil, mémorisé dans averse-rain).
   Perf : plus aucun dégradé créé par goutte ni de flou plein écran à chaque image —
   chaque traînée est un petit « sprite » pré-rendu (déjà flouté pour le lointain et le premier plan).
   v7 : thèmes (densité / opacité / éclairs « Nuit d'orage »), rainBurst(ms) = grosse averse temporaire
   (easter egg), et canvas créé à la demande sur les pages qui n'en ont pas (carnet).
   ===================================================================== */
(function(){
let canvas=document.getElementById('rain');
/* pas de canvas (carnet) : rien ne tourne ; rainBurst le crée seulement s'il est demandé */
if(!canvas){
  window.rainBurst=function(ms){
    canvas=document.createElement('canvas');canvas.id='rain';
    Object.assign(canvas.style,{position:'fixed',inset:'0',zIndex:'0',pointerEvents:'none'});
    document.body.prepend(canvas);init(true);return window.rainBurst(ms);
  };
  window.rainOn=()=>false;window.rainSetColor=window.rainTheme=()=>{};
  return;
}
init(false);
function init(lazy){
  const ctx=canvas.getContext('2d');
  if(!ctx)return;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Couleur = teinte unique du site (--fg), pour rester sur deux couleurs */
  function readColor(){
    const v=getComputedStyle(document.documentElement).getPropertyValue('--fg').trim();
    const m=/#?([0-9a-f]{6})/i.exec(v);
    if(m){const n=parseInt(m[1],16);return[(n>>16)&255,(n>>8)&255,n&255];}
    return[199,188,228];
  }
  let COL=readColor(),AM=1;                         // AM : opacité globale (thème Papier = pluie discrète)
  const rgba=a=>'rgba('+COL[0]+','+COL[1]+','+COL[2]+','+Math.min(1,a*AM)+')';
  window.rainSetColor=function(){COL=readColor();makeSprites();};

  /* Sprite = une traînée verticale en dégradé (transparent en haut → couleur en bas), dessinée une seule fois.
     SPW de large, trait de 2 px au centre : on l'étire ensuite à la taille de chaque goutte. */
  const SPW=32,SPH=128;
  let sprNet,sprFar,sprBokeh;
  function sprite(blur){
    const c=document.createElement('canvas');c.width=SPW;c.height=SPH;
    const x=c.getContext('2d'),g=x.createLinearGradient(0,0,0,SPH);
    g.addColorStop(0,rgba(0));g.addColorStop(1,rgba(1));
    if(blur)x.filter='blur('+blur+'px)';                // le flou est calculé ici, une fois pour toutes
    x.fillStyle=g;x.fillRect(SPW/2-1,blur*2,2,SPH-blur*4);
    return c;
  }
  function makeSprites(){sprNet=sprite(0);sprFar=sprite(3);sprBokeh=sprite(1.2);}
  makeSprites();

  let W=0,H=0,dpr=1;
  let near=[],fars=[],bokeh=[],ripples=[],bits=[];
  let enabled=false,burst=0,burstT=0,wasOn=false;
  /* jamais réglé : pluie coupée… sauf en « Nuit d'orage » où elle fait partie du thème */
  const pref=()=>{try{const v=localStorage.getItem('averse-rain');if(v)return v==='on';}catch(e){}
    return!!(window.THEME&&THEME.def().storm);};
  enabled=!lazy&&pref();
  let t=0,last=performance.now(),running=enabled&&!document.hidden,raf=0;
  const rnd=(a,b)=>a+Math.random()*(b-a);

  /* Une goutte. speed en px/s ; longueur ~ proportionnelle à la vitesse (flou de mouvement) */
  function makeDrop(kind){
    let sp,al,wd;
    if(kind==='far'){ sp=rnd(130,300); al=rnd(.05,.12); wd=rnd(.6,1.1); }
    else            { sp=rnd(480,860); al=rnd(.16,.34); wd=rnd(1,1.9); }
    return{x:Math.random()*W,y:Math.random()*H,sp:sp,al:al,wd:wd,len:sp*rnd(.05,.08)};
  }
  function makeBokeh(){
    const sp=rnd(560,980);
    return{x:Math.random()*W,y:rnd(-H,H),sp:sp,al:rnd(.03,.07),wd:rnd(5,12),len:sp*rnd(.07,.11)};
  }

  function resize(){
    dpr=Math.min(2,window.devicePixelRatio||1);
    W=innerWidth;H=innerHeight;
    canvas.width=W*dpr;canvas.height=H*dpr;
    canvas.style.width=W+'px';canvas.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);

    acols=[];
    const th=window.THEME?THEME.def():{rain:1};
    const density=(reduce?0.12:0.32)*(th.rain||1)*(burst?(reduce?1.6:3):1);
    const total=Math.round(W*density);
    near=[];fars=[];bokeh=[];
    for(let i=0;i<total*0.45;i++)near.push(makeDrop('near'));
    for(let i=0;i<total*0.55;i++)fars.push(makeDrop('far'));
    if(!reduce)for(let i=0;i<Math.round(W/240);i++)bokeh.push(makeBokeh());
  }

  /* Trace une traînée alignée sur la vitesse de la goutte (sprite étiré + tourné, pas de dégradé recréé) */
  function streaks(list,spr,windTan,bright,dt,onFall){
    const mag=Math.hypot(windTan,1),ux=windTan/mag,uy=1/mag;    // direction (même angle pour tout le plan)
    const a=dpr*uy,b=-dpr*ux;                                 // rotation : l'axe vertical du sprite suit la goutte
    ctx.fillStyle=rgba(1);
    for(const d of list){
      ctx.setTransform(a,b,-b,a,d.x*dpr,d.y*dpr);
      ctx.globalAlpha=d.al;
      ctx.drawImage(spr,-SPW*d.wd/4,-d.len,SPW*d.wd/2,d.len);  // queue estompée (en haut), tête en (0,0)
      if(bright){                                 // tête plus dense (la goutte elle-même)
        ctx.globalAlpha=Math.min(.6,d.al+.18);
        ctx.fillRect(-d.wd/2,-d.len*.16,d.wd,d.len*.16);
      }
      d.x+=d.sp*windTan*dt; d.y+=d.sp*dt;
      if(d.y-d.len>H)onFall(d);
    }
    ctx.globalAlpha=1;ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function spawnSplash(x){
    ripples.push({x:x,y:H,r:1,al:.22});
    const n=2+(Math.random()*3|0);
    for(let i=0;i<n;i++)bits.push({x:x,vx:rnd(-55,55),y:H,vy:rnd(-160,-70),al:.3,len:rnd(2,5)});
  }

  /* --- variante ASCII : des caractères qui tombent, alignés sur une grille --- */
  let acols=[],aSize=15;
  function asciiInit(){
    aSize=W<600?13:15;const n=Math.ceil(W/(aSize*.62));acols=[];
    for(let i=0;i<n;i++)if(Math.random()<.75)acols.push({x:i*aSize*.62,y:rnd(-H,H),sp:rnd(120,330),len:(3+Math.random()*6)|0});
  }
  let aSplash=[];
  function asciiStep(dt,windTan){
    ctx.clearRect(0,0,W,H);ctx.font='400 '+aSize+'px "JetBrains Mono", monospace';ctx.textBaseline='top';
        for(const c of acols){
      c.y+=c.sp*dt;
      const head=c.sp>260?'|':c.sp>190?'!':':';
      for(let k=0;k<c.len;k++){
        const y=c.y-k*aSize,a=(k===0?.55:.3/(k+.4))*Math.min(1,c.sp/260+.2);
        if(y<-aSize||y>H)continue;
        ctx.fillStyle=rgba(a);ctx.fillText(k===0?head:(k===1?':':'.'),c.x+(c.y%80)*windTan*.0,y);
      }
      if(c.y-c.len*aSize>H){
        if(!reduce&&Math.random()<.6)aSplash.push({x:c.x,t:0});
        c.y=-rnd(0,H*.5);c.sp=rnd(120,330);c.len=(2+Math.random()*4)|0;
        c.x=Math.floor(Math.random()*Math.ceil(W/(aSize*.62)))*aSize*.62;
      }
    }
    for(let i=aSplash.length-1;i>=0;i--){
      const s=aSplash[i];s.t+=dt;const a=Math.max(0,.45-s.t*1.1);
      if(a<=0){aSplash.splice(i,1);continue;}
      ctx.fillStyle=rgba(a);
      const ch=s.t<.18?'.':s.t<.4?'o':'\'';
      ctx.fillText(ch,s.x,H-aSize*(s.t<.18?1:s.t<.4?1.2:1.6));
      if(s.t>.18){ctx.fillText('.',s.x-aSize*.62*(1+s.t*3),H-aSize);ctx.fillText('.',s.x+aSize*.62*(1+s.t*3),H-aSize);}
    }
  }

  /* éclairs (Nuit d'orage) : voile bref et rare (12-40 s), aucun sous prefers-reduced-motion */
  let nextFlash=0,flashEl=null;
  function storm(now){
    if(reduce||!window.THEME||!THEME.def().storm)return;
    if(!nextFlash){nextFlash=now+rnd(12000,40000);return;}
    if(now<nextFlash)return;
    nextFlash=now+rnd(12000,40000);
    if(!flashEl){flashEl=document.createElement('div');flashEl.className='storm-flash';flashEl.setAttribute('aria-hidden','true');document.body.prepend(flashEl);
      flashEl.addEventListener('animationend',()=>flashEl.classList.remove('on'));}
    flashEl.classList.remove('on');void flashEl.offsetWidth;flashEl.classList.add('on');
    window.rainFlashes=(window.rainFlashes||0)+1;
  }
  function step(now){
    if(!running)return;
    let dt=(now-last)/1000; last=now; t+=dt;
    if(dt>0.05)dt=0.05;                         // garde-fou si l'onglet a lagué
    if(burst&&now>burstT)endBurst();
    if(!running)return;
    storm(now);
    if(document.documentElement.dataset.style==='ascii'){
      if(!acols.length)asciiInit();
      asciiStep(dt,0);raf=requestAnimationFrame(step);return;
    }
    acols=[];

    /* Vent en rafales : l'inclinaison varie lentement et naturellement */
    const windTan=0.12 + 0.10*Math.sin(t*0.18) + 0.05*Math.sin(t*0.63);

    ctx.clearRect(0,0,W,H);

    /* --- PLAN LOINTAIN : sprite pré-flouté (avant : rendu basse définition + vrai flou à chaque image) --- */
    streaks(fars,sprFar,windTan,false,dt,d=>{Object.assign(d,makeDrop('far'));d.y=-d.len;d.x=Math.random()*W;});

    /* --- PLAN NET : gouttes proches, dessinées directement (piquées) --- */
    streaks(near,sprNet,windTan,true,dt,d=>{
      if(!reduce&&Math.random()<0.5)spawnSplash(d.x);
      Object.assign(d,makeDrop('near'));d.y=-d.len;d.x=Math.random()*W;
    });

    /* --- ÉCLABOUSSURES : ondelette + gouttelettes qui rebondissent --- */
    ctx.lineCap='round';
    for(let i=ripples.length-1;i>=0;i--){
      const r=ripples[i];
      ctx.strokeStyle=rgba(r.al);ctx.lineWidth=.7;
      ctx.beginPath();ctx.arc(r.x,r.y,r.r,Math.PI,2*Math.PI);ctx.stroke();
      r.r+=40*dt; r.al-=0.9*dt;
      if(r.al<=0)ripples.splice(i,1);
    }
    for(let i=bits.length-1;i>=0;i--){
      const p=bits[i];
      ctx.strokeStyle=rgba(p.al);ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*0.01,p.y-p.len);ctx.stroke();
      p.vy+=520*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.al-=1.1*dt;
      if(p.al<=0||p.y>H+4)bits.splice(i,1);
    }

    /* --- PREMIER PLAN : grosses gouttes hors-focus (effet objectif), sprite déjà flouté --- */
    if(bokeh.length)streaks(bokeh,sprBokeh,windTan*1.3,false,dt,d=>{Object.assign(d,makeBokeh());d.y=-d.len;});

    raf=requestAnimationFrame(step);
  }

  resize();
  addEventListener('resize',resize);
  const on=()=>enabled||!!burst;
  function start(){
    running=on()&&!document.hidden;
    cancelAnimationFrame(raf);raf=0;              // sinon l'ancienne boucle repart en plus de la nouvelle
    canvas.style.display=on()?'block':'none';
    if(running){last=performance.now();raf=requestAnimationFrame(step);}
    else ctx.clearRect(0,0,W,H);
  }
  /* grosse averse temporaire (easter egg) : densité ×3 pendant ms, puis retour à l'état d'avant
     (la boucle s'arrête si la pluie était coupée). Version réduite : moins dense, plus courte. */
  function endBurst(){burst=0;resize();start();document.dispatchEvent(new CustomEvent('averse-burst',{detail:{on:false}}));}
  window.rainBurst=function(ms){
    ms=Math.min(ms||6000,reduce?2500:12000);
    if(!burst){burst=1;resize();}
    burstT=performance.now()+ms;start();
    document.dispatchEvent(new CustomEvent('averse-burst',{detail:{on:true}}));
    return ms;
  };
  window.rainBursting=()=>!!burst;
  window.rainFlashSoon=()=>{nextFlash=1;};        // tests : prochain éclair à la prochaine image (si orage et mouvement autorisé)
  window.rainRunning=()=>running&&!!raf;
  /* appelé par theme.js : densité, opacité, pluie par défaut du thème orage */
  window.rainTheme=function(){AM=window.THEME?THEME.def().rainAlpha||1:1;COL=readColor();makeSprites();
    enabled=!lazy&&pref();resize();start();};
  document.addEventListener('visibilitychange',start);
  /* interrupteur : rainToggle() bascule, rainToggle(true/false) force ; renvoie l'état */
  window.rainToggle=function(on){
    enabled=on===undefined?!enabled:!!on;
    try{localStorage.setItem('averse-rain',enabled?'on':'off');}catch(e){}
    start();return enabled;
  };
  window.rainOn=()=>enabled;
  AM=window.THEME?THEME.def().rainAlpha||1:1;makeSprites();
  start();
}
})();
