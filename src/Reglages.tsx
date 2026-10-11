import { useEffect, useRef, useState } from 'react';
import type { Etat } from '../shared/types';
import { CLE_TM, actions } from './actions';
import type { Outils } from './App';
import { type Autorisations, activerNotifs, libererBatterie } from './Bandeaux';
import { dateEtHeure } from './format';
import { lancerTacheFond, ouvrirReglagesAppli, partagerFichier, surTelephone, versionAppli } from './natif';

export function Reglages({
  etat,
  outils,
  autorisations,
}: {
  etat: Etat;
  outils: Outils;
  autorisations: Autorisations;
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
        <p>Touchez « Suivre » sur un concert : vous aurez un rappel {etat.rappelJours} jours avant.</p>
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
