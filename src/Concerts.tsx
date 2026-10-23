import { type CSSProperties, type MouseEvent, useState } from 'react';
import { aujourdhuiParis } from '../shared/logique';
import type { Concert, Etat } from '../shared/types';
import { actions } from './actions';
import type { Outils } from './App';
import { Etiquettes, Portrait } from './Elements';
import { Fiche } from './Fiche';
import { compteARebours, heure, jourCourt, moisAnnee, moisCourt, numeroJour, pluriel } from './format';
import { IconeCloche, IconeEtoile, IconeLieu } from './Icones';
import { type PrefLieu, distanceDe, region, villeDe } from './lieux';

type Filtre = 'tous' | 'suivis';

/** Applique un filtre et fait glisser la pastille touchée bien en vue dans sa rangée. */
function choisir(e: MouseEvent<HTMLButtonElement>, f: () => void) {
  f();
  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

export function Concerts({
  etat,
  outils,
  lieu,
  allerAuxArtistes,
}: {
  etat: Etat;
  outils: Outils;
  lieu: PrefLieu;
  allerAuxArtistes: () => void;
}) {
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const [ou, setOu] = useState('partout');
  const [artiste, setArtiste] = useState('');
  const [enCours, setEnCours] = useState('');
  const [sonne, setSonne] = useState('');
  const [fiche, setFiche] = useState<string | null>(null);

  if (!etat.artistes.length) {
    return (
      <div className="accueil">
        <div className="disque" aria-hidden>
          <IconeEtoile taille={44} />
        </div>
        <h2>Bienvenue</h2>
        <p>Ajoutez vos artistes préférés : leurs concerts en France apparaîtront ici, avec une alerte à chaque nouvelle date.</p>
        <button className="principal" onClick={allerAuxArtistes}>
          Ajouter un artiste
        </button>
      </div>
    );
  }

  const maintenant = new Date();
  const auj = aujourdhuiParis(maintenant);
  const maVille = villeDe(lieu);
  const artistes = new Map(etat.artistes.map((a) => [a.id, a]));

  const proche = (c: Concert) => {
    const d = distanceDe(c, maVille);
    return d !== undefined && d <= lieu.rayon;
  };
  const dansLieu = (c: Concert) => (ou === 'partout' ? true : ou === 'proche' ? proche(c) : region(c) === ou);

  // Les régions présentes, de la plus fournie à la moins fournie.
  const parRegion = new Map<string, number>();
  for (const c of etat.concerts) {
    const r = region(c);
    if (r) parRegion.set(r, (parRegion.get(r) ?? 0) + 1);
  }
  const regions = Array.from(parRegion).sort((a, b) => b[1] - a[1]);

  const liste = etat.concerts.filter(
    (c) => (filtre === 'tous' || c.suivi) && (!artiste || c.artisteId === artiste) && dansLieu(c),
  );
  const vedette = liste.find((c) => !c.annule);
  const reste = liste.filter((c) => c !== vedette);

  // Regroupement par mois.
  const parMois = new Map<string, Concert[]>();
  for (const c of reste) {
    const mois = moisAnnee(c.date);
    parMois.set(mois, (parMois.get(mois) ?? []).concat(c));
  }

  async function basculer(c: Concert) {
    setEnCours(c.id);
    try {
      outils.setEtat(await actions.suivre(c.id, !c.suivi));
      if (!c.suivi) setSonne(c.id);
      outils.informer(
        c.suivi
          ? 'Vous ne suivez plus ce concert.'
          : `C'est noté : rappel ${etat.rappelJours} jours avant le concert.`,
      );
    } catch (e) {
      outils.echec(e);
    } finally {
      setEnCours('');
    }
  }

  const cloche = (c: Concert) =>
    !c.annule && (
      <button
        className={`cloche${c.suivi ? ' suivi' : ''}${sonne === c.id ? ' sonne' : ''}`}
        disabled={enCours === c.id}
        onClick={(e) => {
          e.stopPropagation();
          void basculer(c);
        }}
        aria-pressed={c.suivi}
        aria-label={c.suivi ? `Ne plus suivre ${c.artisteNom}` : `Suivre ${c.artisteNom}`}
      >
        <IconeCloche pleine={c.suivi} />
      </button>
    );

  const concertFiche = fiche ? etat.concerts.find((c) => c.id === fiche) : undefined;
  let rang = 0;

  return (
    <>
      <div className="segments" style={{ '--rang': filtre === 'tous' ? 0 : 1 } as CSSProperties}>
        <span className="curseur" aria-hidden />
        <button className={filtre === 'tous' ? 'actif' : ''} onClick={() => setFiltre('tous')}>
          Tous <small>{etat.concerts.length}</small>
        </button>
        <button className={filtre === 'suivis' ? 'actif' : ''} onClick={() => setFiltre('suivis')}>
          Suivis <small>{etat.concerts.filter((c) => c.suivi).length}</small>
        </button>
      </div>

      <div className="puces" role="group" aria-label="Lieu">
        <button className={ou === 'partout' ? 'actif' : ''} onClick={(e) => choisir(e, () => setOu('partout'))}>
          Toute la France
        </button>
        <button className={ou === 'proche' ? 'actif' : ''} onClick={(e) => choisir(e, () => setOu('proche'))}>
          <IconeLieu taille={16} />
          Autour de {maVille.nom} · {lieu.rayon} km
          <small>{etat.concerts.filter(proche).length}</small>
        </button>
        {regions.map(([r, n]) => (
          <button key={r} className={ou === r ? 'actif' : ''} onClick={(e) => choisir(e, () => setOu(r))}>
            {r} <small>{n}</small>
          </button>
        ))}
      </div>

      {etat.artistes.length > 1 && (
        <div className="ronde" role="group" aria-label="Artiste">
          <button className={!artiste ? 'actif' : ''} onClick={(e) => choisir(e, () => setArtiste(''))}>
            <span className="portrait initiales tous" aria-hidden>
              <IconeEtoile taille={20} />
            </span>
            <span className="ronde-nom">Tous</span>
          </button>
          {etat.artistes.map((a) => (
            <button key={a.id} className={artiste === a.id ? 'actif' : ''} onClick={(e) => choisir(e, () => setArtiste(artiste === a.id ? '' : a.id))}>
              <Portrait artiste={a} nom={a.nom} />
              <span className="ronde-nom">{a.nom}</span>
            </button>
          ))}
        </div>
      )}

      {!liste.length && (
        <div className="vide">
          <p>
            {filtre === 'suivis'
              ? 'Aucun concert suivi ici. Touchez la cloche d’un concert pour recevoir un rappel.'
              : ou !== 'partout'
                ? 'Aucun concert annoncé dans ce coin pour le moment.'
                : 'Aucun concert annoncé en France pour le moment. Une notification vous préviendra dès qu’une date sort.'}
          </p>
          {ou !== 'partout' && (
            <button className="secondaire" onClick={() => setOu('partout')}>
              Voir toute la France
            </button>
          )}
        </div>
      )}

      {vedette && (
        <article
          className="vedette"
          onClick={() => setFiche(vedette.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setFiche(vedette.id)}
        >
          {(vedette.image ?? artistes.get(vedette.artisteId)?.image) && (
            <img src={vedette.image ?? artistes.get(vedette.artisteId)?.image} alt="" />
          )}
          <div className="voile" />
          <span className="compte">{compteARebours(vedette.date, auj)}</span>
          <div className="vedette-texte">
            <p className="surtitre">Prochain concert</p>
            <h2>{vedette.artisteNom}</h2>
            <p>
              {jourCourt(vedette.date)} {numeroJour(vedette.date)} {moisCourt(vedette.date)}
              {vedette.heure ? ` · ${heure(vedette.heure)}` : ''}
            </p>
            <p className="lieu">
              <IconeLieu taille={16} />
              {[vedette.salle, vedette.ville].filter(Boolean).join(', ')}
            </p>
            <Etiquettes c={vedette} maintenant={maintenant} />
          </div>
          {cloche(vedette)}
        </article>
      )}

      {Array.from(parMois).map(([mois, concerts]) => (
        <section key={mois}>
          <h2 className="mois">{mois}</h2>
          {concerts.map((c) => (
            <article
              key={c.id}
              className={`concert${c.annule ? ' annule' : ''}`}
              style={{ '--i': Math.min(rang++, 12) } as CSSProperties}
              onClick={() => setFiche(c.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setFiche(c.id)}
            >
              <div className="calendrier" aria-hidden>
                <span>{jourCourt(c.date)}</span>
                <strong>{numeroJour(c.date)}</strong>
                <span>{moisCourt(c.date)}</span>
              </div>
              <div className="details">
                <h3>{c.artisteNom}</h3>
                <p className="lieu">
                  {[c.ville, c.salle].filter(Boolean).join(' · ')}
                  {c.heure && <span className="discret"> · {heure(c.heure)}</span>}
                </p>
                <Etiquettes c={c} maintenant={maintenant} />
              </div>
              {cloche(c)}
            </article>
          ))}
        </section>
      ))}

      {liste.length > 0 && (
        <p className="discret centre">
          {pluriel(liste.length, 'concert')} à venir. La cloche : un rappel {etat.rappelJours} jours avant le concert.
        </p>
      )}

      {concertFiche && (
        <Fiche
          c={concertFiche}
          artiste={artistes.get(concertFiche.artisteId)}
          maVille={maVille}
          rappelJours={etat.rappelJours}
          enCours={enCours === concertFiche.id}
          basculer={() => void basculer(concertFiche)}
          fermer={() => setFiche(null)}
        />
      )}
    </>
  );
}
