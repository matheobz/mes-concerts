import { useEffect, useState } from 'react';
import type { Artiste, Etat, Suggestion } from '../shared/types';
import { actions } from './actions';
import type { Outils } from './App';
import { pluriel } from './format';

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
        <label htmlFor="artiste">Ajouter un artiste</label>
        <input
          id="artiste"
          type="search"
          placeholder="Nom de l'artiste (ex. Vianney)"
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          autoComplete="off"
          disabled={ajout}
        />
      </form>

      {ajout && <p className="discret">Ajout et recherche des concerts…</p>}
      {!ajout && recherche && <p className="discret">Recherche…</p>}

      {!ajout && saisie.trim().length >= 2 && (
        <ul className="suggestions">
          {suggestions.map((s) => (
            <li key={s.tmId}>
              <button onClick={() => void ajouter(s.nom, s.tmId, s.image)}>
                {s.image ? <img src={s.image} alt="" /> : <span className="sans-image">🎵</span>}
                <span className="nom">
                  {s.nom}
                  {s.genre && s.genre !== 'Undefined' && <small>{s.genre}</small>}
                </span>
                <span className="plus">Ajouter</span>
              </button>
            </li>
          ))}
          {!recherche && (
            <li>
              <button className="libre" onClick={() => void ajouter(saisie.trim())}>
                <span className="sans-image">＋</span>
                <span className="nom">
                  Ajouter « {saisie.trim()} »
                  <small>{suggestions.length ? 'pas dans la liste ci-dessus' : 'recherche par nom'}</small>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}

      <h2 className="mois">Mes artistes ({etat.artistes.length})</h2>
      {!etat.artistes.length && <p className="vide">Aucun artiste pour l'instant.</p>}
      <ul className="artistes">
        {etat.artistes.map((a) => (
          <li key={a.id}>
            {a.image ? <img src={a.image} alt="" /> : <span className="sans-image">🎵</span>}
            <span className="nom">
              {a.nom}
              <small>{pluriel(nbConcerts(a.id), 'concert à venir', 'concerts à venir')}</small>
            </span>
            <button className="retirer" onClick={() => void retirer(a)} aria-label={`Retirer ${a.nom}`}>
              Retirer
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
