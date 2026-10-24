/* tools/electronique.js — ÉLECTRONIQUE : loi d'Ohm, diviseur de tension, LED, code couleurs, résistances série/parallèle.
   Les champs acceptent les préfixes : 4k7, 4.7k, 10m (milli), 2M (méga), 100u / 100µ (micro), 22n, 10p. */
(function(){
const {register,seg,out}=NOXE;

/* ---------- valeurs avec préfixes SI ---------- */
const MULT={p:1e-12,n:1e-9,u:1e-6,'µ':1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,G:1e9,R:1,'':1};
function parseSI(str){
  if(str==null)return NaN;
  let s=String(str).trim().replace(',','.').replace(/\s+/g,'').replace(/ohms?/ig,'').replace(/Ω/g,'').replace(/[VAWFvawf]$/,'');
  let m=/^(\d+)([pnuµmkKMGR])(\d+)$/.exec(s);                    // notation 4k7
  if(m)return parseFloat(m[1]+'.'+m[3])*MULT[m[2]];
  m=/^([+-]?\d*\.?\d+(?:e[+-]?\d+)?)([pnuµmkKMGR]?)$/i.exec(s);
  return m?parseFloat(m[1])*MULT[m[2]]:NaN;
}
const PREF=[[1e9,'G'],[1e6,'M'],[1e3,'k'],[1,''],[1e-3,'m'],[1e-6,'µ'],[1e-9,'n'],[1e-12,'p']];
function fmtSI(v,unit){
  if(!isFinite(v))return'—';
  if(v===0)return'0 '+unit;
  const a=Math.abs(v),pr=PREF.find(p=>a>=p[0]*.9995)||PREF[PREF.length-1];
  return String(+(v/pr[0]).toPrecision(4)).replace('.',',')+' '+pr[1]+unit;
}

/* ---------- série E24 ---------- */
const E24=[1.0,1.1,1.2,1.3,1.5,1.6,1.8,2.0,2.2,2.4,2.7,3.0,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1];
function e24(v,mode){                                             // mode : 'near' (plus proche), 'up' (≥), 'down' (≤)
  if(!(v>0))return NaN;
  const dec=Math.floor(Math.log10(v)),all=[];
  for(let d=dec-1;d<=dec+1;d++)E24.forEach(x=>all.push(+(x*Math.pow(10,d)).toPrecision(3)));
  all.sort((a,b)=>a-b);
  if(mode==='up')return all.find(x=>x>=v*.9999);
  if(mode==='down')return [...all].reverse().find(x=>x<=v*1.0001);
  return all.reduce((b,x)=>Math.abs(x-v)<Math.abs(b-v)?x:b);
}

/* ===================== Loi d'Ohm, diviseur, LED ===================== */
register({
  key:'ohm',cat:'elec',title:'Ohm, diviseur & LED',
  words:'loi ohm tension courant résistance puissance diviseur résistance led esp32 3.3v',
  desc:'Loi d\'Ohm (donne-en deux, il calcule le reste), diviseur de tension et résistance pour LED.',
  run(p){
    NOXE.tabs(p,[
      ['ohm','Loi d\'Ohm',host=>{
        const K=[['U','Tension U','V'],['I','Courant I','A'],['R','Résistance R','Ω'],['P','Puissance P','W']];
        host.innerHTML='<div class="info" style="margin:0 0 4px">Remplis <b>deux</b> champs : les deux autres se calculent tout seuls.</div><div class="group"><div class="row">'+
          K.map(k=>'<div class="field"><label>'+k[1]+' ('+k[2]+')</label><input type="text" id="o_'+k[0]+'" spellcheck="false" autocomplete="off" placeholder="ex : 4k7"></div>').join('')+'</div></div><div class="info" id="o_msg"></div>';
        let order=[];
        const SOLVE={IU:(i,u)=>({R:u/i,P:u*i}),IR:(i,r)=>({U:i*r,P:i*i*r}),IP:(i,pw)=>({U:pw/i,R:pw/(i*i)}),
          PR:(pw,r)=>({U:Math.sqrt(pw*r),I:Math.sqrt(pw/r)}),PU:(pw,u)=>({I:pw/u,R:u*u/pw}),RU:(r,u)=>({I:u/r,P:u*u/r})};
        function update(){
          const calc=K.map(k=>k[0]).filter(k=>!order.includes(k));
          if(order.length<2){calc.forEach(k=>{$('o_'+k).value='';$('o_'+k).style.opacity=1;});$('o_msg').textContent='';return;}
          const [a,b]=order,key=[a,b].sort().join(''),va=parseSI($('o_'+a).value),vb=parseSI($('o_'+b).value);
          const v={[a]:va,[b]:vb},sorted=[a,b].sort();
          const res=SOLVE[key](v[sorted[0]],v[sorted[1]]);
          let bad=false;
          calc.forEach(k=>{const x=res[k],el=$('o_'+k);el.style.opacity=.75;
            if(!isFinite(x)||x<0&&k!=='U'&&k!=='I'){el.value='—';bad=true;}else el.value=fmtSI(x,K.find(q=>q[0]===k)[2]);});
          $('o_msg').innerHTML=bad?'<span class="bad">Combinaison impossible (division par zéro ?)</span>':'';
        }
        K.forEach(([k])=>$('o_'+k).oninput=()=>{
          const el=$('o_'+k);el.style.opacity=1;
          order=order.filter(x=>x!==k);
          if(el.value.trim()&&!isNaN(parseSI(el.value)))order.push(k);
          el.classList.toggle('bad',!!el.value.trim()&&isNaN(parseSI(el.value)));
          order=order.slice(-2);update();
        });
      }],
      ['div','Diviseur de tension',host=>{
        host.innerHTML=
          '<div class="group"><div class="row"><div class="field"><label>Vin (V)</label><input type="text" id="v_in" value="5" spellcheck="false"></div>'+
          '<div class="field"><label>R1 (Ω)</label><input type="text" id="v_r1" value="1k" spellcheck="false"></div>'+
          '<div class="field"><label>R2 (Ω)</label><input type="text" id="v_r2" value="2k" spellcheck="false"></div></div></div><div id="v_out"></div>'+
          '<div class="lbl" style="margin-top:26px">Trouver R2 pour une tension voulue</div>'+
          '<div class="group" style="margin-top:8px"><div class="row"><div class="field"><label>Vin (V)</label><input type="text" id="w_in" value="5" spellcheck="false"></div>'+
          '<div class="field"><label>Vout voulue (V)</label><input type="text" id="w_out" value="3.3" spellcheck="false"></div>'+
          '<div class="field"><label>R1 (Ω)</label><input type="text" id="w_r1" value="1k" spellcheck="false"></div></div></div><div id="w_res"></div>'+
          '<div class="info">Vout = Vin × R2 / (R1 + R2). Exemple classique : 5 V → 3,3 V pour une entrée de ESP32. Le diviseur ne convient qu\'à une charge très faible (signal), pas à une alimentation.</div>';
        function a(){
          const vin=parseSI($('v_in').value),r1=parseSI($('v_r1').value),r2=parseSI($('v_r2').value);
          ['v_in','v_r1','v_r2'].forEach(id=>$(id).classList.toggle('bad',isNaN(parseSI($(id).value))));
          if([vin,r1,r2].some(x=>isNaN(x))||r1+r2<=0){$('v_out').innerHTML='';return;}
          const vout=vin*r2/(r1+r2),i=vin/(r1+r2);
          $('v_out').innerHTML=out([['Vout',fmtSI(vout,'V')],['Courant dans le pont',fmtSI(i,'A')],['Puissance totale',fmtSI(vin*i,'W')],['Rapport R2/(R1+R2)',String(+(r2/(r1+r2)).toFixed(4)).replace('.',',')]]);
        }
        function b(){
          const vin=parseSI($('w_in').value),vo=parseSI($('w_out').value),r1=parseSI($('w_r1').value);
          ['w_in','w_out','w_r1'].forEach(id=>$(id).classList.toggle('bad',isNaN(parseSI($(id).value))));
          if([vin,vo,r1].some(x=>isNaN(x))){$('w_res').innerHTML='';return;}
          if(!(vo>0&&vo<vin)){$('w_res').innerHTML='<div class="info bad">Vout doit être comprise entre 0 et Vin.</div>';return;}
          const r2=r1*vo/(vin-vo),n=e24(r2,'near'),got=vin*n/(r1+n);
          $('w_res').innerHTML=out([['R2 exacte',fmtSI(r2,'Ω')],['R2 normalisée (E24, la plus proche)',fmtSI(n,'Ω')],['Vout obtenue avec cette valeur',fmtSI(got,'V')]]);
        }
        ['v_in','v_r1','v_r2'].forEach(id=>$(id).oninput=a);['w_in','w_out','w_r1'].forEach(id=>$(id).oninput=b);a();b();
      }],
      ['led','Résistance de LED',host=>{
        host.innerHTML=
          '<div class="group"><div class="row"><div class="field"><label>Alimentation (V)</label><input type="text" id="l_vs" value="5" spellcheck="false"></div>'+
          '<div class="field"><label>Tension LED Vf (V)</label><input type="text" id="l_vf" value="2" spellcheck="false"></div>'+
          '<div class="field"><label>Courant voulu (A)</label><input type="text" id="l_if" value="15m" spellcheck="false"></div></div>'+
          '<div class="field"><label>Couleur (Vf typique)</label><div class="segmented" id="l_col"><button data-v="1.8">Rouge 1,8</button><button data-v="2.0" class="active">Jaune/orange 2,0</button><button data-v="2.2">Vert 2,2</button><button data-v="3.0">Bleu 3,0</button><button data-v="3.2">Blanc 3,2</button></div></div></div><div id="l_out"></div>'+
          '<div class="info">Une LED indicatrice s\'allume déjà bien vers 5–15 mA. 20 mA est le maximum courant. Les GPIO d\'un ESP32 ne doivent pas dépasser ~12 mA.</div>';
        function render(){
          const vs=parseSI($('l_vs').value),vf=parseSI($('l_vf').value),i=parseSI($('l_if').value);
          ['l_vs','l_vf','l_if'].forEach(id=>$(id).classList.toggle('bad',isNaN(parseSI($(id).value))));
          if([vs,vf,i].some(x=>isNaN(x))||!(i>0)){$('l_out').innerHTML='';return;}
          if(vs<=vf){$('l_out').innerHTML='<div class="info bad">L\'alimentation doit être supérieure à la tension de la LED.</div>';return;}
          const r=(vs-vf)/i,n=e24(r,'up'),real=(vs-vf)/n;
          $('l_out').innerHTML=out([['Résistance calculée',fmtSI(r,'Ω')],['Valeur normalisée à prendre (E24, ≥)',fmtSI(n,'Ω')],['Courant réel avec elle',fmtSI(real,'A')],['Puissance dans la résistance',fmtSI((vs-vf)*real,'W')+'  (¼ W suffit presque toujours)']]);
        }
        ['l_vs','l_vf','l_if'].forEach(id=>$(id).oninput=render);
        seg('l_col',v=>{$('l_vf').value=v.replace('.',',');render();});render();
      }]
    ]);
  }
});

/* ===================== Résistances : code couleurs, série/parallèle ===================== */
const COL=[ // nom, couleur, chiffre, multiplicateur, tolérance %
  ['Noir','#111',0,1,null],['Marron','#7a4a1e',1,10,1],['Rouge','#d33',2,100,2],['Orange','#f80',3,1e3,null],['Jaune','#ee3',4,1e4,null],
  ['Vert','#2a3',5,1e5,.5],['Bleu','#26c',6,1e6,.25],['Violet','#86c',7,1e7,.1],['Gris','#999',8,1e8,.05],['Blanc','#eee',9,1e9,null],
  ['Or','#c9a227',null,.1,5],['Argent','#bbb',null,.01,10]
];
register({
  key:'resistance',cat:'elec',title:'Résistances',
  words:'code couleurs bagues série parallèle e24 ohm composant',
  desc:'Lis une résistance par ses bandes de couleurs (et inversement), calcule des montages série / parallèle.',
  run(p){
    NOXE.tabs(p,[
      ['color','Code couleurs',host=>{
        let bands=4;
        const sel=(id,idx)=>'<select id="'+id+'">'+idx.map(i=>'<option value="'+i+'">'+COL[i][0]+'</option>').join('')+'</select>';
        const dig=[0,1,2,3,4,5,6,7,8,9],mul=[0,1,2,3,4,5,6,7,8,9,10,11],tol=[1,2,5,6,7,8,10,11];
        host.innerHTML=
          '<div class="field"><label>Nombre de bandes</label><div class="segmented" id="c_n"><button data-v="4" class="active">4 bandes</button><button data-v="5">5 bandes</button></div></div>'+
          '<div class="resistor" id="c_res"></div>'+
          '<div class="group"><div class="row" id="c_sel"></div></div><div id="c_out"></div>'+
          '<div class="field" style="margin-top:22px"><label>Ou : quelles couleurs pour cette valeur ?</label><input type="text" id="c_val" placeholder="ex : 4k7, 330, 1M" spellcheck="false"></div>';
        function build(){
          const keep={};['c1','c2','c3','cm','ct'].forEach(id=>{if($(id))keep[id]=$(id).value;});
          $('c_sel').innerHTML='<div class="field"><label>Bande 1</label>'+sel('c1',dig.slice(0))+'</div><div class="field"><label>Bande 2</label>'+sel('c2',dig)+'</div>'+
            (bands===5?'<div class="field"><label>Bande 3</label>'+sel('c3',dig)+'</div>':'')+
            '<div class="field"><label>Multiplicateur</label>'+sel('cm',mul)+'</div><div class="field"><label>Tolérance</label>'+sel('ct',tol)+'</div>';
          const def={c1:1,c2:0,c3:0,cm:bands===5?2:2,ct:10};      // 1 0 ×100 = 1 kΩ
          ['c1','c2','c3','cm','ct'].forEach(id=>{if($(id)){$(id).value=keep[id]!=null?keep[id]:def[id];$(id).onchange=render;}});
          render();
        }
        function render(){
          const d=[+$('c1').value,+$('c2').value].concat(bands===5?[+$('c3').value]:[]);
          const m=COL[+$('cm').value][3],t=COL[+$('ct').value][4];
          const val=d.reduce((a,x)=>a*10+COL[x][2],0)*m;
          const stripes=d.map(i=>COL[i][1]).concat([COL[+$('cm').value][1]]);
          $('c_res').innerHTML=stripes.map(c=>'<i style="background:'+c+'"></i>').join('')+'<i class="gap"></i><i style="background:'+COL[+$('ct').value][1]+'"></i>';
          $('c_out').innerHTML=out([['Valeur',fmtSI(val,'Ω')+'  ±'+String(t).replace('.',',')+' %'],
            ['Plage réelle',fmtSI(val*(1-t/100),'Ω')+' → '+fmtSI(val*(1+t/100),'Ω')],['Valeur brute',String(+val.toPrecision(6)).replace('.',',')+' Ω']]);
        }
        function fromValue(){
          const v=parseSI($('c_val').value);
          $('c_val').classList.toggle('bad',!!$('c_val').value.trim()&&!(v>0));
          if(!(v>0))return;
          const n=bands-2,lo=Math.pow(10,n-1);                    // 4 bandes → 2 chiffres ; 5 bandes → 3 chiffres
          let e=Math.floor(Math.log10(v))-(n-1),digits=Math.round(v/Math.pow(10,e));
          if(digits>=lo*10){digits=Math.round(digits/10);e++;}
          if(e<-2||e>9){toast('Valeur hors de la plage du code couleurs');return;}
          const s=String(digits);
          $('c1').value=+s[0];$('c2').value=+s[1];if(bands===5)$('c3').value=+s[2];
          $('cm').value=e<0?(e===-1?10:11):e;render();
        }
        seg('c_n',v=>{bands=+v;build();if($('c_val').value)fromValue();});
        $('c_val').oninput=fromValue;build();
      }],
      ['sp','Série / parallèle',host=>{
        host.innerHTML=
          '<div class="field"><label>Valeurs (séparées par des espaces, des points-virgules ou des retours à la ligne)</label><textarea id="s_in" spellcheck="false" placeholder="ex : 100  220  4k7">100  220  4k7</textarea></div><div id="s_out"></div>'+
          '<div class="info">Série : R = R1 + R2 + … · Parallèle : 1/R = 1/R1 + 1/R2 + …</div>';
        function render(){
          const toks=[];                                       // espaces / ; séparent ; « 4,7k » reste un décimal, « 100,220 » aussi
          $('s_in').value.split(/[\s;]+/).filter(Boolean).forEach(t=>{if(/^\d+,\d+[a-zA-Zµ]?$/.test(t)||!t.includes(','))toks.push(t);else t.split(',').filter(Boolean).forEach(x=>toks.push(x));});
          const vals=toks.map(parseSI);
          const bad=vals.some(v=>isNaN(v)||!(v>0));
          $('s_in').classList.toggle('bad',bad&&!!$('s_in').value.trim());
          if(!vals.length||bad){$('s_out').innerHTML=bad?'<div class="info bad">Une valeur n\'est pas reconnue (exemples : 330, 4k7, 1M).</div>':'';return;}
          const ser=vals.reduce((a,b)=>a+b,0),par=1/vals.reduce((a,b)=>a+1/b,0);
          $('s_out').innerHTML=out([['Nombre de résistances',String(vals.length)],['En série',fmtSI(ser,'Ω')],['En parallèle',fmtSI(par,'Ω')],
            ['Parallèle, valeur E24 la plus proche',fmtSI(e24(par,'near'),'Ω')]]);
        }
        $('s_in').oninput=render;render();
      }]
    ]);
  }
});

})();
