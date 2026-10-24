/* tools/memo.js — MÉMO : fiches de référence consultables hors ligne (ports, commandes, formules…).
   Pour ajouter une ligne : un tableau [description, valeur-à-copier] dans la bonne section. */
(function(){
const {register}=NOXE;

/* tableau CIDR calculé, pas écrit à la main */
const cidr=[];
for(let p=8;p<=32;p++){
  const m=p===0?0:(0xFFFFFFFF<<(32-p))>>>0;
  const mask=[m>>>24,(m>>>16)&255,(m>>>8)&255,m&255].join('.');
  const hosts=p===32?1:p===31?2:Math.pow(2,32-p)-2;
  cidr.push(['/'+p+'  ·  '+hosts.toLocaleString('fr-FR')+' hôte'+(hosts>1?'s':''),mask]);
}
const pow2=[];for(let i=0;i<=16;i++)pow2.push(['2^'+i,String(Math.pow(2,i))]);

const SECTIONS=[
['ports','Ports',[
 ['FTP (données / contrôle)','20 / 21'],['SSH','22'],['Telnet (non chiffré)','23'],['SMTP (envoi de mail)','25'],
 ['DNS','53'],['DHCP (serveur / client)','67 / 68'],['TFTP','69'],['HTTP','80'],['POP3','110'],['NTP','123'],
 ['NetBIOS','137-139'],['IMAP','143'],['SNMP (requêtes / traps)','161 / 162'],['LDAP','389'],['HTTPS','443'],
 ['SMB / partage Windows','445'],['SMTP submission','587'],['Syslog (UDP)','514'],['LDAPS','636'],['IMAPS','993'],['POP3S','995'],
 ['SQL Server','1433'],['MySQL / MariaDB','3306'],['RDP (bureau à distance)','3389'],['PostgreSQL','5432'],['VNC','5900'],['HTTP alternatif','8080']]],
['linux','Linux',[
 ['Lister (détails, cachés)','ls -la'],['Où suis-je ?','pwd'],['Copier un dossier','cp -r source/ dest/'],['Déplacer / renommer','mv ancien nouveau'],
 ['Créer des dossiers imbriqués','mkdir -p a/b/c'],['Supprimer un dossier (définitif)','rm -r dossier/'],['Droits rwx','chmod 755 fichier'],['Changer le propriétaire','chown user:groupe fichier'],
 ['Chercher un texte dans les fichiers','grep -rn "mot" .'],['Chercher un fichier','find / -name "fichier*" 2>/dev/null'],['Suivre un fichier en direct','tail -f /var/log/syslog'],
 ['Adresses IP','ip a'],['Table de routage','ip r'],['Ports en écoute','ss -tulpn'],['Ping 4 fois','ping -c 4 8.8.8.8'],['Résolution DNS','dig exemple.fr'],
 ['État d\'un service','systemctl status ssh'],['Démarrer au boot + maintenant','systemctl enable --now ssh'],['Journal d\'un service','journalctl -u ssh -f'],
 ['Processus','ps aux'],['Espace disque','df -h'],['Taille des dossiers','du -sh *'],['Archive tar.gz (créer)','tar -czvf archive.tar.gz dossier/'],['Archive tar.gz (extraire)','tar -xzvf archive.tar.gz'],
 ['Connexion SSH','ssh user@192.168.1.10'],['Copier via SSH','scp fichier user@192.168.1.10:/tmp/'],['Mettre à jour (Debian/Ubuntu)','sudo apt update && sudo apt upgrade'],
 ['Pare-feu : autoriser SSH','sudo ufw allow 22/tcp']]],
['cisco','Cisco IOS',[
 ['Mode privilégié','enable'],['Mode configuration','configure terminal'],['Nom de l\'équipement','hostname R1'],['Entrer dans une interface','interface g0/0'],
 ['Adresse IP','ip address 192.168.1.1 255.255.255.0'],['Activer l\'interface','no shutdown'],['Description','description LAN vers SW1'],
 ['Résumé des interfaces','show ip interface brief'],['Config en cours','show running-config'],['Sauvegarder la config','copy running-config startup-config'],
 ['Créer un VLAN','vlan 10\n name COMPTA'],['Port en accès dans un VLAN','switchport mode access\nswitchport access vlan 10'],['Port trunk','switchport mode trunk'],
 ['Voir les VLAN','show vlan brief'],['Route statique','ip route 192.168.2.0 255.255.255.0 10.0.0.2'],['Route par défaut','ip route 0.0.0.0 0.0.0.0 10.0.0.2'],
 ['Table de routage','show ip route'],['Mot de passe du mode enable','enable secret MonMotDePasse'],['Chiffrer les mots de passe','service password-encryption'],
 ['Accès distant SSH/telnet','line vty 0 4\n login local\n transport input ssh'],['Voisins CDP','show cdp neighbors'],['Pool DHCP','ip dhcp pool LAN\n network 192.168.1.0 255.255.255.0\n default-router 192.168.1.1']]],
['windows','Windows',[
 ['Configuration IP complète','ipconfig /all'],['Libérer / renouveler le bail DHCP','ipconfig /release && ipconfig /renew'],['Vider le cache DNS','ipconfig /flushdns'],
 ['Chemin vers une machine','tracert 8.8.8.8'],['Requête DNS','nslookup exemple.fr'],['Connexions et PID','netstat -ano'],['Table ARP','arp -a'],['Table de routage','route print'],
 ['Forcer les stratégies de groupe','gpupdate /force'],['Réparer les fichiers système','sfc /scannow'],['Processus','tasklist'],['Tuer un processus','taskkill /PID 1234 /F'],['Nom de la machine','hostname']]],
['reseau','Réseau',[
 ['OSI 7','Application'],['OSI 6','Présentation'],['OSI 5','Session'],['OSI 4','Transport (TCP, UDP)'],['OSI 3','Réseau (IP, routeur)'],['OSI 2','Liaison (Ethernet, MAC, switch)'],['OSI 1','Physique (câbles, signaux)'],
 ['Privé classe A','10.0.0.0/8'],['Privé classe B','172.16.0.0/12'],['Privé classe C','192.168.0.0/16'],['Loopback','127.0.0.0/8'],['APIPA (pas de DHCP)','169.254.0.0/16'],['Multicast','224.0.0.0/4'],
 ...cidr]],
['elec','Électronique',[
 ['Loi d\'Ohm','U = R × I'],['Puissance','P = U × I = R × I² = U² / R'],['Résistances en série','Req = R1 + R2 + …'],['Résistances en parallèle','1/Req = 1/R1 + 1/R2 + …'],
 ['Deux résistances en parallèle','Req = R1×R2 / (R1+R2)'],['Diviseur de tension','Us = Ue × R2 / (R1+R2)'],['Résistance de LED','R = (Ualim − Uled) / I'],
 ['Condensateur : constante de temps','τ = R × C  (≈ 63 % de charge à τ, 99 % à 5τ)'],['Fréquence et période','f = 1 / T'],['Loi des nœuds','Σ I entrants = Σ I sortants'],['Loi des mailles','Σ U = 0 sur une maille'],
 ['Préfixes','p 10⁻¹² · n 10⁻⁹ · µ 10⁻⁶ · m 10⁻³ · k 10³ · M 10⁶ · G 10⁹']]],
['bin','Binaire',[...pow2,['Hex → décimal','0xFF = 255'],['Octet','8 bits = 2 chiffres hexa'],['Ko / Kio','1 Ko = 1000 o · 1 Kio = 1024 o']]]
];

/* v6 : exposé pour la recherche globale de l'accueil (search.js) */
NOXE.memo=SECTIONS;
const mnorm=s=>String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

register({
  key:'memo',cat:'memo',title:'Aide-mémoire',
  words:'ports commandes linux cisco windows osi cidr masque formules ohm binaire puissances aide fiche mémo vlan ssh ping chmod ipconfig tcp udp',
  desc:'Ports courants, commandes Linux / Cisco / Windows, plages privées, table des masques, formules. Un clic copie.',
  run(p){
    p.innerHTML='<div class="field"><input type="text" id="mq" placeholder="Chercher dans toutes les fiches (ex. ssh, vlan, 443, ohm)…" autocomplete="off"></div><div id="mbody"></div>';
    const body=$('mbody');
    const rows=l=>'<div class="out">'+l.map(r=>
      '<div class="line" data-copy="'+esc(r[1])+'"><span>'+esc(r[0])+'</span><span style="white-space:pre-wrap;text-align:right">'+esc(r[1])+'</span></div>').join('')+'</div>';
    let cur=SECTIONS[0][0];
    function show(){
      const q=mnorm($('mq').value.trim());   // v6 : sans accents (« hote » trouve « hôte »)
      if(!q){
        body.innerHTML='<div class="segmented tabs" id="mtabs">'+SECTIONS.map(s=>'<button data-v="'+s[0]+'"'+(s[0]===cur?' class="active"':'')+'>'+s[1]+'</button>').join('')+'</div><div class="tab-body">'+rows(SECTIONS.find(s=>s[0]===cur)[2])+'</div>';
        body.querySelectorAll('#mtabs button').forEach(b=>b.onclick=()=>{cur=b.dataset.v;show();});
        return;
      }
      let html='';
      SECTIONS.forEach(s=>{
        const l=s[2].filter(r=>mnorm(r[0]+' '+r[1]).includes(q));
        if(l.length){html+='<div class="lbl" style="margin-top:16px">'+esc(s[1])+'</div>'+rows(l);}
      });
      body.innerHTML=html||'<div class="info">Rien ne correspond à « '+esc($('mq').value.trim())+' ».</div>';
    }
    $('mq').oninput=show;show();
    $('mq').focus();
  }
});
})();
