/* data.js — LE fichier à modifier pour changer le contenu du site (nom, projets, liens). */

const SITE={

  /* Tes projets. url: '' = carte sans lien (affiche « bientôt »). */
  projects:[
    {tag:'Web',            title:'Averse',                desc:'Ce site : une boîte à outils et un carnet, sans serveur.',            url:''},
    {tag:'Jeu vidéo',      title:'Unreal Engine 5',       desc:'Apprentissage et expérimentations sur Unreal Engine 5.',               url:''},
    {tag:'Électronique',   title:'Systèmes embarqués',    desc:'Projets avec ESP32 et Raspberry Pi Pico.',                             url:''},
    {tag:'Automatisation', title:'Chaîne YouTube auto',   desc:'Pipeline Node.js pour automatiser une chaîne YouTube.',                url:''}
  ],

  /* Liens du pied de page : pour l'instant les comptes OFFICIELS de chaque plateforme.
     Remplace par tes propres profils quand tu veux. */
  links:[
    {label:'instagram', url:'https://www.instagram.com/instagram/'},
    {label:'github',    url:'https://github.com/github'},
    {label:'youtube',   url:'https://www.youtube.com/@YouTube'},
    {label:'tiktok',    url:'https://www.tiktok.com/@tiktok'},
    {label:'x',         url:'https://x.com/X'},
    {label:'linkedin',  url:'https://www.linkedin.com/company/linkedin/'},
    {label:'discord',   url:'https://discord.com/'},
    {label:'twitch',    url:'https://www.twitch.tv/twitch'},
    {label:'reddit',    url:'https://www.reddit.com/user/reddit/'}
  ],

  /* v6 — « Signaler / Suggérer » (js/feedback.js) :
     feedbackRepo  : le dépôt GitHub où s'ouvre le ticket (formulaire prérempli, rien n'est envoyé sans toi)
     feedbackEmail : adresse de secours (bouton « Par e-mail ») ; vide = bouton caché */
  feedbackRepo:'GabRealX/averse',
  feedbackEmail:''
};
