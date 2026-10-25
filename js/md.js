/* md.js — v6 : le rendu Markdown léger d'AVERSE, partagé par le carnet (notes.js) et share.html.
   SÉCURITÉ : tout le texte passe par esc() AVANT d'être transformé ; seules quelques balises sûres sont produites
   (p, h1-3, strong, em, code, pre, ul/ol/li, table, blockquote, hr, a). Liens : http/https/mailto/ancre/relatif uniquement.
   v9 : ![nom](att:ID) → <img data-att> (pièce jointe, remplie ensuite par attach.js) si l'option att est donnée ;
        sinon (note partagée) un simple texte « pièce jointe non partagée ». Aucune autre image n'est chargée.
   Options : exists(titre) → la note liée existe ? · nowiki : [[liens]] en simple texte (lecture d'une note partagée)
             readonly : cases à cocher désactivées · empty : texte d'une note vide.
   Utilise esc() de core.js. */
const MD=(function(){
const DEF={exists:()=>false,nowiki:false,readonly:false,att:false,empty:'Note vide — commence à écrire à gauche.'};
let O=DEF;
// N'autorise que des schémas sûrs (http/https/mailto/ancre/relatif). Bloque javascript:, data:, vbscript:…
function safeUrl(u){const s=String(u==null?'':u).trim();
  return /^(https?:|mailto:|#|\/|\.|[^:]*$)/i.test(s)?s:'#';}
function inline(text,opt){
  if(opt&&typeof opt==='object')O=Object.assign({},DEF,opt);   // v9 : pas l'index de .map(inline) (remettait les options à zéro dès la 2e ligne : [[liens]] « absents », images jointes)
  return esc(text).replace(
    /(`[^`]+`)|(!\[[^\]]*\]\(att:[\w-]{1,48}\))|(\[\[[^\]]+\]\])|(\[[^\]]+\]\([^)]+\))|(\bhttps?:\/\/[^\s<]+)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g,
    (m,code,att,wiki,link,url,bold,ital)=>{
      if(code)return'<code>'+code.slice(1,-1)+'</code>';
      if(att){const mm=/^!\[([^\]]*)\]\(att:([\w-]+)\)$/.exec(att);
        return O.att?'<img class="att-img" data-att="'+mm[2]+'" alt="'+mm[1]+'">':'<span class="att-miss">[pièce jointe'+(mm[1]?' « '+mm[1]+' »':'')+' — non partagée]</span>';}
      if(wiki){const t=wiki.slice(2,-2).trim().replace(/&(lt|gt|quot|amp);/g,(_,k)=>({lt:'<',gt:'>',quot:'"',amp:'&'}[k])),exist=O.exists(t);   // le texte a déjà été échappé : on le remet à l'état brut
        return O.nowiki?'<span class="wl ro" title="Lien vers une autre note (non partagée)">'+esc(t)+'</span>':'<a class="wl'+(exist?'':' missing')+'" data-title="'+esc(t)+'">'+esc(t)+'</a>';}
      if(link){const mm=/\[([^\]]+)\]\(([^)]+)\)/.exec(link);
        return'<a href="'+safeUrl(mm[2])+'" target="_blank" rel="noopener">'+mm[1]+'</a>';}
      if(url)return'<a href="'+safeUrl(url)+'" target="_blank" rel="noopener">'+url+'</a>';
      if(bold)return'<strong>'+bold.slice(2,-2)+'</strong>';
      if(ital)return'<em>'+ital.slice(1,-1)+'</em>';
      return m;});
}
/* rendu complet : les formules sont mises de côté (math.js), le Markdown est rendu, puis les formules reviennent (échappées) */
function render(body,opt){
  if(typeof MATH==='undefined')return renderMd(body,opt);
  const m=MATH.extract(body);return MATH.restore(renderMd(m.src,opt),m.list);
}
function renderMd(body,opt){
  O=Object.assign({},DEF,opt||{});
  if(!body||!body.trim())return'<p class="empty">'+esc(O.empty)+'</p>';
  const L=body.replace(/\r/g,'').split('\n');let html='',para=[],i=0;
  const flushP=()=>{if(para.length){html+='<p>'+para.map(inline).join('<br>')+'</p>';para=[];}};
  const cells=l=>l.trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim());
  const isSep=l=>/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
  while(i<L.length){
    const l=L[i].replace(/\s+$/,'');
    if(/^```/.test(l)){flushP();const code=[];i++;while(i<L.length&&!/^```/.test(L[i])){code.push(L[i]);i++;}i++;
      html+='<pre><code>'+esc(code.join('\n'))+'</code></pre>';continue;}
    const h=/^(#{1,3})\s+(.*)$/.exec(l);
    if(h){flushP();html+='<h'+h[1].length+'>'+inline(h[2])+'</h'+h[1].length+'>';i++;continue;}
    if(/^-{3,}$/.test(l.trim())){flushP();html+='<hr>';i++;continue;}
    if(l.includes('|')&&i+1<L.length&&isSep(L[i+1])){
      flushP();const head=cells(l);i+=2;const rows=[];
      while(i<L.length&&L[i].includes('|')&&L[i].trim()){rows.push(cells(L[i]));i++;}
      html+='<div class="tw"><table><thead><tr>'+head.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+
        rows.map(r=>'<tr>'+head.map((_,k)=>'<td>'+inline(r[k]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';continue;}
    if(/^>\s?/.test(l)){flushP();const q=[];while(i<L.length&&/^>\s?/.test(L[i])){q.push(L[i].replace(/^>\s?/,''));i++;}
      html+='<blockquote>'+q.map(inline).join('<br>')+'</blockquote>';continue;}
    if(/^\s*([-*]|\d+[.)])\s+/.test(l)){flushP();const ord=/^\s*\d+[.)]/.test(l),items=[];
      while(i<L.length&&/^\s*([-*]|\d+[.)])\s+/.test(L[i])){
        const m=/^\s*(?:[-*]|\d+[.)])\s+(\[( |x|X)?\](?:\s+|$))?(.*)$/.exec(L[i]);
        items.push(m[1]?'<li class="task"><input type="checkbox" data-ln="'+i+'"'+(O.readonly?' disabled':'')+(m[2]&&m[2]!==' '?' checked':'')+'> '+inline(m[3])+'</li>':'<li>'+inline(m[3])+'</li>');i++;}
      html+=(ord?'<ol>':'<ul>')+items.join('')+(ord?'</ol>':'</ul>');continue;}
    if(!l.trim()){flushP();i++;continue;}
    para.push(l);i++;
  }
  flushP();return html;
}
return{safeUrl,inline,render,renderMd};
})();
window.MD=MD;   // accessible aussi comme propriété de window (tests du carnet : la CSP y interdit eval)
