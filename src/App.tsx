import { type CSSProperties, useCallback, useEffect, useState } from 'react';
import type { Etat } from '../shared/types';
import { actions } from './actions';
import { Artistes } from './Artistes';
import { Bandeaux, useAutorisations } from './Bandeaux';
import { Concerts } from './Concerts';
import { IconeBillet, IconeEtoile, IconeMaj, IconeReglages } from './Icones';
import { type PrefLieu, ecrirePrefLieu, lirePrefLieu } from './lieux';
import { type Publication, chercherSiBesoin } from './maj';
import { quandNotifTouchee, quandRetour } from './natif';
import { Reglages } from './Reglages';

type Onglet = 'concerts' | 'artistes' | 'reglages';
const ONGLETS: Onglet[] = ['concerts', 'artistes', 'reglages'];

export interface Outils {
  setEtat: (e: Etat) => void;
  /** Affiche un message en bas de l'écran. */
  informer: (texte: string) => void;
  /** Affiche une erreur. */
  echec: (e: unknown) => void;
}

/** Mise à jour de l'appli disponible (trouvée à l'ouverture ou depuis les réglages). */
export interface EtatMaj {
  publication: Publication | null;
  setPublication: (p: Publication | null) => void;
}

function salutation(): string {
  const h = new Date().getHours();
  return h >= 18 || h < 5 ? 'Bonsoir Delphine' : 'Bonjour Delphine';
}

export function App() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('concerts');
  const [info, setInfo] = useState('');
  const [chargement, setChargement] = useState(false);
  const [lieu, setLieuEtat] = useState<PrefLieu>(lirePrefLieu);
  const [publication, setPublication] = useState<Publication | null>(null);
  const autorisations = useAutorisations();
  const { actualiser } = autorisations;

  const informer = useCallback((texte: string) => setInfo(texte), []);
  const echec = useCallback((e: unknown) => setInfo(e instanceof Error ? e.message : 'Une erreur est survenue.'), []);

  const setLieu = useCallback((p: PrefLieu) => {
    ecrirePrefLieu(p);
    setLieuEtat(p);
  }, []);

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
    void chercherSiBesoin().then((p) => p && setPublication(p));
    void quandRetour(() => {
      void rafraichir();
      void actualiser();
    });
    void quandNotifTouchee(() => setOnglet('concerts'));
  }, [rafraichir, actualiser]);

  const outils: Outils = { setEtat, informer, echec };
  const maj: EtatMaj = { publication, setPublication };

  return (
    <div className="appli">
      <div className="aurore" aria-hidden>
        <span />
        <span />
        <span />
      </div>

      <header className="entete">
        <div>
          <p className="surtitre">{salutation()}</p>
          <h1>
            {onglet === 'concerts' ? 'Mes concerts' : onglet === 'artistes' ? 'Mes artistes' : 'Réglages'}
          </h1>
        </div>
        {chargement && <span className="synchro" role="status" aria-label="Mise à jour en cours" />}
      </header>

      <main className="contenu" key={onglet}>
        {publication && onglet !== 'reglages' && (
          <button className="bandeau-maj" onClick={() => setOnglet('reglages')}>
            <IconeMaj />
            <span>
              <strong>Nouvelle version {publication.version}</strong>
              <small>Touchez pour mettre l'appli à jour</small>
            </span>
          </button>
        )}
        {onglet !== 'reglages' && <Bandeaux autorisations={autorisations} outils={outils} />}
        {!etat ? (
          <div className="squelettes" aria-label="Chargement">
            <div className="squelette grand" />
            <div className="squelette" />
            <div className="squelette" />
          </div>
        ) : onglet === 'concerts' ? (
          <Concerts
            etat={etat}
            outils={outils}
            lieu={lieu}
            allerAuxArtistes={() => setOnglet('artistes')}
          />
        ) : onglet === 'artistes' ? (
          <Artistes etat={etat} outils={outils} />
        ) : (
          <Reglages
            etat={etat}
            outils={outils}
            autorisations={autorisations}
            lieu={lieu}
            setLieu={setLieu}
            maj={maj}
          />
        )}
      </main>

      {info && (
        <div className="message" role="status" onClick={() => setInfo('')} key={info}>
          {info}
        </div>
      )}

      <nav className="onglets" style={{ '--rang': ONGLETS.indexOf(onglet) } as CSSProperties}>
        <span className="curseur" aria-hidden />
        <button className={onglet === 'concerts' ? 'actif' : ''} onClick={() => setOnglet('concerts')}>
          <IconeBillet />
          Concerts
        </button>
        <button className={onglet === 'artistes' ? 'actif' : ''} onClick={() => setOnglet('artistes')}>
          <IconeEtoile />
          Artistes
        </button>
        <button className={onglet === 'reglages' ? 'actif' : ''} onClick={() => setOnglet('reglages')}>
          <IconeReglages />
          Réglages
          {publication && <i className="pastille" aria-label="mise à jour disponible" />}
        </button>
      </nav>
    </div>
  );
}
