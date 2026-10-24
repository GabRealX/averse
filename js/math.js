/* math.js — les formules dans les notes : $…$ (dans la ligne) et $$…$$ (en bloc), rendues par KaTeX.
   KaTeX est rangé dans js/vendor/katex/ (hors ligne) et chargé SEULEMENT quand une note contient une formule.
   Sécurité :
     1. extract() sort les formules du texte AVANT le Markdown, et les remplace par des marqueurs
        (caractères privés \uE000 n \uE001 — ceux déjà présents dans la note sont supprimés : impossible d'en forger) ;
     2. restore() remet un <span data-tex="…"> dont le contenu est ÉCHAPPÉ (le source s'affiche tel quel si KaTeX manque) ;
     3. typeset() appelle KaTeX avec trust:false (pas de \href javascript:, \htmlData, \includegraphics…) et throwOnError:false. */
const MATH=(function(){
const A='\uE000',B='\uE001';
const DISPLAY=/\$\$([\s\S]+?)\$\$/g;
/* $…$ : pas d'espace juste après le $ ouvrant ni avant le $ fermant, pas de chiffre après (« 5 $ et 10 $ » reste du texte) */
const INLINE=/(^|[^\\$])\$(?!\s)((?:\\\$|[^$\n])+?)(?<![\s\\])\$(?![\d$])/g;

function extract(src){
  const list=[];
  src=String(src==null?'':src).replace(/[\uE000-\uF8FF]/g,'');
  if(src.indexOf('$')<0)return{src,list};
  const put=(tex,disp)=>{list.push({tex:tex.trim(),disp,raw:(disp?'$$':'$')+tex+(disp?'$$':'$')});return A+(list.length-1)+B;};
  const text=t=>t
    .replace(DISPLAY,(m,tex)=>put(tex,true)+'\n'.repeat((tex.match(/\n/g)||[]).length))   // on garde le nombre de lignes (cases à cocher)
    .replace(INLINE,(m,pre,tex)=>pre+put(tex,false))
    .replace(/\\\$/g,'$');
  /* on ne touche pas au code : blocs ``` … ``` puis `code` dans la ligne */
  const parts=src.split(/(^```[^\n]*\n[\s\S]*?(?:^```[^\n]*$|(?![\s\S])))/m);
  src=parts.map((p,i)=>i%2?p:p.split(/(`[^`\n]*`)/).map((q,j)=>j%2?q:text(q)).join('')).join('');
  return{src,list};
}
function restore(html,list){
  if(!list||!list.length)return html;
  return html.replace(/\uE000(\d+)\uE001/g,(m,i)=>{const x=list[+i];if(!x)return'';
    return'<span class="math'+(x.disp?' math-d':'')+'" data-tex="'+esc(x.tex)+'">'+esc(x.raw)+'</span>';});
}

/* chargement paresseux de KaTeX (une seule fois) */
let loading=null;
function load(){
  if(window.katex)return Promise.resolve(window.katex);
  if(loading)return loading;
  loading=new Promise((ok,ko)=>{
    if(!document.querySelector('link[data-katex]')){const l=document.createElement('link');l.rel='stylesheet';l.href='js/vendor/katex/katex.min.css';l.dataset.katex='';document.head.appendChild(l);}
    const s=document.createElement('script');s.src='js/vendor/katex/katex.min.js';
    s.onload=()=>window.katex?ok(window.katex):ko(new Error('katex'));
    s.onerror=()=>{loading=null;ko(new Error('katex introuvable'));};
    document.head.appendChild(s);
  });
  return loading;
}
const OPTS={throwOnError:false,trust:false,strict:'ignore',maxExpand:1000,maxSize:40,output:'htmlAndMathml'};
async function typeset(root){
  const els=[...(root||document).querySelectorAll('.math[data-tex]:not([data-done])')];
  if(!els.length)return 0;
  let k;try{k=await load();}catch(e){els.forEach(el=>el.classList.add('math-src'));return 0;}   // pas de KaTeX : le source reste lisible
  els.forEach(el=>{
    if(!el.isConnected)return;
    try{k.render(el.dataset.tex,el,Object.assign({displayMode:el.classList.contains('math-d')},OPTS));}
    catch(e){el.textContent=el.dataset.tex;el.classList.add('math-err');}
    el.dataset.done='1';
  });
  return els.length;
}
return{extract,restore,typeset,load};
})();
