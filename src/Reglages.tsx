import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type { Etat } from '../shared/types';
import { CLE_TM, actions } from './actions';
import type { EtatMaj, Outils } from './App';
import { type Autorisations, activerNotifs, libererBatterie } from './Bandeaux';
import { dateEtHeure } from './format';
import { type PrefLieu, RAYONS, VILLES } from './lieux';
import { chercherMiseAJour, installer, majAuto, setMajAuto, versionInstallee } from './maj';
import { lancerTacheFond, ouvrirReglagesAppli, partagerFichier, surTelephone, versionAppli } from './natif';

/** Carte « Mise à jour » : vérifier, télécharger et installer la dernière version publiée. */
function MiseAJour({ maj, outils }: { maj: EtatMaj; outils: Outils }) {
  const [version, setVersion] = useState('');
  const [auto, setAuto] = useState(majAuto);
  const [etape, setEtape] = useState<'' | 'recherche' | 'telechargement'>('');
  const [pourcent, setPourcent] = useState(0);
  const [aJour, setAJour] = useState(false);
  const { publication, setPublication } = maj;

  useEffect(() => {
    void versionInstallee().then(setVersion);
  }, []);

  async function rechercher() {
    setEtape('recherche');
    setAJour(false);
    try {
      const p = await chercherMiseAJour();
      setPublication(p);
      if (!p) setAJour(true);
    } catch (e) {
      outils.echec(e);
    } finally {
      setEtape('');
    }
  }

  async function mettreAJour() {
    if (!publication) return;
    setEtape('telechargement');
    setPourcent(0);
    try {
      const r = await installer(publication, setPourcent);
      outils.informer(
        r === 'autorisation'
          ? 'Activez « Autoriser depuis cette source », revenez, puis touchez à nouveau « Mettre à jour ».'
          : 'Touchez « Mettre à jour » dans la fenêtre Android. Vos artistes et concerts sont conservés.',
      );
    } catch (e) {
      outils.echec(e);
    } finally {
      setEtape('');
    }
  }

  return (
    <section className="carte">
      <h2>Mise à jour</h2>
      <p className="discret">
        {surTelephone ? `Version installée : ${version || '?'}` : 'Mise à jour disponible seulement sur le téléphone.'}
      </p>
      {publication ? (
        <>
          <p className="ok">Nouvelle version {publication.version} disponible.</p>
          {etape === 'telechargement' && (
            <div className="progression" role="progressbar" aria-valuenow={pourcent} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pourcent}%` }} />
            </div>
          )}
          <button className="principal" disabled={!!etape} onClick={() => void mettreAJour()}>
            {etape === 'telechargement' ? `Téléchargement… ${pourcent} %` : 'Mettre à jour'}
          </button>
        </>
      ) : (
        <>
          {aJour && <p className="ok">L'appli est à jour.</p>}
          <button className="secondaire" disabled={!!etape || !surTelephone} onClick={() => void rechercher()}>
            {etape === 'recherche' ? 'Recherche…' : 'Rechercher une mise à jour'}
          </button>
        </>
      )}
      <label className="interrupteur">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => {
            setMajAuto(e.target.checked);
            setAuto(e.target.checked);
          }}
        />
        <span className="glissiere" aria-hidden />
        Prévenir automatiquement quand une nouvelle version sort
      </label>
    </section>
  );
}

export function Reglages({
  etat,
  outils,
  autorisations,
  lieu,
  setLieu,
  maj,
}: {
  etat: Etat;
  outils: Outils;
  autorisations: Autorisations;
  lieu: PrefLieu;
  setLieu: (p: PrefLieu) => void;
  maj: EtatMaj;
}) {
  const [enCours, setEnCours] = useState('');
  const [version, setVersion] = useState('');
  const fichier = useRef<HTMLInputElement>(null);
  const { notifs, batterie } = autorisations;

  useEffect(() => {
    void versionAppli().then(setVersion);
  }, []);

  async function tache(nom: string, f: () => Promise<void>) {
    setEnCours(nom);
    try {
      await f();
    } catch (e) {
      outils.echec(e);
    } finally {
      setEnCours('');
    }
  }

  const verifier = () =>
    tache('verif', async () => {
      const r = await actions.verifier();
      outils.setEtat(r.etat);
      outils.informer(`Vérification faite : ${r.bilan}.`);
    });

  const notifTest = () =>
    tache('notif', async () => {
      await actions.notifTest();
      outils.informer('Notification envoyée : elle doit apparaître en haut de l’écran.');
    });

  const exporter = () =>
    tache('export', async () => {
      const { nom, texte } = await actions.exporter();
      await partagerFichier(nom, texte);
    });

  async function importer(f: File | undefined) {
    if (!f) return;
    await tache('import', async () => {
      const d = actions.lireSauvegarde(await f.text());
      const message = `Cette sauvegarde contient ${d.artistes.length} artiste(s). Elle va remplacer ce qui est dans l'appli. Continuer ?`;
      if (!window.confirm(message)) return;
      outils.setEtat(await actions.importer(d));
      outils.informer('Sauvegarde rechargée.');
    });
    if (fichier.current) fichier.current.value = '';
  }

  const testerFond = () =>
    tache('fond', async () => {
      const bilan = await lancerTacheFond();
      outils.setEtat(await actions.etat());
      outils.informer(`Vérification automatique : ${bilan}.`);
    });

  return (
    <div className="reglages">
      <section className="carte">
        <h2>Comment ça marche</h2>
        <p>Chaque jour, l'application cherche toute seule les concerts de vos artistes en France.</p>
        <p>Dès qu'une nouvelle date est annoncée, une notification apparaît sur votre téléphone.</p>
        <p>
          Billetterie : une alerte quand l'ouverture est annoncée, puis 24 heures et 1 heure avant, pour être
          prête au bon moment. C'est automatique, pour tous les concerts de vos artistes.
        </p>
        <p>
          La cloche, c'est pour un concert où vous allez : touchez-la et vous aurez un rappel {etat.rappelJours} jours
          avant le concert.
        </p>
      </section>

      <section className="carte">
        <h2>Ma ville</h2>
        <p>Pour le filtre « Autour de… » de l'écran Concerts.</p>
        <select value={lieu.ville} onChange={(e) => setLieu({ ...lieu, ville: e.target.value })} aria-label="Ma ville">
          {VILLES.map((v) => (
            <option key={v.nom} value={v.nom}>
              {v.nom}
            </option>
          ))}
        </select>
        <div className="segments" style={{ '--rang': RAYONS.indexOf(lieu.rayon), '--nb': RAYONS.length } as CSSProperties}>
          <span className="curseur" aria-hidden />
          {RAYONS.map((r) => (
            <button key={r} className={lieu.rayon === r ? 'actif' : ''} onClick={() => setLieu({ ...lieu, rayon: r })}>
              {r} km
            </button>
          ))}
        </div>
      </section>

      <section className="carte">
        <h2>Dernière vérification</h2>
        <p>{etat.derniereVerif ? dateEtHeure(etat.derniereVerif) : 'Pas encore faite.'}</p>
        {etat.dernierBilan && <p className="discret">{etat.dernierBilan}</p>}
        {surTelephone && (
          <p className="discret">
            Vérification automatique :{' '}
            {etat.derniereVerifFond ? `dernier passage ${dateEtHeure(etat.derniereVerifFond)}` : 'pas encore passée'}
          </p>
        )}
        <button className="principal" disabled={!!enCours} onClick={() => void verifier()}>
          {enCours === 'verif' ? 'Vérification…' : 'Vérifier maintenant'}
        </button>
      </section>

      <section className="carte">
        <h2>Notifications</h2>
        {notifs === 'oui' ? (
          <>
            <p className="ok">✅ Les notifications sont autorisées.</p>
            <button disabled={!!enCours} onClick={() => void notifTest()}>
              {enCours === 'notif' ? 'Envoi…' : 'Envoyer une notification d’essai'}
            </button>
          </>
        ) : (
          <>
            <p className="alerte">Les notifications sont bloquées : l'appli ne peut pas vous prévenir.</p>
            <button className="principal" onClick={() => void activerNotifs(autorisations, outils)}>
              Autoriser les notifications
            </button>
          </>
        )}
      </section>

      {surTelephone && (
        <section className="carte">
          <h2>Batterie</h2>
          <p>
            Pour économiser la batterie, votre téléphone OnePlus endort les applications qu'on n'ouvre pas. Il faut
            lui dire de laisser « Mes concerts » tranquille, sinon les notifications n'arriveront pas.
          </p>
          {batterie?.libre ? (
            <p className="ok">✅ C'est fait : l'appli peut travailler en arrière-plan.</p>
          ) : (
            <button className="principal" onClick={() => void libererBatterie(outils)}>
              Autoriser l'appli en arrière-plan
            </button>
          )}
          <p>Si les notifications n'arrivent toujours pas, faites aussi ceci :</p>
          <ol>
            <li>Touchez « Ouvrir les réglages de l'appli » ci-dessous.</li>
            <li>Touchez « Batterie » (ou « Utilisation de la batterie »).</li>
            <li>Activez « Autoriser l'activité en arrière-plan » et, s'il existe, « Démarrage automatique ».</li>
          </ol>
          <button onClick={() => void ouvrirReglagesAppli()}>Ouvrir les réglages de l'appli</button>
        </section>
      )}

      <MiseAJour maj={maj} outils={outils} />

      <section className="carte">
        <h2>Sauvegarde</h2>
        <p>
          Vos artistes et vos concerts suivis sont gardés sur ce téléphone. Pour ne rien perdre en changeant de
          téléphone, enregistrez une sauvegarde (dans Google Drive, ou envoyez-la vous par mail).
        </p>
        <button disabled={!!enCours} onClick={() => void exporter()}>
          {enCours === 'export' ? 'Préparation…' : 'Enregistrer une sauvegarde'}
        </button>
        <button disabled={!!enCours} onClick={() => fichier.current?.click()}>
          {enCours === 'import' ? 'Lecture…' : 'Recharger une sauvegarde'}
        </button>
        <input
          ref={fichier}
          type="file"
          hidden
          onChange={(e) => void importer(e.target.files?.[0])}
        />
      </section>

      <section className="carte">
        <h2>Sources</h2>
        <p>D'où viennent les informations de l'appli :</p>
        <ul className="sources">
          <li>
            <strong>Ticketmaster</strong>
            <span>Les concerts, les salles, l'ouverture de la billetterie et les photos des artistes. Consulté chaque jour.</span>
          </li>
          <li>
            <strong>Google Maps</strong>
            <span>L'itinéraire jusqu'à la salle, quand vous touchez « Itinéraire ».</span>
          </li>
          <li>
            <strong>GitHub</strong>
            <span>Les nouvelles versions de l'appli.</span>
          </li>
        </ul>
        <p className="discret">
          Un concert vendu ailleurs que sur Ticketmaster (petites salles, certains festivals) peut ne pas apparaître.
        </p>
      </section>

      <details className="carte">
        <summary>Dépannage (pour Mathéo)</summary>
        <p className="discret">Version {version || '?'} · clé Ticketmaster {CLE_TM ? 'présente' : 'absente'}</p>
        {surTelephone && (
          <button disabled={!!enCours} onClick={() => void testerFond()}>
            {enCours === 'fond' ? 'En cours…' : 'Tester la vérification automatique'}
          </button>
        )}
      </details>
    </div>
  );
}
