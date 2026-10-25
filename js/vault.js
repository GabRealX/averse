/* vault.js — le coffre chiffré de la synchro (v5). Aucune dépendance, aucun accès réseau, aucun affichage :
   que de la cryptographie WebCrypto (intégrée au navigateur), pour pouvoir la tester toute seule.

   PRINCIPE (chiffrement de bout en bout : GitHub ne voit que du charabia)
   - Une « clé des données » (DK, AES-256-GCM, tirée au hasard) chiffre les notes.
   - Cette clé n'est jamais envoyée en clair : elle est « emballée » dans des cases (slots) du coffre :
       · une case par APPAREIL : clé d'emballage = HKDF( mot de passe (PBKDF2-SHA256, 600 000 tours, sel aléatoire)
                                                         ‖ secret de la passkey de l'appareil (extension WebAuthn PRF) )
         → il faut LES DEUX : le mot de passe ET la passkey (empreinte / visage / code PIN de CET appareil) ;
       · une case SECOURS (facultative) : clé = HKDF(code de secours aléatoire de 160 bits) — ouvre le coffre à elle seule ;
       · une case d'APPAIRAGE temporaire (15 min) : clé = HKDF(mot de passe ‖ code d'appairage) ; elle transporte la DK et
         le jeton GitHub vers le nouvel appareil, qui s'ajoute alors sa propre case et efface celle-ci.
   - Pas de « vérificateur » de mot de passe stocké : un mauvais mot de passe se voit parce que le déballage échoue
     (AES-GCM authentifie : impossible de déchiffrer « à moitié »).
   - Ne JAMAIS journaliser (console) un mot de passe, un code ou un jeton : rien ici n'écrit dans la console. */
(function(){
const C=crypto.subtle,te=new TextEncoder(),td=new TextDecoder();
const ITER=600000,MIN_ITER=100000;                         // 600 000 = recommandation OWASP 2023 pour PBKDF2-SHA256
const rnd=n=>crypto.getRandomValues(new Uint8Array(n));
/* base64url (sans =) */
const b64=u=>{u=u instanceof Uint8Array?u:new Uint8Array(u);let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');};
const unb64=s=>{s=String(s||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u;};
const cat=(...a)=>{const o=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let k=0;a.forEach(x=>{o.set(x,k);k+=x.length;});return o;};
/* base32 sans lettres ambiguës (pas de I, L, O, U) : codes à recopier à la main */
const B32='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32(u){let bits=0,v=0,o='';for(const x of u){v=(v<<8)|x;bits+=8;while(bits>=5){o+=B32[(v>>>(bits-5))&31];bits-=5;}v&=255;}if(bits)o+=B32[(v<<(5-bits))&31];return o;}
function unb32(s){s=String(s||'').toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1');let bits=0,v=0;const o=[];
  for(const ch of s){const k=B32.indexOf(ch);if(k<0)throw new Error('caractère invalide : '+ch);v=(v<<5)|k;bits+=5;if(bits>=8){o.push((v>>>(bits-8))&255);bits-=8;}v&=255;}
  return new Uint8Array(o);}
const groups=s=>s.match(/.{1,4}/g).join('-');

class VaultError extends Error{constructor(code,msg){super(msg);this.code=code;}}
const fail=(code,msg)=>{throw new VaultError(code,msg);};

/* ---- briques ---- */
async function pwBits(password,salt,iter){                 // mot de passe → 32 octets (lent exprès : ~0,3–1,5 s)
  if(!password)fail('pw','mot de passe vide');
  const k=await C.importKey('raw',te.encode(String(password).normalize('NFC')),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await C.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:iter},k,256));
}
async function hkdfKey(ikm,salt,info){                     // secrets combinés → clé AES-GCM (non exportable)
  const k=await C.importKey('raw',ikm,'HKDF',false,['deriveKey']);
  return C.deriveKey({name:'HKDF',hash:'SHA-256',salt,info:te.encode(info)},k,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(key,bytes,aad){const iv=rnd(12);
  return{iv:b64(iv),ct:b64(await C.encrypt({name:'AES-GCM',iv,additionalData:te.encode(aad)},key,bytes))};}
async function open(key,box,aad,code){
  try{return new Uint8Array(await C.decrypt({name:'AES-GCM',iv:unb64(box.iv),additionalData:te.encode(aad)},key,unb64(box.ct)));}
  catch(e){fail(code||'bad','déchiffrement impossible');}
}
const dkKey=raw=>C.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']);   // DK utilisable mais non exportable

/* ---- compression (si le navigateur sait) : le Gist reste petit ---- */
const canZ=typeof CompressionStream==='function';
async function gz(bytes,dir){const s=new Blob([bytes]).stream().pipeThrough(dir?new CompressionStream('gzip'):new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());}

/* ---- le coffre ---- */
const slotAad=(v,s)=>'averse-slot-v1|'+v.id+'|'+s.type+'|'+s.id;
const dataAad=v=>'averse-data-v1|'+v.id;
function check(v){
  if(!v||typeof v!=='object'||v.app!=='averse'||v.kind!=='vault'||v.v!==1)fail('format','ce fichier n\'est pas un coffre AVERSE');
  if(!v.kdf||v.kdf.alg!=='PBKDF2-SHA256'||!(v.kdf.iter>=MIN_ITER)||!v.kdf.salt)fail('format','paramètres de chiffrement invalides');
  if(!Array.isArray(v.slots)||!v.data)fail('format','coffre incomplet');
  return v;
}
/* nouveau coffre vide (premier appareil) ; renvoie {vault, dk (octets bruts, à oublier après usage)} */
async function create(opts){
  const v={app:'averse',kind:'vault',v:1,id:b64(rnd(12)),kdf:{alg:'PBKDF2-SHA256',iter:Math.max(MIN_ITER,(opts&&opts.iter)||ITER),salt:b64(rnd(16))},
    slots:[],data:null,rev:0,updated:''};
  return{vault:v,dk:rnd(32)};
}
async function deviceWrapKey(v,pw,prf,salt){              // mot de passe ET passkey → clé d'emballage
  const p=pw instanceof Uint8Array?pw:await pwBits(pw,unb64(v.kdf.salt),v.kdf.iter);
  if(!(prf instanceof Uint8Array)||prf.length<32)fail('prf','secret de passkey manquant');
  return hkdfKey(cat(p,prf),salt,'averse-wrap-v1');
}
/* ajoute (ou remplace) la case d'un appareil */
async function addDevice(v,dk,pw,prf,info){
  const salt=rnd(16),s={type:'device',id:info.id||b64(rnd(9)),name:String(info.name||'appareil').slice(0,60),created:Date.now(),
    credId:info.credId,prfSalt:info.prfSalt,salt:b64(salt)};
  const k=await deviceWrapKey(v,pw,prf,salt);Object.assign(s,await seal(k,dk,slotAad(v,s)));
  v.slots=v.slots.filter(x=>x.id!==s.id).concat(s);return s;
}
async function openDevice(v,slot,pw,prf){                  // → DK brute ; erreur 'pw' si mauvais mot de passe (ou passkey d'un autre coffre)
  const k=await deviceWrapKey(v,pw,prf,unb64(slot.salt));
  return open(k,slot,slotAad(v,slot),'pw');
}
/* code de secours : 20 octets aléatoires = 160 bits, affiché UNE fois en groupes de 4 (32 caractères) */
async function addRecovery(v,dk){
  const code=rnd(20),salt=rnd(16),s={type:'recovery',id:'recovery',created:Date.now(),salt:b64(salt)};
  Object.assign(s,await seal(await hkdfKey(code,salt,'averse-recovery-v1'),dk,slotAad(v,s)));
  v.slots=v.slots.filter(x=>x.type!=='recovery').concat(s);
  return groups(b32(code));
}
async function openRecovery(v,codeText){
  const s=v.slots.find(x=>x.type==='recovery');if(!s)fail('norec','ce coffre n\'a pas de code de secours');
  let code;try{code=unb32(codeText);}catch(e){fail('rec','code de secours invalide');}
  if(code.length!==20)fail('rec','code de secours incomplet (32 caractères attendus)');
  return open(await hkdfKey(code,unb64(s.salt),'averse-recovery-v1'),s,slotAad(v,s),'rec');
}
/* appairage : case temporaire (15 min) qui transporte {dk, jeton} ; ouverte par mot de passe + code */
async function addPair(v,dk,pw,token,ttl){
  const code=rnd(10),salt=rnd(16),p=pw instanceof Uint8Array?pw:await pwBits(pw,unb64(v.kdf.salt),v.kdf.iter);
  const s={type:'pair',id:'p'+b64(rnd(6)),created:Date.now(),exp:Date.now()+(ttl||15*60000),salt:b64(salt)};
  const body=te.encode(JSON.stringify({dk:b64(dk),token}));
  Object.assign(s,await seal(await hkdfKey(cat(p,code),salt,'averse-pair-v1'),body,slotAad(v,s)));
  v.slots=v.slots.filter(x=>x.type!=='pair').concat(s);
  return{code:b32(code),slot:s};
}
async function openPair(v,codeText,pw,now){
  const s=v.slots.find(x=>x.type==='pair');if(!s)fail('nopair','aucun appairage en cours (déjà utilisé, ou annulé)');
  if((now||Date.now())>s.exp)fail('expired','code d\'appairage expiré : recommence depuis l\'autre appareil');
  let code;try{code=unb32(codeText);}catch(e){fail('paircode','code d\'appairage invalide');}
  const p=await pwBits(pw,unb64(v.kdf.salt),v.kdf.iter);
  const raw=await open(await hkdfKey(cat(p,code),unb64(s.salt),'averse-pair-v1'),s,slotAad(v,s),'pw');
  const o=JSON.parse(td.decode(raw));return{dk:unb64(o.dk),token:o.token,pwBits:p,slot:s};
}
/* changement de mot de passe après un secours : nouveau sel, les anciennes cases d'appareils ne servent plus */
function resetPassword(v,opts){v.kdf={alg:'PBKDF2-SHA256',iter:Math.max(MIN_ITER,(opts&&opts.iter)||ITER),salt:b64(rnd(16))};
  const gone=v.slots.filter(x=>x.type==='device'||x.type==='pair').length;v.slots=v.slots.filter(x=>x.type==='recovery');return gone;}

/* données : {notes, deleted} ↔ boîte chiffrée (avec compression si possible) */
async function sealData(v,key,obj){
  let bytes=te.encode(JSON.stringify(obj)),z='';
  if(canZ){bytes=await gz(bytes,true);z='gzip';}
  v.data=Object.assign({z},await seal(key,bytes,dataAad(v)));
  v.rev=(v.rev||0)+1;v.updated=new Date().toISOString();return v;
}
async function openData(v,key){
  if(!v.data||!v.data.ct)return{notes:{},deleted:{}};
  let bytes=await open(key,v.data,dataAad(v),'data');
  if(v.data.z==='gzip'){if(!canZ)fail('z','navigateur trop ancien pour lire ce coffre (compression)');bytes=await gz(bytes,false);}
  const o=JSON.parse(td.decode(bytes));
  const r={notes:o&&typeof o.notes==='object'?o.notes:{},deleted:o&&typeof o.deleted==='object'?o.deleted:{}};
  if(o&&o.templates&&typeof o.templates==='object')r.templates=o.templates;   // v6 : les modèles de note voyagent aussi
  if(o&&o.secrets&&typeof o.secrets==='object')r.secrets=o.secrets;           // v7 : clés d'API de l'IA (dans la boîte chiffrée)
  if(o&&o.att&&typeof o.att==='object')r.att=o.att;                           // v9 : la liste des pièces jointes (revérifiée par attach.js)
  return r;
}
/* v7 : petit secret (clé d'API de l'IA) chiffré sur CET appareil, avec une clé AES-GCM non exportable
   gardée dans IndexedDB (le navigateur ne laisse jamais lire ses octets). localStorage ne voit que {iv, ct}. */
async function deviceKey(){return C.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function sealSecret(key,text,aad){return seal(key,te.encode(String(text)),aad||'averse-secret');}
async function openSecret(key,box,aad){return td.decode(await open(key,box,aad||'averse-secret','secret'));}

window.VAULT={ITER,MIN_ITER,create,addDevice,openDevice,addRecovery,openRecovery,addPair,openPair,resetPassword,sealData,openData,
  check,pwBits,dkKey,deviceKey,sealSecret,openSecret,b64,unb64,b32,unb32,rnd,VaultError};
})();
