// Logique pure (sans réseau ni KV) : facile à tester.
import type { Artiste, Concert, Donnees, Etat, Source, Suggestion } from '../shared/types';

/** Concert tel que lu dans une source, avant rattachement à nos données. */
export interface ConcertTrouve {
  titre: string;
  date: string;
  heure?: string;
  ville: string;
  salle: string;
  pays: string;
  url?: string;
  source: Source;
  annule?: boolean;
}

export function donneesVides(): Donnees {
  return { artistes: [], concerts: {} };
}

export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cleConcert(artisteId: string, date: string, ville: string): string {
  return `${artisteId}|${date}|${normaliser(ville)}`;
}

/** Date du jour à Paris, au format AAAA-MM-JJ. */
export function aujourdhuiParis(maintenant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(maintenant);
}

export function joursEntre(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export function dateLongue(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

export function listePays(valeur: string | undefined): string[] {
  const pays = (valeur ?? 'FR')
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter((p) => /^[A-Z]{2}$/.test(p));
  return pays.length ? pays : ['FR'];
}

/** Lit une réponse "events" de l'API Ticketmaster Discovery. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lireTicketmaster(json: any, artiste: Artiste): ConcertTrouve[] {
  const evenements: any[] = json?._embedded?.events ?? [];
  const nomArtiste = normaliser(artiste.nom);
  const resultat: ConcertTrouve[] = [];
  for (const e of evenements) {
    const date: string | undefined = e?.dates?.start?.localDate;
    if (!date) continue;
    const titre: string = e?.name ?? artiste.nom;
    // Ticketmaster publie parfois parkings, vestiaires ou packs VIP comme des "événements".
    if (/parking|stationnement|vestiaire|navette/i.test(titre)) continue;
    if (!artiste.tmId) {
      // Recherche par nom : on vérifie que l'artiste apparaît bien dans l'événement.
      const noms = [titre, ...((e?._embedded?.attractions ?? []) as any[]).map((a) => a?.name ?? '')];
      if (!noms.some((n) => normaliser(n).includes(nomArtiste))) continue;
    }
    const salle = e?._embedded?.venues?.[0];
    resultat.push({
      titre,
      date,
      heure: typeof e?.dates?.start?.localTime === 'string' ? e.dates.start.localTime.slice(0, 5) : undefined,
      ville: salle?.city?.name ?? '',
      salle: salle?.name ?? '',
      pays: salle?.country?.countryCode ?? '',
      url: e?.url,
      source: 'ticketmaster',
      annule: e?.dates?.status?.code === 'cancelled',
    });
  }
  return resultat;
}

const NOMS_PAYS: Record<string, string[]> = {
  FR: ['france'],
  BE: ['belgium', 'belgique'],
  CH: ['switzerland', 'suisse'],
  LU: ['luxembourg'],
  MC: ['monaco'],
  CA: ['canada'],
};

/** Lit une réponse "events" de l'API Bandsintown, en gardant les pays demandés. */
export function lireBandsintown(json: any, artiste: Artiste, pays: string[]): ConcertTrouve[] {
  if (!Array.isArray(json)) return [];
  const resultat: ConcertTrouve[] = [];
  for (const e of json) {
    const dateHeure: string = e?.datetime ?? '';
    const date = dateHeure.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const paysNom = normaliser(e?.venue?.country ?? '');
    const code = pays.find((p) => (NOMS_PAYS[p] ?? [p.toLowerCase()]).includes(paysNom));
    if (!code) continue;
    const heure = dateHeure.slice(11, 16);
    resultat.push({
      titre: e?.title || artiste.nom,
      date,
      heure: /^\d{2}:\d{2}$/.test(heure) && heure !== '00:00' ? heure : undefined,
      ville: e?.venue?.city ?? '',
      salle: e?.venue?.name ?? '',
      pays: code,
      url: e?.offers?.[0]?.url ?? e?.url,
      source: 'bandsintown',
    });
  }
  return resultat;
}

/** Lit une réponse "attractions" de Ticketmaster (suggestions d'artistes). */
export function lireSuggestions(json: any): Suggestion[] {
  const attractions: any[] = json?._embedded?.attractions ?? [];
  return attractions.map((a) => {
    const images: any[] = a?.images ?? [];
    const carree = images
      .filter((i) => i?.ratio === '1_1' || i?.ratio === '4_3')
      .sort((x, y) => (x.width ?? 0) - (y.width ?? 0))[0];
    return {
      tmId: String(a.id),
      nom: String(a.name),
      image: carree?.url ?? images[0]?.url,
      genre: a?.classifications?.[0]?.genre?.name,
      nbConcerts: a?.upcomingEvents?._total,
    };
  });
}

/**
 * Ajoute les concerts trouvés pour un artiste. Renvoie les concerts nouveaux.
 * dejaConnus = true à l'ajout d'un artiste : ses dates actuelles ne déclenchent pas de mail.
 */
export function fusionner(
  donnees: Donnees,
  artiste: Artiste,
  trouves: ConcertTrouve[],
  opts: { maintenant: string; aujourdhui: string; dejaConnus: boolean },
): Concert[] {
  const nouveaux: Concert[] = [];
  for (const t of trouves) {
    if (t.date < opts.aujourdhui) continue;
    const id = cleConcert(artiste.id, t.date, t.ville);
    const existant = donnees.concerts[id];
    if (existant) {
      // Mise à jour des infos, sans toucher au suivi ni aux mails envoyés.
      if (existant.source === t.source) {
        existant.titre = t.titre;
        existant.heure = t.heure ?? existant.heure;
        existant.salle = t.salle || existant.salle;
        existant.url = t.url ?? existant.url;
        existant.annule = t.annule;
      } else if (!existant.url && t.url) {
        existant.url = t.url;
      }
      continue;
    }
    const concert: Concert = {
      ...t,
      id,
      artisteId: artiste.id,
      artisteNom: artiste.nom,
      trouveLe: opts.maintenant,
      notifie: opts.dejaConnus,
      suivi: false,
      rappelEnvoye: false,
    };
    donnees.concerts[id] = concert;
    nouveaux.push(concert);
  }
  return nouveaux;
}

export function purgerPasses(donnees: Donnees, aujourdhui: string): void {
  for (const [id, c] of Object.entries(donnees.concerts)) {
    if (c.date < aujourdhui) delete donnees.concerts[id];
  }
}

export function trier(concerts: Concert[]): Concert[] {
  return [...concerts].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.heure ?? '').localeCompare(b.heure ?? '') ||
      a.artisteNom.localeCompare(b.artisteNom),
  );
}

/** Nouvelles dates pas encore annoncées par mail. */
export function aAnnoncer(donnees: Donnees, aujourdhui: string): Concert[] {
  return trier(
    Object.values(donnees.concerts).filter((c) => !c.notifie && !c.annule && c.date >= aujourdhui),
  );
}

/** Concerts suivis qui approchent et dont le rappel n'est pas encore parti. */
export function aRappeler(donnees: Donnees, aujourdhui: string, rappelJours: number): Concert[] {
  return trier(
    Object.values(donnees.concerts).filter((c) => {
      if (!c.suivi || c.rappelEnvoye || c.annule) return false;
      const j = joursEntre(aujourdhui, c.date);
      return j >= 0 && j <= rappelJours;
    }),
  );
}

/** Artistes à vérifier ce tour-ci : les moins récemment vérifiés d'abord. */
export function artistesAVerifier(artistes: Artiste[], max: number): Artiste[] {
  return [...artistes]
    .sort((a, b) => (a.verifieLe ?? '').localeCompare(b.verifieLe ?? ''))
    .slice(0, Math.max(1, max));
}

export function versEtat(donnees: Donnees, rappelJours: number, aujourdhui = aujourdhuiParis()): Etat {
  return {
    artistes: [...donnees.artistes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    concerts: trier(Object.values(donnees.concerts).filter((c) => c.date >= aujourdhui)),
    derniereVerif: donnees.derniereVerif,
    dernierBilan: donnees.dernierBilan,
    rappelJours,
  };
}

// ---------- Mails ----------

export interface Mail {
  sujet: string;
  html: string;
  texte: string;
}

function echapper(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function lieu(c: Concert): string {
  return [c.salle, c.ville].filter(Boolean).join(', ');
}

function enveloppe(titre: string, corps: string, appUrl?: string): string {
  const lien = appUrl
    ? `<p style="margin-top:24px"><a href="${echapper(appUrl)}" style="color:#5b21b6">Ouvrir mes concerts</a></p>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1f2937;max-width:560px">
<h2 style="color:#5b21b6">${echapper(titre)}</h2>${corps}${lien}</div>`;
}

function blocConcert(c: Concert): string {
  const heure = c.heure ? ` à ${c.heure.replace(':', 'h')}` : '';
  const billets = c.url
    ? `<br><a href="${echapper(c.url)}" style="color:#5b21b6">Voir les billets</a>`
    : '';
  return `<p style="margin:0 0 16px"><strong>${echapper(c.artisteNom)}</strong><br>
${echapper(dateLongue(c.date))}${heure}<br>${echapper(lieu(c))}${billets}</p>`;
}

export function mailNouveaux(concerts: Concert[], appUrl?: string): Mail {
  const premier = concerts[0]!;
  const sujet =
    concerts.length === 1
      ? `Nouveau concert : ${premier.artisteNom} à ${premier.ville || 'une date à venir'}`
      : `${concerts.length} nouveaux concerts annoncés`;
  const titre = concerts.length === 1 ? 'Une nouvelle date est annoncée' : 'De nouvelles dates sont annoncées';
  const html = enveloppe(titre, concerts.map(blocConcert).join('\n'), appUrl);
  const texte = [
    titre,
    '',
    ...concerts.map(
      (c) => `${c.artisteNom} : ${dateLongue(c.date)}${c.heure ? ` à ${c.heure}` : ''}, ${lieu(c)}${c.url ? `\n${c.url}` : ''}`,
    ),
    appUrl ? `\n${appUrl}` : '',
  ].join('\n');
  return { sujet, html, texte };
}

export function mailRappel(c: Concert, jours: number, appUrl?: string): Mail {
  const quand = jours === 0 ? "aujourd'hui" : jours === 1 ? 'demain' : `dans ${jours} jours`;
  const sujet = `Rappel : ${c.artisteNom} ${quand}`;
  const titre = `${c.artisteNom}, c'est ${quand} !`;
  const html = enveloppe(titre, blocConcert(c), appUrl);
  const texte = `${titre}\n\n${dateLongue(c.date)}${c.heure ? ` à ${c.heure}` : ''}, ${lieu(c)}${c.url ? `\n${c.url}` : ''}`;
  return { sujet, html, texte };
}
