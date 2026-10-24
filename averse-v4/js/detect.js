/* detect.js — le « collage malin » : devine ce que tu viens de coller et propose le bon outil.
   NOXE.detect(texte) → liste de suggestions [{key, label, text, tab?, input?}], la plus probable d'abord ;
   liste vide si on ne reconnaît rien (le texte se colle alors normalement dans la recherche).
   Fichier séparé et sans dépendance à la page : il est testé tel quel dans tests.html. */
(function(){
const JWT=/^eyJ[\w-]+\.eyJ[\w-]*\.[\w-]*$/;
const DATAURI=/^data:[\w.+\/-]*(;[^,;]*)*;base64,/i;
const short=s=>s.length>40?s.slice(0,40)+'…':s;

/* Base64 → texte, ou null si ce n'est pas du texte lisible */
function b64text(s){
  try{
    let b=s.replace(/-/g,'+').replace(/_/g,'/');while(b.length%4)b+='=';
    const bytes=Uint8Array.from(atob(b),c=>c.charCodeAt(0));
    const t=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const bad=(t.match(/[\u0000-\u0008\u000e-\u001f\u007f\ufffd]/g)||[]).length;
    return t.trim()&&bad===0?t:null;
  }catch(e){return null;}
}

NOXE.detect=raw=>{
  const t=String(raw==null?'':raw).trim(),res=[];
  if(!t||t.length>5e6)return res;
  const add=(key,label,o)=>res.push(Object.assign({key,label,text:t},o||{}));

  if(DATAURI.test(t)){add('base64','Data URI → retrouver le fichier',{tab:'dec',input:'b_dec'});return res;}
  if(JWT.test(t)){add('jwt','Jeton JWT → décoder');return res;}
  if(/^[\[{]/.test(t)&&/[\]}]$/.test(t)){
    let ok=true;try{JSON.parse(t);}catch(e){ok=false;}
    add('json',ok?'JSON → formater / valider':'JSON (invalide ?) → trouver l\'erreur');return res;
  }
  if(/^https?:\/\/\S+$/i.test(t)){add('url','URL → analyser / décoder');add('qr','URL → QR code');return res;}
  if(!/\s/.test(t)&&/%[0-9a-f]{2}/i.test(t)){add('url','Texte encodé (%XX) → décoder');return res;}
  /* couleur : #abc, #aabbcc, ou 6 caractères hexadécimaux mêlant chiffres et lettres (sinon « facade » serait une couleur) */
  const hx=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if(hx&&(t[0]==='#'||(hx[1].length===6&&/\d/.test(hx[1])&&/[a-f]/i.test(hx[1])))){
    const h='#'+(hx[1].length===3?[...hx[1]].map(c=>c+c).join(''):hx[1]).toLowerCase();
    add('couleurs','Couleur '+h+' → convertir',{tab:'conv',text:h});return res;
  }
  if(/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/i.test(t)){add('couleurs','Couleur RGB → convertir',{tab:'conv',input:'k_rgb'});return res;}
  /* timestamp Unix : 10 chiffres (secondes) ou 13 (millisecondes), entre 2000 et 2100 (évite les numéros de téléphone) */
  if(/^\d{10}$|^\d{13}$/.test(t)){
    const ms=t.length===13?+t:+t*1000;
    if(ms>=946684800000&&ms<4102444800000){add('dates','Timestamp → '+new Date(ms).toLocaleString('fr-FR'),{tab:'unix'});return res;}
  }
  if(/^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(t)){add('reseau','Adresse IPv4 → calculer le réseau');return res;}
  if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)){add('uuid','UUID → vérifier',{input:'id_chk'});return res;}
  if(/^([0-9a-f]{40}|[0-9a-f]{64}|[0-9a-f]{96}|[0-9a-f]{128})$/i.test(t)){add('encodage','Empreinte (hash) → comparer',{input:'h_cmp'});return res;}
  /* Base64 : au moins 8 caractères de l'alphabet Base64, pas un simple mot, et qui se décode en texte lisible */
  const b=t.replace(/\s+/g,'');
  if(b.length>=8&&/^[A-Za-z0-9+/_-]+={0,2}$/.test(b)&&b.length%4!==1&&/[0-9+/=_-]|[A-Z].*[a-z]|[a-z].*[A-Z]/.test(b)){
    const s=b64text(b);
    if(s){add('base64','Base64 → « '+short(s)+' »',{tab:'dec',input:'b_dec'});return res;}
  }
  return res;
};
})();
