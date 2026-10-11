# Mes concerts (appli Android pour Delphine)

Petite appli Android pour une seule personne : Delphine saisit ses artistes préférés, l'appli liste leurs concerts en France et lui envoie une **notification** dès qu'une nouvelle date est annoncée. Elle peut « suivre » un concert pour avoir un **rappel 3 jours avant**.

Aucun serveur : tout est sur le téléphone (un OnePlus sous OxygenOS). L'appli s'installe à partir d'un fichier APK téléchargé par un lien public (GitHub Releases).

> La première version (PWA + Worker Cloudflare, KV, mails Resend) reste dans l'historique git (premier commit).

## Ce que fait l'appli

1. **Mes artistes** : on tape un nom, l'appli propose les artistes connus de Ticketmaster (avec photo). On en touche un pour l'ajouter ; ses concerts déjà annoncés s'affichent tout de suite (sans notification).
2. **Concerts** : liste par mois, avec date, ville, salle, heure, bouton « Billets ». Badge « Nouveau » pendant 7 jours. Filtre « Mes concerts suivis ».
3. **Chaque jour, en arrière-plan** : l'appli interroge Ticketmaster, repère les dates jamais vues et envoie une notification (une par concert, ou une seule récapitulative au-delà de 3). Elle envoie aussi un rappel pour chaque concert suivi qui a lieu dans 3 jours ou moins.
4. **À chaque ouverture** (secours si Android a bloqué la tâche de fond) : même vérification si la dernière a plus de 6 heures, et rappels.
5. **Réglages** : état des notifications et de la batterie (avec explications OnePlus), « Vérifier maintenant », notification d'essai, sauvegarde et rechargement (fichier JSON), et un encart « Dépannage » (version, clé présente, test de la tâche de fond, heure de son dernier passage).

## Comment c'est fait

| Besoin | Solution |
| --- | --- |
| Interface | Vite + React + TypeScript, emballé avec **Capacitor 8** (Android) |
| Stockage | `@capacitor/preferences` (SharedPreferences Android), une seule clé `donnees` |
| Concerts | API Ticketmaster Discovery appelée depuis le téléphone ; clé intégrée au build (`VITE_TICKETMASTER_KEY`) |
| Alertes | Notifications locales (`@capacitor/local-notifications`) ; permission POST_NOTIFICATIONS demandée au premier lancement (Android 13+) |
| Tâche de fond | `@capacitor/background-runner` (WorkManager) : toutes les 4 h environ ; Ticketmaster une fois par jour ; notifications seulement entre 8h et 21h |
| Batterie OnePlus | Plugin natif maison `BatteriePlugin.java` : détecte l'exemption, ouvre la fenêtre « Autoriser en arrière-plan » ou les réglages de l'appli |
| Sauvegarde | Export JSON via la feuille de partage Android (Drive, Gmail...), import par sélection de fichier |
| Build | GitHub Actions : APK signé publié dans GitHub Releases |

Points techniques utiles :

- **Stockage partagé** : la tâche de fond tourne dans un moteur JavaScript séparé, sans la WebView. Son stockage (`CapacitorKV`) est un fichier SharedPreferences qui porte le nom de la tâche (`fr.berrez.mesconcerts.verification`). L'appli configure Preferences avec ce même nom de groupe : les deux lisent et écrivent exactement les mêmes données.
- **Moteur minimal** : pas d'`Intl` ni d'`URL` dans la tâche de fond. Les dates (heure de Paris, changements d'heure, noms des jours et des mois) et les adresses sont donc calculées à la main dans `shared/logique.ts`. Un test exécute la tâche compilée dans un bac à sable sans `Intl` ni `URL`.
- **Pas d'écrasement** : les appels Ticketmaster se font sur une copie ; les données sont relues juste avant d'écrire, pour ne pas perdre un concert suivi pendant la vérification.
- **Pas de doublon d'alerte** : chaque concert garde `notifie` et `rappelEnvoye`. Si les notifications sont bloquées, rien n'est marqué : l'alerte repart plus tard.
- **La clé Ticketmaster est lisible dans l'APK** (c'est inévitable sans serveur). C'est une clé gratuite à quota (5 000 appels par jour) : risque faible. En cas d'abus, en créer une nouvelle et republier.

## Structure

```
src/              interface React (Concerts, Mes artistes, Réglages, bandeaux)
  actions.ts      actions de l'interface (stockage local + Ticketmaster)
  natif.ts        accès au téléphone : stockage, notifications, batterie, partage, tâche de fond
shared/           code commun à l'interface et à la tâche de fond
  logique.ts      logique pure : lecture Ticketmaster, nouvelles dates, rappels, textes, dates, sauvegarde
  verification.ts la vérification complète (réseau, fusion, notifications)
  ticketmaster.ts appels à l'API Ticketmaster (fetch seul)
  config.ts       réglages (pays, rappel, horaires, identifiants)
runner/           tâche de fond (compilée à part en dist/runners/verification.js)
android/          projet Android (Capacitor) : manifeste, signature, BatteriePlugin.java, icônes
docs/             page de téléchargement (GitHub Pages, optionnelle)
tests/            tests Vitest (logique, vérification, tâche de fond en bac à sable)
.github/workflows/apk.yml   build de l'APK signé et publication
```

## Commandes

| Commande | Effet |
| --- | --- |
| `npm install` | installe les dépendances |
| `npm run dev` | interface dans le navigateur (http://localhost:5173), pour travailler l'affichage |
| `npm run build` | vérifie les types, construit l'interface et la tâche de fond dans `dist/` |
| `npm test` | lance les tests |
| `npm run check` | build + tests + `cap sync android` |
| `npm run apk` | build + sync + APK release (nécessite le SDK Android, voir plus bas) |
| `npm run icones` | regénère toutes les icônes (web et Android) |

La clé Ticketmaster est lue au moment du build dans la variable d'environnement `VITE_TICKETMASTER_KEY`. Elle n'est jamais écrite dans le dépôt. En local (Git Bash) :

```
VITE_TICKETMASTER_KEY=ta_cle npm run dev
```

Sans clé, l'appli s'ouvre mais ne trouve aucun concert (Réglages > Dépannage indique « clé absente »).

## Mise en route pas à pas

Compter 30 à 45 minutes la première fois. Il faut un compte GitHub, Node.js 20 ou plus et un JDK (pour `keytool`, une seule fois). Pas besoin du SDK Android : GitHub Actions compile l'APK.

### 1. Clé Ticketmaster

1. Créer un compte gratuit sur https://developer.ticketmaster.com (bouton « Get Your API Key »).
2. Dans « My Apps », une application par défaut existe déjà : copier sa **Consumer Key**.
3. Offre gratuite : 5 000 appels par jour, 5 par seconde. L'appli en fait environ un par artiste et par jour.

### 2. Dépôt GitHub

Le dépôt doit être **public** : c'est ce qui rend le lien de téléchargement accessible à Delphine sans compte (la clé et le keystore restent dans les secrets, jamais dans le code).

```
gh repo create concerts-delphine --public --source . --push
```

Ou sur github.com : « New repository » (public, vide), puis `git remote add origin https://github.com/UTILISATEUR/concerts-delphine.git` et `git push -u origin HEAD:main`.

### 3. Keystore (clé de signature de l'appli)

Android n'accepte une mise à jour que si elle est signée avec **la même clé** que la première installation. Cette clé se crée une seule fois :

```
keytool -genkeypair -v -keystore mes-concerts.keystore -alias mesconcerts -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` est fourni avec le JDK. Il demande un mot de passe (le noter), puis nom, ville, etc. (on peut tout laisser vide et répondre « oui » à la fin). Avec le format actuel (PKCS12), le mot de passe de la clé est le même que celui du keystore.

Puis encoder le fichier pour GitHub (Git Bash) :

```
base64 -w0 mes-concerts.keystore > keystore.b64.txt
```

**Important** : ranger `mes-concerts.keystore` et son mot de passe en lieu sûr (gestionnaire de mots de passe, hors du dépôt ; le `.gitignore` exclut déjà les `*.keystore`). Si on les perd, plus de mise à jour possible : il faudrait désinstaller l'appli chez Delphine (après une sauvegarde) et réinstaller.

### 4. Secrets GitHub

Dans le dépôt : Settings > Secrets and variables > Actions > « New repository secret ». Cinq secrets :

| Nom | Valeur |
| --- | --- |
| `TICKETMASTER_KEY` | la Consumer Key Ticketmaster |
| `ANDROID_KEYSTORE_BASE64` | le contenu de `keystore.b64.txt` (une seule longue ligne) |
| `ANDROID_KEYSTORE_PASSWORD` | le mot de passe du keystore |
| `ANDROID_KEY_ALIAS` | `mesconcerts` |
| `ANDROID_KEY_PASSWORD` | le même mot de passe |

Avec la ligne de commande GitHub, chaque commande demande la valeur :

```
gh secret set TICKETMASTER_KEY
gh secret set ANDROID_KEYSTORE_BASE64 < keystore.b64.txt
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```

Ensuite, supprimer `keystore.b64.txt`.

### 5. Publier une version

```
git tag v2.0.0
git push origin v2.0.0
```

Le workflow « APK Android » (onglet Actions) lance les tests, construit l'appli avec la clé, compile et signe l'APK, puis crée la release. Compter 5 à 10 minutes. Le lien de téléchargement, toujours valable pour la dernière version :

```
https://github.com/UTILISATEUR/concerts-delphine/releases/latest/download/mes-concerts.apk
```

Pour une simple vérification sans release : Actions > APK Android > « Run workflow » (l'APK est alors dans les artefacts du run).

### 6. Page de téléchargement (optionnel)

Settings > Pages > Source « Deploy from a branch », branche `main`, dossier `/docs`. La page est en ligne quelques minutes plus tard sur `https://UTILISATEUR.github.io/concerts-delphine/`, avec un gros bouton « Télécharger » (il pointe tout seul vers la dernière release) et les étapes d'installation en français. C'est ce lien-là qu'il est le plus simple d'envoyer à Delphine.

### 7. Installation sur le OnePlus de Delphine

1. Sur son téléphone, ouvrir le lien (page de téléchargement ou lien direct de l'APK) dans Chrome.
2. Chrome peut prévenir que le fichier « peut être dangereux » : « Télécharger quand même ».
3. Ouvrir le fichier téléchargé (notification de Chrome, ou Fichiers > Téléchargements > `mes-concerts.apk`).
4. Android demande d'autoriser l'installation depuis Chrome (« sources inconnues ») : Paramètres > activer « Autoriser depuis cette source », puis retour.
5. « Installer ». Si **Google Play Protect** bloque (« Application inconnue », « Appli non vérifiée ») : « Plus de détails » > « Installer quand même ». S'il propose d'envoyer l'appli pour analyse, peu importe la réponse.
6. Ouvrir « Mes concerts » :
   - bandeau **Autorisez les notifications** > « Autoriser les notifications » > « Autoriser » ;
   - bandeau **Laissez l'appli travailler en arrière-plan** > « Autoriser » > « Autoriser » dans la fenêtre Android.
7. **Spécial OnePlus** (OxygenOS endort les applis très agressivement) : Paramètres > Applis > Mes concerts > Batterie (ou « Utilisation de la batterie ») > activer **Autoriser l'activité en arrière-plan** et, s'il existe, **Démarrage automatique**. L'écran Réglages de l'appli a un bouton « Ouvrir les réglages de l'appli » qui mène directement à cette page. En plus, on peut verrouiller l'appli dans les applis récentes (appui long sur sa vignette > « Verrouiller ») pour qu'elle ne soit jamais fermée de force.
8. Ajouter ses artistes, puis Réglages > « Envoyer une notification d'essai ».
9. Le lendemain, vérifier dans Réglages > Dépannage (ou « Dernière vérification ») que la vérification automatique est bien passée.

### Mettre à jour l'appli

Modifier le code, commiter, pousser, puis créer un nouveau tag (`v2.0.1`, `v2.1.0`...). Delphine retélécharge par le même lien et installe par-dessus : ses données sont conservées. Le numéro de version Android (`versionCode`) est le numéro du run GitHub Actions, il augmente tout seul.

### Changer de téléphone

Réglages > « Enregistrer une sauvegarde » : Android propose où envoyer le fichier `mes-concerts-AAAA-MM-JJ.json` (Google Drive, Gmail à soi-même...). Sur le nouveau téléphone : installer l'appli, puis Réglages > « Recharger une sauvegarde » et choisir le fichier. Les dates déjà connues ne redéclenchent pas de notification.

(La sauvegarde automatique Android vers le compte Google peut aussi restaurer les données, mais ce n'est pas garanti : mieux vaut la sauvegarde manuelle.)

## Compiler l'APK en local (optionnel)

Il faut Android Studio (ou le SDK Android en ligne de commande) et un **JDK 21** (Capacitor 8 et Gradle 8.14 ; un JDK plus récent peut échouer). Puis :

```
npm install
VITE_TICKETMASTER_KEY=ta_cle npm run sync
npx cap open android        # Android Studio : Build > Build APK(s), ou lancer sur un téléphone branché
```

APK de test (signé avec la clé de débogage) : `cd android && ./gradlew assembleDebug` (fichier dans `android/app/build/outputs/apk/debug/`). Pour un APK signé en local, définir avant `npm run apk` les mêmes variables que le workflow : `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## Dépannage

- **Pas de notification** : Réglages > Notifications doit indiquer « autorisées ». Sinon, « Autoriser les notifications » (si Android a déjà refusé, le bouton ouvre les réglages de l'appli).
- **La vérification automatique ne passe pas** : Réglages > Dépannage montre l'heure du dernier passage de la tâche de fond. S'il date de plus d'un jour, c'est l'économie de batterie (étape 7 ci-dessus). Le bouton « Tester la vérification automatique » lance la tâche de fond tout de suite pour vérifier qu'elle fonctionne.
- **« clé absente »** dans Dépannage : l'APK a été construit sans `TICKETMASTER_KEY` (secret manquant ou vide).
- **« Ticketmaster refuse la clé »** : clé révoquée ou mal copiée ; corriger le secret et republier.
- Journaux Android (téléphone branché, débogage USB) : `adb logcat | grep -i -E "runner|capacitor"`.

## Réglages (shared/config.ts et capacitor.config.ts)

| Réglage | Défaut | Rôle |
| --- | --- | --- |
| `PAYS` | `['FR']` | pays surveillés, ex. `['FR', 'BE', 'CH']` |
| `RAPPEL_JOURS` | `3` | rappel X jours avant un concert suivi |
| `HEURE_DEBUT`, `HEURE_FIN` | `8`, `21` | plage (heure de Paris) où la tâche de fond peut notifier |
| `VERIF_OUVERTURE_HEURES` | `6` | à l'ouverture, revérifier si la dernière vérification est plus ancienne |
| `interval` (capacitor.config.ts) | `240` | minutes entre deux passages de la tâche de fond (15 minimum) |

Après une modification : nouveau tag, nouvelle release.

## Limites connues

- Android décide du moment exact de la tâche de fond (WorkManager) ; sur OnePlus, sans les réglages de batterie, elle peut ne jamais tourner. L'ouverture de l'appli sert de filet de sécurité.
- Ticketmaster ne couvre pas toutes les billetteries françaises (Fnac, petites salles).
- Un artiste ajouté « tel quel » (sans le choisir dans les propositions) est cherché par nom : résultats approximatifs possibles pour un nom très court ou courant. Mieux vaut choisir dans la liste proposée.
- Android uniquement (pas d'iPhone).
