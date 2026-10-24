/* cloud.js — synchro chiffrée entre appareils (v5) : PC + téléphone, via un Gist GitHub SECRET.
   - Le Gist ne contient que le coffre chiffré (voir vault.js) : GitHub ne peut pas lire tes notes.
   - Chaque appareil garde (dans ce navigateur) : le jeton GitHub (droit « gist » seulement), l'identifiant du Gist,
     et la clé des données sous forme NON exportable (IndexedDB) — sauf si tu choisis « verrouiller à chaque ouverture ».
   - Quand : à l'ouverture, au retour sur l'onglet, toutes les 30 s si la page est visible ; envoi 2,5 s après une modif.
   - Fusion : la même que le fichier lié (notes.js : syncMerge → la plus récente gagne, pierres tombales, copies de conflit).
   - Anti-écrasement : lecture conditionnelle (ETag → 304 si rien n'a bougé), on relit TOUJOURS avant d'écrire, et après
     l'écriture on vérifie dans l'historique du Gist que personne n'a écrit entre les deux ; sinon on récupère cette
     version, on fusionne et on renvoie.
   - Jamais de jeton / mot de passe / code dans la console ou dans les messages d'erreur.
   - Page sans script en ligne (CSP) : tout est branché ici par addEventListener. */
(function(){
const TEST=sessionStorage.getItem('averse-tests')==='1';      // tests.html : clés à part et réseau coupé (faux GitHub injecté)
const CKEY=TEST?'averse-tests-cloud':'averse-cloud',FILE='averse-carnet.json',DESC='AVERSE — carnet chiffré (ne pas modifier à la main)';
const TOKEN_URL='https://github.com/settings/tokens/new?scopes=gist&description=AVERSE';
let POLL=30000,PUSH_DELAY=2500,ITER=VAULT.ITER;
let API='https://api.github.com';
try{const o=localStorage.getItem('averse-cloud-api');if(o&&o.startsWith(location.origin+'/'))API=o.replace(/\/+$/,'');}catch(e){}   // faux GitHub local (tests) : même origine seulement
let fetchFn=TEST?null:(u,o)=>fetch(u,o);
let creds=()=>navigator.credentials;

/* ---------- état ---------- */
let CS=load();                                             // {gistId, token, slotId, credId, prfSalt, name, base, version, etag, hash, lock, at}
const M={key:null,vault:null,state:'off',detail:'',busy:null,again:false,dirty:false,t:0,poll:0,conflicts:0};
function load(){try{const o=JSON.parse(localStorage.getItem(CKEY)||'null');return o&&o.gistId&&o.token?o:null;}catch(e){return null;}}
function store(){try{if(CS)localStorage.setItem(CKEY,JSON.stringify(CS));else localStorage.removeItem(CKEY);}catch(e){}}
const DKEY='cloud-dk';
class CloudError extends Error{constructor(code,msg){super(msg);this.code=code;}}
const E=(code,msg)=>new CloudError(code,msg);
const hash=s=>{let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193);}return (h>>>0).toString(36)+'.'+s.length;};
const hm=t=>new Date(t).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});

/* ---------- indicateur ---------- */
const LABEL={busy:'synchro…',ok:'synchronisé',ext:'reçu d\'un autre appareil — fusionné',err:'erreur',lock:'verrouillée',removed:'appareil retiré',off:''};
function ui(state,detail){
  M.state=state;M.detail=detail||'';
  const b=$('cloudBtn'),st=$('cloudState');
  if(b){b.textContent=!CS?'Synchro':state==='lock'?'Synchro — déverrouiller':state==='err'?'Synchro ⚠':'Synchro ✓';b.classList.toggle('on',!!CS&&(state==='ok'||state==='ext'||state==='busy'));}
  if(!st)return;
  st.hidden=state==='off';st.dataset.state=state;
  st.textContent=state==='off'?'':'☁ '+LABEL[state]+(detail?' : '+detail:'')+((state==='ok'||state==='ext')&&CS&&CS.at?' · '+hm(CS.at):'');
  st.title='Synchro chiffrée (Gist GitHub secret)'+(CS&&CS.name?' — cet appareil : '+CS.name:'')+(M.conflicts?' — '+M.conflicts+' copie(s) de conflit':'');
  if(window.barScroll)barScroll.update();
}

/* ---------- GitHub ---------- */
async function gh(method,path,body,o){
  o=o||{};
  if(!fetchFn)throw E('net','mode test : réseau coupé (aucun faux GitHub branché)');
  const h={'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
  const tok=o.token!==undefined?o.token:CS&&CS.token;if(tok)h.Authorization='Bearer '+tok;
  if(o.etag)h['If-None-Match']=o.etag;
  if(body)h['Content-Type']='application/json';
  let r;
  try{r=await fetchFn(API+path,{method,headers:h,body:body?JSON.stringify(body):undefined,cache:'no-store'});}
  catch(e){throw E('net','pas de réseau (ou GitHub injoignable)');}
  if(r.status===304)return{status:304};
  if(r.status===401)throw E('auth','jeton GitHub refusé (faux, expiré ou révoqué ?)');
  if(r.status===403||r.status===429){
    if(r.headers.get('x-ratelimit-remaining')==='0'||r.status===429)throw E('rate','limite de GitHub atteinte, nouvel essai plus tard');
    throw E('perm','accès refusé : le jeton a-t-il bien le droit « gist » ?');}
  if(r.status===404)throw E('404',o.notFound||'coffre introuvable sur GitHub (Gist supprimé ?)');
  if(r.status===409)throw E('conflict','GitHub : écriture en conflit, nouvel essai');
  if(!r.ok)throw E('http','GitHub : erreur '+r.status);
  return{status:r.status,json:await r.json(),etag:r.headers.get('ETag')};
}
async function vaultOf(g){                                 // réponse « gist » → coffre (gros fichier : contenu complet via raw_url)
  const f=g&&g.files&&g.files[FILE];if(!f)throw E('format','ce Gist ne contient pas de carnet AVERSE');
  let txt=f.content;
  if(f.truncated||txt==null){
    if(!fetchFn)throw E('net','réseau coupé');
    const r=await fetchFn(f.raw_url,{cache:'no-store'});if(!r.ok)throw E('http','lecture du coffre impossible ('+r.status+')');txt=await r.text();}
  let v;try{v=JSON.parse(txt);}catch(e){throw E('format','coffre illisible (modifié à la main ?)');}
  try{return VAULT.check(v);}catch(e){throw E('format',e.message);}
}
const version=g=>g&&Array.isArray(g.history)&&g.history[0]?g.history[0].version:null;
async function findVaults(token){                          // les coffres AVERSE de ce compte (pour ne pas en créer un 2e)
  const r=await gh('GET','/gists?per_page=100',null,{token});
  return(r.json||[]).filter(g=>g&&g.files&&g.files[FILE]).map(g=>({id:g.id,updated:g.updated_at,description:g.description}));
}

/* ---------- passkey (WebAuthn + extension PRF) ---------- */
async function prfSupport(){
  if(!window.PublicKeyCredential||!creds()||!creds().create)return'no';
  try{if(PublicKeyCredential.getClientCapabilities){const c=await PublicKeyCredential.getClientCapabilities();
    if(c&&c['extension:prf']===true)return'yes';if(c&&c['extension:prf']===false)return'no';}}catch(e){}
  return'maybe';                                            // on saura au moment de créer la passkey
}
const NOPRF='ce navigateur / cet appareil ne sait pas protéger une clé avec une passkey (extension « PRF » de WebAuthn). '+
  'La synchro ne peut pas être activée ici. Essaie Chrome ou Edge à jour (Windows 11, Android, macOS) ou Safari sur iOS 18 / macOS 15.';
function pkErr(e){
  if(e instanceof CloudError)return e;
  const n=e&&e.name;
  if(n==='NotAllowedError'||n==='AbortError')return E('passkey','passkey refusée, annulée ou absente de cet appareil');
  if(n==='InvalidStateError')return E('passkey','cette passkey existe déjà sur cet appareil');
  if(n==='SecurityError')return E('passkey','passkey impossible sur cette adresse (il faut https)');
  if(n==='NotSupportedError')return E('noprf',NOPRF);
  return E('passkey','passkey : '+(e&&e.message||'erreur').slice(0,100));
}
const prfOut=c=>{const x=c&&c.getClientExtensionResults?c.getClientExtensionResults():{};return{x,out:x&&x.prf&&x.prf.results&&x.prf.results.first};};
async function passkeyCreate(name){
  const salt=VAULT.rnd(32);let c;
  try{c=await creds().create({publicKey:{rp:{name:'AVERSE'},user:{id:VAULT.rnd(16),name:'AVERSE · '+name,displayName:'AVERSE · '+name},
    challenge:VAULT.rnd(32),pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:120000,
    authenticatorSelection:{residentKey:'preferred',userVerification:'required'},extensions:{prf:{eval:{first:salt}}}}});}
  catch(e){throw pkErr(e);}
  if(!c)throw E('passkey','passkey annulée');
  const {x,out}=prfOut(c),credId=VAULT.b64(c.rawId);
  if(!x.prf||x.prf.enabled===false)throw E('noprf',NOPRF);
  const prf=out?new Uint8Array(out):await passkeyEval(credId,VAULT.b64(salt));   // certains navigateurs : 2e appui nécessaire
  return{credId,prfSalt:VAULT.b64(salt),prf};
}
async function passkeyEval(credId,prfSalt){
  let a;
  try{a=await creds().get({publicKey:{challenge:VAULT.rnd(32),allowCredentials:[{type:'public-key',id:VAULT.unb64(credId)}],
    userVerification:'required',timeout:120000,extensions:{prf:{eval:{first:VAULT.unb64(prfSalt)}}}}});}
  catch(e){throw pkErr(e);}
  const {out}=prfOut(a);if(!out)throw E('noprf',NOPRF);
  const u=new Uint8Array(out);if(u.length<32)throw E('noprf',NOPRF);return u;
}

/* ---------- clé des données sur l'appareil ---------- */
async function keepKey(raw){M.key=await VAULT.dkKey(raw);raw.fill(0);
  if(CS&&!CS.lock)try{await idbSet(DKEY,M.key);}catch(e){}}
async function forgetKey(){M.key=null;try{await idbSet(DKEY,null);}catch(e){}}

/* ---------- LA synchro ---------- */
function ready(){return !!(CS&&M.key);}
function sync(why){
  if(!ready())return Promise.resolve();
  if(M.busy){M.again=true;return M.busy;}
  M.busy=(async()=>{
    try{
      let res={n:0,c:0},remoteText=null,v=M.vault,ver=CS.version;
      const r=await gh('GET','/gists/'+CS.gistId,null,{etag:M.vault&&CS.etag});
      if(r.status!==304){
        v=await vaultOf(r.json);ver=version(r.json);
        if(!v.slots.some(s=>s.type==='device'&&s.id===CS.slotId)){await removedHere();return;}
        const d=await VAULT.openData(v,M.key).catch(()=>{throw E('key','clé de chiffrement différente (synchro réinitialisée ailleurs ?)');});
        remoteText=JSON.stringify(d);
        if(hash(remoteText)!==CS.remote){res=notesApi.merge(d,CS.base);M.conflicts+=res.c;}
        M.vault=v;CS.etag=r.etag||null;CS.version=ver;CS.remote=hash(remoteText);
      }
      let local=notesApi.text();
      const remoteSame=remoteText!=null?local===remoteText:hash(local)===CS.hash;
      if(!remoteSame){
        if(M.state!=='ext')ui('busy');
        const before=CS.version;
        const out=JSON.parse(JSON.stringify(M.vault));
        out.slots=out.slots.filter(s=>s.type!=='pair'||s.exp>Date.now());          // appairage expiré : on nettoie
        out.by=CS.slotId;
        await VAULT.sealData(out,M.key,notesApi.payload());
        const p=await gh('PATCH','/gists/'+CS.gistId,{files:{[FILE]:{content:JSON.stringify(out)}}});
        const h=p.json&&p.json.history||[];
        M.vault=out;CS.version=version(p.json);CS.etag=null;CS.remote=hash(local);
        if(before&&h[1]&&h[1].version!==before){            // quelqu'un a écrit entre notre lecture et notre écriture
          const lost=await gh('GET','/gists/'+CS.gistId+'/'+h[1].version);
          const lv=await vaultOf(lost.json),ld=await VAULT.openData(lv,M.key);
          const r2=notesApi.merge(ld,CS.base);M.conflicts+=r2.c;res.n+=r2.n;res.c+=r2.c;
          M.again=true;                                     // et on renvoie le tout fusionné
        }
      }
      CS.base=notesApi.base();CS.hash=hash(notesApi.text());CS.at=Date.now();M.dirty=false;store();
      ui(res.n?'ext':(M.state==='ext'&&why==='poll'?'ext':'ok'),res.c?res.c+' conflit(s) gardé(s) en double':'');
    }catch(e){
      ui('err',(e instanceof CloudError?e.message:'erreur inattendue').slice(0,140));
      if(e&&e.code==='auth')ui('err','jeton GitHub refusé : Synchro → « Changer de jeton »');
    }finally{
      M.busy=null;
      if(M.again){M.again=false;setTimeout(()=>sync('again'),60);}
    }
  })();
  return M.busy;
}
async function removedHere(){                              // notre case a été retirée depuis un autre appareil
  clearInterval(M.poll);clearTimeout(M.t);CS=null;store();await forgetKey();M.vault=null;
  ui('removed','cet appareil a été retiré de la synchro (tes notes restent ici)');
}
function later(){if(!ready())return;M.dirty=true;clearTimeout(M.t);M.t=setTimeout(()=>sync('save'),PUSH_DELAY);}
function watch(){clearInterval(M.poll);M.poll=setInterval(()=>{if(ready()&&!document.hidden)sync('poll');},POLL);}
addEventListener('focus',()=>{if(ready())sync('focus');});
document.addEventListener('visibilitychange',()=>{if(!ready())return;if(document.hidden){if(M.dirty)sync('hide');}else sync('focus');});

/* ---------- mise en place ---------- */
const guessName=()=>/iPhone/.test(navigator.userAgent)?'iPhone':/iPad/.test(navigator.userAgent)?'iPad':/Android/.test(navigator.userAgent)?'Téléphone Android':
  /Mac/.test(navigator.userAgent)?'Mac':/Windows/.test(navigator.userAgent)?'PC Windows':'Ordinateur';
/* premier appareil : nouveau coffre + Gist secret */
async function setupFirst(token,password,name){
  const pk=await passkeyCreate(name);
  const {vault,dk}=await VAULT.create({iter:ITER});
  const pw=await VAULT.pwBits(password,VAULT.unb64(vault.kdf.salt),vault.kdf.iter);
  const slot=await VAULT.addDevice(vault,dk,pw,pk.prf,{name,credId:pk.credId,prfSalt:pk.prfSalt});
  const key=await VAULT.dkKey(dk);
  vault.by=slot.id;await VAULT.sealData(vault,key,notesApi.payload());
  const r=await gh('POST','/gists',{description:DESC,public:false,files:{[FILE]:{content:JSON.stringify(vault)}}},{token});
  CS={gistId:r.json.id,token,slotId:slot.id,credId:pk.credId,prfSalt:pk.prfSalt,name,base:notesApi.base(),version:version(r.json),etag:null,
    hash:hash(notesApi.text()),remote:hash(notesApi.text()),lock:false,at:Date.now()};
  store();M.vault=vault;await keepKey(dk.slice());
  return{dk,pw};                                            // gardés le temps de proposer le code de secours
}
async function writeVault(v){                              // écrit le coffre (cases modifiées) après l'avoir relu
  const r=await gh('PATCH','/gists/'+CS.gistId,{files:{[FILE]:{content:JSON.stringify(v)}}});
  M.vault=v;CS.version=version(r.json);CS.etag=null;store();
}
async function freshVault(token,gistId){const r=await gh('GET','/gists/'+(gistId||CS.gistId),null,{token,notFound:'Gist introuvable (mauvais code, ou supprimé)'});return{v:await vaultOf(r.json),g:r.json};}
async function addRecoveryNow(dk){const {v}=await freshVault();const code=await VAULT.addRecovery(v,dk);await writeVault(v);return code;}
/* déverrouillage complet (mot de passe + passkey) : pour ajouter un appareil, refaire le code de secours, ou si verrouillé */
async function fullUnlock(password){
  const {v}=await freshVault();
  const s=v.slots.find(x=>x.type==='device'&&x.id===CS.slotId);if(!s){await removedHere();throw E('removed','cet appareil a été retiré de la synchro');}
  const prf=await passkeyEval(s.credId,s.prfSalt);
  const pw=await VAULT.pwBits(password,VAULT.unb64(v.kdf.salt),v.kdf.iter);
  let dk;try{dk=await VAULT.openDevice(v,s,pw,prf);}catch(e){throw E('pw','mot de passe incorrect');}
  return{dk,pw,v};
}
async function startPair(password){
  const {dk,pw,v}=await fullUnlock(password);
  const p=await VAULT.addPair(v,dk,pw,CS.token);dk.fill(0);await writeVault(v);
  return{code:p.code,exp:p.slot.exp,link:location.origin+location.pathname+'#pair='+CS.gistId+'.'+p.code};
}
async function cancelPair(){const {v}=await freshVault();if(v.slots.some(s=>s.type==='pair')){v.slots=v.slots.filter(s=>s.type!=='pair');await writeVault(v);}}
function parsePair(t){const m=String(t||'').trim().replace(/^.*#pair=/,'').match(/^([0-9a-f]{20,40})[.\s]+([0-9A-Za-z\- ]{16,24})$/);
  return m?{gistId:m[1],code:m[2].replace(/[\s-]/g,'')}:null;}
/* nouvel appareil, depuis un code d'appairage affiché par un appareil déjà autorisé */
async function joinPair(text,password,name){
  const p=parsePair(text);if(!p)throw E('paircode','code d\'appairage invalide (il doit ressembler à 1a2b…9f.ABCD-EFGH-…)');
  const {v}=await freshVault('',p.gistId);                   // Gist secret : lisible sans jeton par qui connaît son adresse
  let o;try{o=await VAULT.openPair(v,p.code,password);}catch(e){throw E(e.code==='pw'?'pw':e.code||'pair',e.code==='pw'?'mot de passe (ou code) incorrect':e.message);}
  const pk=await passkeyCreate(name);
  const slot=await VAULT.addDevice(v,o.dk,o.pwBits,pk.prf,{name,credId:pk.credId,prfSalt:pk.prfSalt});
  v.slots=v.slots.filter(s=>s.type!=='pair');
  CS={gistId:p.gistId,token:o.token,slotId:slot.id,credId:pk.credId,prfSalt:pk.prfSalt,name,base:null,version:null,etag:null,hash:'',remote:'',lock:false,at:0};
  await writeVault(v);const dk=o.dk.slice();await keepKey(o.dk);return dk;   // dk : le temps de proposer un code de secours
}
/* plus aucun appareil (ou mot de passe oublié) : code de secours + nouveau jeton + nouveau mot de passe */
async function recover(token,gistId,codeText,password,name){
  const {v}=await freshVault(token,gistId);
  let dk;try{dk=await VAULT.openRecovery(v,codeText);}catch(e){throw E(e.code||'rec',e.code==='rec'?'code de secours incorrect':e.message);}
  const pk=await passkeyCreate(name);
  const gone=VAULT.resetPassword(v,{iter:ITER});
  const pw=await VAULT.pwBits(password,VAULT.unb64(v.kdf.salt),v.kdf.iter);
  const slot=await VAULT.addDevice(v,dk,pw,pk.prf,{name,credId:pk.credId,prfSalt:pk.prfSalt});
  CS={gistId,token,slotId:slot.id,credId:pk.credId,prfSalt:pk.prfSalt,name,base:null,version:null,etag:null,hash:'',remote:'',lock:false,at:0};
  await writeVault(v);await keepKey(dk);return gone;
}
async function removeDevice(id){const {v}=await freshVault();v.slots=v.slots.filter(s=>s.id!==id);await writeVault(v);if(id===CS.slotId)await removedHere();}
async function disableHere(){clearInterval(M.poll);clearTimeout(M.t);CS=null;store();await forgetKey();M.vault=null;ui('off');}

/* ========== ASSISTANT (en français, pour débutant) ========== */
let W=null,WS={};                                          // fenêtre ouverte, données de l'assistant (jamais enregistrées)
const pwIn=(id,label,ac)=>'<label class="cw-l" for="'+id+'">'+label+'</label><input id="'+id+'" type="password" autocomplete="'+(ac||'off')+'" spellcheck="false" autocapitalize="off">';
const txtIn=(id,label,val,ph)=>'<label class="cw-l" for="'+id+'">'+label+'</label><input id="'+id+'" type="text" spellcheck="false" autocapitalize="off" value="'+esc(val||'')+'" placeholder="'+esc(ph||'')+'">';
const btns=(...b)=>'<div class="cw-b">'+b.join('')+'</div>';
const B=(act,label,cls)=>'<button type="button" class="btn '+(cls||'ghost')+'" data-cw="'+act+'">'+label+'</button>';
const steps=n=>'<div class="cw-steps">'+['Jeton','Mot de passe','Passkey','Secours'].map((s,i)=>'<span class="'+(i<n?'done':i===n?'on':'')+'">'+(i+1)+'. '+s+'</span>').join('')+'</div>';
const VIEWS={
  intro:()=>'<h2>Synchro entre tes appareils</h2>'+
    '<p>Tes notes passent d\'un appareil à l\'autre (PC, téléphone…) par un <b>Gist secret</b> de ton compte GitHub. '+
    'Elles sont <b>chiffrées ici, avant l\'envoi</b> : GitHub ne voit que du charabia.</p>'+
    '<p>Pour ouvrir le coffre il faut <b>ton mot de passe</b> ET <b>la passkey de l\'appareil</b> (empreinte, visage ou code PIN). '+
    'Un nouvel appareil s\'ajoute seulement depuis un appareil déjà autorisé.</p>'+
    '<div class="cw-prf" id="cwPrf">vérification de la compatibilité…</div>'+
    btns(B('x','Fermer'),B('join','J\'ai déjà la synchro sur un autre appareil'),B('first','Commencer (premier appareil)','primary'))+
    '<p class="cw-small"><button type="button" class="cw-link" data-cw="recover">J\'ai perdu mes appareils / mon mot de passe : code de secours</button></p>',
  token:()=>steps(0)+'<h2>1. Ton jeton GitHub</h2>'+
    '<ol class="cw-ol"><li>Connecte-toi à GitHub (compte gratuit), puis ouvre <a href="'+TOKEN_URL+'" target="_blank" rel="noopener noreferrer">cette page de création de jeton</a> (case « gist » déjà cochée).</li>'+
    '<li>Laisse <b>seulement « gist »</b> coché. Expiration : « No expiration », ou une date (il faudra alors en refaire un).</li>'+
    '<li>En bas : « Generate token », puis copie le code (il commence par <code>ghp_</code>) et colle-le ici.</li></ol>'+
    '<p class="cw-small">Ce jeton ne peut toucher qu\'à tes Gists (pas à tes dépôts). Il reste dans ce navigateur. Un jeton « fine-grained » avec seulement « Gists : Read and write » marche aussi.</p>'+
    pwIn('cwToken','Jeton GitHub')+'<div class="cw-err" id="cwErr" role="alert"></div>'+btns(B('intro','← Retour'),B('tokenOk','Vérifier','primary')),
  exists:()=>'<h2>Un coffre AVERSE existe déjà</h2><p>Ce compte GitHub a déjà une synchro AVERSE (dernière modif : '+esc(new Date(WS.found.updated).toLocaleString('fr-FR'))+'). '+
    'Pour ne pas couper tes notes en deux, ajoute plutôt cet appareil :</p><ul class="cw-ol"><li>depuis un appareil déjà synchronisé : Synchro → « Ajouter un appareil » (QR code) ;</li>'+
    '<li>sinon, avec ton code de secours.</li></ul>'+btns(B('intro','← Retour'),B('recover','Code de secours'),B('join','J\'ai un code d\'appairage','primary'))+
    '<p class="cw-small"><button type="button" class="cw-link" data-cw="password">Créer quand même un 2e coffre séparé</button></p>',
  password:()=>steps(1)+'<h2>2. Ton mot de passe de synchro</h2>'+
    '<p>Il chiffre tes notes. Choisis-en un <b>long</b> (au moins 10 caractères, une petite phrase c\'est très bien) et <b>différent</b> de celui de GitHub.</p>'+
    pwIn('cwPw','Mot de passe','new-password')+pwIn('cwPw2','Encore une fois','new-password')+
    '<p class="cw-warn">Personne ne peut le retrouver pour toi : ni GitHub, ni AVERSE. Sans lui (et sans code de secours), la copie sur GitHub serait illisible. '+
    'Tes notes resteraient quand même sur chacun de tes appareils.</p>'+
    '<div class="cw-err" id="cwErr" role="alert"></div>'+btns(B('token','← Retour'),B('pwOk','Continuer','primary')),
  device:()=>steps(2)+'<h2>3. La passkey de cet appareil</h2>'+
    '<p>Ton appareil va te demander ton empreinte, ton visage ou ton code PIN : c\'est la « passkey ». Elle ne quitte jamais l\'appareil.</p>'+
    txtIn('cwName','Nom de cet appareil',WS.name||guessName())+'<div class="cw-err" id="cwErr" role="alert"></div>'+
    btns(B(WS.mode==='first'?'password':WS.mode==='join'?'join':'recover','← Retour'),B('create','Créer la passkey et activer','primary')),
  recovery:()=>steps(3)+'<h2>4. Code de secours (fortement conseillé)</h2>'+
    '<p>Un code à <b>écrire sur papier</b> et ranger chez toi. Il ouvre le coffre <b>tout seul</b> : si tu perds tous tes appareils ou oublies le mot de passe, c\'est ta seule porte de sortie.</p>'+
    '<p class="cw-warn">Sans code de secours : mot de passe oublié OU tous les appareils perdus = la copie chiffrée sur GitHub est perdue pour toujours. Personne ne peut la déchiffrer.</p>'+
    '<div class="cw-err" id="cwErr" role="alert"></div>'+btns(B('skipRec','Plus tard (déconseillé)'),B('makeRec','Créer mon code de secours','primary')),
  showRec:()=>'<h2>Ton code de secours</h2><p>Recopie-le <b>maintenant</b> sur papier. Il ne sera <b>plus jamais affiché</b>. Ne le mets pas dans tes notes ni dans un mail.</p>'+
    '<div class="cw-code" id="cwCode">'+esc(WS.rec)+'</div>'+
    '<label class="cw-chk"><input type="checkbox" id="cwWrote"> Je l\'ai écrit sur papier</label>'+btns(B('recDone','Terminer','primary')),
  done:()=>'<h2>Synchro activée ✓</h2><p>Cet appareil (« '+esc(CS&&CS.name)+' ») est synchronisé. Pour ajouter ton téléphone ou un autre PC : '+
    'ouvre Synchro ici → « Ajouter un appareil », puis scanne le QR code avec l\'autre appareil.</p>'+(WS.noRec?'<p class="cw-warn">Pas de code de secours pour l\'instant : tu peux en créer un plus tard dans Synchro.</p>':'')+
    btns(B('x','Fermer','primary')),
  join:()=>'<h2>Ajouter cet appareil</h2><p>Sur un appareil <b>déjà synchronisé</b> : Synchro → « Ajouter un appareil ». Scanne le QR code (il ouvre cette page directement), '+
    'ou copie ici le code affiché.</p>'+txtIn('cwPair','Code d\'appairage',WS.pair||'','1a2b3c….ABCD-EFGH-JKMN-PQRS')+pwIn('cwPw','Mot de passe de synchro','current-password')+
    '<div class="cw-err" id="cwErr" role="alert"></div>'+btns(B('intro','← Retour'),B('joinOk','Continuer','primary')),
  recover:()=>'<h2>Récupérer avec le code de secours</h2><p>Il te faut : un jeton GitHub (<a href="'+TOKEN_URL+'" target="_blank" rel="noopener noreferrer">en créer un</a>, case « gist »), ton code de secours, et un <b>nouveau</b> mot de passe. '+
    'Les anciens appareils devront être ré-ajoutés (leurs passkeys sont liées à l\'ancien mot de passe).</p>'+
    pwIn('cwToken','Jeton GitHub')+txtIn('cwRec','Code de secours','','XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX')+pwIn('cwPw','Nouveau mot de passe','new-password')+pwIn('cwPw2','Encore une fois','new-password')+
    '<div class="cw-err" id="cwErr" role="alert"></div>'+btns(B('intro','← Retour'),B('recOk','Continuer','primary')),
  settings:()=>{const v=M.vault,dev=v?v.slots.filter(s=>s.type==='device'):[],rec=v&&v.slots.some(s=>s.type==='recovery');
    return '<h2>Synchro</h2><p class="cw-state">'+esc(($('cloudState')||{}).textContent||'')+'</p>'+
    btns(B('syncNow','Synchroniser maintenant','primary'),B('pair','Ajouter un appareil'))+
    '<h3>Appareils</h3><ul class="cw-dev">'+dev.map(s=>'<li><span>'+esc(s.name)+(s.id===CS.slotId?' <i>(celui-ci)</i>':'')+'<small>ajouté le '+esc(new Date(s.created).toLocaleDateString('fr-FR'))+'</small></span>'+
      B('rm:'+esc(s.id),'Retirer')+'</li>').join('')+'</ul>'+
    '<h3>Code de secours</h3><p class="'+(rec?'cw-small':'cw-warn')+'">'+(rec?'Un code de secours existe. Tu peux le remplacer (l\'ancien ne marchera plus).':'Aucun code de secours : si tu oublies le mot de passe ou perds tes appareils, la copie GitHub sera perdue.')+'</p>'+
    btns(B('newRec',rec?'Nouveau code de secours':'Créer un code de secours'))+
    '<h3>Sur cet appareil</h3><label class="cw-chk"><input type="checkbox" id="cwLock"'+(CS.lock?' checked':'')+'> Verrouiller à chaque ouverture (mot de passe + passkey à chaque fois)</label>'+
    btns(B('newToken','Changer de jeton'),B('off','Désactiver ici','ghost danger'))+
    '<p class="cw-small">Retirer un appareil efface sa case : il ne pourra plus rien déchiffrer de neuf. Si un appareil a été volé : retire-le, puis révoque le jeton sur github.com/settings/tokens et mets-en un nouveau (« Changer de jeton »).</p>'+
    btns(B('x','Fermer'));},
  askPw:()=>'<h2>'+esc(WS.title)+'</h2><p>'+esc(WS.why)+'</p>'+pwIn('cwPw','Mot de passe de synchro','current-password')+'<div class="cw-err" id="cwErr" role="alert"></div>'+
    btns(B(CS&&M.key?'settings':'x','Annuler'),B('pwThen','Continuer (puis passkey)','primary')),
  pairShow:()=>'<h2>Ajouter un appareil</h2><p>Sur l\'autre appareil (téléphone…), <b>scanne ce QR code</b> avec l\'appareil photo : il ouvre AVERSE, demande le mot de passe, puis crée sa passkey.</p>'+
    '<div class="cw-qr"><img id="cwQr" alt="QR code d\'appairage" src="'+WS.qr+'"></div>'+
    '<p class="cw-small">Ou, dans Synchro → « J\'ai déjà la synchro… » sur l\'autre appareil, colle ce code :</p><div class="cw-code small" id="cwPairCode">'+esc(WS.pairText)+'</div>'+
    '<p class="cw-small" id="cwExp">Valable 15 minutes, une seule fois. Ce code seul ne suffit pas : il faut aussi le mot de passe.</p>'+
    btns(B('pairCancel','Annuler l\'appairage'),B('settings','OK','primary')),
  newToken:()=>'<h2>Changer de jeton</h2><p>Crée un nouveau jeton (<a href="'+TOKEN_URL+'" target="_blank" rel="noopener noreferrer">ici</a>, case « gist »), colle-le, puis révoque l\'ancien sur GitHub.</p>'+
    pwIn('cwToken','Nouveau jeton GitHub')+'<div class="cw-err" id="cwErr" role="alert"></div>'+btns(B('settings','Annuler'),B('tokenSet','Enregistrer','primary')),
  noprf:()=>'<h2>Synchro impossible sur cet appareil</h2><p class="cw-warn">'+esc(NOPRF)+'</p><p>Tes notes restent utilisables ici ; pour les passer d\'un appareil à l\'autre en attendant : « Sauvegarde » puis « Restaurer » (fusion, rien n\'est écrasé).</p>'+btns(B('x','Fermer','primary')),
};
function show(view){
  WS.view=view;
  if(!W){W=document.createElement('div');W.className='ctx-ov cw-ov';W.innerHTML='<form class="ctx-dlg cw" role="dialog" aria-modal="true" aria-label="Synchro" autocomplete="off" novalidate></form>';   // <form> : les gestionnaires de mots de passe s'y retrouvent
    W.addEventListener('submit',e=>e.preventDefault());
    document.body.appendChild(W);W.addEventListener('click',onClick);W.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(WS.view!=='showRec')close();}
      else if(e.key==='Enter'&&e.target.tagName==='INPUT'&&e.target.type!=='checkbox'){e.preventDefault();const p=W.querySelector('.btn.primary');if(p)p.click();}});}
  const box=W.firstChild;box.innerHTML=VIEWS[view]();box.dataset.view=view;
  const f=box.querySelector('input:not([type=checkbox])')||box.querySelector('.btn.primary');if(f)f.focus();
  if(view==='intro')prfSupport().then(s=>{const el=$('cwPrf');if(!el)return;WS.prf=s;el.dataset.s=s;
    el.textContent=s==='yes'?'✓ Cet appareil sait utiliser une passkey pour chiffrer.':s==='no'?'✕ '+NOPRF:'? Compatibilité passkey à confirmer à l\'étape 3 (la plupart des navigateurs récents marchent).';
    if(s==='no')box.querySelectorAll('[data-cw="first"],[data-cw="join"],[data-cw="recover"]').forEach(b=>b.disabled=true);});
}
function close(){if(W){W.remove();W=null;}if(WS.dk)WS.dk.fill(0);WS={};}   // on oublie tout ce qui a été tapé
const errBox=m=>{const e=$('cwErr');if(e)e.textContent=m||'';};
const val=id=>{const e=$(id);return e?e.value:'';};
async function busy(btn,fn){
  const b=btn,old=b&&b.textContent;if(b){b.disabled=true;b.textContent='…';}errBox('');
  try{await fn();}
  catch(e){if(e&&e.code==='noprf'){show('noprf');return;}errBox(e instanceof CloudError||e instanceof VAULT.VaultError?e.message:'erreur inattendue');}
  finally{if(b&&b.isConnected){b.disabled=false;b.textContent=old;}}
}
const okPw=(a,b)=>!a||a.length<10?'au moins 10 caractères':a!==b?'les deux mots de passe sont différents':'';
async function onClick(e){
  if(e.target===W){if(WS.view!=='showRec')close();return;}
  const b=e.target.closest('[data-cw]');if(!b)return;const a=b.dataset.cw;
  if(a==='x'){close();return;}
  if(a.startsWith('rm:')){const id=a.slice(3),s=M.vault.slots.find(x=>x.id===id);
    if(!s||!(await CTX.confirm('Retirer « '+s.name+' » de la synchro ?'+(id===CS.slotId?' (c\'est cet appareil : la synchro s\'arrêtera ici)':''),'Retirer')))return;
    await busy(null,async()=>{await removeDevice(id);if(CS)show('settings');else close();toast('Appareil retiré');});return;}
  switch(a){
    case 'intro':case 'token':case 'password':case 'recover':show(a);return;
    case 'first':WS.mode='first';show('token');return;
    case 'join':WS.mode='join';show('join');return;
    case 'tokenOk':{const t=val('cwToken').trim();if(!/^[\w-]{20,255}$/.test(t)){errBox('ce jeton n\'a pas la bonne forme (copie-le en entier)');return;}
      await busy(b,async()=>{const found=await findVaults(t);WS.token=t;
        if(found.length){WS.found=found[0];show('exists');}else show('password');});return;}
    case 'pwOk':{const p=val('cwPw'),m=okPw(p,val('cwPw2'));if(m){errBox(m);return;}WS.pw=p;show('device');return;}
    case 'create':{const name=(val('cwName').trim()||guessName()).slice(0,60);WS.name=name;
      await busy(b,async()=>{
        if(WS.mode==='first'){const r=await setupFirst(WS.token,WS.pw,name);WS.dk=r.dk;WS.pw=null;WS.token=null;watch();await sync('setup');show('recovery');}
        else if(WS.mode==='join'){const dk=await joinPair(WS.pair,WS.pw,name);WS.pw=null;watch();await sync('join');
          if(M.vault&&M.vault.slots.some(s=>s.type==='recovery')){dk.fill(0);WS.noRec=false;show('done');}else{WS.dk=dk;show('recovery');}}
        else{await recover(WS.token,WS.gistId,WS.rec,WS.pw,name);WS.pw=null;WS.rec=null;watch();await sync('recover');WS.noRec=false;show('done');}
      });return;}
    case 'makeRec':await busy(b,async()=>{
      let dk=WS.dk;if(!dk){WS.then='rec';WS.title='Code de secours';WS.why='Pour créer le code, confirme avec ton mot de passe puis ta passkey.';show('askPw');return;}
      WS.rec=await addRecoveryNow(dk);dk.fill(0);WS.dk=null;show('showRec');});return;
    case 'skipRec':if(WS.dk){WS.dk.fill(0);WS.dk=null;}WS.noRec=true;show('done');return;
    case 'recDone':if(!$('cwWrote').checked){$('cwWrote').parentElement.classList.add('cw-need');return;}WS.rec=null;WS.noRec=false;
      if(WS.fromSettings){WS.fromSettings=false;show('settings');}else show('done');return;
    case 'joinOk':{const p=parsePair(val('cwPair'));if(!p){errBox('code d\'appairage invalide');return;}const pw=val('cwPw');if(!pw){errBox('mot de passe ?');return;}
      WS.pair=val('cwPair');WS.pw=pw;
      await busy(b,async()=>{const {v}=await freshVault('',p.gistId);await VAULT.openPair(v,p.code,pw).catch(e=>{throw E(e.code,e.code==='pw'?'mot de passe (ou code) incorrect':e.message);});show('device');});return;}
    case 'recOk':{const t=val('cwToken').trim(),m=okPw(val('cwPw'),val('cwPw2'));if(m){errBox(m);return;}
      await busy(b,async()=>{const f=await findVaults(t);if(!f.length)throw E('404','aucun coffre AVERSE sur ce compte GitHub');
        const {v}=await freshVault(t,f[0].id);await VAULT.openRecovery(v,val('cwRec')).catch(e=>{throw E(e.code,e.code==='rec'?'code de secours incorrect':e.message);});
        WS.mode='recover';WS.token=t;WS.gistId=f[0].id;WS.rec=val('cwRec');WS.pw=val('cwPw');show('device');});return;}
    case 'settings':show('settings');return;
    case 'syncNow':await busy(b,async()=>{await sync('now');show('settings');});return;
    case 'pair':WS.then='pair';WS.title='Ajouter un appareil';WS.why='Confirme avec ton mot de passe, puis ta passkey : un code valable 15 minutes sera affiché.';show('askPw');return;
    case 'newRec':WS.then='rec';WS.title='Code de secours';WS.why='Confirme avec ton mot de passe, puis ta passkey. L\'ancien code ne marchera plus.';show('askPw');return;
    case 'pwThen':{const pw=val('cwPw');if(!pw){errBox('mot de passe ?');return;}
      await busy(b,async()=>{
        if(WS.then==='pair'){const p=await startPair(pw);WS.pairText=CS.gistId+'.'+p.code.match(/.{1,4}/g).join('-');
          const q=qrcode(0,'M');q.addData(p.link,'Byte');q.make();WS.qr=q.createDataURL(4,2);show('pairShow');}
        else if(WS.then==='rec'){const u=await fullUnlock(pw);WS.rec=await addRecoveryNow(u.dk);u.dk.fill(0);WS.fromSettings=!!M.key&&M.state!=='lock';show('showRec');}
        else if(WS.then==='unlock'){const u=await fullUnlock(pw);await keepKey(u.dk);watch();await sync('unlock');close();toast('Synchro déverrouillée');}
      });return;}
    case 'pairCancel':await busy(b,async()=>{await cancelPair();show('settings');toast('Appairage annulé');});return;
    case 'newToken':show('newToken');return;
    case 'tokenSet':{const t=val('cwToken').trim();if(!/^[\w-]{20,255}$/.test(t)){errBox('jeton mal copié');return;}
      await busy(b,async()=>{await gh('GET','/gists/'+CS.gistId,null,{token:t});CS.token=t;CS.etag=null;store();await sync('token');show('settings');});return;}
    case 'off':if(!(await CTX.confirm('Désactiver la synchro sur cet appareil ? Tes notes restent ici ; le coffre sur GitHub n\'est pas effacé.','Désactiver')))return;
      await disableHere();close();toast('Synchro désactivée sur cet appareil');return;
  }
}
document.addEventListener('change',async e=>{if(e.target&&e.target.id==='cwLock'&&CS){CS.lock=e.target.checked;store();
  if(CS.lock){try{await idbSet(DKEY,null);}catch(x){}toast('Mot de passe + passkey demandés à chaque ouverture');}
  else if(M.key){try{await idbSet(DKEY,M.key);}catch(x){}}}});

function openPanel(){
  if(!CS){show('intro');return;}
  if(!M.key){WS.then='unlock';WS.title='Déverrouiller la synchro';WS.why='Entre ton mot de passe de synchro, puis valide avec la passkey de cet appareil.';show('askPw');return;}
  show('settings');
}

/* ---------- démarrage ---------- */
{const b=$('cloudBtn');if(b)b.addEventListener('click',openPanel);}
async function init(){
  const h=location.hash.match(/^#pair=(.+)$/);
  if(h){history.replaceState(null,'',location.pathname+location.search);          // le code ne reste pas dans l'adresse
    if(!CS){WS.mode='join';WS.pair=decodeURIComponent(h[1]);show('join');}else toast('Cet appareil est déjà synchronisé');}
  if(!CS){ui('off');return;}
  if(!CS.lock)try{M.key=await idbGet(DKEY)||null;}catch(e){}
  if(!M.key){ui('lock','clique sur Synchro pour déverrouiller');return;}
  ui('busy');watch();await sync('open');
}
window.cloudLater=later;
const ready0=init();
window.cloudSync={state:()=>M.state,status:()=>{const s=$('cloudState');return s?s.textContent:'';},sync,open:openPanel,ready:()=>ready0,
  configured:()=>!!CS,unlocked:()=>!!M.key,parsePair};
if(TEST)window.cloudDebug={                                // tests.html seulement : faux GitHub, fausses passkeys, réglages rapides
  setFetch:f=>{fetchFn=f;},setCreds:c=>{creds=()=>c;},setIter:n=>{ITER=n;},setTimes:(poll,push)=>{POLL=poll;PUSH_DELAY=push;if(CS&&M.key)watch();},
  M,get CS(){return CS;},show,close,view:()=>WS.view,reset:async()=>{await disableHere();close();},reload:async()=>{CS=load();M.key=null;M.vault=null;await init();},
  forgetLocalKey:async()=>{M.key=null;try{await idbSet(DKEY,null);}catch(e){}},setup:setupFirst,startPair,joinPair,recover,removeDevice,addRecoveryNow,fullUnlock};
})();
