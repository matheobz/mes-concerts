import { useCallback, useEffect, useState } from 'react';
import type { Etat } from '../shared/types';
import { CodeRefuse, api, enregistrerCode, etatEnCache, lireCode, oublierCode } from './api';
import { Artistes } from './Artistes';
import { Concerts } from './Concerts';
import { Connexion } from './Connexion';
import { Reglages } from './Reglages';

type Onglet = 'concerts' | 'artistes' | 'reglages';

export interface Outils {
  code: string;
  setEtat: (e: Etat) => void;
  /** Affiche un message en bas de l'écran. */
  informer: (texte: string) => void;
  /** Gère une erreur d'appel (code refusé = retour à l'écran de connexion). */
  echec: (e: unknown) => void;
}

export function App() {
  const [code, setCode] = useState(lireCode);
  const [etat, setEtat] = useState<Etat | null>(etatEnCache);
  const [onglet, setOnglet] = useState<Onglet>('concerts');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);

  const informer = useCallback((texte: string) => setInfo(texte), []);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(''), 6000);
    return () => clearTimeout(t);
  }, [info]);

  const deconnecter = useCallback(() => {
    oublierCode();
    setCode('');
  }, []);

  const echec = useCallback(
    (e: unknown) => {
      if (e instanceof CodeRefuse) {
        deconnecter();
        setInfo('Code incorrect, merci de le saisir à nouveau.');
      } else {
        setInfo(e instanceof Error ? e.message : 'Une erreur est survenue.');
      }
    },
    [deconnecter],
  );

  const charger = useCallback(async () => {
    if (!code) return;
    setChargement(true);
    try {
      setEtat(await api.etat(code));
    } catch (e) {
      echec(e);
    } finally {
      setChargement(false);
    }
  }, [code, echec]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (!code) {
    return (
      <Connexion
        message={info}
        valider={(c) => {
          enregistrerCode(c);
          setInfo('');
          setCode(c);
        }}
      />
    );
  }

  const outils: Outils = { code, setEtat, informer, echec };

  return (
    <div className="appli">
      <header className="entete">
        <h1>Mes concerts</h1>
        {chargement && <span className="discret">Mise à jour…</span>}
      </header>

      <main className="contenu">
        {!etat ? (
          <p className="vide">Chargement…</p>
        ) : onglet === 'concerts' ? (
          <Concerts etat={etat} outils={outils} allerAuxArtistes={() => setOnglet('artistes')} />
        ) : onglet === 'artistes' ? (
          <Artistes etat={etat} outils={outils} />
        ) : (
          <Reglages etat={etat} outils={outils} deconnecter={deconnecter} />
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
          <span aria-hidden>⚙️</span>Réglages
        </button>
      </nav>
    </div>
  );
}
