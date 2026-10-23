// Fiche d'un concert : panneau qui monte du bas de l'écran.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { aujourdhuiParis, enVente } from '../shared/logique';
import type { Artiste, Concert } from '../shared/types';
import { Etiquettes, Portrait } from './Elements';
import { compteARebours, dateComplete, estFestival, heure, quandVente } from './format';
import { IconeBillet, IconeCalendrier, IconeCloche, IconeFermer, IconeHorloge, IconeItineraire, IconeLieu } from './Icones';
import { type Ville, distanceDe } from './lieux';

export function Fiche({
  c,
  artiste,
  maVille,
  rappelJours,
  enCours,
  basculer,
  fermer,
}: {
  c: Concert;
  artiste?: Artiste;
  maVille: Ville;
  rappelJours: number;
  enCours: boolean;
  basculer: () => void;
  fermer: () => void;
}) {
  const [sortie, setSortie] = useState(false);

  const partir = () => {
    setSortie(true);
    setTimeout(fermer, 240);
  };

  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && partir();
    window.addEventListener('keydown', touche);
    return () => {
      document.body.style.overflow = avant;
      window.removeEventListener('keydown', touche);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maintenant = new Date();
  const image = c.image ?? artiste?.image;
  const km = distanceDe(c, maVille);
  const ventes = (c.ventes ?? []).filter((v) => !v.fin || Date.parse(v.fin) > maintenant.getTime());
  const itineraire = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [c.salle, c.ville].filter(Boolean).join(', '),
  )}`;

  // Rendue directement dans <body> : le contenu animé de l'onglet ne doit ni la recouvrir ni la décaler.
  return createPortal(
    <div className={`fond-fiche${sortie ? ' sortie' : ''}`} onClick={partir}>
      <section className="fiche" role="dialog" aria-modal aria-label={c.artisteNom} onClick={(e) => e.stopPropagation()}>
        <div className="fiche-visuel">
          {image ? <img src={image} alt="" /> : <Portrait artiste={artiste} nom={c.artisteNom} taille={96} />}
          <div className="voile" />
          <button className="fermer" onClick={partir} aria-label="Fermer">
            <IconeFermer />
          </button>
        </div>

        <div className="fiche-corps">
          <p className="surtitre or">{compteARebours(c.date, aujourdhuiParis(maintenant))}</p>
          <h2>{c.artisteNom}</h2>
          {c.titre && c.titre.toLowerCase() !== c.artisteNom.toLowerCase() && (
            <p className="sous-titre">{estFestival(c.titre) ? `Au festival ${c.titre}` : c.titre}</p>
          )}
          <Etiquettes c={c} maintenant={maintenant} />

          <ul className="infos">
            <li>
              <IconeCalendrier />
              <span>{dateComplete(c.date)}</span>
            </li>
            {c.heure && (
              <li>
                <IconeHorloge />
                <span>À {heure(c.heure)}</span>
              </li>
            )}
            <li>
              <IconeLieu />
              <span>
                {[c.salle, c.ville].filter(Boolean).join(', ')}
                {km !== undefined && <small>à {Math.round(km)} km de {maVille.nom}</small>}
              </span>
            </li>
          </ul>

          {(ventes.length > 0 || enVente(c, maintenant)) && (
            <div className="billetterie">
              <h3>Billetterie</h3>
              {ventes.map((v) => (
                <p key={v.debut + v.nom}>
                  <IconeBillet taille={18} />
                  <span>
                    {v.nom}
                    <small>
                      {Date.parse(v.debut) > maintenant.getTime() ? `ouvre ${quandVente(v.debut)}` : 'ouverte'}
                    </small>
                  </span>
                </p>
              ))}
              <p className="discret">Une alerte à l'annonce, puis 24 h et 1 h avant chaque ouverture.</p>
            </div>
          )}

          <div className="fiche-actions">
            {c.url && (
              <a className="bouton principal" href={c.url} target="_blank" rel="noreferrer">
                <IconeBillet />
                Billets
              </a>
            )}
            {!c.annule && (
              <button className={`secondaire${c.suivi ? ' suivi' : ''}`} disabled={enCours} onClick={basculer} aria-pressed={c.suivi}>
                <IconeCloche pleine={c.suivi} />
                {c.suivi ? 'Suivi' : 'Suivre'}
              </button>
            )}
            <a className="bouton secondaire" href={itineraire} target="_blank" rel="noreferrer">
              <IconeItineraire />
              Itinéraire
            </a>
          </div>
          {!c.annule && (
            <p className="discret centre">
              {c.suivi ? `Rappel ${rappelJours} jours avant le concert.` : `Suivre : un rappel ${rappelJours} jours avant.`}
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
