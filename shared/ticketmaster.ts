// Appels à l'API Ticketmaster Discovery, utilisés par l'appli et par la tâche de fond.
// Uniquement fetch, sans URL ni Request : c'est tout ce qu'offre le moteur de la tâche de fond.
import type { Artiste, Suggestion } from './types';
import { type ConcertTrouve, adresse, lireSuggestions, lireTicketmaster } from './logique';

const BASE = 'https://app.ticketmaster.com/discovery/v2';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ticketmaster limite à 5 requêtes par seconde. */
export const PAUSE_TM = 250;

export class CleManquante extends Error {
  constructor() {
    super("Cette version de l'appli n'a pas de clé Ticketmaster. Il faut la reconstruire avec la clé.");
  }
}

async function lireJson(url: string): Promise<any> {
  const r = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (r.status === 401 || r.status === 403) throw new Error('Ticketmaster refuse la clé (vérifier la clé API).');
  if (r.status === 429) throw new Error('Trop de demandes à Ticketmaster aujourd’hui, nouvel essai plus tard.');
  if (r.status < 200 || r.status >= 300) throw new Error(`Ticketmaster a répondu ${r.status}`);
  const texte = await r.text();
  return texte ? JSON.parse(texte) : {};
}

export async function chercherConcerts(cle: string, artiste: Artiste, pays: string[]): Promise<ConcertTrouve[]> {
  if (!cle) throw new CleManquante();
  let resultat: ConcertTrouve[] = [];
  for (const code of pays) {
    const params: Record<string, string> = {
      apikey: cle,
      countryCode: code,
      size: '100',
      sort: 'date,asc',
      locale: '*',
    };
    if (artiste.tmId) {
      params.attractionId = artiste.tmId;
    } else {
      params.keyword = artiste.nom;
      params.classificationName = 'music';
    }
    const json = await lireJson(adresse(`${BASE}/events.json`, params));
    resultat = resultat.concat(lireTicketmaster(json, artiste));
    await pause(PAUSE_TM);
  }
  return resultat;
}

export async function suggererArtistes(cle: string, recherche: string): Promise<Suggestion[]> {
  if (!cle) throw new CleManquante();
  const json = await lireJson(
    adresse(`${BASE}/attractions.json`, {
      apikey: cle,
      keyword: recherche,
      size: '8',
      locale: '*',
      classificationName: 'music',
    }),
  );
  return lireSuggestions(json);
}
