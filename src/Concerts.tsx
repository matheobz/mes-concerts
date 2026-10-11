import { useState } from 'react';
import type { Concert, Etat } from '../shared/types';
import { actions } from './actions';
import type { Outils } from './App';
import { estRecent, heure, jourCourt, moisAnnee, moisCourt, numeroJour, pluriel } from './format';

type Filtre = 'tous' | 'suivis';

export function Concerts({
  etat,
  outils,
  allerAuxArtistes,
}: {
  etat: Etat;
  outils: Outils;
  allerAuxArtistes: () => void;
}) {
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [artiste, setArtiste] = useState('');
  const [enCours, setEnCours] = useState('');

  if (!etat.artistes.length) {
    return (
      <div className="vide">
        <p>Bienvenue ! Ajoutez vos artistes préférés : leurs concerts en France apparaîtront ici.</p>
        <button className="principal" onClick={allerAuxArtistes}>
          Ajouter un artiste
        </button>
      </div>
    );
  }

  const liste = etat.concerts.filter((c) => (filtre === 'tous' || c.suivi) && (!artiste || c.artisteId === artiste));

  // Regroupement par mois.
  const parMois = new Map<string, Concert[]>();
  for (const c of liste) {
    const mois = moisAnnee(c.date);
    parMois.set(mois, (parMois.get(mois) ?? []).concat(c));
  }

  async function basculer(c: Concert) {
    setEnCours(c.id);
    try {
      outils.setEtat(await actions.suivre(c.id, !c.suivi));
      outils.informer(
        c.suivi
          ? 'Vous ne suivez plus ce concert.'
          : `C'est noté : vous aurez une notification de rappel ${etat.rappelJours} jours avant.`,
      );
    } catch (e) {
      outils.echec(e);
    } finally {
      setEnCours('');
    }
  }

  return (
    <>
      <div className="filtres">
        <button className={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>
          Tous ({etat.concerts.length})
        </button>
        <button className={filtre === 'suivis' ? 'actif' : ''} onClick={() => setFiltre('suivis')}>
          Mes concerts suivis ({etat.concerts.filter((c) => c.suivi).length})
        </button>
      </div>
      {etat.artistes.length > 1 && (
        <select className="choix-artiste" value={artiste} onChange={(e) => setArtiste(e.target.value)}>
          <option value="">Tous les artistes</option>
          {etat.artistes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nom}
            </option>
          ))}
        </select>
      )}

      {!liste.length && (
        <p className="vide">
          {filtre === 'suivis'
            ? 'Vous ne suivez aucun concert. Touchez « Suivre » sur un concert pour avoir un rappel.'
            : 'Aucun concert annoncé en France pour le moment. Une notification vous préviendra dès qu’une date sort.'}
        </p>
      )}

      {Array.from(parMois).map(([mois, concerts]) => (
        <section key={mois}>
          <h2 className="mois">{mois}</h2>
          {concerts.map((c) => (
            <article key={c.id} className={`concert${c.annule ? ' annule' : ''}`}>
              <div className="calendrier" aria-hidden>
                <span>{jourCourt(c.date)}</span>
                <strong>{numeroJour(c.date)}</strong>
                <span>{moisCourt(c.date)}</span>
              </div>
              <div className="details">
                <h3>
                  {c.artisteNom}
                  {c.annule ? (
                    <span className="badge rouge">Annulé</span>
                  ) : (
                    estRecent(c.trouveLe) && <span className="badge">Nouveau</span>
                  )}
                </h3>
                <p className="lieu">{[c.ville, c.salle].filter(Boolean).join(' · ')}</p>
                {c.heure && <p className="discret">à {heure(c.heure)}</p>}
                <div className="actions">
                  {c.url && (
                    <a className="bouton" href={c.url} target="_blank" rel="noreferrer">
                      Billets
                    </a>
                  )}
                  {!c.annule && (
                    <button
                      className={c.suivi ? 'suivi' : ''}
                      disabled={enCours === c.id}
                      onClick={() => void basculer(c)}
                      aria-pressed={c.suivi}
                    >
                      {c.suivi ? '🔔 Suivi' : '☆ Suivre'}
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      ))}

      {filtre === 'tous' && liste.length > 0 && (
        <p className="discret centre">
          {pluriel(liste.length, 'concert')} à venir. « Suivre » = notification de rappel {etat.rappelJours} jours avant.
        </p>
      )}
    </>
  );
}
