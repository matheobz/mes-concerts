# Mes concerts (pour Delphine)

Petite application web pour une seule personne : Delphine saisit ses artistes préférés, l'appli liste leurs concerts en France et lui envoie un mail dès qu'une nouvelle date est annoncée. Elle peut « suivre » un concert pour recevoir un rappel quelques jours avant.

- Interface : Vite + React + TypeScript, en PWA (installable sur téléphone), en français, pensée mobile d'abord.
- Serveur : un Worker Cloudflare qui sert l'interface, l'API (`/api/...`) et une vérification quotidienne (Cron Trigger).
- Stockage : Cloudflare KV (une seule clé `donnees` : artistes, concerts trouvés, mails déjà envoyés, concerts suivis).
- Sources : API Ticketmaster Discovery (`countryCode=FR`), et Bandsintown en option.
- Mails : Resend.
- Accès : un code unique (secret `ACCESS_CODE`), demandé à la première ouverture puis mémorisé sur l'appareil.

Tout tient sur les offres gratuites de Cloudflare, Ticketmaster et Resend.

> Choix technique : plutôt qu'un projet Cloudflare Pages + un Worker séparé, l'interface est servie par le Worker lui-même (« Workers Static Assets », l'équivalent intégré de Pages). Une seule commande de déploiement, une seule adresse, pas de CORS.

## Ce que fait l'appli

1. **Mes artistes** : on tape un nom, l'appli propose les artistes connus de Ticketmaster (avec photo). On en touche un pour l'ajouter ; ses concerts déjà annoncés s'affichent tout de suite (sans mail).
2. **Concerts** : liste par mois, avec date, ville, salle, heure, bouton « Billets ». Badge « Nouveau » pendant 7 jours. Filtre « Mes concerts suivis ».
3. **Chaque matin** (6h UTC, soit 8h l'été et 7h l'hiver à Paris) : le Worker interroge Ticketmaster pour chaque artiste, repère les dates jamais vues et envoie **un seul mail** récapitulatif. Il envoie aussi un **rappel** pour chaque concert suivi qui a lieu dans 3 jours ou moins (réglable).
4. **Réglages** : « Vérifier maintenant », « Envoyer un mail de test », date et bilan de la dernière vérification.

Si un mail échoue (clé absente, Resend en panne), les dates restent « à annoncer » et repartent le lendemain. Les concerts passés sont effacés automatiquement.

## Structure

```
src/            interface React (Concerts, Mes artistes, Réglages, écran de code)
worker/         Worker Cloudflare
  index.ts      API, contrôle du code d'accès, vérification quotidienne
  sources.ts    appels Ticketmaster, Bandsintown, Resend
  logique.ts    logique pure : lecture des API, détection des nouvelles dates, rappels, mails
shared/types.ts types communs à l'interface et au Worker
tests/          tests Vitest de la logique
public/         manifest PWA, service worker, icônes (générées par npm run icones)
wrangler.toml   configuration Cloudflare (KV, cron, variables)
```

## Commandes

| Commande | Effet |
| --- | --- |
| `npm install` | installe les dépendances |
| `npm run dev` | lance l'appli en local : interface sur http://localhost:5173, API sur le port 8787 (nécessite `.dev.vars`) |
| `npm run build` | vérifie les types et construit l'interface dans `dist/` |
| `npm test` | lance les tests |
| `npm run check` | build + tests + déploiement à blanc (valide la config Cloudflare) |
| `npm run deploy` | build puis mise en ligne |
| `npm run logs` | affiche en direct les journaux du Worker en ligne |

En local, `npm run dev` lance Wrangler avec `--test-scheduled` : ouvrir http://localhost:8787/__scheduled déclenche la vérification quotidienne à la main.

## Mise en ligne pas à pas

Compter 20 à 30 minutes. Il faut Node.js 20 ou plus.

### 1. Compte Cloudflare

1. Créer un compte gratuit sur https://dash.cloudflare.com/sign-up.
2. Dans le dossier du projet :
   ```
   npm install
   npx wrangler login
   ```
   Une page s'ouvre dans le navigateur : autoriser Wrangler.

### 2. Clé Ticketmaster

1. Créer un compte sur https://developer.ticketmaster.com (bouton « Get Your API Key »).
2. Dans « My Apps », une application par défaut existe déjà : copier sa **Consumer Key**. C'est `TICKETMASTER_KEY`.
3. Offre gratuite : 5 000 appels par jour, 5 par seconde, largement suffisant.

### 3. Clé Resend et expéditeur

1. Créer un compte sur https://resend.com.
2. « API Keys » > « Create API Key » (droit « Sending access » suffit) : copier la clé `re_...`. C'est `RESEND_KEY`.
3. L'expéditeur, deux possibilités :
   - **Le plus simple** : garder `onboarding@resend.dev` (valeur par défaut de `MAIL_EXPEDITEUR` dans `wrangler.toml`). Limite : Resend n'envoie alors qu'à l'adresse du compte Resend. Il faut donc **créer le compte Resend avec l'adresse de Delphine** (celle de `MAIL_DESTINATAIRE`).
   - **Avec un nom de domaine** (ex. un domaine de Mathéo) : « Domains » > « Add Domain », ajouter les enregistrements DNS demandés, attendre la validation, puis mettre dans `wrangler.toml` : `MAIL_EXPEDITEUR = "Mes concerts <concerts@mondomaine.fr>"`. On peut alors écrire à n'importe quelle adresse.

### 4. Stockage KV

```
npx wrangler kv namespace create DONNEES
```

La commande affiche un `id`. Le copier dans `wrangler.toml` à la place de `A_REMPLACER_PAR_L_ID_DU_NAMESPACE`.

### 5. Premier déploiement

```
npm run deploy
```

À la première fois, Wrangler demande de choisir un sous-domaine `workers.dev`. L'appli est ensuite en ligne à une adresse du type `https://concerts-delphine.<sous-domaine>.workers.dev`.

### 6. Secrets

Chaque commande demande la valeur (rien n'est écrit dans le code) :

```
npx wrangler secret put TICKETMASTER_KEY
npx wrangler secret put RESEND_KEY
npx wrangler secret put MAIL_DESTINATAIRE
npx wrangler secret put ACCESS_CODE
```

- `MAIL_DESTINATAIRE` : l'adresse de Delphine (plusieurs possibles, séparées par des virgules).
- `ACCESS_CODE` : un code long et difficile à deviner, par exemple 4 mots au hasard (`violon-tulipe-orage-cerise`).
- Optionnel : `npx wrangler secret put BANDSINTOWN_APP_ID` si on obtient un identifiant Bandsintown (sur demande auprès de Bandsintown). Sans lui, seule Ticketmaster est utilisée.

Les secrets sont pris en compte immédiatement, sans redéployer.

### 7. Lien dans les mails (conseillé)

Dans `wrangler.toml`, mettre l'adresse de l'appli dans `APP_URL` (ex. `APP_URL = "https://concerts-delphine.<sous-domaine>.workers.dev"`), puis `npm run deploy` à nouveau. Les mails contiendront alors un lien « Ouvrir mes concerts ».

### 8. Remettre l'appli à Delphine

1. Lui envoyer le lien avec le code : `https://concerts-delphine.<sous-domaine>.workers.dev/?code=LE_CODE`. Le code est mémorisé sur son téléphone puis retiré de l'adresse.
2. L'installer sur l'écran d'accueil :
   - Android (Chrome) : menu ⋮ > « Ajouter à l'écran d'accueil » / « Installer l'application ».
   - iPhone (Safari) : bouton Partager > « Sur l'écran d'accueil ». Sur iPhone, l'appli installée redemande le code une fois.
3. Dans Réglages, toucher « Envoyer un mail de test » pour vérifier la réception (et regarder dans les indésirables la première fois ; marquer l'expéditeur comme sûr).

## Réglages (wrangler.toml, section [vars])

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `MAIL_EXPEDITEUR` | `Mes concerts <onboarding@resend.dev>` | expéditeur des mails |
| `PAYS` | `FR` | pays surveillés, ex. `FR,BE,CH` |
| `RAPPEL_JOURS` | `3` | rappel X jours avant un concert suivi |
| `APP_URL` | vide | lien ajouté dans les mails |

L'heure de vérification se change dans `[triggers]` (`crons`, en heure UTC). Après toute modification : `npm run deploy`.

## Limites connues

- Offre gratuite Cloudflare : 50 requêtes sortantes par exécution. L'appli vérifie donc au plus 40 artistes par jour (20 avec Bandsintown, moins si plusieurs pays) ; au-delà, elle tourne : les artistes les moins récemment vérifiés passent en premier.
- Ticketmaster ne couvre pas toutes les billetteries françaises (Fnac, petites salles). Bandsintown complète si on a un identifiant.
- Un artiste ajouté « tel quel » (sans le choisir dans les propositions) est cherché par nom : risque de résultats approximatifs pour un nom très court ou courant. Mieux vaut toujours choisir dans la liste proposée.
- Les données vivent dans KV : pour les voir ou les sauvegarder, `npx wrangler kv key get donnees --binding DONNEES --remote`.
