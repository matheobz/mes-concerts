import { useState } from 'react';
import type { Etat } from '../shared/types';
import { api } from './api';
import type { Outils } from './App';
import { dateEtHeure } from './format';

export function Reglages({ etat, outils, deconnecter }: { etat: Etat; outils: Outils; deconnecter: () => void }) {
  const [enCours, setEnCours] = useState('');

  async function verifier() {
    setEnCours('verif');
    try {
      const r = await api.verifier(outils.code);
      outils.setEtat(r.etat);
      outils.informer(`Vérification faite : ${r.bilan}.`);
    } catch (e) {
      outils.echec(e);
    } finally {
      setEnCours('');
    }
  }

  async function mailTest() {
    setEnCours('mail');
    try {
      await api.mailTest(outils.code);
      outils.informer('Mail de test envoyé. Pensez à regarder dans les indésirables.');
    } catch (e) {
      outils.echec(e);
    } finally {
      setEnCours('');
    }
  }

  return (
    <div className="reglages">
      <section className="carte">
        <h2>Comment ça marche</h2>
        <p>Chaque matin, l'application cherche les concerts de vos artistes en France.</p>
        <p>Dès qu'une nouvelle date est annoncée, vous recevez un mail.</p>
        <p>
          Touchez « Suivre » sur un concert : vous recevrez un rappel {etat.rappelJours} jours avant.
        </p>
      </section>

      <section className="carte">
        <h2>Dernière vérification</h2>
        <p>{etat.derniereVerif ? dateEtHeure(etat.derniereVerif) : 'Pas encore faite.'}</p>
        {etat.dernierBilan && <p className="discret">{etat.dernierBilan}</p>}
        <button className="principal" disabled={!!enCours} onClick={() => void verifier()}>
          {enCours === 'verif' ? 'Vérification…' : 'Vérifier maintenant'}
        </button>
      </section>

      <section className="carte">
        <h2>Mails</h2>
        <p>Pour être sûre de bien recevoir les alertes, envoyez-vous un mail d'essai.</p>
        <button disabled={!!enCours} onClick={() => void mailTest()}>
          {enCours === 'mail' ? 'Envoi…' : 'Envoyer un mail de test'}
        </button>
      </section>

      <section className="carte">
        <h2>Sur votre téléphone</h2>
        <p>
          Pour l'avoir comme une application : dans le navigateur, menu puis « Ajouter à l'écran d'accueil »
          (sur iPhone : bouton Partager puis « Sur l'écran d'accueil »).
        </p>
      </section>

      <button className="lien" onClick={deconnecter}>
        Se déconnecter de cet appareil
      </button>
    </div>
  );
}
