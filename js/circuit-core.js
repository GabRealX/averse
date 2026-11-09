/* circuit-core.js — v11 : le MOTEUR des circuits d'AVERSE. Il lit un montage écrit en texte, le calcule (courant continu)
   et le DESSINE en schéma (SVG) avec de vrais symboles. Il sert à deux endroits :
     - l'outil « Simulateur de circuit » (js/tools/circuit.js)
     - le carnet : un bloc  ```circuit … ```  devient un schéma dans l'aperçu (md.js appelle CIRCUIT.block).
   Aucune dépendance : ni core.js, ni les outils. Tout ce qui est écrit dans le SVG passe par esc().

   LE TEXTE D'UN CIRCUIT                                       (exemple)
     V = 9                           la tension de la source (facultatif : sans elle, pas de simulation)
     titre: Une LED en sécurité      un titre (facultatif)
     330 + led:rouge + sw            le montage : + = en série · | = en parallèle · ( ) = groupes (| passe avant +)
     # une ligne qui commence par # est un commentaire
   COMPOSANTS
     330  4k7  1M  r:100        résistance (ohms)
     led  led:vert  led:2.1     LED (couleur ou tension de seuil)   rouge 2,0 · jaune 2,1 · vert 2,2 · bleu/blanc 3,0 · ir 1,2
     d  d:0.3                   diode (seuil 0,7 V par défaut)
     c:100n  c100n              condensateur (en continu : circuit ouvert, il se charge à la tension de sa branche)
     l:10m  l10m                bobine (en continu : un fil)
     sw  sw:off                 interrupteur (fermé par défaut)
     lamp  lamp:47              lampe (une résistance qui s'allume)
   Modèle : courant continu établi. Diode / LED = tension de seuil constante (fil idéal au-delà, ouvert en dessous). */
const CIRCUIT=(function(){
const E=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- valeurs avec préfixes (4k7, 100n, 22µ…) ---------- */
const MULT={p:1e-12,n:1e-9,u:1e-6,'µ':1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,G:1e9,R:1,'':1};
function parseSI(str){
  if(str==null)return NaN;
  const s=String(str).trim().replace(',','.').replace(/\s+/g,'').replace(/ohms?/ig,'').replace(/Ω/g,'').replace(/[VAWFHvawfh]$/,'');
  let m=/^(\d+)([pnuµmkKMGR])(\d+)$/.exec(s);
  if(m)return parseFloat(m[1]+'.'+m[3])*MULT[m[2]];
  m=/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)([pnuµmkKMGR]?)$/i.exec(s);
  return m?parseFloat(m[1])*MULT[m[2]]:NaN;
}
const PREF=[[1e9,'G'],[1e6,'M'],[1e3,'k'],[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n'],[1e-12,'p']];
function fmt(v,unit){
  if(!isFinite(v))return'infini';
  if(Math.abs(v)<1e-15)return'0 '+unit;
  const a=Math.abs(v),pr=PREF.find(p=>a>=p[0]*.9995)||PREF[PREF.length-1];
  return String(+(v/pr[0]).toPrecision(4)).replace('.',',')+' '+pr[1]+unit;
}
const fr=(v,d)=>String(+v.toPrecision(d||4)).replace('.',',');
const E24=[1.0,1.1,1.2,1.3,1.5,1.6,1.8,2.0,2.2,2.4,2.7,3.0,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];
function e24up(v){const d=Math.floor(Math.log10(v)),all=[];
  for(let k=d-1;k<=d+1;k++)E24.forEach(x=>all.push(+(x*Math.pow(10,k)).toPrecision(3)));
  all.sort((a,b)=>a-b);return all.find(x=>x>=v*.9999);}

/* ---------- les composants connus ---------- */
const LEDC={rouge:[2.0,'#ff5c5c'],red:[2.0,'#ff5c5c'],orange:[2.0,'#ff9f4d'],jaune:[2.1,'#ffd84d'],yellow:[2.1,'#ffd84d'],vert:[2.2,'#4dff88'],green:[2.2,'#4dff88'],
  bleu:[3.0,'#4d9dff'],blue:[3.0,'#4d9dff'],blanc:[3.0,'#f2f2f2'],white:[3.0,'#f2f2f2'],ir:[1.2,'#b36bff']};
const KIND={r:'R',res:'R',c:'C',l:'L',led:'LED',d:'D',diode:'D',sw:'SW',inter:'SW',switch:'SW',lamp:'LAMP',lampe:'LAMP',ampoule:'LAMP'};
const PFX={R:'R',C:'C',L:'L',LED:'D',D:'D',SW:'S',LAMP:'H'};
const NUM=/^[\d.,]+(?:[pnuµmkKMGR]\d*)?/;

/* ---------- lecture d'une expression -> arbre {t:'E'|'S'|'P'} ---------- */
function parseExpr(src){
  const s=String(src).replace(/Ω|ohms?/gi,'').replace(/\|\||\/\//g,'|').replace(/\s+/g,' ').trim();
  if(!s)throw new Error('');
  const tok=[];let i=0;
  while(i<s.length){
    const c=s[i],rest=s.slice(i);
    if(c===' '){i++;continue;}
    if('()+|'.includes(c)){tok.push({k:c,at:i});i++;continue;}
    let m=/^[a-zA-Zµ]+/.exec(rest);
    if(m){
      const w=m[0].toLowerCase(),kind=KIND[w];
      if(!kind)throw new Error('Composant inconnu « '+m[0]+' » (position '+(i+1)+'). Connus : un nombre (résistance), led, d, c, l, sw, lamp.');
      let j=i+m[0].length,val=null;
      if(s[j]===':'){const q=/^:\s*([^\s()+|]+)/.exec(s.slice(j));if(!q)throw new Error('Il manque une valeur après « : » (position '+(j+1)+').');val=q[1];j+=q[0].length;}
      else{const q=NUM.exec(s.slice(j));if(q&&(w==='r'||w==='c'||w==='l'||w==='d'||w==='lamp')){val=q[0];j+=q[0].length;}}
      tok.push({k:'e',kind,val,at:i,raw:s.slice(i,j)});i=j;continue;
    }
    m=NUM.exec(rest);
    if(!m)throw new Error('Caractère inattendu « '+c+' » (position '+(i+1)+').');
    const v=parseSI(m[0]);
    if(!(v>0))throw new Error('Valeur invalide : « '+m[0]+' ».');
    tok.push({k:'e',kind:'R',val:null,v,at:i,raw:m[0]});i+=m[0].length;
  }
  let p=0;const cnt={};
  const peek=()=>tok[p]&&tok[p].k;
  function make(t){
    const e={t:'E',type:t.kind};
    const need=(x,what)=>{const v=parseSI(x);if(!(v>0))throw new Error('Valeur invalide pour « '+t.raw+' » : '+what+' attendu (ex. 100n).');return v;};
    if(t.kind==='R')e.v=t.v!=null?t.v:need(t.val,'une résistance en ohms');
    else if(t.kind==='LAMP')e.v=t.val!=null?need(t.val,'une résistance en ohms'):47;
    else if(t.kind==='C')e.v=t.val!=null?need(t.val,'une capacité'):100e-9;
    else if(t.kind==='L')e.v=t.val!=null?need(t.val,'une inductance'):10e-3;
    else if(t.kind==='LED'){
      const k=t.val==null?'rouge':String(t.val).toLowerCase();
      if(LEDC[k]){e.vf=LEDC[k][0];e.color=LEDC[k][1];e.cname=k;}
      else{const v=parseSI(k);if(!(v>0&&v<10))throw new Error('LED « '+t.raw+' » : couleur (rouge, vert, bleu…) ou tension de seuil (ex. led:2.1) attendue.');e.vf=v;e.color=LEDC.rouge[1];}
    }
    else if(t.kind==='D'){const v=t.val==null?.7:parseSI(t.val);if(!(v>0&&v<10))throw new Error('Diode « '+t.raw+' » : tension de seuil attendue (ex. d:0.3).');e.vf=v;}
    else if(t.kind==='SW'){const k=t.val==null?'on':String(t.val).toLowerCase();
      if(/^(on|1|ferme|fermé|closed|close)$/.test(k))e.on=true;else if(/^(off|0|ouvert|open)$/.test(k))e.on=false;
      else throw new Error('Interrupteur « '+t.raw+' » : on ou off attendu.');}
    e.n=cnt[PFX[t.kind]]=(cnt[PFX[t.kind]]||0)+1;e.name=PFX[t.kind]+e.n;
    return e;
  }
  function factor(){
    const t=tok[p];
    if(!t)throw new Error('Il manque une valeur ou un composant à la fin.');
    if(t.k==='e'){p++;return make(t);}
    if(t.k==='('){p++;const e=expr();if(peek()!==')')throw new Error('Il manque une parenthèse fermante « ) ».');p++;return e;}
    throw new Error('Un composant ou « ( » est attendu ici (position '+(t.at+1)+').');
  }
  const group=(type,sym,next)=>()=>{
    const kids=[next()];
    while(peek()===sym){p++;kids.push(next());}
    if(kids.length===1)return kids[0];
    const flat=[];kids.forEach(k=>k.t===type?flat.push(...k.k):flat.push(k));
    return{t:type,k:flat};
  };
  const term=group('P','|',factor),expr=group('S','+',term);
  const tree=expr();
  if(p<tok.length)throw new Error(tok[p].k===')'?'Parenthèse fermante « ) » en trop (position '+(tok[p].at+1)+').':'Il manque « + » ou « | » avant la position '+(tok[p].at+1)+'.');
  return tree;
}

/* ---------- le texte complet (source, titre, montage) ---------- */
function parseDoc(src){
  const lines=String(src==null?'':src).replace(/\r/g,'').split('\n');
  let V=null,title='',expr=[];
  lines.forEach(l0=>{
    const l=l0.replace(/#.*$/,'').trim();if(!l)return;
    let m;
    if((m=/^(?:titre|title)\s*[:=]\s*(.+)$/i.exec(l)))title=m[1].trim().slice(0,120);
    else if((m=/^(?:v|u|vs|vcc|source|alim|tension)\s*[:=]?\s*([\d.,]+\s*[pnuµmkKMG]?)\s*V?$/i.exec(l))||(m=/^([\d.,]+\s*[mk]?)\s*V$/i.exec(l))){
      const v=parseSI(m[1]);if(!(v>0)||v>1e5)throw new Error('Tension de source invalide : « '+m[1].trim()+' ».');V=v;}
    else expr.push(l);
  });
  const tree=parseExpr(expr.join(' '));
  return{V,title,tree,expr:expr.join(' ')};
}

/* ---------- calcul : analyse nodale, diodes par itération ---------- */
const GSHORT=1e5,GMIN=1e-12,RS=.01;
function netlist(tree){
  let nn=2;const els=[];
  (function walk(n,a,b){
    if(n.t==='E'){els.push({e:n,a,b});return;}
    if(n.t==='S'){let cur=a;n.k.forEach((k,i)=>{const nx=i===n.k.length-1?b:nn++;walk(k,cur,nx);cur=nx;});return;}
    n.k.forEach(k=>walk(k,a,b));
  })(tree,1,0);
  return{els,N:nn};
}
function gauss(A,b){
  const n=b.length;
  for(let c=0;c<n;c++){
    let r=c;for(let i=c+1;i<n;i++)if(Math.abs(A[i][c])>Math.abs(A[r][c]))r=i;
    if(Math.abs(A[r][c])<1e-300)continue;
    [A[c],A[r]]=[A[r],A[c]];[b[c],b[r]]=[b[r],b[c]];
    for(let i=c+1;i<n;i++){const f=A[i][c]/A[c][c];if(f){for(let j=c;j<n;j++)A[i][j]-=f*A[c][j];b[i]-=f*b[c];}}
  }
  const x=new Array(n).fill(0);
  for(let i=n-1;i>=0;i--){let s=b[i];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=Math.abs(A[i][i])<1e-300?0:s/A[i][i];}
  return x;
}
/* renvoie {els, Itot, Ptot, Req} et remplit V, I, P sur chaque composant de l'arbre */
function simulate(tree,V){
  const {els,N}=netlist(tree);
  els.forEach(x=>{const t=x.e.type;if(t==='LED'||t==='D')x.on=false;});
  let guard=0,changed=true,volt=null;
  const conduct=x=>{const e=x.e;
    switch(e.type){
      case'R':case'LAMP':return{g:1/e.v,vs:0};
      case'L':return{g:GSHORT,vs:0};
      case'SW':return{g:e.on?GSHORT:0,vs:0};
      case'C':return{g:0,vs:0};
      default:return x.on?{g:1/RS,vs:e.vf}:{g:0,vs:0};}};
  while(changed&&guard++<80){
    const A=Array.from({length:N},()=>new Array(N).fill(0)),b=new Array(N).fill(0);
    els.forEach(x=>{const c=conduct(x);x.c=c;if(!c.g)return;
      A[x.a][x.a]+=c.g;A[x.b][x.b]+=c.g;A[x.a][x.b]-=c.g;A[x.b][x.a]-=c.g;b[x.a]+=c.g*c.vs;b[x.b]-=c.g*c.vs;});
    for(let i=2;i<N;i++)A[i][i]+=GMIN;
    A[0]=new Array(N).fill(0);A[0][0]=1;b[0]=0;A[1]=new Array(N).fill(0);A[1][1]=1;b[1]=V;
    volt=gauss(A,b);changed=false;
    els.forEach(x=>{if(x.on===undefined)return;const vd=volt[x.a]-volt[x.b],I=x.c.g?x.c.g*(vd-x.c.vs):0;
      if(x.on&&I<-1e-9){x.on=false;changed=true;}else if(!x.on&&vd>x.e.vf+1e-9){x.on=true;changed=true;}});
  }
  els.forEach(x=>{const e=x.e,vd=volt[x.a]-volt[x.b],c=x.c;
    e.V=Math.abs(vd)<1e-6?0:vd;
    e.I=c.g?c.g*(vd-c.vs):0;if(Math.abs(e.I)<1e-10)e.I=0;
    if(e.type==='L'||(e.type==='SW'&&e.on))e.V=0;           // un fil : pas de chute à afficher
    e.P=e.V*e.I;
    if(e.type==='LED'||e.type==='D')e.lit=!!x.on&&e.I>1e-9;
    if(e.type==='C'){e.Q=e.v*e.V;e.W=.5*e.v*e.V*e.V;}
    if(e.type==='L')e.W=.5*e.v*e.I*e.I;});
  let It=0;els.forEach(x=>{if(x.a===1)It+=x.e.I;});
  if(Math.abs(It)<1e-10)It=0;
  return{els:els.map(x=>x.e),Itot:It,Ptot:V*It,Req:It>0?V/It:Infinity};
}
const leaves=(n,a=[])=>{n.t==='E'?a.push(n):n.k.forEach(k=>leaves(k,a));return a;};

/* ---------- remarques en français ---------- */
function advice(doc,sim){
  const W=[],V=doc.V;
  if(V==null)return W;
  const L=sim.els;
  L.forEach(e=>{
    if((e.type==='R'||e.type==='LAMP')&&e.P>.25)W.push({lv:'bad',t:e.name+' dissipe '+fmt(e.P,'W')+' : plus que 1/4 W, prends une résistance plus puissante.'});
    if(e.type==='LED'){
      if(e.lit&&e.I>.03)W.push({lv:'bad',t:e.name+' : '+fmt(e.I,'A')+' dans la LED, elle va griller (20 mA au plus pour une LED classique). Ajoute ou augmente la résistance en série.'});
      else if(e.lit&&e.I>.02)W.push({lv:'warn',t:e.name+' : '+fmt(e.I,'A')+', au-dessus des 20 mA usuels.'});
      else if(e.lit&&e.I<.0005)W.push({lv:'info',t:e.name+' ne brille presque pas ('+fmt(e.I,'A')+').'});
      if(!e.lit&&sim.Itot>0)W.push({lv:'info',t:e.name+' est éteinte : il faut au moins '+fr(e.vf,3)+' V à ses bornes, et dans le bon sens.'});
    }
    if(e.type==='D'&&!e.lit&&sim.Itot>0)W.push({lv:'info',t:e.name+' est bloquée (moins de '+fr(e.vf,3)+' V à ses bornes).'});
  });
  if(sim.Itot===0)W.push({lv:'info',t:'Aucun courant : le circuit est ouvert (condensateur, interrupteur ouvert ou diode bloquée sur le chemin).'});
  const top=doc.tree.t==='S'?doc.tree.k:[doc.tree],leds=top.filter(x=>x.t==='E'&&x.type==='LED'),lim=top.some(x=>x.t==='E'&&(x.type==='R'||x.type==='LAMP'));
  if(leds.length&&!lim){
    const vf=top.filter(x=>x.t==='E'&&(x.type==='LED'||x.type==='D')).reduce((a,x)=>a+x.vf,0);
    if(V>vf+.2){const r=(V-vf)/.01;W.push({lv:'warn',t:'Pas de résistance en série : pour 10 mA il faudrait '+fmt(r,'Ω')+' (E24 : '+fmt(e24up(r),'Ω')+').'});}
  }
  return W;
}

/* ---------- dessin ---------- */
const BW=120,BH=82,MID=46,GAP=14,PAD=18,VG=12;
const ln=(x1,y1,x2,y2,c)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'"'+(c?' class="'+c+'"':'')+'/>';
const tx=(x,y,t,c,a)=>'<text x="'+x+'" y="'+y+'"'+(a?' text-anchor="'+a+'"':' text-anchor="middle"')+(c?' class="'+c+'"':'')+'>'+E(t)+'</text>';
function size(n){
  if(n.t==='E')return n.z={w:BW,h:BH,mid:MID};
  const ks=n.k.map(size);
  if(n.t==='S'){
    const up=Math.max(...ks.map(z=>z.mid)),dn=Math.max(...ks.map(z=>z.h-z.mid));
    return n.z={w:ks.reduce((a,z)=>a+z.w,0)+GAP*(ks.length-1),h:up+dn,mid:up};
  }
  let y=0,first=0,last=0;
  ks.forEach((z,i)=>{if(i===0)first=z.mid;if(i===ks.length-1)last=y+z.mid;y+=z.h+(i<ks.length-1?VG:0);});
  return n.z={w:Math.max(...ks.map(z=>z.w))+PAD*2,h:y,mid:(first+last)/2};
}
const KNAME={R:'',C:'',L:'',D:'diode',LED:'LED',SW:'',LAMP:'lampe'};
function elValue(e){
  switch(e.type){
    case'R':case'LAMP':return fmt(e.v,'Ω');
    case'C':return fmt(e.v,'F');
    case'L':return fmt(e.v,'H');
    case'D':return fmt(e.vf,'V');
    case'LED':return(e.cname?e.cname+' ':'')+fmt(e.vf,'V');
    default:return e.on?'fermé':'ouvert';}
}
function symbol(e,cx,cy,has){
  const half={R:24,C:5,L:24,D:11,LED:11,SW:16,LAMP:15}[e.type];
  let wire='',body='';
  const live=has&&Math.abs(e.I)>1e-9;
  switch(e.type){
    case'R':body='<rect x="'+(cx-24)+'" y="'+(cy-9)+'" width="48" height="18" class="sym"/>';break;
    case'C':body=ln(cx-5,cy-14,cx-5,cy+14,'sym')+ln(cx+5,cy-14,cx+5,cy+14,'sym');break;
    case'L':{let d='M'+(cx-24)+' '+cy;for(let i=0;i<4;i++)d+=' a6 6 0 0 1 12 0';body='<path d="'+d+'" class="sym"/>';break;}
    case'D':case'LED':{
      const br=has&&e.lit?Math.min(1,e.I/.02):0,col=e.color||'currentColor';
      if(e.type==='LED'&&br>0)body+='<circle cx="'+cx+'" cy="'+cy+'" r="22" fill="'+col+'" opacity="'+(.15+br*.5).toFixed(2)+'" class="glow"/>';
      const tri=(cx-11)+','+(cy-12)+' '+(cx-11)+','+(cy+12)+' '+(cx+11)+','+cy;
      if(br>0)body+='<polygon points="'+tri+'" fill="'+col+'" fill-opacity="'+(.25+br*.6).toFixed(2)+'" class="glow"/>';
      body+='<polygon points="'+tri+'" class="sym"/>'+ln(cx+11,cy-12,cx+11,cy+12,'sym');
      if(e.type==='LED'){const o=has&&!e.lit?.35:1;
        body+='<g opacity="'+o+'" class="sym">'+ln(cx+1,cy-14,cx+11,cy-26)+'<polyline points="'+(cx+6)+','+(cy-26)+' '+(cx+11)+','+(cy-26)+' '+(cx+11)+','+(cy-21)+'"/>'+
          ln(cx+8,cy-10,cx+18,cy-22)+'<polyline points="'+(cx+13)+','+(cy-22)+' '+(cx+18)+','+(cy-22)+' '+(cx+18)+','+(cy-17)+'"/></g>';}
      break;}
    case'SW':
      body='<circle cx="'+(cx-16)+'" cy="'+cy+'" r="2.5" class="dot"/><circle cx="'+(cx+16)+'" cy="'+cy+'" r="2.5" class="dot"/>'+
        (e.on?ln(cx-16,cy,cx+16,cy,'sym'):ln(cx-16,cy,cx+12,cy-15,'sym'));break;
    case'LAMP':{
      const br=has?Math.min(1,e.P/.3):0;
      if(br>0)body+='<circle cx="'+cx+'" cy="'+cy+'" r="24" fill="#ffd84d" opacity="'+(.15+br*.55).toFixed(2)+'" class="glow"/>';
      body+='<circle cx="'+cx+'" cy="'+cy+'" r="15" class="sym"/>'+ln(cx-10,cy-10,cx+10,cy+10,'sym')+ln(cx-10,cy+10,cx+10,cy-10,'sym');break;}
  }
  return{half,body,live};
}
function drawEl(e,x,y,has){
  const cx=x+BW/2,cy=y+MID,sy=symbol(e,cx,cy,has);
  let s=ln(x,cy,cx-sy.half,cy,'w')+ln(cx+sy.half,cy,x+BW,cy,'w');
  if(sy.live)s+=ln(x,cy,cx-sy.half,cy,'fl')+ln(cx+sy.half,cy,x+BW,cy,'fl');
  s+=sy.body;
  const nm=e.name,val=elValue(e);
  s+=tx(cx,y+12,nm+'  '+val,'t');
  if(has){
    let b='';
    if(e.type==='LED'||e.type==='D')b=e.lit?fmt(e.I,'A'):(e.type==='LED'?'éteinte':'bloquée');
    else if(e.type==='SW'||e.type==='L')b=fmt(e.I,'A');
    else b=fmt(e.V,'V')+'  ·  '+fmt(e.I,'A');
    s+=tx(cx,y+BH-6,b,'t m');
  }
  return s;
}
function drawNode(n,x,y,has){
  if(n.t==='E')return drawEl(n,x,y,has);
  const z=n.z,cy=y+z.mid;let s='';
  if(n.t==='S'){
    let cx=x;
    n.k.forEach((k,i)=>{
      s+=drawNode(k,cx,y+z.mid-k.z.mid,has);
      if(i<n.k.length-1)s+=ln(cx+k.z.w,cy,cx+k.z.w+GAP,cy,'w');
      cx+=k.z.w+GAP;
    });
    return s;
  }
  let yy=y;const mids=[];
  n.k.forEach(k=>{
    const kx=x+PAD+(z.w-PAD*2-k.z.w)/2;
    s+=drawNode(k,kx,yy,has);
    const m=yy+k.z.mid;mids.push(m);
    s+=ln(x,m,kx,m,'w')+ln(kx+k.z.w,m,x+z.w,m,'w');
    yy+=k.z.h+VG;
  });
  s+=ln(x,mids[0],x,mids[mids.length-1],'w')+ln(x+z.w,mids[0],x+z.w,mids[mids.length-1],'w');
  if(mids[0]!==z.mid)s+=ln(x-GAP/2,cy,x,cy,'w')+ln(x+z.w,cy,x+z.w+GAP/2,cy,'w');
  return s;
}
function svg(doc,sim){
  const tree=doc.tree,has=doc.V!=null&&sim;
  size(tree);
  const z=tree.z,XL=70,X0=XL+44,Y0=14,XR=X0+z.w+44,W=XR+40,cy=Y0+z.mid,by=cy+(z.h-z.mid)+44,H=by+40;
  let s=drawNode(tree,X0,Y0,has);
  s+=ln(XL,cy,X0,cy,'w')+ln(X0+z.w,cy,XR,cy,'w');
  s+=ln(XL,cy,XL,(cy+by)/2-5,'w')+ln(XL,(cy+by)/2+5,XL,by,'w')+ln(XR,cy,XR,by,'w')+ln(XL,by,XR,by,'w');
  const bc=(cy+by)/2;
  s+=ln(XL-15,bc-5,XL+15,bc-5,'sym')+'<line x1="'+(XL-8)+'" y1="'+(bc+5)+'" x2="'+(XL+8)+'" y2="'+(bc+5)+'" class="sym" stroke-width="4"/>';
  s+=tx(XL+20,bc-8,'+','t','start')+tx(XL-22,bc+4,has?fmt(doc.V,'V'):'source','t b','end');
  if(has&&sim.Itot>0){
    s+='<polygon points="'+((XL+X0)/2-5)+','+(cy-5)+' '+((XL+X0)/2+5)+','+cy+' '+((XL+X0)/2-5)+','+(cy+5)+'" class="ar"/>';
    s+=ln(XL,cy,X0,cy,'fl');
  }
  if(has)s+=tx((XL+XR)/2,by+22,'I = '+fmt(sim.Itot,'A')+'   ·   P = '+fmt(sim.Ptot,'W'),'t m');
  const lab='Schéma : '+leaves(tree).map(e=>e.name+' '+elValue(e)).join(', ')+(has?' sous '+fmt(doc.V,'V'):'');
  return'<svg class="circuit-svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;min-width:'+Math.round(W*.8)+'px;max-width:'+Math.max(360,W)+'px;height:auto" role="img" aria-label="'+E(lab)+'">'+s+'</svg>';
}

/* ---------- API ---------- */
function analyse(src){
  let doc;
  try{doc=parseDoc(src);}catch(e){return{ok:false,error:e.message};}
  const sim=doc.V!=null?simulate(doc.tree,doc.V):null;
  let Req=null;
  if(!sim){const lin=leaves(doc.tree).every(e=>e.type==='R'||e.type==='LAMP'||e.type==='L'||(e.type==='SW'&&e.on));
    if(lin){const r=simulate(doc.tree,1);Req=r.Req;}}
  else Req=sim.Req;
  const warns=sim?advice(doc,sim):[];
  return{ok:true,doc,sim,Req,warns,svg:svg(doc,sim),list:leaves(doc.tree)};
}
/* bloc ```circuit``` du carnet : figure + légende */
function block(src){
  const r=analyse(src);
  if(!r.ok){
    if(!r.error)return'<div class="circuit-err"><b>Circuit vide</b> — écris par exemple : <code>V = 5</code> puis <code>330 + led:rouge</code>.</div>';
    return'<div class="circuit-err"><b>Circuit : </b>'+E(r.error)+'</div><pre><code>'+E(src)+'</code></pre>';
  }
  const d=r.doc,s=r.sim;
  let cap=d.title?'<b>'+E(d.title)+'</b>':'';
  const info=s?'source '+fmt(d.V,'V')+' · courant '+fmt(s.Itot,'A')+' · puissance '+fmt(s.Ptot,'W')+(isFinite(s.Req)?' · Req '+fmt(s.Req,'Ω'):''):(r.Req!=null?'Résistance équivalente : '+fmt(r.Req,'Ω'):'');
  if(info)cap+=(cap?'<br>':'')+E(info);
  return'<figure class="circuit"><div class="circuit-fig">'+r.svg+'</div>'+(cap?'<figcaption>'+cap+'</figcaption>':'')+
    r.warns.map(w=>'<div class="circuit-note '+w.lv+'">'+E(w.t)+'</div>').join('')+'</figure>';
}
/* modèles proposés dans l'outil et dans le carnet : [nom, tension, montage] */
const EXAMPLES=[
  ['LED + résistance','5','330 + led:rouge'],
  ['Interrupteur + lampe','6','sw + lamp:47'],
  ['2 LED en parallèle','5','(330 + led:vert) | (330 + led:bleu)'],
  ['Diviseur de tension','9','1k + 2k'],
  ['Mixte','5','100 + (220 | 330) + 4k7'],
  ['Pont','10','(100 + 220) | (330 + 470)'],
  ['Condensateur','5','1k + c:100n'],
  ['Bobine','5','100 + l:10m'],
  ['Diode de protection','12','sw + d + 470 + led:jaune']
];
function snippet(v,expr,title){return '```circuit\n'+(title?'titre: '+title+'\n':'')+(v?'V = '+v+'\n':'')+expr+'\n```';}
return{parseSI,fmt,e24up,parseDoc,parseExpr,simulate,analyse,svg,block,advice,leaves,EXAMPLES,snippet};
})();
window.CIRCUIT=CIRCUIT;
