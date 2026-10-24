# AVERSE

Boîte à outils du quotidien + carnet de notes. HTML/CSS/JS pur, tout tourne dans le navigateur, rien n'est envoyé nulle part, et ça marche hors ligne.
(Les projets et les liens sont sur `about.html`.)

## Lancer
Il faut un petit serveur local (service worker, Worker et crypto ne marchent pas en `file://`) :

    python3 -m http.server 8000     # puis http://localhost:8000

## Utiliser
- **L'accueil est une recherche** : tape quelques lettres (« jsn », « fusion pdf », « qr »…), **Entrée** ouvre le meilleur résultat, ↑ ↓ pour choisir. Les notes du carnet sortent aussi dans les résultats. **Ctrl+K** remet le curseur dans la recherche.
- **Favoris** : l'étoile ☆ sur une carte ou en haut d'un outil. Favoris et **récents** s'affichent sous la recherche.
- **Collage malin** : colle (Ctrl+V) directement sur l'accueil un JSON, un JWT, une URL, une couleur (#ff8800), un timestamp, un UUID, du Base64, une IP, un hash… ou une image : l'outil qui va bien est proposé (Entrée pour l'ouvrir).
- **Glisser-déposer** un fichier n'importe où : un PDF ouvre l'outil PDF, une image propose optimiser / convertir / éditer / mettre en PDF, un autre fichier propose hash ou Base64.
- **Une page par outil** : adresse `index.html#/json`, `#/regex`, `#/pdfoutils`… (on peut la mettre en marque-page, le bouton Retour marche). **Échap** revient à la recherche.
- Les champs **se souviennent** de leur dernière valeur (sauf mots de passe, clés et très gros textes). Les résultats ont un bouton copier.
- **Carnet** : **Ctrl+J** (⌘+J sur Mac) ouvre le panneau des notes partout. **→ Carnet** en haut de chaque outil envoie entrées + résultats dans une note. Le carnet complet reste `notes.html`.
- **Autres outils** (`#/autres`) : réseau, électronique, texte & dates, aide-mémoire. Moins utilisés, mais toujours trouvables par la recherche.
- **Pluie** : désactivée par défaut, lien « pluie : off/on » en bas de page. **Style ASCII** : lien « style » en bas (ou `?style=ascii`).

## Nouveautés v5
- **Synchro chiffrée PC ↔ téléphone** (bouton **Synchro** du carnet), marche aussi sur mobile, Firefox et Safari. Détails plus bas.
- **Graphe lisible même avec beaucoup de notes** :
  - **Groupes** : « + par tag » crée un groupe par tag fréquent. Pour un groupe manuel : clic droit sur un nœud → « Groupe… ».
  - Chaque groupe a une **forme** (cercle, carré, triangle, losange, étoile) et une **couleur**. Clic sur son nom dans la légende pour les changer.
  - **Légende** avec une case par groupe pour l'afficher ou le masquer. Elle est repliée par défaut sur téléphone.
  - **Filtre par tag** (liste en haut à droite).
  - **Étiquettes** : « auto » (les noms apparaissent en zoomant ou au survol quand il y a beaucoup de nœuds), « toutes » ou « survol ».
  - **Zoom** : molette, pincement à deux doigts, boutons − / +. **⤢** recadre tout.
  - **Focus** : un clic sur un nœud ne montre que lui et ses voisins. Un 2e clic ouvre la note.
  - Tous ces réglages sont gardés (clé `averse-graph`). Testé avec 500 notes.
- **Barre du carnet sur mobile** : des fondus et des flèches ‹ › aux bords, plus une petite barre de position sous les boutons, montrent qu'elle défile. À la première visite, la barre glisse un peu toute seule pour le montrer.
- **Tests plus fiables** (ils échouaient sur ton téléphone alors que tout marchait) :
  - le graphe est testé pas à pas, sans attendre l'animation, que le navigateur ralentit (onglet en arrière-plan, téléphone lent) ;
  - le test regex attendait trop peu sur Safari ;
  - Safari/iPhone n'a pas de fichier local de navigateur (OPFS) : les tests de synchro par fichier utilisent alors un faux fichier en mémoire ;
  - une API absente sur un navigateur est marquée « ignoré », jamais « réussi » ;
  - un vrai bug a été trouvé et corrigé : l'OCR plantait sur une page où l'élément « hors-ligne » n'existait pas.
  - **Tes données ne risquent rien** : tests.html range une copie de tes notes et réglages avant de commencer, les remet à la fin (même après un plantage, au chargement suivant), et utilise une base IndexedDB et une clé de synchro à part.
- **notes.html** a une politique de sécurité stricte (CSP) : plus aucun script dans la page. Elle ne peut parler qu'à `api.github.com` et `gist.githubusercontent.com`.

## Synchro chiffrée (v5)
### Mise en route (5 minutes)
1. Sur le PC : carnet → **Synchro** → « Commencer ». L'assistant t'envoie sur
   https://github.com/settings/tokens/new?scopes=gist&description=AVERSE.
   La case « gist » y est déjà cochée, ne coche rien d'autre. Choisis une durée, clique « Generate token », copie le jeton `ghp_…` et colle-le dans AVERSE.
2. Choisis un **mot de passe de synchro** (8 caractères minimum, une phrase c'est mieux), puis crée la **passkey** de cet appareil (Windows Hello, empreinte, Face ID…).
3. (Conseillé) Note le **code de secours** affiché UNE seule fois. C'est le seul moyen de tout récupérer si tu perds tous tes appareils.
4. Sur le téléphone : sur le PC, **Synchro → Ajouter un appareil** affiche un QR code et un code de 16 caractères (valable 15 min, une seule fois). Scanne-le avec le téléphone (ou tape le code sur le téléphone : Synchro → « J'ai déjà la synchro sur un autre appareil »), entre le mot de passe et crée la passkey du téléphone. Le jeton passe dans le code, tu n'as pas à le recopier.

Ensuite, tout se fait seul :
- les notes sont récupérées à l'ouverture, au retour sur l'onglet et toutes les 30 s ;
- elles sont envoyées 2,5 s après une modification ;
- l'état s'affiche à côté du bouton : synchronisé · reçu d'un autre appareil — fusionné · erreur · verrouillée · appareil retiré.

### Sécurité
- Le Gist est **secret** et ne contient qu'un **coffre chiffré** (AES-256-GCM, notes compressées puis chiffrées). GitHub ne peut lire ni tes notes, ni leurs titres, ni leur nombre.
- La clé des données est tirée au hasard. Elle n'est jamais envoyée en clair : pour chaque appareil, elle est enveloppée par une clé qui combine (HKDF) ton **mot de passe** (PBKDF2-SHA256, 600 000 tours) ET la **passkey de cet appareil** (extension PRF). Le mot de passe seul ne suffit pas, et la passkey seule non plus.
- Le code de secours a sa propre enveloppe. Le code d'appairage aussi : elle est supprimée dès qu'il a servi ou au bout de 15 min.
- Chaque appareil garde : le jeton (droit « gist » uniquement), l'identifiant du Gist et la clé des données, rangée **non exportable** dans IndexedDB. Option « verrouiller à chaque ouverture » : la clé n'est pas gardée, mot de passe et passkey sont demandés à chaque ouverture.
- Jamais de jeton, de mot de passe ou de code dans la console ou dans la Sauvegarde. Le champ du jeton est masqué (type mot de passe).
- **Anti-écrasement** : lecture conditionnelle (ETag). Avant chaque envoi, on relit. Après l'envoi, on vérifie dans l'historique du Gist que personne n'a écrit entre-temps. Sinon on récupère cette version, on fusionne et on renvoie. Même fusion que la synchro par fichier : la plus récente gagne, les pierres tombales gèrent les suppressions, et un conflit donne une copie avec le tag `conflit`.

### Si tu perds…
| tu perds | conséquence |
|---|---|
| un appareil | les autres continuent. Retire-le : Synchro → appareils → « Retirer ». Si quelqu'un a pu le garder, change aussi le jeton (voir plus bas). |
| ta passkey (ex. réinstallation de Windows) | cet appareil ne peut plus ouvrir le coffre (la synchro continue tant que sa clé reste en mémoire). Retire-le, puis réajoute-le depuis un autre appareil (QR) ou avec le code de secours. |
| ton mot de passe | les appareils déjà réglés continuent (ils ne le redemandent pas, sauf en mode « verrouiller »). Pour en choisir un nouveau : code de secours (Synchro → « J'ai déjà la synchro… » → « Code de secours ») : ça remet un mot de passe, et les anciennes cases d'appareils sont retirées (à réajouter par QR). Sans code de secours : « Désactiver ici » puis recrée une synchro depuis un appareil qui a les notes (elles sont toutes en local). |
| TOUS tes appareils, sans code de secours | le coffre est illisible, par personne, toi compris. C'est le prix du chiffrement de bout en bout. Fais aussi des Sauvegardes de temps en temps. |
| le jeton GitHub | il ne donne accès qu'à tes Gists, et le contenu est chiffré. Révoque-le quand même. |

### Révoquer / changer le jeton
1. Sur https://github.com/settings/tokens, supprime l'ancien jeton (« Delete »).
2. Crée-en un nouveau (même lien que plus haut).
3. Dans AVERSE, sur chaque appareil : Synchro → « Changer de jeton ».

Une fois le jeton supprimé, l'appareil volé ne peut plus rien lire ni écrire.

### À savoir
- **Navigateurs** : il faut une passkey avec l'extension **PRF**.
  - OK : Chrome/Edge récents (Windows Hello, Android, gestionnaire Google), Safari 18+ (iOS/macOS 15+, trousseau iCloud), Firefox récent selon la plateforme.
  - Si l'appareil ne sait pas, l'assistant le dit (« Synchro impossible sur cet appareil »), et rien n'est créé.
- **Même origine** : sur `gabrealx.github.io`, tous tes projets GitHub Pages partagent le même stockage. Un autre de tes projets (ou une page qu'un jour tu y publierais sans y faire attention) pourrait lire le jeton et le coffre local. Pour une vraie séparation, utilise un **domaine perso** (Settings → Pages → Custom domain), ou ne publie rien d'autre sur ce compte Pages.
- Le Gist s'appelle « AVERSE — carnet chiffré ». Ne le modifie pas à la main. Le supprimer arrête la synchro, mais tes notes restent sur chaque appareil.
- Limite de GitHub : 5 000 requêtes par heure, et AVERSE en fait ~120 par heure et par appareil ouvert. Les lectures « rien n'a changé » (304) ne comptent pas.

## Nouveautés v3
- **Accueil** : grand titre AVERSE au-dessus de la recherche, liens (data.js) dans le pied de page. Les projets restent sur `about.html`.
- **Raccourcis clavier** (touche **?** pour l'aide) — ils ne gênent jamais la frappe dans un champ :
  - **/** recherche · **Ctrl+Entrée** lancer / recalculer · **Ctrl+Maj+C** copier le résultat · **Échap** retour · **?** aide.
  - Ctrl+K et Ctrl+J marchent aussi dans un champ. Sur Mac, ⌘ remplace Ctrl.
  - Attention : dans Chrome/Edge, Ctrl+Maj+C est aussi le raccourci de l'inspecteur. Selon le navigateur, l'inspecteur peut passer avant AVERSE ; dans l'appli installée, il ne gêne pas.
- **Chaînage** : bouton **→ Envoyer vers…** en haut de chaque outil.
  - Un texte part vers JSON, Base64, URL, Hash, Regex, QR ou une note.
  - Une image part vers Optimiser, Convertir, Éditeur ou Images → PDF.
  - Un PDF part vers les outils PDF.
- **Clic droit** (menu AVERSE, au clavier : ↑ ↓ Entrée → ←, **Échap** ferme) :
  - **Résultat, sélection, image** : copier, envoyer vers un outil, ajouter au carnet, ouvrir l'outil associé (deviné comme pour le collage).
  - **Note** (liste du carnet, panneau Ctrl+J, résultats de recherche, nœud du graphe) : ouvrir, renommer, dupliquer, épingler, ajouter un tag, exporter .md, exporter PDF, supprimer (avec confirmation). Les notes épinglées passent en haut (◆).
  - **Fichier chargé dans un outil** (miniatures et listes d'Optimiser, Images → PDF, PDF) : ouvrir dans un autre outil, renommer pour l'export, télécharger, copier l'image, retirer de la liste, infos (taille, dimensions, pages).
  - **Menu habituel du navigateur** : **Maj+clic droit**, ou clic droit dans un champ de saisie sans sélection.
- **Sauvegarde complète** (`#/sauvegarde`, ou boutons Sauvegarde / Restaurer du carnet) :
  - Un seul fichier JSON avec les notes, favoris, récents, champs mémorisés et réglages (style, pluie).
  - Les secrets n'y vont jamais : mots de passe, clés, jetons, HMAC, JWT.
  - À l'import, tout est vérifié (taille, types, clés connues, pas de `__proto__`) et fusionné sans rien écraser de plus récent. Un ancien export du carnet s'importe aussi.
- **Carnet** :
  - **PDF** : vue d'impression propre (titre, date, tags, note rendue), puis « Enregistrer en PDF » dans la fenêtre d'impression.
  - **Formules** `$…$` et `$$…$$` avec KaTeX, copié en local (`js/vendor/katex`) et chargé seulement s'il y a une formule. `\$` écrit un vrai dollar ; le code entre accents graves n'est pas touché. Le HTML est échappé, `trust:false`, donc pas de `\href{javascript:…}` ni d'injection.
- **Appli installable (PWA)** : bouton **Installer** (il apparaît quand le navigateur le propose), icônes normales et « maskable » (192/512), raccourcis (JSON, PDF, Optimiser, QR, Carnet).
- **Ouvrir avec AVERSE** :
  - Une fois installée, l'appli reçoit les fichiers PDF, images, JSON et txt (`file_handlers` + `launchQueue`).
  - Elle apparaît aussi dans le menu Partager du téléphone (`share_target`, POST traité par sw.js) : le contenu est rangé puis envoyé au bon outil.

### Windows : clic droit sur un fichier → « Ouvrir avec » → AVERSE
1. Ouvre AVERSE dans Chrome ou Edge (servi en https, ou en `http://localhost`).
2. Clique sur **Installer**, ou passe par le menu ⋮ → « Installer AVERSE ».
3. Clic droit sur un PDF, une image, un .json ou un .txt → **Ouvrir avec** → **AVERSE**. Il faut parfois passer par « Choisir une autre application ».
4. Au premier fichier, le navigateur demande l'autorisation d'ouvrir ce type de fichier. Accepte-la.

Pas de fichier .reg fourni, volontairement :
- Chrome et Edge inscrivent eux-mêmes l'appli installée dans « Ouvrir avec » à partir du `manifest.json`.
- Une clé de registre faite main devrait pointer vers `chrome_proxy.exe` avec l'identifiant de l'appli, qui change d'une installation à l'autre. Elle casserait à la moindre mise à jour, et modifier le registre n'est pas sans risque.
- Pour retirer l'entrée, il suffit de désinstaller l'appli.

## Nouveautés v4
- **Texte d'une image (OCR)** (`#/ocr`, famille Fichiers) : lit le texte d'une photo, d'un scan ou d'une capture, en français, en anglais ou les deux.
  - On y arrive en glissant une image, en la collant (Ctrl+V) ou par clic droit sur une image → « Envoyer vers OCR ». Une image déposée sur l'accueil le propose aussi.
  - Le texte lu se copie, part dans le carnet (→ Carnet), ou se chaîne vers un autre outil (→ Envoyer vers…).
  - Moteur : Tesseract.js 7, copié dans `js/vendor/tesseract/`. Rien ne part sur Internet.
  - **Taille** : 15,6 Mo ajoutés au dossier, mais un appareil n'en télécharge que ~4,8 Mo (français seul) ou ~7,7 Mo (avec l'anglais). Le détail : moteur 3,9 Mo (une seule des 3 variantes, choisie selon le navigateur), français 0,7 Mo, anglais 2,9 Mo, scripts 0,17 Mo.
  - **Mise en cache** : rien n'est chargé tant qu'on n'ouvre pas l'outil. Les fichiers ne sont pas dans la liste d'installation `ASSETS` : sinon chaque visiteur paierait ~8 Mo d'un coup, même sans jamais utiliser l'OCR, et une seconde fois à chaque nouvelle version.
  - Ils vont à la première utilisation dans un cache à part (`averse-ocr-1`), qui n'est pas vidé quand le site change de version. Ensuite, l'OCR marche hors-ligne. L'outil affiche si c'est déjà le cas.
- **Synchro du carnet entre appareils** (bouton **Fichier** du carnet, Chrome / Edge sur ordinateur) :
  - Lie le carnet à un fichier `.json` placé dans ton dossier OneDrive / Google Drive / Dropbox.
  - Le fichier est relu toutes les 5 s quand l'onglet est visible, et au retour sur l'onglet. Ses changements faits ailleurs sont fusionnés, suppressions comprises.
  - Avant chaque écriture, le fichier est relu : rien n'est écrasé.
  - **Conflit** (la même note modifiée sur les deux appareils, ou modifiée d'un côté et supprimée de l'autre) : la version la plus récente reste, l'autre est gardée dans une note « … (conflit — …) » avec le tag `conflit`. Tu compares et tu supprimes celle que tu ne veux pas.
  - Un fichier illisible (le service de synchro est en train de l'écrire) n'est jamais écrasé : on réessaie au passage suivant.
  - L'état est affiché à côté du bouton : **synchro OK** · **modifié ailleurs — fusionné** · **erreur** (fichier illisible ou introuvable) · **accès au fichier à redonner** (après un redémarrage du navigateur : un clic sur Fichier).
  - **Firefox / Safari / mobile** n'ont pas cette API. Le bouton explique alors d'utiliser **Sauvegarde** ici puis **Restaurer** sur l'autre appareil ; la fusion est la même.
- **GitHub Pages** : tout marche dans un sous-dossier (`https://toi.github.io/averse/`). Vérifié sous `/averse/` : portée du service worker, installabilité, partage (vrai POST vers `share-target`), adresses du manifeste (« Ouvrir avec », raccourcis, icônes). Fichier `.nojekyll` ajouté. Voir plus bas.
- **Carnet sur mobile** : les boutons de la barre défilent au doigt (Sauvegarde / Restaurer étaient coupés hors écran).
- **Dette réglée** :
  - le graphe s'arrête de calculer quand il est stable, et reste fluide avec 500 notes (répulsion par grille) ;
  - plus de fuite d'URL d'aperçu dans les outils d'images ;
  - Rechercher / remplacer passe par un Worker avec délai de 1 s, comme l'outil Regex (même code) ;
  - les jours ouvrés sont calculés sans boucle jour par jour ;
  - `esc()` échappe aussi l'apostrophe ;
  - code mort retiré.

## Les outils
- **Fichiers** : optimiser des images, convertir PNG / JPG / WebP, images → PDF, éditeur d'image, texte d'une image (OCR), PDF (fusionner, extraire ou découper des pages).
- **Dev** : JSON, regex, hash, Base64 (texte et fichiers), URL (encoder / décoder / lire les paramètres), JWT (décodage), UUID, QR code (texte ou Wi-Fi, PNG/SVG), mots de passe, couleurs.
- **Notes** : note rapide, carnet, panneau Ctrl+J.
- HEIC (photos d'iPhone) : seulement là où le navigateur sait le lire (Safari). Pas de décodeur ajouté : trop lourd.

## Organisation
    index.html     recherche + pages d'outils + « Autres outils »
    about.html     projets et liens (l'ancienne page d'accueil)
    notes.html     le carnet complet
    tests.html     tests automatiques (ouvre-le via le serveur : tout doit être ✓)
    sw.js, manifest.json, icon.svg, icons/ (PNG 192/512 normales + maskable, sources SVG)
    css/   base.css (couleurs, texte) · home.css (barre du haut, cartes, pied de page) · tools.css (pages d'outils)
           app.css (recherche, panneau de notes, dépôt) · notes.css (carnet) · ascii.css (style ASCII)
           ui.css (partagé : bouton Installer, menus Envoyer vers / clic droit, aide des raccourcis)
    js/
      core.js       petites fonctions communes ($, esc, getLS/setLS, envoi vers le carnet…)
      app.js        l'accueil : recherche, favoris/récents, collage malin, glisser-déposer, routage #/outil
      detect.js     le collage malin : devine ce qui a été collé (testé dans tests.html)
      panel.js      le panneau de notes Ctrl+J
      keys.js       raccourcis clavier + aide « ? »
      ctxmenu.js    menu clic droit (texte, images, fichiers, notes) + petites boîtes de dialogue
      backup.js     sauvegarde complète : export, vérification, import
      math.js       formules $…$ / $$…$$ (charge KaTeX à la demande)
      pwa.js        bouton Installer
      about.js      la page à propos (projets, liens) · data.js : projets + liens
      rain.js       la pluie (en option) · notes.js : le carnet
      notes-graph.js  le graphe (groupes, formes, zoom, focus) · notes-page.js : branchements + barre mobile
      vault.js      le coffre chiffré (AES-GCM, PBKDF2, HKDF, enveloppes par appareil) · cloud.js : synchro Gist + assistant
      tools/base.js        le moteur : NOXE.register(), page d'outil, dépôt de fichiers, mémoire des champs, favoris
      tools/image.js       optimiser, convertir, images → PDF
      tools/editeur.js     éditeur d'image
      tools/pdf.js         fusionner / découper des PDF
      tools/ocr.js         texte d'une image (Tesseract.js, chargé à l'ouverture de l'outil)
      tools/dev.js         JSON, regex (dans un Worker), hash, mots de passe, couleurs
      tools/encodage.js    Base64, URL, JWT, UUID, QR code
      tools/carnet.js      note rapide
      tools/sauvegarde.js  page « Sauvegarde complète »
      tools/reseau.js      calculateur IPv4/VLSM, bases & codes, débit & stockage
      tools/electronique.js loi d'Ohm/diviseur/LED, code couleurs des résistances
      tools/texte.js       outils de texte, comparateur, dates
      tools/memo.js        aide-mémoire hors ligne — ajouter une ligne = un tableau [description, valeur]
      vendor/       bibliothèques copiées ici pour marcher hors ligne, chargées seulement quand on ouvre l'outil :
                    pdf-lib.min.js (PDF, licence MIT) · qrcode.js (QR code, licence MIT)
                    katex/ (formules, KaTeX 0.16, licence MIT, polices woff2 seulement)
                    tesseract/ (OCR, Tesseract.js 7 + modèles fra/eng, Apache-2.0 — voir LISEZMOI.txt)

## Ajouter un outil
Dans le fichier de sa catégorie (ou un nouveau fichier ajouté dans index.html et sw.js) :

    NOXE.register({ key:'monoutil', cat:'dev', title:'Mon outil', desc:'Ce qu\'il fait.',
                    words:'mots pour la recherche', input:'id_du_champ_principal',
                    run(panel){ panel.innerHTML = '...'; } });

La carte apparaît toute seule (accueil, recherche), et la page existe à `#/monoutil`.
Catégories : liste `NOXE.cats` dans tools/base.js ; celles de `NOXE.main` sont sur l'accueil, les autres dans « Autres outils ».
Options : `image:true` / `multi:true` (outil à fichiers), `accept` et `hint` (types acceptés), `mem:false` (ne rien mémoriser, ni dans la sauvegarde).
Pour le chaînage et Ctrl+Entrée / Ctrl+Maj+C : `data-main` sur le bouton principal, `data-result` sur l'élément résultat, ou `NOXE.setResult({text})` / `NOXE.fileItems({...})` pour un résultat fichier (voir le commentaire en tête de tools/base.js).

## À savoir
- Après toute modif de fichier : augmenter `averse-vN` dans sw.js (actuellement `averse-v13`), sinon le cache garde l'ancienne version. Un nouveau fichier doit aussi être ajouté dans la liste `ASSETS`.
- Les notes sont dans le localStorage (clé `noxe-notes`) : bouton Sauvegarde (tout) ou Export (notes seules) pour sauvegarder. Une note supprimée laisse une « pierre tombale » (gardée 90 jours) pour qu'un autre onglet ouvert ne la fasse pas revenir.
- Autres clés : `averse-fav` (favoris), `averse-recent` (récents), `averse-in` (valeurs des champs), `averse-rain` (pluie), `averse-style` (style). `averse-ocr-lang` (langue de l'OCR), `noxe-sync` (état de la dernière synchro par fichier), `averse-graph` (réglages du graphe), `averse-cloud` (synchro chiffrée : jeton, n° du Gist, appareil — jamais exporté), `averse-bar-hint`. IndexedDB `averse` : fichier lié et clé de synchro non exportable. Cache `averse-share` : contenu partagé en attente (vidé dès qu'il est lu). Cache `averse-ocr-1` : fichiers de l'OCR.
- Changer de nom : rechercher/remplacer « AVERSE » (index.html, about.html, notes.html, manifest.json, sw.js, data.js).
- Projets et liens : js/data.js (url vide = « bientôt »).

## Mettre en ligne sur GitHub Pages
Tous les chemins sont relatifs (manifeste, service worker, partage, « Ouvrir avec ») : le site marche tel quel dans un sous-dossier comme `https://ton-pseudo.github.io/averse/`.
1. Crée un dépôt sur GitHub, par exemple `averse` (public, ou privé avec un compte qui permet Pages).
2. Mets-y **le contenu** de ce dossier, avec `index.html` à la racine du dépôt. Garde le fichier `.nojekyll` : il évite que GitHub retraite le site avec Jekyll.
   En ligne de commande, depuis ce dossier :

       git init && git add . && git commit -m "AVERSE v5"
       git branch -M main
       git remote add origin https://github.com/ton-pseudo/averse.git
       git push -u origin main

   Sans ligne de commande : sur la page du dépôt, « Add file » → « Upload files », puis glisse le contenu du dossier.
   ⚠ L'explorateur de fichiers masque `.nojekyll` (fichier qui commence par un point), et il manque aujourd'hui dans ton dépôt. Ce n'est pas grave (le site marche sans), mais pour l'ajouter : « Add file » → « Create new file », nom `.nojekyll`, contenu vide, « Commit ».
3. Sur GitHub : **Settings → Pages → Build and deployment → Source : « Deploy from a branch »**, branche `main`, dossier `/ (root)`, puis **Save**.
4. Attends une à deux minutes, puis ouvre `https://ton-pseudo.github.io/averse/`. Le lien est aussi affiché dans Settings → Pages.
5. Chaque mise à jour : augmente `averse-vN` dans `sw.js`, puis commit et push. Les visiteurs reçoivent la nouvelle version au chargement suivant.

À savoir :
- GitHub Pages est en HTTPS, donc le service worker, l'installation et le partage marchent.
- L'origine `ton-pseudo.github.io` est partagée par tous tes projets Pages. AVERSE ne supprime que ses propres caches (`averse-…`), mais le localStorage (tes notes) est commun à ces projets. Pour une séparation totale, utilise un domaine perso.
- Le dossier pèse ~17 Mo, dont 15,6 Mo pour l'OCR. C'est bien sous les limites de GitHub (1 Go par site, 100 Mo par fichier). Le plus gros fichier fait 3,9 Mo.

## Tests
- `tests.html` (via le serveur, ou en ligne sur ton site) : **124 tests**. Vert = réussi, rouge = vrai problème, gris = « ignoré : non disponible sur ce navigateur » (API absente, jamais pour cacher un résultat faux). `tests.html?only=Graphe` ne lance que les tests dont le nom contient ce mot.
  - v5 : graphe (groupes par tag, formes et couleurs, légende, filtre, étiquettes, zoom molette et pincement, focus, groupe par clic droit, réglages gardés) en pas à pas déterministe ; coffre chiffré (mauvais mot de passe, passkey manquante, code de secours, appairage) ; synchro Gist avec un faux GitHub (2 appareils, conflit, ETag/304, écriture concurrente, appareil retiré).
  - v4 : synchro par fichier, OCR, regex en Worker, jours ouvrés, fuites d'URL. Avant : chaînage, sauvegarde, KaTeX, raccourcis, menus clic droit, impression, « Ouvrir avec » et partage simulés.
  - Les tests ne touchent pas à tes notes : copie avant, remise en place après, base et clés à part, aucun accès réseau (faux GitHub).
- Vérifié pour la v5 : Chrome ordinateur, Chrome mobile émulé avec un processeur 6× plus lent, Firefox et WebKit (moteur de Safari) en iPhone émulé : 124/124 partout. La synchro a aussi été testée de bout en bout avec 2 à 3 navigateurs, un faux serveur GitHub et des passkeys virtuelles (avec et sans PRF).
- **Non testable automatiquement** : le vrai GitHub avec ton jeton (la configuration réseau d'api.github.com a été vérifiée : en-têtes et ETag autorisés), les vraies passkeys (Windows Hello, Android, iPhone), un vrai téléphone, le vrai « Ouvrir avec » Windows et la vraie feuille de partage. À essayer une fois à la main.
