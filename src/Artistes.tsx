import { type CSSProperties, useEffect, useState } from 'react';
import type { Artiste, Etat, Suggestion } from '../shared/types';
import { actions } from './actions';
import type { Outils } from './App';
import { Portrait } from './Elements';
import { pluriel } from './format';
import { IconeFermer, IconePlus, IconeRecherche } from './Icones';

export function Artistes({ etat, outils }: { etat: Etat; outils: Outils }) {
  const [saisie, setSaisie] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recherche, setRecherche] = useState(false);
  const [ajout, setAjout] = useState(false);

  // Recherche d'artistes chez Ticketmaster pendant la saisie (avec un petit délai).
  useEffect(() => {
    const q = saisie.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let annule = false;
    const t = setTimeout(async () => {
      setRecherche(true);
      try {
        const s = await actions.rechercher(q);
        if (!annule) setSuggestions(s);
      } catch {
        if (!annule) setSuggestions([]);
      } finally {
        if (!annule) setRecherche(false);
      }
    }, 400);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [saisie]);

  async function ajouter(nom: string, tmId?: string, image?: string) {
    setAjout(true);
    try {
      const r = await actions.ajouterArtiste(nom, tmId, image);
      outils.setEtat(r.etat);
      setSaisie('');
      setSuggestions([]);
      outils.informer(
        r.avertissement ??
          (r.trouves
            ? `${nom} ajouté : ${pluriel(r.trouves, 'concert trouvé', 'concerts trouvés')}.`
            : `${nom} ajouté. Pas de concert pour l'instant : une notification vous préviendra.`),
      );
    } catch (e) {
      outils.echec(e);
    } finally {
      setAjout(false);
    }
  }

  async function retirer(a: Artiste) {
    if (!window.confirm(`Retirer ${a.nom} de vos artistes ?`)) return;
    try {
      outils.setEtat(await actions.retirerArtiste(a.id));
      outils.informer(`${a.nom} a été retiré.`);
    } catch (e) {
      outils.echec(e);
    }
  }

  const nbConcerts = (id: string) => etat.concerts.filter((c) => c.artisteId === id && !c.annule).length;

  return (
    <>
      <form
        className="ajout"
        onSubmit={(e) => {
          e.preventDefault();
          const premier = suggestions[0];
          if (premier) void ajouter(premier.nom, premier.tmId, premier.image);
        }}
      >
        <label htmlFor="artiste" className="sr">
          Ajouter un artiste
        </label>
        <div className="champ">
          <IconeRecherche />
          <input
            id="artiste"
            type="search"
            placeholder="Ajouter un artiste (ex. Vianney)"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            autoComplete="off"
            disabled={ajout}
          />
          {(recherche || ajout) && <span className="synchro petite" aria-hidden />}
        </div>
      </form>

      {ajout && <p className="discret">Ajout et recherche des concerts…</p>}

      {!ajout && saisie.trim().length >= 2 && (
        <ul className="suggestions">
          {suggestions.map((s, i) => (
            <li key={s.tmId} style={{ '--i': i } as CSSProperties}>
              <button onClick={() => void ajouter(s.nom, s.tmId, s.image)}>
                <Portrait artiste={{ id: s.tmId, nom: s.nom, image: s.image, ajouteLe: '' }} nom={s.nom} />
                <span className="nom">
                  {s.nom}
                  {s.genre && s.genre !== 'Undefined' && <small>{s.genre}</small>}
                </span>
                <span className="plus">
                  <IconePlus taille={20} />
                </span>
              </button>
            </li>
          ))}
          {!recherche && (
            <li style={{ '--i': suggestions.length } as CSSProperties}>
              <button className="libre" onClick={() => void ajouter(saisie.trim())}>
                <span className="portrait initiales" aria-hidden>
                  <IconePlus taille={20} />
                </span>
                <span className="nom">
                  Ajouter « {saisie.trim()} »
                  <small>{suggestions.length ? 'pas dans la liste ci-dessus' : 'recherche par nom'}</small>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      <h2 className="mois">
        {etat.artistes.length ? pluriel(etat.artistes.length, 'artiste suivi', 'artistes suivis') : 'Aucun artiste'}
      </h2>
      {!etat.artistes.length && <p className="vide">Cherchez un nom ci-dessus pour commencer.</p>}
      <ul className="artistes">
        {etat.artistes.map((a, i) => {
          const n = nbConcerts(a.id);
          return (
            <li key={a.id} style={{ '--i': Math.min(i, 12) } as CSSProperties}>
              {a.image ? (
                <img src={a.image} alt="" loading="lazy" />
              ) : (
                <span className="sans-image" aria-hidden>
                  {a.nom.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="voile" />
              <span className="nom">
                {a.nom}
                <small className={n ? 'or' : ''}>{n ? pluriel(n, 'concert', 'concerts') : 'Pas de date'}</small>
              </span>
              <button className="retirer" onClick={() => void retirer(a)} aria-label={`Retirer ${a.nom}`}>
                <IconeFermer taille={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
