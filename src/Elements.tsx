// Petits éléments communs : portrait d'artiste, étiquettes d'un concert.
import type { CSSProperties } from 'react';
import { enVente, prochaineVente } from '../shared/logique';
import type { Artiste, Concert } from '../shared/types';
import { estFestival, estRecent, quandVente } from './format';
import { IconeBillet, IconeEtoile } from './Icones';

/** Portrait rond de l'artiste (ou ses initiales sur fond doré). */
export function Portrait({ artiste, nom, taille }: { artiste?: Artiste; nom: string; taille?: number }) {
  const style = taille ? ({ '--taille': `${taille}px` } as CSSProperties) : undefined;
  if (artiste?.image) return <img className="portrait" src={artiste.image} alt="" style={style} loading="lazy" />;
  const initiales = nom
    .split(/\s+/)
    .map((m) => m.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="portrait initiales" style={style} aria-hidden>
      {initiales}
    </span>
  );
}

/** Petites étiquettes d'un concert : annulé, nouveau, festival, billetterie. */
export function Etiquettes({ c, maintenant }: { c: Concert; maintenant: Date }) {
  const vente = prochaineVente(c, maintenant);
  return (
    <div className="etiquettes">
      {c.annule && <span className="etiquette rouge">Annulé</span>}
      {!c.annule && estRecent(c.trouveLe) && <span className="etiquette or">Nouveau</span>}
      {estFestival(c.titre) && (
        <span className="etiquette">
          <IconeEtoile taille={13} />
          {c.titre}
        </span>
      )}
      {!c.annule && vente && (
        <span className="etiquette vente">
          <IconeBillet taille={14} />
          {vente.nom === 'Mise en vente' ? 'Billets' : vente.nom} {quandVente(vente.debut)}
        </span>
      )}
      {!c.annule && !vente && enVente(c, maintenant) && <span className="etiquette vert">En vente</span>}
    </div>
  );
}
