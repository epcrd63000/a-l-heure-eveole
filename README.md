# À l'heure — Évéole Douai

Application web mobile-first installable (PWA) qui recherche les arrêts et horaires théoriques du réseau Évéole depuis le GTFS officiel, calcule l'heure conseillée pour partir, et conserve les favoris sur l'appareil.

## Source gratuite

Le projet utilise le jeu de données public **[EVEOLE DOUAI — GTFS du SMTD](https://www.data.gouv.fr/datasets/eveole-douai-reseau-bus-du-syndicat-mixte-des-transports-du-douaisis-smtd)**, publié sur data.gouv.fr sous licence ODbL. Il n'y a ni abonnement, ni compte, ni clé API à créer.

L'application récupère automatiquement la dernière archive GTFS publiée par l'opérateur et lit les arrêts, lignes, calendriers et heures de passage. L'archive inspectée est d'environ 1,7 Mo compressée. La ligne peut être choisie avant ou après la localisation ; dans ce cas, seuls les arrêts desservis par cette ligne sont proposés et l'arrêt retenu est celui dont l'itinéraire piéton est le plus court.

**Important : cette source est un horaire théorique, pas un flux temps réel.** Elle ne signale pas les retards, annulations ou positions des bus. Le GTFS est valable sur la période indiquée par le réseau et peut ne pas encore refléter un changement récent. L'application ne présente pas ces horaires comme du temps réel. Une vraie donnée temps réel nécessite qu'Évéole publie un flux GTFS-RT accessible ; aucun flux GTFS-RT public n'a été identifié pour cette source.

L'itinéraire piéton utilise le profil à pied d'OSRM fourni par [routing.openstreetmap.de](https://routing.openstreetmap.de/), gratuit sous réserve de ses limites d'utilisation. Pour classer les arrêts, l'application calcule une matrice piétonne de tous les arrêts de la ligne situés à moins de 1 km à vol d'oiseau. Si le routage est indisponible, elle retombe sur cette distance directe, affichée explicitement comme approximation. L'estimation du temps de marche utilise ensuite la route piétonne OSRM ou, en repli, 4,5 km/h à vol d'oiseau.

Les navigateurs exigent HTTPS (ou `localhost`) pour demander la géolocalisation. Si elle est refusée, sélectionnez la ligne et recherchez un arrêt par son nom ; le temps de marche peut être saisi manuellement dans les réglages.

## Tester en local

La géolocalisation et l'installation PWA demandent `localhost` ou HTTPS ; ouvrir `index.html` directement via `file://` ne suffit pas.

**Avec VS Code Live Server**

1. Ouvrez le dossier dans VS Code et installez l'extension Live Server.
2. Faites un clic droit sur `index.html`, puis **Open with Live Server**.
3. Autorisez éventuellement la géolocalisation ; aucune configuration de clé n'est nécessaire.

**Avec Python**

Depuis le dossier du projet :

```powershell
python -m http.server 8000
```

Puis ouvrez `http://localhost:8000/`. Il faut une connexion internet pour télécharger la dernière archive GTFS et interroger OSRM. Les fichiers d'interface peuvent ensuite rester disponibles grâce au cache du service worker ; les horaires ne sont pas conservés ni présentés comme actuels hors ligne.

## Déployer gratuitement

La source des horaires ne demande aucun secret et fonctionne avec un hébergement statique en HTTPS.

**GitHub Pages**

1. Poussez les fichiers du projet à la racine d'un dépôt GitHub.
2. Dans **Settings → Pages**, choisissez **Deploy from a branch**, la branche `main` et `/ (root)`.
3. Ouvrez l'adresse HTTPS publiée.

**Netlify**

1. Importez le dépôt dans Netlify ou déposez le dossier du projet.
2. Laissez la commande de build vide et publiez le dossier racine.
3. Ouvrez l'adresse HTTPS Netlify.

**Vercel**

1. Importez le dépôt dans Vercel ou lancez `vercel` depuis le dossier.
2. Choisissez un site statique, sans commande de build, avec `.` comme dossier de sortie si demandé.
3. Ouvrez l'adresse HTTPS publiée.

## Fichiers

- `index.html`, `styles.css` : interface responsive et accessible.
- `app.js` : recherche, géolocalisation, compte à rebours, filtres, favoris et réglages.
- `api.js` : téléchargement et lecture de l'archive GTFS, calculs d'horaires, routage piéton OSRM et repli à vol d'oiseau.
- `storage.js` : marge, temps de marche manuel et favoris en localStorage.
- `manifest.webmanifest`, `sw.js`, `icon.svg` : installation et cache de l'application shell.

Les horaires chargés sont calculés selon `calendar.txt`, `calendar_dates.txt` et `stop_times.txt` du GTFS, y compris les exceptions de calendrier et les heures GTFS après minuit. Tailwind et les bibliothèques de polices/icônes externes ne sont pas nécessaires : les styles et icônes de l'interface sont locaux.
