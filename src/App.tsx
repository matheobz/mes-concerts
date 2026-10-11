import { useCallback, useEffect, useState } from 'react';
import type { Etat } from '../shared/types';
import { actions } from './actions';
import { Artistes } from './Artistes';
import { Bandeaux, useAutorisations } from './Bandeaux';
import { Concerts } from './Concerts';
import { quandNotifTouchee, quandRetour } from './natif';
import { Reglages } from './Reglages';

type Onglet = 'concerts' | 'artistes' | 'reglages';

export interface Outils {
  setEtat: (e: Etat) => void;
  /** Affiche un message en bas de l'écran. */
  informer: (texte: string) => void;
  /** Affiche une erreur. */
  echec: (e: unknown) => void;
}

export function App() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('concerts');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);
  const autorisations = useAutorisations();
  const { actualiser } = autorisations;

  const informer = useCallback((texte: string) => setInfo(texte), []);
  const echec = useCallback((e: unknown) => setInfo(e instanceof Error ? e.message : 'Une erreur est survenue.'), []);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(''), 6000);
    return () => clearTimeout(t);
  }, [info]);

  // À chaque ouverture : affichage immédiat des données du téléphone, puis vérification en secours
  // (Ticketmaster si la dernière vérification a plus de 6 heures, rappels toujours).
  const rafraichir = useCallback(async () => {
    try {
      setEtat(await actions.etat());
      setChargement(true);
      setEtat(await actions.verifierSiBesoin());
    } catch (e) {
      echec(e);
    } finally {
      setChargement(false);
    }
  }, [echec]);

  useEffect(() => {
    void rafraichir();
    void quandRetour(() => {
      void rafraichir();
      void actualiser();
    });
    void quandNotifTouchee(() => setOnglet('concerts'));
  }, [rafraichir, actualiser]);

  const outils: Outils = { setEtat, informer, echec };

  return (
    <div className="appli">
      <header className="entete">
        <h1>Mes concerts</h1>
        {chargement && <span className="discret">Mise à jour…</span>}
      </header>

      <main className="contenu">
        {onglet !== 'reglages' && <Bandeaux autorisations={autorisations} outils={outils} />}
        {!etat ? (
          <p className="vide">Chargement…</p>
        ) : onglet === 'concerts' ? (
          <Concerts etat={etat} outils={outils} allerAuxArtistes={() => setOnglet('artistes')} />
        ) : onglet === 'artistes' ? (
          <Artistes etat={etat} outils={outils} />
        ) : (
          <Reglages etat={etat} outils={outils} autorisations={autorisations} />
        )}
      </main>

      {info && (
        <div className="message" role="status" onClick={() => setInfo('')}>
          {info}
        </div>
      )}

      <nav className="onglets">
        <button className={onglet === 'concerts' ? 'actif' : ''} onClick={() => setOnglet('concerts')}>
          <span aria-hidden>🎤</span>Concerts
        </button>
        <button className={onglet === 'artistes' ? 'actif' : ''} onClick={() => setOnglet('artistes')}>
          <span aria-hidden>⭐</span>Mes artistes
        </button>
        <button className={onglet === 'reglages' ? 'actif' : ''} onClick={() => setOnglet('reglages')}>
          <span aria-hidden>🔧</span>Réglages
        </button>
      </nav>
    </div>
  );
}
