/* tools/esp32.js — ESP32 : brochage, budget de courant, autonomie sur batterie, niveaux 5 V -> 3,3 V, LED, ADC, PWM.
   Pensé pour une carte « DevKit » ESP32-WROOM-32 (30 ou 38 broches). Les chiffres sont des ordres de grandeur utiles
   pour concevoir ; pour un montage qui compte, vérifie la fiche technique (datasheet) de TA carte et de TON module. */
(function(){
const {register,tabs,out}=NOXE;
const {parseSI,fmtSI,e24}=NOXE.si;
const fr=(v,d)=>isFinite(v)?String(+v.toPrecision(d||4)).replace('.',','):'-';
const num=s=>parseFloat(String(s).trim().replace(',','.'));

/* ============ BROCHAGE ============
   [gpio, état, fonctions, remarque]   état : ok = utilisable · care = utilisable avec précaution · no = à ne pas utiliser */
const PINS=[
 [0,'care','strapping · ADC2_CH1 · Touch1','Bas au démarrage = mode flash. Évite un bouton ou une LED ici.'],
 [1,'care','TX0 (UART0)','Utilisé par le moniteur série / l\'USB.'],
 [2,'care','strapping · ADC2_CH2 · Touch2','LED intégrée sur beaucoup de cartes. Doit être bas ou flottant pour flasher.'],
 [3,'care','RX0 (UART0)','Utilisé par le moniteur série / l\'USB.'],
 [4,'ok','ADC2_CH0 · Touch0',''],
 [5,'care','strapping · VSPI CS','Sort un signal PWM au démarrage.'],
 [6,'no','flash SPI (CLK)','Relié à la mémoire flash : ne pas utiliser.'],
 [7,'no','flash SPI (D0)','Relié à la mémoire flash : ne pas utiliser.'],
 [8,'no','flash SPI (D1)','Relié à la mémoire flash : ne pas utiliser.'],
 [9,'no','flash SPI (D2)','Relié à la mémoire flash : ne pas utiliser.'],
 [10,'no','flash SPI (D3)','Relié à la mémoire flash : ne pas utiliser.'],
 [11,'no','flash SPI (CMD)','Relié à la mémoire flash : ne pas utiliser.'],
 [12,'care','strapping (MTDI) · ADC2_CH5 · Touch5 · HSPI MISO','Doit être BAS au démarrage, sinon le module peut ne pas démarrer.'],
 [13,'ok','ADC2_CH4 · Touch4 · HSPI MOSI',''],
 [14,'ok','ADC2_CH6 · Touch6 · HSPI CLK','Sort un signal PWM au démarrage.'],
 [15,'care','strapping (MTDO) · ADC2_CH3 · Touch3 · HSPI CS','Message de démarrage sur le port série si haut.'],
 [16,'ok','UART2 RX','Sur un module WROVER : pris par la PSRAM.'],
 [17,'ok','UART2 TX','Sur un module WROVER : pris par la PSRAM.'],
 [18,'ok','VSPI CLK',''],
 [19,'ok','VSPI MISO',''],
 [21,'ok','I2C SDA (par défaut)',''],
 [22,'ok','I2C SCL (par défaut)',''],
 [23,'ok','VSPI MOSI',''],
 [25,'ok','DAC1 · ADC2_CH8',''],
 [26,'ok','DAC2 · ADC2_CH9',''],
 [27,'ok','ADC2_CH7 · Touch7',''],
 [32,'ok','ADC1_CH4 · Touch9','Quartz 32 kHz sur certaines cartes.'],
 [33,'ok','ADC1_CH5 · Touch8','Quartz 32 kHz sur certaines cartes.'],
 [34,'ok','ADC1_CH6 · entrée seulement','Pas de résistance de tirage interne (pull-up / pull-down).'],
 [35,'ok','ADC1_CH7 · entrée seulement','Pas de résistance de tirage interne.'],
 [36,'ok','ADC1_CH0 (VP) · entrée seulement','Pas de résistance de tirage interne.'],
 [39,'ok','ADC1_CH3 (VN) · entrée seulement','Pas de résistance de tirage interne.']
];
const MARK={ok:'[ok]',care:'[!]',no:'[x]'};

/* ============ ADC : plages utiles par atténuation (doc ESP-IDF, ESP32 d'origine), en mV ============ */
const ATT=[['0 dB',100,950],['2,5 dB',100,1250],['6 dB',150,1750],['11 dB',150,2450]];

function tabPins(h){
  h.innerHTML=
    '<div class="field"><label>Chercher</label><input type="text" id="e_q" placeholder="21, i2c, spi, adc, touch, dac, uart, boot…" spellcheck="false" autocomplete="off"></div>'+
    '<div class="field" style="margin-top:12px"><div class="segmented" id="e_f"><button data-v="all" class="active">Toutes</button><button data-v="ok">Sans souci</button><button data-v="care">Avec précaution</button><button data-v="no">À éviter</button></div></div>'+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>GPIO</th><th>Fonctions</th><th>Remarque</th></tr></thead><tbody id="e_rows"></tbody></table></div>'+
    '<div class="info"><b>[ok]</b> sans souci · <b>[!]</b> avec précaution (broches de démarrage ou série) · <b>[x]</b> ne pas utiliser. '+
    'Niveaux logiques : <b>3,3 V seulement</b>, pas de 5 V sur une broche. L\'ADC2 est inutilisable quand le WiFi est actif : préfère l\'ADC1 (GPIO 32 à 39). '+
    'Courant par broche : reste autour de 10 à 20 mA ; 40 mA est la limite absolue (vérifie la datasheet).</div>';
  let f='all';
  function render(){
    const q=$('e_q').value.trim().toLowerCase().replace(/^gpio\s*/,'');
    const rows=PINS.filter(r=>(f==='all'||r[1]===f)&&(!q||(r[0]+' '+r[2]+' '+r[3]).toLowerCase().includes(q)));
    $('e_rows').innerHTML=rows.length?rows.map(r=>'<tr><td>'+MARK[r[1]]+'</td><td>'+r[0]+'</td><td>'+esc(r[2])+'</td><td class="dim">'+esc(r[3])+'</td></tr>').join(''):
      '<tr><td colspan="4" class="dim">Aucune broche ne correspond.</td></tr>';
  }
  NOXE.seg('e_f',v=>{f=v;render();});$('e_q').oninput=render;render();
}

function tabPower(h){
  h.innerHTML=
    '<div class="lbl">Budget de courant</div>'+
    '<div class="field"><label>Consommateurs — une ligne « nom ; mA » <b>(valeurs d\'exemple : remplace par les tiennes)</b></label>'+
    '<textarea id="p_list" spellcheck="false" rows="6">ESP32 (WiFi actif, pointes) ; 240\nLED ; 10\nCapteur BME280 ; 1\nEcran OLED ; 20</textarea></div>'+
    '<div class="row"><div class="field"><label>Limite de la source (mA)</label><input type="text" id="p_lim" value="500" inputmode="decimal"></div>'+
    '<div class="field"><label>Tension d\'entrée du régulateur (V)</label><input type="text" id="p_vin" value="5" inputmode="decimal"></div></div>'+
    '<div id="p_out1"></div>'+
    '<div class="lbl" style="margin-top:26px">Autonomie sur batterie</div>'+
    '<div class="row"><div class="field"><label>Capacité (mAh)</label><input type="text" id="b_cap" value="2000" inputmode="decimal"></div>'+
    '<div class="field"><label>Courant actif (mA)</label><input type="text" id="b_ia" value="80" inputmode="decimal"></div>'+
    '<div class="field"><label>Durée active (s)</label><input type="text" id="b_ta" value="3" inputmode="decimal"></div></div>'+
    '<div class="row"><div class="field"><label>Courant en veille (µA)</label><input type="text" id="b_is" value="150" inputmode="decimal"></div>'+
    '<div class="field"><label>Un cycle toutes les (s)</label><input type="text" id="b_t" value="600" inputmode="decimal"></div>'+
    '<div class="field"><label>Capacité réellement utilisable (%)</label><input type="text" id="b_pc" value="80" inputmode="decimal"></div></div>'+
    '<div id="p_out2"></div>'+
    '<div class="info">La veille d\'une <b>carte</b> (régulateur, puce USB-série, LED d\'alimentation) consomme bien plus que la puce seule en deep sleep : mesure avec un multimètre en série. ' +
    'Un régulateur linéaire transforme l\'excédent de tension en chaleur : P = (Vin - 3,3) × I.</div>';
  function r1(){
    const lines=$('p_list').value.split('\n').map(s=>s.trim()).filter(Boolean);
    const items=lines.map(l=>{const i=l.lastIndexOf(';');return[i<0?l:l.slice(0,i).trim(),num(i<0?'':l.slice(i+1))];});
    const bad=items.some(x=>!isFinite(x[1])||x[1]<0);
    $('p_list').classList.toggle('bad',bad);
    if(bad||!items.length){$('p_out1').innerHTML=bad?'<div class="info bad">Chaque ligne doit finir par « ; » puis un nombre de mA.</div>':'';return;}
    const tot=items.reduce((a,x)=>a+x[1],0),lim=num($('p_lim').value),vin=num($('p_vin').value);
    const rows=[['Courant total',fr(tot)+' mA']];
    if(lim>0){const use=tot/lim*100;rows.push(['Part de la limite',fr(use,3)+' %'+(use>100?'  (DÉPASSÉ)':use>80?'  (juste : garde de la marge)':'')]);}
    if(vin>3.3&&isFinite(vin))rows.push(['Chaleur dans le régulateur',fmtSI((vin-3.3)*tot/1000,'W')+'  (Vin '+fr(vin)+' V -> 3,3 V)']);
    $('p_out1').innerHTML=out(rows);
  }
  function r2(){
    const cap=num($('b_cap').value),ia=num($('b_ia').value),ta=num($('b_ta').value),is=num($('b_is').value)/1000,T=num($('b_t').value),pc=num($('b_pc').value)/100;
    const ok=[cap,ia,ta,is,T,pc].every(isFinite)&&cap>0&&T>0&&ta>=0&&ta<=T&&pc>0&&pc<=1;
    if(!ok){$('p_out2').innerHTML='<div class="info bad">Vérifie les valeurs (la durée active ne peut pas dépasser la durée du cycle).</div>';return;}
    const avg=(ia*ta+is*(T-ta))/T,hours=cap*pc/avg,hours0=cap*pc/ia;
    const dur=h=>h>=48?fr(h/24,3)+' jours':fr(h,3)+' h';
    $('p_out2').innerHTML=out([['Courant moyen',fr(avg,3)+' mA'],['Autonomie estimée',dur(hours)],['Toujours actif (sans veille)',dur(hours0)],
      ['Gain de la veille','x '+fr(hours/hours0,3)],['Part du temps actif',fr(ta/T*100,3)+' %']]);
  }
  ['p_list','p_lim','p_vin'].forEach(id=>$(id).oninput=r1);
  ['b_cap','b_ia','b_ta','b_is','b_t','b_pc'].forEach(id=>$(id).oninput=r2);
  r1();r2();
}

function tabLevels(h){
  h.innerHTML=
    '<div class="lbl">Diviseur de tension (signal 5 V -> 3,3 V)</div>'+
    '<div class="row"><div class="field"><label>Tension du signal (V)</label><input type="text" id="d_vin" value="5" inputmode="decimal"></div>'+
    '<div class="field"><label>Tension voulue (V)</label><input type="text" id="d_vout" value="3.3" inputmode="decimal"></div></div>'+
    '<div id="d_out"></div>'+
    '<div class="info">Un diviseur convient aux signaux <b>lents et à sens unique</b> (capteur -> ESP32). Pour un bus bidirectionnel (I2C) ou rapide, utilise un convertisseur de niveau.</div>'+
    '<div class="lbl" style="margin-top:26px">Résistance de LED sur une broche (3,3 V)</div>'+
    '<div class="row"><div class="field"><label>Tension de la LED (V)</label><input type="text" id="l_vf" value="2.0" inputmode="decimal"></div>'+
    '<div class="field"><label>Courant voulu (mA)</label><input type="text" id="l_i" value="5" inputmode="decimal"></div></div>'+
    '<div id="l_out"></div>'+
    '<div class="info">Tensions typiques : rouge ~ 2 V, jaune / vert ~ 2 V, bleu / blanc ~ 3 V. Une LED bleue ou blanche à 3,3 V laisse très peu de marge : lis sa fiche.</div>';
  function rd(){
    const vin=num($('d_vin').value),vt=num($('d_vout').value);
    if(!(vin>0&&vt>0&&vt<vin)){$('d_out').innerHTML='<div class="info bad">La tension voulue doit être positive et plus petite que celle du signal.</div>';return;}
    const ratio=vin/vt-1,res=[];
    for(const r2 of [1e3,1.5e3,2.2e3,3.3e3,4.7e3,6.8e3,10e3,22e3,33e3,47e3]){
      const r1=e24(r2*ratio,'near'),v=vin*r2/(r1+r2);res.push({r1,r2,v,err:(v-vt)/vt*100,i:vin/(r1+r2)});
    }
    res.sort((a,b)=>Math.abs(a.err)-Math.abs(b.err)||a.r1+a.r2-b.r1-b.r2);
    const best=res.slice(0,3);
    $('d_out').innerHTML='<div class="tbl-wrap"><table class="tbl"><thead><tr><th>R1 (haut)</th><th>R2 (bas)</th><th>Sortie</th><th>Écart</th><th>Courant</th></tr></thead><tbody>'+
      best.map(b=>'<tr><td>'+fmtSI(b.r1,'Ω')+'</td><td>'+fmtSI(b.r2,'Ω')+'</td><td>'+fr(b.v,3)+' V</td><td>'+(b.err>=0?'+':'')+fr(b.err,2)+' %</td><td>'+fmtSI(b.i,'A')+'</td></tr>').join('')+
      '</tbody></table></div>'+(vt>3.3?'<div class="info bad">Attention : au-dessus de 3,3 V, tu risques d\'abîmer la broche.</div>':'');
  }
  function rl(){
    const vf=num($('l_vf').value),i=num($('l_i').value)/1000,vs=3.3;
    if(!(vf>0&&i>0)){$('l_out').innerHTML='';return;}
    if(vf>=vs){$('l_out').innerHTML='<div class="info bad">La LED demande au moins '+fr(vf)+' V : 3,3 V ne suffit pas (prends un transistor et une alimentation plus haute).</div>';return;}
    const r=(vs-vf)/i,re=e24(r,'up'),ie=(vs-vf)/re;
    $('l_out').innerHTML=out([['Résistance calculée',fmtSI(r,'Ω')],['Valeur E24 (arrondie vers le haut)',fmtSI(re,'Ω')],['Courant réel',fmtSI(ie,'A')],
      ['Puissance dans la résistance',fmtSI((vs-vf)*ie,'W')]])+(ie>0.02?'<div class="info bad">Plus de 20 mA sur une broche : trop. Vise 5 à 10 mA, ou commande la LED avec un transistor.</div>':'');
  }
  ['d_vin','d_vout'].forEach(id=>$(id).oninput=rd);['l_vf','l_i'].forEach(id=>$(id).oninput=rl);rd();rl();
}

function tabAdcPwm(h){
  h.innerHTML=
    '<div class="lbl">ADC (12 bits : valeurs de 0 à 4095)</div>'+
    '<div class="row"><div class="field"><label>Valeur lue (0 à 4095)</label><input type="text" id="a_raw" value="2048" inputmode="numeric"></div>'+
    '<div class="field"><label>Tension de référence (V)</label><input type="text" id="a_ref" value="3.3" inputmode="decimal"></div>'+
    '<div class="field"><label>ou tension mesurée (V)</label><input type="text" id="a_v" placeholder="ex : 1.65" inputmode="decimal"></div></div>'+
    '<div id="a_out"></div>'+
    '<div class="info">Le calcul ci-dessus est linéaire. Sur un ESP32 réel, la courbe n\'est <b>pas</b> linéaire près de 0 V et de la pleine échelle : utilise <b>analogReadMilliVolts()</b> (il applique la calibration) ou limite-toi aux plages ci-dessous.</div>'+
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Atténuation</th><th>Plage utile (mV)</th></tr></thead><tbody>'+
    ATT.map(a=>'<tr><td>'+a[0]+'</td><td>'+a[1]+' à '+a[2]+'</td></tr>').join('')+'</tbody></table></div>'+
    '<div class="lbl" style="margin-top:26px">PWM (LEDC)</div>'+
    '<div class="row"><div class="field"><label>Fréquence (Hz)</label><input type="text" id="w_f" value="5k" inputmode="decimal"></div>'+
    '<div class="field"><label>Résolution (bits)</label><select id="w_b">'+[8,9,10,11,12,13,14,15,16].map(b=>'<option value="'+b+'"'+(b===10?' selected':'')+'>'+b+'</option>').join('')+'</select></div>'+
    '<div class="field"><label>Rapport cyclique (%)</label><input type="text" id="w_p" value="25" inputmode="decimal"></div></div>'+
    '<div id="w_out"></div>'+
    '<div class="info">Règle : fréquence × 2^résolution ne doit pas dépasser 80 MHz (horloge du bloc LEDC). Plus la fréquence monte, moins il reste de bits.</div>';
  function ra(){
    const ref=num($('a_ref').value),vs=$('a_v').value.trim();
    if(!(ref>0)){$('a_out').innerHTML='';return;}
    let raw;
    if(vs){const v=num(vs);if(!isFinite(v)||v<0){$('a_out').innerHTML='<div class="info bad">Tension invalide.</div>';return;}raw=Math.min(4095,Math.round(v/ref*4095));}
    else{raw=Math.round(num($('a_raw').value));if(!isFinite(raw)||raw<0||raw>4095){$('a_out').innerHTML='<div class="info bad">La valeur doit être entre 0 et 4095.</div>';return;}}
    const v=raw/4095*ref;
    $('a_out').innerHTML=out([['Valeur ADC',String(raw)],['Tension (calcul linéaire)',fmtSI(v,'V')],['Pas de mesure (1 LSB)',fmtSI(ref/4095,'V')]]);
  }
  function rw(){
    const f=parseSI($('w_f').value),b=+$('w_b').value,p=num($('w_p').value);
    if(!(f>0)||!(p>=0&&p<=100)){$('w_out').innerHTML='<div class="info bad">Fréquence ou rapport cyclique invalide.</div>';return;}
    const max=Math.floor(Math.log2(80e6/f)),fits=f*Math.pow(2,b)<=80e6,top=Math.pow(2,b)-1;
    $('w_out').innerHTML=out([['Valeur à écrire (ledcWrite)',String(Math.round(p/100*top))+'  sur  '+top],['Fréquence maximale avec '+b+' bits',fmtSI(80e6/Math.pow(2,b),'Hz')],
      ['Résolution maximale à cette fréquence',max>=1?String(Math.min(max,20))+' bits':'aucune : fréquence trop haute'],['Réglage valide',fits?'oui':'NON : baisse la fréquence ou la résolution']]);
    $('w_f').classList.toggle('bad',!fits);
  }
  ['a_raw','a_ref','a_v'].forEach(id=>$(id).oninput=ra);['w_f','w_p'].forEach(id=>$(id).oninput=rw);$('w_b').onchange=rw;ra();rw();
}

register({
  key:'esp32',cat:'elec',title:'ESP32',
  words:'esp32 gpio brochage pinout broches adc dac pwm ledc i2c spi uart batterie autonomie deep sleep 3.3 diviseur niveau led resistance boot strapping',
  desc:'Brochage (broches à éviter, ADC, I2C, SPI), budget de courant, autonomie sur batterie, 5 V -> 3,3 V, résistance de LED, ADC et PWM.',
  run(p){
    tabs(p,[['pins','Brochage',tabPins],['pow','Alimentation',tabPower],['lev','Niveaux & LED',tabLevels],['adc','ADC & PWM',tabAdcPwm]]);
  }
});
/* l'aide-mémoire (tools/memo.js) peut s'en servir pour la recherche */
NOXE.esp32Pins=PINS;
})();
