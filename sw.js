/* sw.js — fait fonctionner le site hors-ligne, et reçoit les partages (share_target).
   ⚠ À chaque modification d'un fichier, change le numéro de version ci-dessous
   (averse-v14 → averse-v16…) pour que les visiteurs reçoivent la nouvelle version.
   Tous les chemins sont RELATIFS à ce fichier : le site marche aussi dans un sous-dossier
   (ex. https://toi.github.io/averse/ sur GitHub Pages). */
const CACHE = 'averse-v16';
const SHARE = 'averse-share';          // contenu partagé en attente (lu puis vidé par app.js)
/* OCR (v4) : Tesseract.js pèse ~11 Mo (moteur wasm + langues). Il n'est PAS dans ASSETS : sinon chaque visiteur
   téléchargerait 11 Mo à l'installation, même sans jamais utiliser l'OCR, et à chaque nouvelle version du site.
   Il est mis en cache à la PREMIÈRE utilisation de l'outil, dans un cache à part qui survit aux mises à jour
   (ces fichiers ne changent jamais : il faut juste changer OCR_CACHE si on remplace Tesseract). */
const OCR_CACHE = 'averse-ocr-1';
const OCR_DIR = new URL('./js/vendor/tesseract/', self.location).href;
/* IA locale (v7) : Transformers.js (~0,9 Mo) n'est chargé qu'à l'activation de la « recherche par le sens ».
   Même principe que l'OCR : cache à part, rempli à la première utilisation. Le worker y range aussi le moteur
   WebAssembly (21 Mo, vérifié SHA-384) ; le modèle est dans « transformers-cache » (géré par Transformers.js). */
const AI_CACHE = 'averse-ai-1';
const AI_DIR = new URL('./js/vendor/transformers/', self.location).href;
const KATEX_FONTS = [
  'AMS-Regular',
  'Caligraphic-Bold',
  'Caligraphic-Regular',
  'Fraktur-Bold',
  'Fraktur-Regular',
  'Main-Bold',
  'Main-BoldItalic',
  'Main-Italic',
  'Main-Regular',
  'Math-BoldItalic',
  'Math-Italic',
  'SansSerif-Bold',
  'SansSerif-Italic',
  'SansSerif-Regular',
  'Script-Regular',
  'Size1-Regular',
  'Size2-Regular',
  'Size3-Regular',
  'Size4-Regular',
  'Typewriter-Regular'
].map(f => './js/vendor/katex/fonts/KaTeX_' + f + '.woff2');
const ASSETS = [
  './', './index.html', './notes.html', './about.html', './share.html', './manifest.json', './icon.svg',
  './icons/icon.svg', './icons/maskable.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png',
  './css/base.css', './css/home.css', './css/tools.css', './css/app.css', './css/ui.css', './css/notes.css', './css/ascii.css', './css/share.css',
  './js/core.js', './js/data.js', './js/rain.js', './js/app.js', './js/about.js', './js/detect.js', './js/panel.js', './js/notes.js',
  './js/keys.js', './js/pwa.js', './js/ctxmenu.js', './js/backup.js', './js/math.js',
  './js/notes-graph.js', './js/notes-page.js', './js/vault.js', './js/cloud.js',   // v5 : graphe, barre mobile, synchro chiffrée
  './js/theme.js', './js/eggs.js', './js/glyph.js', './js/ai.js', './js/ai-bar.js', './js/ai-notes.js', './js/ai-worker.js', './css/ai.css',   // v7
  './js/accent.js', './js/search.js', './js/templates.js', './js/notes-tpl.js', './js/md.js', './js/share.js', './js/share-view.js', './js/feedback.js',   // v6
  './js/tools/base.js', './js/tools/image.js', './js/tools/editeur.js', './js/tools/pdf.js', './js/tools/reseau.js',
  './js/tools/electronique.js', './js/tools/dev.js', './js/tools/encodage.js', './js/tools/carnet.js', './js/tools/texte.js', './js/tools/memo.js',
  './js/tools/sauvegarde.js', './js/tools/ocr.js',
  './js/vendor/pdf-lib.min.js', './js/vendor/qrcode.js', './js/vendor/katex/katex.min.js', './js/vendor/katex/katex.min.css'
].concat(KATEX_FONTS);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // seulement NOS anciens caches (averse-…) : sur GitHub Pages, l'origine (toi.github.io) est partagée
      // avec tes autres projets, on ne touche pas à leurs caches.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('averse-') && k !== CACHE && k !== SHARE && k !== OCR_CACHE && k !== AI_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* « Partager vers AVERSE » (manifest share_target) : le système envoie un POST multipart sur ./share-target.
   On range titre / texte / lien / fichiers dans le cache SHARE, puis on redirige vers index.html?share=1
   (app.js lit, vide le cache et ouvre le bon outil). Rien ne quitte l'appareil. */
async function receiveShare(req) {
  const home = new URL('./index.html', self.registration.scope);
  try {
    const form = await req.formData();
    const c = await caches.open(SHARE);
    for (const k of await c.keys()) await c.delete(k);
    const str = k => { const v = form.get(k); return typeof v === 'string' ? v.slice(0, 100000) : ''; };
    const files = form.getAll('files').filter(f => f && typeof f !== 'string').slice(0, 20);
    for (let i = 0; i < files.length; i++) {
      await c.put('./__share/' + i, new Response(files[i], { headers: {
        'content-type': files[i].type || 'application/octet-stream', 'x-name': encodeURIComponent(files[i].name || 'fichier') } }));
    }
    await c.put('./__share/meta', new Response(JSON.stringify({ title: str('title'), text: str('text'), url: str('url'), files: files.length, t: Date.now() }),
      { headers: { 'content-type': 'application/json' } }));
    home.search = '?share=1';
  } catch (err) { home.search = '?share=0'; }
  return Response.redirect(home.href, 303);
}

/* Pages HTML : réseau d'abord (nouvelle version tout de suite), cache si hors-ligne.
   Le reste : cache d'abord, mis à jour en arrière-plan. Les polices Google sont gardées aussi. */
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  const inScope = req.url.startsWith(self.registration.scope);
  if (req.method === 'POST' && inScope && /\/share-target\/?$/.test(url.pathname)) {
    e.respondWith(receiveShare(req));
    return;
  }
  if (req.method !== 'GET') return;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin !== self.location.origin && !isFont) return;
  // v5 : jamais de cache pour une requête authentifiée ou « no-store » (API de synchro : toujours le réseau)
  if (req.headers.has('authorization') || req.cache === 'no-store') return;

  if (req.url.startsWith(AI_DIR)) {                // IA locale : idem OCR
    e.respondWith(caches.open(AI_CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) c.put(req.url.split('?')[0], res.clone());
      return res;
    }))));
    return;
  }
  if (req.url.startsWith(OCR_DIR)) {               // OCR : cache d'abord, rempli à la première utilisation
    e.respondWith(caches.open(OCR_CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(res => {
      if (res && res.status === 200) c.put(req.url.split('?')[0], res.clone());
      return res;
    }))));
    return;
  }

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    const key = url.origin + url.pathname;          // index.html?share=1 et index.html : la même page en cache
    e.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
        return res;
      }).catch(() => caches.match(key, { ignoreSearch: true }).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res && (res.status === 200 || (isFont && res.type === 'opaque'))) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
