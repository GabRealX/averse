/* tools/circuit.js — SIMULATEUR DE CIRCUIT : tu écris le montage, il dessine le schéma et calcule.
   Le calcul et le dessin sont dans js/circuit-core.js (le carnet les utilise aussi : bloc ```circuit```).
   Syntaxe : voir l'en-tête de circuit-core.js — résistances (330, 4k7), led, d, c:100n, l:10m, sw, lamp ;
   « + » en série, « | » en parallèle, ( ) pour grouper. Avec une tension de source : V, I et P de chaque composant. */
(function(){
const {register,out}=NOXE;
const C=CIRCUIT;

register({
  key:'circuit',cat:'elec',title:'Simulateur de circuit',
  words:'resistances serie parallele schema circuit req tension courant puissance montage calcul diviseur led diode condensateur bobine interrupteur lampe simulation electronique',
  desc:'Écris un montage ( 330 + led:rouge ), vois le schéma avec les vrais composants, la tension, le courant et la puissance de chacun. Un clic l\'insère dans une note.',
  input:'ci_expr',
  run(p){
    p.innerHTML=
      '<div class="field"><label>Montage <b>+ série · | parallèle · ( ) groupes</b></label>'+
      '<textarea id="ci_expr" rows="2" spellcheck="false" autocomplete="off">100 + (220 | 330) + led:vert</textarea></div>'+
      '<div class="btn-row" id="ci_pal" role="group" aria-label="Ajouter un composant"></div>'+
      '<div class="row" style="margin-top:14px"><div class="field"><label>Tension de la source (V) — vide = pas de simulation</label>'+
      '<input type="text" id="ci_v" value="9" spellcheck="false" autocomplete="off"></div></div>'+
      '<div class="lbl" style="margin-top:14px">Exemples</div><div class="btn-row" id="ci_ex"></div>'+
      '<div id="ci_err"></div><div id="ci_svg" class="preview-box" style="padding:10px"></div><div id="ci_warn"></div>'+
      '<div class="btn-row" style="margin-top:10px"><button class="btn primary" type="button" id="ci_note">Mettre le schéma dans le carnet</button>'+
      '<button class="btn ghost" type="button" id="ci_copy">Copier le bloc (```circuit)</button></div>'+
      '<div id="ci_out"></div><span id="ci_md" data-note-md="" hidden></span>'+
      '<div class="info"><b>R1 | R2</b> = côte à côte (même tension, les courants s\'additionnent) · <b>R1 + R2</b> = l\'une après l\'autre (même courant, les tensions s\'additionnent). '+
      'Composants : un nombre = résistance (<b>330</b>, <b>4k7</b>) · <b>led</b> ou <b>led:vert</b> · <b>d</b> diode · <b>c:100n</b> condensateur · <b>l:10m</b> bobine · <b>sw</b> / <b>sw:off</b> interrupteur · <b>lamp:47</b> lampe. '+
      'Modèle : courant continu établi (condensateur = circuit ouvert, bobine = fil, LED / diode = tension de seuil).</div>';
    const PAL=[['+ R','330'],['+ LED','led:rouge'],['+ diode','d'],['+ C','c:100n'],['+ L','l:10m'],['+ interrupteur','sw'],['+ lampe','lamp:47'],['( )','('],['|','|']];
    $('ci_pal').innerHTML=PAL.map((e,i)=>'<button class="btn ghost" type="button" data-p="'+i+'" title="Ajouter à la fin du montage">'+esc(e[0])+'</button>').join('');
    $('ci_pal').onclick=e=>{const b=e.target.closest('[data-p]');if(!b)return;const x=PAL[+b.dataset.p][1],t=$('ci_expr');let v=t.value.replace(/\s+$/,'');
      if(x==='(')v='('+v+')';else if(x==='|')v+=' | ';else v+=(v&&!/[+|(]\s*$/.test(v)?' + ':'')+x;
      t.value=v;t.focus();render();};
    $('ci_ex').innerHTML=C.EXAMPLES.map((e,i)=>'<button class="btn ghost" type="button" data-e="'+i+'">'+esc(e[0])+'</button>').join('');
    $('ci_ex').onclick=e=>{const b=e.target.closest('[data-e]');if(!b)return;const x=C.EXAMPLES[+b.dataset.e];$('ci_expr').value=x[2];$('ci_v').value=x[1];render();};
    const source=()=>{const v=$('ci_v').value.trim();return(v?'V = '+v+'\n':'')+$('ci_expr').value.replace(/\n+/g,' ').trim();};
    const block=()=>'```circuit\n'+source()+'\n```';
    function render(){
      const vs=$('ci_v').value.trim(),vbad=vs!==''&&!(C.parseSI(vs)>0);
      $('ci_v').classList.toggle('bad',vbad);$('ci_expr').classList.remove('bad');$('ci_err').innerHTML='';
      const r=C.analyse(vbad?$('ci_expr').value:source());
      $('ci_md').dataset.noteMd=r.ok?block():'';
      if(!r.ok){
        $('ci_svg').innerHTML='';$('ci_out').innerHTML='';$('ci_warn').innerHTML='';
        if(r.error){$('ci_expr').classList.add('bad');$('ci_err').innerHTML='<div class="info bad">'+esc(r.error)+'</div>';}
        return;
      }
      $('ci_svg').innerHTML='<div class="circuit-fig" style="border:0;background:none;padding:0">'+r.svg+'</div>';
      $('ci_warn').innerHTML=r.warns.map(w=>'<div class="circuit-note '+w.lv+'">'+esc(w.t)+'</div>').join('');
      const s=r.sim,rows=[['Résistance équivalente',isFinite(r.Req||Infinity)?C.fmt(r.Req,'Ω'):(r.Req==null?'(circuit non linéaire : donne une tension)':'infinie (circuit ouvert)')],
        ['Nombre de composants',String(r.list.length)]];
      if(r.Req>0&&isFinite(r.Req))rows.splice(1,0,['Valeur E24 la plus proche',C.fmt(C.e24up(r.Req),'Ω')]);
      if(s){
        rows.push(['Courant total',C.fmt(s.Itot,'A')],['Puissance totale',C.fmt(s.Ptot,'W')],['Chaque composant',null]);
        r.list.forEach(e=>{
          const nm=e.name+'  ('+(e.type==='LED'||e.type==='D'?(e.type==='LED'?'LED ':'diode ')+C.fmt(e.vf,'V'):e.type==='C'?C.fmt(e.v,'F'):e.type==='L'?C.fmt(e.v,'H'):e.type==='SW'?(e.on?'fermé':'ouvert'):C.fmt(e.v,'Ω'))+')';
          let val=C.fmt(e.V,'V')+'  ·  '+C.fmt(e.I,'A')+'  ·  '+C.fmt(e.P,'W');
          if(e.type==='C')val+='  ·  charge '+C.fmt(e.Q,'C')+'  ·  énergie '+C.fmt(e.W,'J');
          if(e.type==='L')val=C.fmt(e.I,'A')+'  ·  énergie '+C.fmt(e.W,'J');
          if(e.type==='LED'||e.type==='D')val+=e.lit?'':'  ·  éteinte';
          rows.push([nm,val]);});
      }
      $('ci_out').innerHTML=out(rows);
    }
    $('ci_expr').oninput=render;$('ci_v').oninput=render;
    $('ci_note').onclick=()=>{
      const r=C.analyse(source());if(!r.ok){toast('Corrige d\'abord le montage');return;}
      addToNotebook('Circuit — '+new Date().toLocaleDateString('fr-FR'),block(),['circuit']);
      toast('Ajouté au carnet : le schéma s\'y affiche tel quel');
      if(NOXE.notesChanged)NOXE.notesChanged();
    };
    $('ci_copy').onclick=()=>copy(block(),'Bloc copié : colle-le dans une note');
    render();
  }
});
})();
