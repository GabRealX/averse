/* ai-worker.js — v7 : calcul des « embeddings » (vecteurs de sens) HORS du fil principal (Web Worker module).
   Rien ne se télécharge tant que la page n'envoie pas {type:'load'} — c.-à-d. tant que tu n'as pas activé
   « Recherche par le sens » dans les réglages IA.
   - Transformers.js 3.7.6 est VENDORISÉ (js/vendor/transformers/, servi par AVERSE, licence Apache-2.0).
   - Le moteur ONNX en WebAssembly (21 Mo) vient du CDN jsDelivr, VÉRIFIÉ par empreinte SHA-384 (comme un attribut
     integrity=) avant d'être utilisé, puis gardé dans le cache « averse-ai-1 » (hors-ligne ensuite).
   - v8 : le modèle MULTILINGUE multilingual-e5-small quantifié (q8 : 118 Mo + tokenizer 17 Mo ≈ 135 Mo) vient de
     huggingface.co, à une révision FIGÉE (commit), mis en cache par Transformers.js (cache « transformers-cache »).
     Français ET anglais dans le même espace : une question en anglais retrouve une note en français.
     (v7 : all-MiniLM-L6-v2, 23 Mo, anglais seulement — comparaison chiffrée dans le README.)
   Messages : {type:'load'} → {type:'progress',p,loaded,total} … {type:'ready'}
              {type:'embed',id,texts} → {type:'vecs',id,vecs:[Float32Array]}   ·   erreurs : {type:'error',id?,message} */
import {pipeline,env} from './vendor/transformers/transformers.min.js';

const WASM_URL='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/ort-wasm-simd-threaded.jsep.wasm';
const WASM_SRI='sha384-u/bDsx39c+wt0LbHmOCydxt4fyiig3118hQgOTfOvrfkgScM4hRo2IwTtlxyoI02';
const MODEL='Xenova/multilingual-e5-small',REVISION='761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const CACHE='averse-ai-1';

let pipe=null,loading=null;
/* progression par fichier : {loaded,total}. Le modèle (~135 Mo) est compté d'avance pour que la barre
   ne repasse pas de 100 % à 50 % entre le moteur et le modèle ; remplacé par la vraie taille dès qu'elle arrive. */
const files={_model:{loaded:0,total:135e6}};
function report(){let l=0,t=0;for(const k in files){l+=files[k].loaded||0;t+=files[k].total||0;}
  postMessage({type:'progress',p:t?Math.min(1,l/t):0,loaded:l,total:t});}

/* fetch + vérification d'empreinte (SRI « à la main » : import() et importScripts n'acceptent pas integrity) */
async function wasmBytes(){
  const c=await caches.open(CACHE);let res=await c.match(WASM_URL),fromCache=!!res;
  if(!res){res=await fetch(WASM_URL,{credentials:'omit',referrerPolicy:'no-referrer'});
    if(!res.ok)throw new Error('moteur IA : téléchargement impossible ('+res.status+')');}
  const total=+res.headers.get('content-length')||21596019;files.wasm={loaded:0,total};
  const rd=res.body.getReader(),parts=[];let n=0;
  for(;;){const {done,value}=await rd.read();if(done)break;parts.push(value);n+=value.length;files.wasm.loaded=n;if(!fromCache)report();}
  const buf=new Uint8Array(n);let o=0;for(const p of parts){buf.set(p,o);o+=p.length;}
  const dg=new Uint8Array(await crypto.subtle.digest('SHA-384',buf));
  let b='';for(const x of dg)b+=String.fromCharCode(x);
  if('sha384-'+btoa(b)!==WASM_SRI)throw new Error('moteur IA : empreinte SHA-384 incorrecte, fichier refusé');
  if(!fromCache)await c.put(WASM_URL,new Response(buf,{headers:{'content-type':'application/wasm'}}));
  files.wasm.loaded=files.wasm.total=n;report();
  return buf.buffer;
}
async function load(){
  if(pipe)return pipe;
  if(loading)return loading;
  loading=(async()=>{
    env.allowLocalModels=false;env.useBrowserCache=true;
    const w=env.backends.onnx.wasm;
    w.numThreads=1;w.proxy=false;
    w.wasmPaths={mjs:new URL('./vendor/transformers/ort-wasm-simd-threaded.jsep.mjs',import.meta.url).href};
    w.wasmBinary=await wasmBytes();
    pipe=await pipeline('feature-extraction',MODEL,{revision:REVISION,dtype:'q8',device:'wasm',
      progress_callback:e=>{if(e.status==='progress'&&e.file){if(/\.onnx$|tokenizer\.json$/.test(e.file))delete files._model;files[e.file]={loaded:e.loaded,total:e.total};report();}}});
    return pipe;
  })();
  try{return await loading;}catch(e){loading=null;throw e;}
}
onmessage=async e=>{
  const m=e.data||{};
  try{
    if(m.type==='load'){await load();postMessage({type:'ready',model:MODEL,revision:REVISION});return;}
    if(m.type==='embed'){
      const p=await load(),texts=(m.texts||[]).map(t=>String(t||'').slice(0,2000)||' ');
      const out=await p(texts,{pooling:'mean',normalize:true});
      const dim=out.dims[out.dims.length-1],vecs=[];
      for(let i=0;i<texts.length;i++)vecs.push(out.data.slice(i*dim,(i+1)*dim));
      postMessage({type:'vecs',id:m.id,vecs});return;
    }
  }catch(err){postMessage({type:'error',id:m.id,message:String(err&&err.message||err).slice(0,300)});}
};
