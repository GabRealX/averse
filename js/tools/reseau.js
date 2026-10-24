/* tools/reseau.js — RÉSEAU & NOMBRES : calculateur IPv4 / sous-réseaux, conversion de bases, débit & stockage */
(function(){
const {register,seg,out}=NOXE;

/* ================= outils IPv4 ================= */
const ip2n=s=>{
  const m=/^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(s);if(!m)return null;
  const o=m.slice(1).map(Number);if(o.some(v=>v>255))return null;
  return((o[0]<<24)|(o[1]<<16)|(o[2]<<8)|o[3])>>>0;
};
const n2ip=n=>[n>>>24,(n>>>16)&255,(n>>>8)&255,n&255].join('.');
const maskOf=p=>p===0?0:(0xFFFFFFFF<<(32-p))>>>0;
function prefixOfMask(n){                         // masque pointé → nombre de bits à 1, ou -1 si le masque n'est pas valide
  let p=0;while(p<32&&(n&(0x80000000>>>p)))p++;
  return maskOf(p)===n?p:-1;
}
/* accepte « 192.168.1.10/24 », « 192.168.1.10 255.255.255.0 » ou « 192.168.1.10/255.255.255.0 » */
function parseNet(str,needPrefix){
  const m=/^\s*(\d+\.\d+\.\d+\.\d+)\s*(?:[\/\s]\s*(\d+(?:\.\d+\.\d+\.\d+)?))?\s*$/.exec(str);
  if(!m)return{err:'Écris une adresse comme 192.168.1.10/24'};
  const ip=ip2n(m[1]);if(ip==null)return{err:'Adresse IPv4 invalide (chaque nombre entre 0 et 255)'};
  let p;
  if(m[2]==null){if(needPrefix)return{err:'Ajoute le masque : /24 ou 255.255.255.0'};p=32;}
  else if(m[2].includes('.')){const mm=ip2n(m[2]);if(mm==null)return{err:'Masque invalide'};p=prefixOfMask(mm);if(p<0)return{err:'Masque invalide (les bits à 1 doivent être à gauche)'};}
  else{p=+m[2];if(p>32)return{err:'Le préfixe doit être entre 0 et 32'};}
  return{ip,p};
}
function describe(ip,p){
  const m=maskOf(p),net=(ip&m)>>>0,bc=(net|(~m>>>0))>>>0;
  let first,last,hosts;
  if(p===32){first=last=ip;hosts=1;}
  else if(p===31){first=net;last=bc;hosts=2;}
  else{first=net+1;last=bc-1;hosts=Math.pow(2,32-p)-2;}
  return{ip,p,mask:m,net,bc,first,last,hosts};
}
function kind(ip){
  const a=ip>>>24,b=(ip>>>16)&255;
  if(a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168))return'Privée (RFC 1918)';
  if(a===127)return'Loopback (boucle locale)';
  if(a===169&&b===254)return'APIPA (lien local)';
  if(a===100&&b>=64&&b<=127)return'CGNAT (partage d\'adresses FAI)';
  if(a>=224&&a<=239)return'Multicast';
  if(a>=240)return'Réservée';
  if(a===0)return'Réseau « ce réseau »';
  return'Publique';
}
const klass=ip=>{const a=ip>>>24;return a<128?'A':a<192?'B':a<224?'C':a<240?'D (multicast)':'E (réservée)';};
function bin32(n,p){                              // 4 octets en binaire ; partie réseau en clair, partie hôte grisée
  const s=(n>>>0).toString(2).padStart(32,'0');let h='';
  for(let i=0;i<32;i++){h+='<span class="'+(i<p?'net':'host')+'">'+s[i]+'</span>';if(i%8===7&&i<31)h+='.';}
  return h;
}

register({
  key:'reseau',cat:'reseau',title:'Calculateur réseau IPv4',input:'nin',
  words:'ip cidr masque sous-réseau subnet vlsm broadcast passerelle adresse plage cisco',
  desc:'Adresse réseau, broadcast, plage d\'hôtes, masque… et découpage en sous-réseaux (égaux ou VLSM).',
  run(p){
    NOXE.tabs(p,[
      ['addr','Adresse',host=>{
        host.innerHTML=
          '<div class="field"><label>Adresse + masque</label><input type="text" id="nin" value="192.168.1.130/26" spellcheck="false" placeholder="192.168.1.130/26  ou  192.168.1.130 255.255.255.192"></div>'+
          '<div id="nout"></div>';
        function render(){
          const r=parseNet($('nin').value);
          $('nin').classList.toggle('bad',!!r.err);
          if(r.err){$('nout').innerHTML='<div class="info bad">'+esc(r.err)+'</div>';return;}
          const d=describe(r.ip,r.p);
          $('nout').innerHTML=out([
            ['Réseau',n2ip(d.net)+'/'+d.p],['Masque',n2ip(d.mask)],['Wildcard',n2ip(~d.mask>>>0)],
            ['Broadcast',d.p>=31?'— (pas de broadcast)':n2ip(d.bc)],
            ['Première adresse',n2ip(d.first)],['Dernière adresse',n2ip(d.last)],
            ['Adresses utilisables',String(d.hosts)],['Classe',klass(r.ip)],['Type',kind(r.ip)]
          ])+
          '<div class="out"><div class="line head"><span>Binaire (réseau en clair, hôte en grisé)</span><span></span></div>'+
          '<div class="line"><span>IP</span><span class="bits">'+bin32(d.ip,d.p)+'</span></div>'+
          '<div class="line"><span>Masque</span><span class="bits">'+bin32(d.mask,d.p)+'</span></div></div>'+
          '<div class="info">Clique une ligne pour copier sa valeur.</div>';
        }
        $('nin').oninput=render;render();
      }],
      ['sub','Sous-réseaux',host=>{
        let mode='vlsm';
        host.innerHTML=
          '<div class="group"><div class="field"><label>Réseau à découper</label><input type="text" id="sbase" value="192.168.10.0/24" spellcheck="false"></div>'+
          '<div class="field"><label>Méthode</label><div class="segmented" id="smode"><button data-v="vlsm" class="active">VLSM (selon les besoins)</button><button data-v="eq">Sous-réseaux égaux</button></div></div>'+
          '<div class="field" id="sneed"><label>Hôtes nécessaires par sous-réseau</label><input type="text" id="sin" value="50, 20, 10, 2" spellcheck="false" placeholder="ex : 100, 50, 25, 2"></div></div>'+
          '<div id="sout"></div>';
        const cols=['Sous-réseau','Réseau','Masque','Plage utilisable','Broadcast','Hôtes'];
        function table(rows){
          const tsv=[cols.join('\t')].concat(rows.map(r=>r.join('\t'))).join('\n');
          return'<div class="tbl-wrap"><table class="tbl"><thead><tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+
            rows.map(r=>'<tr>'+r.map((c,i)=>'<td'+(i===0?' class="dim"':'')+'>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+
            '<div class="btn-row"><button class="btn ghost" data-copy="'+esc(tsv)+'">Copier le tableau</button></div>';
        }
        function row(label,start,pfx){
          const d=describe(start,pfx);
          return[label,n2ip(d.net)+'/'+pfx,n2ip(d.mask),pfx>=31?n2ip(d.first)+(pfx===31?' – '+n2ip(d.last):''):n2ip(d.first)+' – '+n2ip(d.last),pfx>=31?'—':n2ip(d.bc),String(d.hosts)];
        }
        function render(){
          const r=parseNet($('sbase').value,true);
          $('sbase').classList.toggle('bad',!!r.err);
          const o=$('sout');
          if(r.err){o.innerHTML='<div class="info bad">'+esc(r.err)+'</div>';return;}
          const base=describe(r.ip,r.p),last=base.bc;
          if(mode==='vlsm'){
            const needs=$('sin').value.split(/[\s,;]+/).filter(Boolean).map(Number);
            if(!needs.length||needs.some(v=>!(v>=1)||v!==Math.floor(v))){o.innerHTML='<div class="info bad">Écris des nombres d\'hôtes entiers séparés par des virgules.</div>';return;}
            const order=needs.map((n,i)=>({n,i})).sort((a,b)=>b.n-a.n);        // on place les plus gros d'abord
            let cur=base.net;const rows=[];
            for(const it of order){
              let bits=0;while(Math.pow(2,bits)<it.n+2)bits++;                 // +2 : adresse réseau et broadcast
              const size=Math.pow(2,bits),pfx=32-bits;
              cur=Math.ceil(cur/size)*size;
              if(pfx<base.p||cur+size-1>last){o.innerHTML='<div class="info bad">Ça ne rentre pas : il faudrait plus d\'adresses que dans '+n2ip(base.net)+'/'+base.p+'.</div>';return;}
              rows.push(row('Besoin '+(it.i+1)+' ('+it.n+' hôtes)',cur,pfx));
              cur+=size;
            }
            const used=cur-base.net,total=Math.pow(2,32-base.p);
            o.innerHTML=table(rows)+'<div class="info">Adresses utilisées : <b>'+used+'</b> sur '+total+' ('+Math.round(used/total*100)+' %). Reste libre : '+(total-used)+'.</div>';
          }else{
            const n=Math.floor(+$('sin').value);
            if(!(n>=2)){o.innerHTML='<div class="info bad">Indique un nombre de sous-réseaux (2 ou plus).</div>';return;}
            let bits=0;while(Math.pow(2,bits)<n)bits++;
            const pfx=base.p+bits;
            if(pfx>30){o.innerHTML='<div class="info bad">Trop de sous-réseaux pour ce réseau (il faut garder au moins 4 adresses par sous-réseau).</div>';return;}
            const size=Math.pow(2,32-pfx),rows=[];
            for(let i=0;i<Math.min(n,256);i++)rows.push(row('Sous-réseau '+(i+1),base.net+i*size,pfx));
            o.innerHTML=table(rows)+'<div class="info">'+n+' sous-réseaux en <b>/'+pfx+'</b> → '+(size-2)+' hôtes chacun'+(n<Math.pow(2,bits)?' ('+(Math.pow(2,bits)-n)+' sous-réseaux /'+pfx+' restent libres)':'')+(n>256?' — 256 premières lignes affichées':'')+'.</div>';
          }
        }
        seg('smode',v=>{
          mode=v;
          $('sneed').innerHTML=v==='vlsm'?'<label>Hôtes nécessaires par sous-réseau</label><input type="text" id="sin" value="50, 20, 10, 2" spellcheck="false" placeholder="ex : 100, 50, 25, 2">':
            '<label>Nombre de sous-réseaux</label><input type="number" id="sin" min="2" value="4">';
          $('sin').oninput=render;render();
        });
        $('sbase').oninput=render;$('sin').oninput=render;render();
      }]
    ]);
  }
});

/* ================= bases et codes ================= */
const DIGITS='0123456789abcdef';
function parseBase(str,base){
  str=str.replace(/[\s_]/g,'').toLowerCase();
  const pre={16:'0x',2:'0b',8:'0o'}[base];if(pre&&str.startsWith(pre))str=str.slice(2);
  if(!str)return null;
  let v=0n;const B=BigInt(base);
  for(const ch of str){const d=DIGITS.indexOf(ch);if(d<0||d>=base)return NaN;v=v*B+BigInt(d);}
  return v;
}
const groupBin=s=>{s=s.padStart(Math.ceil(s.length/4)*4,'0');return s.replace(/(.{4})(?=.)/g,'$1 ');};
const groupHex=s=>s.length>4?s.replace(/(.{2})(?=.)/g,'$1 ').toUpperCase():s.toUpperCase();

register({
  key:'bases',cat:'reseau',title:'Bases & codes',
  words:'binaire hexadécimal décimal octal ascii utf-8 conversion complément à 2 bits octets',
  desc:'Convertis entre décimal, binaire, hexadécimal et octal — et entre texte et octets (hex, binaire, décimal).',
  run(p){
    NOXE.tabs(p,[
      ['num','Nombres',host=>{
        const F=[['dec',10,'Décimal'],['bin',2,'Binaire'],['hex',16,'Hexadécimal'],['oct',8,'Octal']];
        host.innerHTML='<div class="group">'+F.map(f=>'<div class="field"><label>'+f[2]+'</label><input type="text" id="b_'+f[0]+'" spellcheck="false" autocomplete="off"></div>').join('')+'</div><div id="bextra"></div>';
        const show=v=>{
          F.forEach(([k,b])=>{const el=$('b_'+k);if(el.dataset.src==='1')return;
            let s=v.toString(b);if(k==='bin')s=groupBin(s);else if(k==='hex')s=groupHex(s);el.value=s;});
          const bits=v.toString(2).length,rows=[['Bits nécessaires',String(v===0n?1:bits)]];
          for(const w of [8,16,32,64]){
            const lim=1n<<BigInt(w);
            if(v<lim){const sgn=v>=(lim>>1n)?v-lim:v;rows.push(['Signé sur '+w+' bits (complément à 2)',sgn.toString()]);break;}
          }
          if(v<=0xFFFFFFFFn)rows.push(['Comme adresse IPv4',[24n,16n,8n,0n].map(s=>((v>>s)&255n).toString()).join('.')]);
          $('bextra').innerHTML=out(rows);
        };
        F.forEach(([k,b])=>{
          const el=$('b_'+k);
          el.oninput=()=>{
            const v=parseBase(el.value,b);
            F.forEach(([k2])=>$('b_'+k2).classList.remove('bad'));
            if(v===null){F.forEach(([k2])=>{if(k2!==k)$('b_'+k2).value='';});$('bextra').innerHTML='';return;}
            if(Number.isNaN(v)){el.classList.add('bad');return;}
            el.dataset.src='1';show(v);delete el.dataset.src;
          };
        });
        $('b_dec').value='202';$('b_dec').oninput();
      }],
      ['txt','Texte ↔ octets',host=>{
        const te=new TextEncoder(),td=new TextDecoder('utf-8',{fatal:true});
        let fmt='hex';
        host.innerHTML=
          '<div class="field"><label>Texte → octets (UTF-8)</label><textarea id="t_in" style="min-height:70px" spellcheck="false">Bonjour é</textarea></div><div id="t_out"></div>'+
          '<div class="field" style="margin-top:26px"><label>Octets → texte</label>'+
          '<div class="segmented" id="t_fmt" style="margin-bottom:8px"><button data-v="hex" class="active">Hexadécimal</button><button data-v="bin">Binaire</button><button data-v="dec">Décimal</button></div>'+
          '<textarea id="t_rev" style="min-height:70px" spellcheck="false" placeholder="ex : 42 6F 6E 6A 6F 75 72"></textarea></div><div id="t_res"></div>';
        function fwd(){
          const b=te.encode($('t_in').value);
          $('t_out').innerHTML=b.length?out([
            ['Hex',[...b].map(x=>x.toString(16).padStart(2,'0')).join(' ').toUpperCase()],
            ['Binaire',[...b].map(x=>x.toString(2).padStart(8,'0')).join(' ')],
            ['Décimal',[...b].join(' ')],['Octets',String(b.length)]]):'';
        }
        function rev(){
          const s=$('t_rev').value.trim();
          if(!s){$('t_res').innerHTML='';$('t_rev').classList.remove('bad');return;}
          let arr;
          if(fmt==='hex'){const c=s.replace(/0x/gi,'').replace(/[\s,;]+/g,'');arr=/^[0-9a-f]*$/i.test(c)&&c.length%2===0?c.match(/../g):null;if(arr)arr=arr.map(h=>parseInt(h,16));}
          else if(fmt==='bin'){const c=s.replace(/[\s,;]+/g,'');arr=/^[01]*$/.test(c)&&c.length%8===0?c.match(/.{8}/g).map(x=>parseInt(x,2)):null;}
          else{arr=s.split(/[\s,;]+/).map(Number);if(arr.some(v=>!Number.isInteger(v)||v<0||v>255))arr=null;}
          $('t_rev').classList.toggle('bad',!arr);
          if(!arr){$('t_res').innerHTML='<div class="info bad">Format invalide pour « '+({hex:'hexadécimal',bin:'binaire (groupes de 8 bits)',dec:'décimal (0–255)'}[fmt])+' ».</div>';return;}
          let txt;try{txt=td.decode(new Uint8Array(arr));}catch(e){$('t_res').innerHTML='<div class="info bad">Ces octets ne forment pas du texte UTF-8 valide.</div>';return;}
          $('t_res').innerHTML='<div class="codebox" data-copy="'+esc(txt)+'">'+esc(txt)+'</div>';
        }
        $('t_in').oninput=fwd;$('t_rev').oninput=rev;seg('t_fmt',v=>{fmt=v;rev();});
        fwd();
      }]
    ]);
  }
});

/* ================= débit & stockage ================= */
const SIZE_U=[['o',1],['Ko',1e3],['Mo',1e6],['Go',1e9],['To',1e12],['Kio',1024],['Mio',1048576],['Gio',1073741824],['Tio',1099511627776]];
const RATE_U=[['Mb/s',1e6],['Gb/s',1e9],['kb/s',1e3],['Mo/s',8e6],['Go/s',8e9],['Ko/s',8e3]];
function dur(s){
  if(!isFinite(s))return'—';
  if(s<1)return s<.001?'< 1 ms':Math.round(s*1000)+' ms';
  s=Math.round(s);const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60,parts=[];
  if(d)parts.push(d+' j');if(h)parts.push(h+' h');if(m)parts.push(m+' min');if(sec&&!d)parts.push(sec+' s');
  return parts.join(' ')||'0 s';
}
const num=n=>(n>=1e5?Math.round(n):+n.toPrecision(6)).toLocaleString('fr-FR',{maximumFractionDigits:6});

register({
  key:'debit',cat:'reseau',title:'Débit & stockage',
  words:'téléchargement transfert temps mégabit mégaoctet mo mio go gio bits octets vitesse fichier',
  desc:'Combien de temps pour transférer un fichier ? Et pourquoi un disque de 1 To affiche 931 Gio ?',
  run(p){
    const opts=(list,sel)=>list.map(u=>'<option'+(u[0]===sel?' selected':'')+'>'+u[0]+'</option>').join('');
    NOXE.tabs(p,[
      ['time','Temps de transfert',host=>{
        host.innerHTML=
          '<div class="group"><div class="row"><div class="field"><label>Taille du fichier</label><div class="inline"><input type="number" id="d_s" value="4.7" min="0" step="any"><select id="d_su" style="width:90px">'+opts(SIZE_U,'Go')+'</select></div></div>'+
          '<div class="field"><label>Débit</label><div class="inline"><input type="number" id="d_r" value="100" min="0" step="any"><select id="d_ru" style="width:100px">'+opts(RATE_U,'Mb/s')+'</select></div></div></div>'+
          '<div class="field"><label>Rendement réel <b id="d_ev">90</b> %</label><input type="range" id="d_e" min="30" max="100" value="90"></div></div>'+
          '<div id="d_out"></div><div class="info">Le rendement tient compte des en-têtes de protocoles, de la latence et du partage de la ligne : 85–95 % est typique sur du filaire.</div>';
        function render(){
          const size=(+$('d_s').value)*SIZE_U.find(u=>u[0]===$('d_su').value)[1]*8,rate=(+$('d_r').value)*RATE_U.find(u=>u[0]===$('d_ru').value)[1],eff=+$('d_e').value/100;
          $('d_ev').textContent=Math.round(eff*100);
          if(!(size>=0)||!(rate>0)){$('d_out').innerHTML='';return;}
          $('d_out').innerHTML=out([['Temps estimé',dur(size/(rate*eff))],['À débit théorique (100 %)',dur(size/rate)],['Débit réel',num(rate*eff/8e6)+' Mo/s  (= '+num(rate*eff/1e6)+' Mb/s)'],['Taille en bits',num(size)+' bits']]);
        }
        ['d_s','d_su','d_r','d_ru','d_e'].forEach(id=>$(id).oninput=render);render();
      }],
      ['store','Unités de stockage',host=>{
        host.innerHTML=
          '<div class="group"><div class="field"><label>Valeur</label><div class="inline"><input type="number" id="u_v" value="1" min="0" step="any"><select id="u_u" style="width:100px">'+opts(SIZE_U,'To')+'</select></div></div></div><div id="u_out"></div>'+
          '<div class="info">Les fabricants comptent en puissances de 10 (1 Go = 1 000 000 000 o) ; Windows affiche en puissances de 2 (1 Gio = 1 073 741 824 o) mais écrit « Go ». D\'où les « manquants ».</div>';
        function render(){
          const v=(+$('u_v').value)*SIZE_U.find(u=>u[0]===$('u_u').value)[1];
          if(!(v>=0)){$('u_out').innerHTML='';return;}
          const dec=SIZE_U.slice(0,5).map(u=>[u[0],num(v/u[1])]),bin=SIZE_U.slice(5).map(u=>[u[0],num(v/u[1])]);
          $('u_out').innerHTML=out([['Décimal (SI)',null]].concat(dec,[['Binaire (CEI)',null]],bin,[['Bits',null],['bits',num(v*8)]]));
        }
        $('u_v').oninput=render;$('u_u').oninput=render;render();
      }]
    ]);
  }
});

})();
