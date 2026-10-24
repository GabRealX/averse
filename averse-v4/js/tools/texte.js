/* tools/texte.js — TEXTE & DATES : outils de texte, comparateur (diff), calculs de dates */
(function(){
const {register,seg,out}=NOXE;

/* ===================== Outils de texte ===================== */
const words=s=>String(s).normalize('NFC').split(/[^\p{L}\p{N}]+|(?<=\p{Ll})(?=\p{Lu})/u).filter(Boolean);
const noAccent=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'');
const CASES=[
  ['upper','MAJUSCULES',s=>s.toUpperCase()],['lower','minuscules',s=>s.toLowerCase()],
  ['title','Titre',s=>s.toLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase())],
  ['sentence','Phrase',s=>s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\p{L})/gu,(m,a,b)=>a+b.toUpperCase())],
  ['camel','camelCase',s=>words(s).map((w,i)=>i?w[0].toUpperCase()+w.slice(1).toLowerCase():w.toLowerCase()).join('')],
  ['pascal','PascalCase',s=>words(s).map(w=>w[0].toUpperCase()+w.slice(1).toLowerCase()).join('')],
  ['snake','snake_case',s=>words(s).map(w=>w.toLowerCase()).join('_')],
  ['kebab','kebab-case',s=>words(s).map(w=>w.toLowerCase()).join('-')],
  ['slug','slug (sans accents)',s=>words(noAccent(s)).map(w=>w.toLowerCase()).join('-')]
];
register({
  key:'texte',cat:'texte',title:'Outils de texte',
  words:'compteur mots caractères majuscules minuscules slug trier lignes doublons remplacer rechercher',
  desc:'Compteur de mots, changement de casse et slug, tri / dédoublonnage de lignes, rechercher-remplacer.',
  run(p){
    NOXE.tabs(p,[
      ['count','Compteur',host=>{
        host.innerHTML='<textarea id="c_in" placeholder="Écris ou colle ton texte ici…" style="min-height:170px"></textarea><div class="out" id="c_out" style="margin-top:14px"></div>';
        const seg2=window.Intl&&Intl.Segmenter?new Intl.Segmenter('fr',{granularity:'grapheme'}):null;
        function render(){
          const t=$('c_in').value,w=(t.match(/[\p{L}\p{N}'’-]+/gu)||[]).length;
          const chars=seg2?[...seg2.segment(t)].length:[...t].length;
          const sent=(t.match(/[^.!?…]+[.!?…]+(?=\s|$)/g)||[]).length||(t.trim()?1:0);
          const paras=t.split(/\n\s*\n/).filter(s=>s.trim()).length,read=w/200,min=Math.floor(read),sec=Math.round((read-min)*60);
          $('c_out').innerHTML=[['Mots',w],['Caractères',chars],['Sans espaces',t.replace(/\s/g,'').length],['Phrases',sent],['Paragraphes',paras],['Temps de lecture',w?(min?min+' min ':'')+sec+' s':'—']]
            .map(r=>'<div class="line"><span>'+r[0]+'</span><span>'+r[1]+'</span></div>').join('');
        }
        $('c_in').oninput=render;render();
      }],
      ['case','Casse & slug',host=>{
        let mode='slug';
        host.innerHTML='<div class="field"><label>Texte</label><textarea id="k_in" style="min-height:90px" placeholder="Écris ou colle ton texte…"></textarea></div>'+
          '<div class="group"><div class="field"><label>Format</label><div class="segmented" id="k_m">'+CASES.map(c=>'<button data-v="'+c[0]+'"'+(c[0]===mode?' class="active"':'')+'>'+c[1]+'</button>').join('')+'</div></div></div>'+
          '<div class="codebox" id="k_out">—</div>';
        const render=()=>{const f=CASES.find(c=>c[0]===mode)[2],v=f($('k_in').value);$('k_out').textContent=v||'—';$('k_out').dataset.copy=v;};
        $('k_in').oninput=render;seg('k_m',v=>{mode=v;render();});render();
      }],
      ['lines','Lignes',host=>{
        let prev=null;
        host.innerHTML='<div class="field"><label>Une valeur par ligne <b id="l_n">0 ligne</b></label><textarea id="l_in" style="min-height:190px" spellcheck="false"></textarea></div>'+
          '<div class="btn-row" style="gap:8px">'+
          [['az','Trier A → Z'],['za','Trier Z → A'],['len','Par longueur'],['rev','Inverser'],['shuf','Mélanger'],['uniq','Supprimer les doublons'],['empty','Supprimer les vides'],['trim','Nettoyer les espaces'],['num','Numéroter']]
            .map(b=>'<button class="btn ghost" data-op="'+b[0]+'">'+b[1]+'</button>').join('')+
          '<button class="btn ghost" id="l_undo" disabled>Annuler</button><button class="btn primary" id="l_cp">Copier</button></div>';
        const lines=()=>$('l_in').value.split('\n');
        const cnt=()=>{const n=$('l_in').value?lines().length:0;$('l_n').textContent=n+' ligne'+(n>1?'s':'');};
        const OPS={
          az:a=>[...a].sort((x,y)=>x.localeCompare(y,'fr',{numeric:true,sensitivity:'base'})),
          za:a=>[...a].sort((x,y)=>y.localeCompare(x,'fr',{numeric:true,sensitivity:'base'})),
          len:a=>[...a].sort((x,y)=>x.length-y.length),rev:a=>[...a].reverse(),
          shuf:a=>{const r=[...a];for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]];}return r;},
          uniq:a=>{const s=new Set();return a.filter(l=>!s.has(l)&&s.add(l));},
          empty:a=>a.filter(l=>l.trim()!==''),
          trim:a=>a.map(l=>l.trim().replace(/\s{2,}/g,' ')),
          num:a=>a.map((l,i)=>(i+1)+'. '+l)
        };
        host.onclick=e=>{
          const b=e.target.closest('[data-op]');if(!b||!$('l_in').value)return;
          prev=$('l_in').value;$('l_in').value=OPS[b.dataset.op](lines()).join('\n');$('l_undo').disabled=false;cnt();
        };
        $('l_undo').onclick=()=>{if(prev!=null){$('l_in').value=prev;prev=null;$('l_undo').disabled=true;cnt();}};
        $('l_cp').onclick=()=>copy($('l_in').value);$('l_in').oninput=cnt;cnt();
      }],
      ['repl','Rechercher / remplacer',host=>{
        host.innerHTML='<div class="field"><label>Texte</label><textarea id="r_in" style="min-height:130px" spellcheck="false"></textarea></div>'+
          '<div class="group"><div class="row"><div class="field"><label>Chercher</label><input type="text" id="r_a" spellcheck="false"></div><div class="field"><label>Remplacer par</label><input type="text" id="r_b" spellcheck="false"></div></div>'+
          '<div class="row"><label class="check"><input type="checkbox" id="r_case"> Respecter la casse</label><label class="check"><input type="checkbox" id="r_re"> Expression régulière</label></div></div>'+
          '<div class="info" id="r_info"></div><div class="btn-row"><button class="btn primary" id="r_go" data-main>Appliquer</button><button class="btn ghost" id="r_cp">Copier le texte</button></div>';
        /* v4 : la recherche tourne dans un Worker avec délai maximum (NOXE.rxRunner, comme le testeur de regex) :
           une expression catastrophique ne fige plus la page. */
        const R=NOXE.rxRunner();let deb=null;NOXE.onClose(()=>{R.stop();clearTimeout(deb);});
        const SLOW='⏱ Recherche arrêtée après '+NOXE.RX_TIMEOUT/1000+' s : expression trop coûteuse (« retour arrière catastrophique », ex. (a+)+$).';
        function job(){                                     // null = rien à chercher, undefined = expression invalide
          const a=$('r_a').value;if(!a)return null;
          const pat=$('r_re').checked?a:a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),flags='g'+($('r_case').checked?'':'i');
          try{new RegExp(pat,flags);}catch(e){return undefined;}
          return {pat,flags};
        }
        function info(){
          clearTimeout(deb);deb=setTimeout(async()=>{
            if(!$('r_info'))return;
            const j=job();$('r_a').classList.toggle('bad',j===undefined);
            if(!j){R.stop();$('r_info').textContent=j===undefined?'Expression invalide.':'';return;}
            try{const r=await R.run(Object.assign({text:$('r_in').value,count:true},j));if($('r_info'))$('r_info').textContent=r.count+' occurrence(s) trouvée(s).';}
            catch(e){if(e.code==='timeout'&&$('r_info'))$('r_info').textContent=SLOW;}
          },120);
        }
        $('r_go').onclick=async()=>{
          const j=job();if(!j)return;clearTimeout(deb);
          const b=$('r_b').value,rep=$('r_re').checked?b:b.replace(/\$/g,'$$$$');   // texte simple : « $ » n'a rien de spécial
          try{const r=await R.run(Object.assign({text:$('r_in').value,count:true,rep},j));
            if(!$('r_in'))return;$('r_in').value=r.rep;toast(r.count+' remplacement(s)');info();}
          catch(e){if(e.code==='timeout'){$('r_info').textContent=SLOW;toast('Trop long : recherche arrêtée');}}
        };
        $('r_cp').onclick=()=>copy($('r_in').value);
        ['r_in','r_a','r_case','r_re'].forEach(id=>$(id).oninput=info);info();
      }]
    ]);
  }
});

/* ===================== Comparateur (diff) ===================== */
register({
  key:'diff',cat:'texte',title:'Comparer deux textes',
  words:'diff différence comparer fichiers code versions lignes',
  desc:'Colle deux versions d\'un texte ou d\'un code : les lignes ajoutées et supprimées sont surlignées.',
  run(p){
    p.innerHTML=
      '<div class="row"><div class="field"><label>Version A (avant)</label><textarea id="f_a" style="min-height:150px" spellcheck="false">un\ndeux\ntrois\nquatre</textarea></div>'+
      '<div class="field"><label>Version B (après)</label><textarea id="f_b" style="min-height:150px" spellcheck="false">un\ndeux modifié\ntrois\nquatre\ncinq</textarea></div></div>'+
      '<div class="row" style="margin-top:12px"><label class="check"><input type="checkbox" id="f_ws"> Ignorer les espaces</label><label class="check"><input type="checkbox" id="f_ci"> Ignorer la casse</label></div>'+
      '<div id="f_out"></div>';
    const MAXL=3000;
    function render(){
      const A=$('f_a').value.split('\n'),B=$('f_b').value.split('\n'),o=$('f_out');
      if(A.length>MAXL||B.length>MAXL){o.innerHTML='<div class="info bad">Trop de lignes (limite : '+MAXL+' par version).</div>';return;}
      const ws=$('f_ws').checked,ci=$('f_ci').checked;
      const key=l=>{if(ws)l=l.replace(/\s+/g,' ').trim();if(ci)l=l.toLowerCase();return l;};
      const ka=A.map(key),kb=B.map(key);
      let s=0;while(s<A.length&&s<B.length&&ka[s]===kb[s])s++;                       // début identique
      let ea=A.length,eb=B.length;while(ea>s&&eb>s&&ka[ea-1]===kb[eb-1]){ea--;eb--;}  // fin identique
      const n=ea-s,m=eb-s,W=m+1,L=new Uint16Array((n+1)*W);
      for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)
        L[i*W+j]=ka[s+i]===kb[s+j]?L[(i+1)*W+j+1]+1:Math.max(L[(i+1)*W+j],L[i*W+j+1]);
      const rows=[];
      for(let i=0;i<s;i++)rows.push(['=',A[i]]);
      let i=0,j=0;
      while(i<n||j<m){
        if(i<n&&j<m&&ka[s+i]===kb[s+j]){rows.push(['=',A[s+i]]);i++;j++;}
        else if(j<m&&(i>=n||L[i*W+j+1]>=L[(i+1)*W+j])){rows.push(['+',B[s+j]]);j++;}
        else{rows.push(['-',A[s+i]]);i++;}
      }
      for(let k=ea;k<A.length;k++)rows.push(['=',A[k]]);
      const add=rows.filter(r=>r[0]==='+').length,del=rows.filter(r=>r[0]==='-').length;
      if(!add&&!del){o.innerHTML='<div class="info ok" style="margin-top:14px">✓ Les deux textes sont identiques.</div>';return;}
      let html='',buf=[];
      const flush=()=>{
        if(buf.length>8){html+=buf.slice(0,3).map(l=>'<div>  '+esc(l)+'</div>').join('')+'<div style="color:var(--fg-faint)">… '+(buf.length-6)+' lignes identiques …</div>'+buf.slice(-3).map(l=>'<div>  '+esc(l)+'</div>').join('');}
        else html+=buf.map(l=>'<div>  '+esc(l)+'</div>').join('');buf=[];
      };
      rows.forEach(r=>{
        if(r[0]==='=')buf.push(r[1]);
        else{flush();html+='<div class="'+(r[0]==='+'?'add':'del')+'">'+r[0]+' '+esc(r[1])+'</div>';}
      });
      flush();
      o.innerHTML='<div class="info" style="margin-top:14px"><span class="ok">+'+add+' ajoutée'+(add>1?'s':'')+'</span> · <span class="bad">−'+del+' supprimée'+(del>1?'s':'')+'</span></div><div class="diff">'+html+'</div>';
    }
    p.addEventListener('input',render);p.addEventListener('change',render);render();
  }
});

/* ===================== Dates ===================== */
const DAY=86400000;
/* Jours ouvrés (lun–ven), sans boucle sur chaque jour : 7 jours d'affilée contiennent toujours 5 jours ouvrés.
   (v3 bouclait jour par jour : figé pour « +10 000 000 jours ouvrés », et faux au-delà de 200 ans d'écart.) */
const isWork=d=>{const w=d.getUTCDay();return w!==0&&w!==6;};
function workdaysBetween(a,days){                            // jours ouvrés dans [a, a+days[
  let n=Math.floor(days/7)*5;const start=new Date(a.getTime()+Math.floor(days/7)*7*DAY);
  for(let i=0;i<days%7;i++)if(isWork(new Date(start.getTime()+i*DAY)))n++;
  return n;
}
function addWorkdays(s,k){                                   // avance (ou recule si k<0) de |k| jours ouvrés
  const step=k<0?-1:1;let n=Math.abs(k),weeks=Math.floor(n/5),rem=n%5;
  if(rem===0&&weeks>0){weeks--;rem=5;}                       // on s'arrête sur le dernier jour ouvré, pas sur le week-end qui suit
  let r=new Date(s.getTime()+step*weeks*7*DAY);
  while(rem>0&&!isNaN(r)){r=new Date(r.getTime()+step*DAY);if(isWork(r))rem--;}
  return r;
}
NOXE.workdays={between:workdaysBetween,add:addWorkdays};          // pour les tests
const parseD=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null;};
const isoD=d=>d.toISOString().slice(0,10);
const longD=d=>d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const dim=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
const isLeap=y=>(y%4===0&&y%100!==0)||y%400===0;
function isoWeek(d){
  const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())),dn=(t.getUTCDay()+6)%7;
  t.setUTCDate(t.getUTCDate()-dn+3);const ft=new Date(Date.UTC(t.getUTCFullYear(),0,4));
  return 1+Math.round(((t-ft)/DAY-3+((ft.getUTCDay()+6)%7))/7);
}
const dayOfYear=d=>Math.round((d-Date.UTC(d.getUTCFullYear(),0,1))/DAY)+1;
const plural=(n,s,p)=>n+' '+(Math.abs(n)>1?(p||s+'s'):s);
function addMonths(d,n){
  const y=d.getUTCFullYear(),m=d.getUTCMonth()+n,ty=y+Math.floor(m/12),tm=((m%12)+12)%12;
  return new Date(Date.UTC(ty,tm,Math.min(d.getUTCDate(),dim(ty,tm))));
}
const today=()=>{const n=new Date();return new Date(Date.UTC(n.getFullYear(),n.getMonth(),n.getDate()));};

register({
  key:'dates',cat:'texte',title:'Calculs de dates',input:'x_ts',
  words:'différence jours ajouter jour de la semaine semaine iso timestamp unix jours ouvrés calendrier',
  desc:'Écart entre deux dates, ajouter des jours ou des mois, jour de la semaine, timestamp Unix.',
  run(p){
    NOXE.tabs(p,[
      ['diff','Écart',host=>{
        const t=today();
        host.innerHTML='<div class="row"><div class="field"><label>Du</label><input type="date" id="a_d" value="'+isoD(t)+'"></div><div class="field"><label>Au</label><input type="date" id="a_f" value="'+isoD(new Date(t.getTime()+100*DAY))+'"></div></div><div id="a_out"></div>';
        function render(){
          let a=parseD($('a_d').value),b=parseD($('a_f').value);const o=$('a_out');
          if(!a||!b){o.innerHTML='';return;}
          const neg=b<a;if(neg)[a,b]=[b,a];
          const days=Math.round((b-a)/DAY);
          let mo=(b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth();
          if(addMonths(a,mo)>b)mo--;                                                    // mois entiers écoulés
          const y=Math.floor(mo/12),m=mo%12,d=Math.round((b-addMonths(a,mo))/DAY);      // + jours restants
          const ouvres=workdaysBetween(a,days);
          o.innerHTML=out([['Écart',(neg?'(B avant A) ':'')+[y&&plural(y,'an'),m&&plural(m,'mois','mois'),d&&plural(d,'jour')].filter(Boolean).join(', ')||'0 jour'],
            ['En jours',String(days)],['En semaines',Math.floor(days/7)+' sem. '+(days%7)+' j'],['Jours ouvrés (lun–ven)',String(ouvres)],['En heures',String(days*24)]]);
        }
        $('a_d').oninput=render;$('a_f').oninput=render;render();
      }],
      ['add','Ajouter / retirer',host=>{
        let unit='d',sign=1;
        host.innerHTML='<div class="group"><div class="row"><div class="field"><label>Date de départ</label><input type="date" id="d_s" value="'+isoD(today())+'"></div>'+
          '<div class="field"><label>Quantité</label><input type="number" id="d_n" value="30" min="0"></div></div>'+
          '<div class="row"><div class="field"><label>Sens</label><div class="segmented" id="d_sg"><button data-v="1" class="active">Ajouter</button><button data-v="-1">Retirer</button></div></div>'+
          '<div class="field"><label>Unité</label><div class="segmented" id="d_u"><button data-v="d" class="active">Jours</button><button data-v="w">Semaines</button><button data-v="m">Mois</button><button data-v="y">Années</button></div></div></div>'+
          '<label class="check" id="d_wk"><input type="checkbox" id="d_ouv"> Compter uniquement les jours ouvrés (lun–ven)</label></div><div id="d_out"></div>';
        function render(){
          const s=parseD($('d_s').value),n=Math.floor(+$('d_n').value),o=$('d_out');
          $('d_wk').style.display=unit==='d'?'flex':'none';
          if(!s||!(n>=0)){o.innerHTML='';return;}
          let r;
          if(unit==='d'&&$('d_ouv').checked)r=addWorkdays(s,sign*n);
          else if(unit==='d')r=new Date(s.getTime()+sign*n*DAY);
          else if(unit==='w')r=new Date(s.getTime()+sign*n*7*DAY);
          else r=addMonths(s,sign*n*(unit==='y'?12:1));
          if(!r||isNaN(r)){o.innerHTML='<div class="info bad">Date hors limites (au-delà de l\'an 275 000).</div>';return;}
          o.innerHTML=out([['Résultat',longD(r)],['Format ISO',isoD(r)],['Semaine ISO',String(isoWeek(r))],['Jour de l\'année',String(dayOfYear(r))]]);
        }
        seg('d_sg',v=>{sign=+v;render();});seg('d_u',v=>{unit=v;render();});
        $('d_s').oninput=render;$('d_n').oninput=render;$('d_ouv').onchange=render;render();
      }],
      ['info','Infos sur une date',host=>{
        host.innerHTML='<div class="field"><label>Date</label><input type="date" id="i_d" value="'+isoD(today())+'"></div><div id="i_out"></div>';
        function render(){
          const d=parseD($('i_d').value),o=$('i_out');if(!d){o.innerHTML='';return;}
          const y=d.getUTCFullYear(),total=isLeap(y)?366:365,doy=dayOfYear(d),t=today();
          const rel=Math.round((d-t)/DAY);
          o.innerHTML=out([['Jour',longD(d)],['Semaine ISO',String(isoWeek(d))],['Jour de l\'année',doy+' / '+total+' ('+(total-doy)+' restants)'],['Trimestre','T'+(Math.floor(d.getUTCMonth()/3)+1)],
            ['Année bissextile',isLeap(y)?'oui':'non'],['Par rapport à aujourd\'hui',rel===0?'aujourd\'hui':rel>0?'dans '+plural(rel,'jour'):'il y a '+plural(-rel,'jour')]]);
        }
        $('i_d').oninput=render;render();
      }],
      ['unix','Timestamp Unix',host=>{
        host.innerHTML='<div class="row"><div class="field"><label>Timestamp (secondes ou millisecondes)</label><input type="text" id="x_ts" spellcheck="false"></div><div class="field" style="flex:none;justify-content:flex-end"><button class="btn ghost" id="x_now">Maintenant</button></div></div><div id="x_out"></div>'+
          '<div class="field" style="margin-top:22px"><label>Date et heure locales → timestamp</label><input type="datetime-local" id="x_dt"></div><div id="x_out2"></div>';
        function fromTs(){
          const raw=$('x_ts').value.trim(),o=$('x_out');
          if(!raw){o.innerHTML='';return;}
          let n=Number(raw);if(!isFinite(n)){$('x_ts').classList.add('bad');o.innerHTML='';return;}
          $('x_ts').classList.remove('bad');
          const ms=Math.abs(n)>=1e11?n:n*1000,d=new Date(ms);
          if(isNaN(d)){o.innerHTML='<div class="info bad">Valeur hors limites.</div>';return;}
          o.innerHTML=out([['Interprété comme',Math.abs(n)>=1e11?'millisecondes':'secondes'],['UTC (ISO 8601)',d.toISOString()],
            ['Heure locale',d.toLocaleString('fr-FR',{dateStyle:'full',timeStyle:'medium'})],['Secondes',String(Math.floor(ms/1000))],['Millisecondes',String(ms)]]);
        }
        function fromDt(){
          const v=$('x_dt').value;if(!v){$('x_out2').innerHTML='';return;}
          const d=new Date(v);$('x_out2').innerHTML=out([['Secondes',String(Math.floor(d/1000))],['Millisecondes',String(d.getTime())],['UTC (ISO 8601)',d.toISOString()]]);
        }
        $('x_ts').oninput=fromTs;$('x_dt').oninput=fromDt;
        $('x_now').onclick=()=>{$('x_ts').value=String(Math.floor(Date.now()/1000));fromTs();};
        $('x_now').onclick();
      }]
    ]);
  }
});

})();
