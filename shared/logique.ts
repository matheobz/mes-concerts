// Logique pure (sans réseau ni stockage) : facile à tester.
// Attention : ce code tourne aussi dans la tâche de fond Android, un moteur JavaScript minimal
// (pas d'Intl, pas d'URL, pas de DOM). D'où les dates et les adresses construites à la main.
import type { Artiste, Concert, Donnees, Etat, Notif, Suggestion } from './types';

/** Concert tel que lu chez Ticketmaster, avant rattachement à nos données. */
export interface ConcertTrouve {
  titre: string;
  date: string;
  heure?: string;
  ville: string;
  salle: string;
  pays: string;
  url?: string;
  annule?: boolean;
}

export function donneesVides(): Donnees {
  return { artistes: [], concerts: {} };
}

export function normaliser(s: string): string {
  let t = s;
  try {
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  } catch {
    // Moteur sans normalize : on garde le texte tel quel.
  }
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function cleConcert(artisteId: string, date: string, ville: string): string {
  return `${artisteId}|${date}|${normaliser(ville)}`;
}

// ---------- Dates (sans Intl) ----------

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function deux(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Instant (ms) du dernier dimanche du mois à 01:00 UTC : changement d'heure européen. */
function changementHeure(annee: number, mois: number): number {
  const dernierJour = new Date(Date.UTC(annee, mois + 1, 0));
  return Date.UTC(annee, mois, dernierJour.getUTCDate() - dernierJour.getUTCDay(), 1);
}

/** Décalage de Paris par rapport à UTC, en heures (2 l'été, 1 l'hiver). */
export function decalageParis(d: Date): number {
  const annee = d.getUTCFullYear();
  const t = d.getTime();
  return t >= changementHeure(annee, 2) && t < changementHeure(annee, 9) ? 2 : 1;
}

/** Date (AAAA-MM-JJ) et heure (0-23) à Paris. */
export function maintenantParis(d: Date = new Date()): { date: string; heure: number } {
  const p = new Date(d.getTime() + decalageParis(d) * 3_600_000);
  return {
    date: `${p.getUTCFullYear()}-${deux(p.getUTCMonth() + 1)}-${deux(p.getUTCDate())}`,
    heure: p.getUTCHours(),
  };
}

export function aujourdhuiParis(d: Date = new Date()): string {
  return maintenantParis(d).date;
}

export function joursEntre(de: string, a: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

/** "samedi 14 novembre 2026". */
export function dateLongue(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "samedi 14 novembre", avec l'année seulement si ce n'est pas l'année en cours. */
export function dateCourte(date: string, aujourdhui: string): string {
  const longue = dateLongue(date);
  return date.slice(0, 4) === aujourdhui.slice(0, 4) ? longue.slice(0, longue.lastIndexOf(' ')) : longue;
}

export function heureFr(h?: string): string {
  return h ? h.replace(':', 'h') : '';
}

// ---------- Ticketmaster ----------

const PAS_UN_CONCERT = new RegExp('parking|stationnement|vestiaire|navette', 'i');

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
    // Ticketmaster publie parfois parkings, vestiaires ou navettes comme des "événements".
    if (PAS_UN_CONCERT.test(titre)) continue;
    if (!artiste.tmId) {
      // Recherche par nom : on vérifie que l'artiste apparaît bien dans l'événement.
      const attractions: any[] = e?._embedded?.attractions ?? [];
      const noms = [titre].concat(attractions.map((a) => a?.name ?? ''));
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
      annule: e?.dates?.status?.code === 'cancelled',
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

/** Construit une adresse avec paramètres (le moteur de la tâche de fond n'a pas URL). */
export function adresse(base: string, params: Record<string, string>): string {
  const morceaux = Object.keys(params).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k]!)}`);
  return `${base}?${morceaux.join('&')}`;
}

// ---------- Fusion, rappels ----------

/**
 * Ajoute les concerts trouvés pour un artiste. Renvoie les concerts nouveaux.
 * dejaConnus = true à l'ajout d'un artiste : ses dates actuelles ne déclenchent pas de notification.
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
      // Mise à jour des infos, sans toucher au suivi ni aux notifications envoyées.
      existant.titre = t.titre;
      existant.heure = t.heure ?? existant.heure;
      existant.salle = t.salle || existant.salle;
      existant.url = existant.url ?? t.url;
      existant.annule = t.annule;
      continue;
    }
    const concert: Concert = Object.assign({}, t, {
      id,
      artisteId: artiste.id,
      artisteNom: artiste.nom,
      trouveLe: opts.maintenant,
      notifie: opts.dejaConnus,
      suivi: false,
      rappelEnvoye: false,
    });
    donnees.concerts[id] = concert;
    nouveaux.push(concert);
  }
  return nouveaux;
}

export function purgerPasses(donnees: Donnees, aujourdhui: string): void {
  for (const id of Object.keys(donnees.concerts)) {
    if (donnees.concerts[id]!.date < aujourdhui) delete donnees.concerts[id];
  }
}

function comparer(a: Concert, b: Concert): number {
  const ha = a.heure ?? '';
  const hb = b.heure ?? '';
  return a.date.localeCompare(b.date) || ha.localeCompare(hb) || a.artisteNom.localeCompare(b.artisteNom);
}

export function trier(concerts: Concert[]): Concert[] {
  return concerts.slice().sort(comparer);
}

function liste(donnees: Donnees): Concert[] {
  return Object.keys(donnees.concerts).map((k) => donnees.concerts[k]!);
}

/** Nouvelles dates pas encore annoncées. */
export function aAnnoncer(donnees: Donnees, aujourdhui: string): Concert[] {
  return trier(liste(donnees).filter((c) => !c.notifie && !c.annule && c.date >= aujourdhui));
}

/** Concerts suivis qui approchent et dont le rappel n'est pas encore parti. */
export function aRappeler(donnees: Donnees, aujourdhui: string, rappelJours: number): Concert[] {
  return trier(
    liste(donnees).filter((c) => {
      if (!c.suivi || c.rappelEnvoye || c.annule) return false;
      const j = joursEntre(aujourdhui, c.date);
      return j >= 0 && j <= rappelJours;
    }),
  );
}

export function versEtat(donnees: Donnees, rappelJours: number, aujourdhui = aujourdhuiParis()): Etat {
  return {
    artistes: donnees.artistes.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    concerts: trier(liste(donnees).filter((c) => c.date >= aujourdhui)),
    derniereVerif: donnees.derniereVerif,
    dernierBilan: donnees.dernierBilan,
    derniereVerifFond: donnees.derniereVerifFond,
    rappelJours,
  };
}

// ---------- Notifications ----------

/** Identifiant de notification stable (entier positif 32 bits) tiré d'un texte. */
export function idNotif(texte: string): number {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = ((h << 5) + h + texte.charCodeAt(i)) | 0;
  return h & 0x7fffffff || 1;
}

function lieu(c: Concert): string {
  if (c.ville && c.salle) return `${c.ville} (${c.salle})`;
  return c.ville || c.salle;
}

function quand(c: Concert, aujourdhui: string): string {
  const h = c.heure ? ` à ${heureFr(c.heure)}` : '';
  return `${dateCourte(c.date, aujourdhui)}${h}`;
}

/** Jusqu'à 3 nouvelles dates : une notification chacune. Au-delà : une seule, récapitulative. */
export function notifsNouveaux(concerts: Concert[], aujourdhui: string): Notif[] {
  if (!concerts.length) return [];
  if (concerts.length <= 3) {
    return concerts.map((c) => ({
      id: idNotif(`nouveau|${c.id}`),
      titre: `Nouveau concert : ${c.artisteNom}`,
      texte: [quand(c, aujourdhui), lieu(c)].filter(Boolean).join(', '),
    }));
  }
  const noms: string[] = [];
  for (const c of concerts) if (!noms.includes(c.artisteNom)) noms.push(c.artisteNom);
  const debut = noms.slice(0, 3).join(', ');
  const reste = noms.length - 3;
  return [
    {
      id: idNotif(`nouveaux|${aujourdhui}|${concerts.length}`),
      titre: `${concerts.length} nouveaux concerts annoncés`,
      texte: reste > 0 ? `${debut} et ${reste} autre${reste > 1 ? 's' : ''}` : debut,
    },
  ];
}

export function notifRappel(c: Concert, aujourdhui: string): Notif {
  const j = joursEntre(aujourdhui, c.date);
  const dans = j <= 0 ? "c'est aujourd'hui" : j === 1 ? "c'est demain" : `dans ${j} jours`;
  return {
    id: idNotif(`rappel|${c.id}`),
    titre: `Rappel : ${c.artisteNom}, ${dans}`,
    texte: [quand(c, aujourdhui), lieu(c)].filter(Boolean).join(', '),
  };
}

// ---------- Sauvegarde (export / import) ----------

export const FORMAT_SAUVEGARDE = 'mes-concerts';

export interface Sauvegarde {
  format: typeof FORMAT_SAUVEGARDE;
  version: 1;
  exporteLe: string;
  donnees: Donnees;
}

export function versSauvegarde(donnees: Donnees, maintenant = new Date()): string {
  const s: Sauvegarde = { format: FORMAT_SAUVEGARDE, version: 1, exporteLe: maintenant.toISOString(), donnees };
  return JSON.stringify(s, null, 2);
}

const PAS_UNE_SAUVEGARDE = "Ce fichier n'est pas une sauvegarde de Mes concerts.";

function texteOu(v: unknown, defaut: string): string {
  return typeof v === 'string' ? v : defaut;
}

function texteOuRien(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Relit un fichier de sauvegarde. Lève une erreur en français si le fichier ne convient pas. */
export function lireSauvegarde(texte: string): Donnees {
  let brut: any;
  try {
    brut = JSON.parse(texte);
  } catch {
    throw new Error(PAS_UNE_SAUVEGARDE);
  }
  // On accepte aussi des données "nues" (copie directe du stockage).
  const d = brut?.format === FORMAT_SAUVEGARDE ? brut.donnees : brut;
  if (!d || !Array.isArray(d.artistes) || typeof d.concerts !== 'object' || d.concerts === null) {
    throw new Error(PAS_UNE_SAUVEGARDE);
  }
  const maintenant = new Date().toISOString();
  const artistes: Artiste[] = d.artistes
    .filter((a: any) => a && typeof a.id === 'string' && typeof a.nom === 'string')
    .map((a: any) => ({
      id: a.id,
      nom: a.nom,
      tmId: texteOuRien(a.tmId),
      image: texteOuRien(a.image),
      ajouteLe: texteOu(a.ajouteLe, maintenant),
      verifieLe: texteOuRien(a.verifieLe),
    }));
  const ids = new Set(artistes.map((a) => a.id));
  const concerts: Record<string, Concert> = {};
  for (const k of Object.keys(d.concerts)) {
    const c = d.concerts[k];
    if (!c || typeof c.date !== 'string' || !ids.has(c.artisteId)) continue;
    concerts[k] = {
      id: k,
      artisteId: c.artisteId,
      artisteNom: texteOu(c.artisteNom, ''),
      titre: texteOu(c.titre, texteOu(c.artisteNom, '')),
      date: c.date,
      heure: texteOuRien(c.heure),
      ville: texteOu(c.ville, ''),
      salle: texteOu(c.salle, ''),
      pays: texteOu(c.pays, ''),
      url: texteOuRien(c.url),
      annule: Boolean(c.annule),
      trouveLe: texteOu(c.trouveLe, maintenant),
      // Après un import, pas d'alerte pour des dates déjà connues.
      notifie: true,
      suivi: Boolean(c.suivi),
      rappelEnvoye: Boolean(c.rappelEnvoye),
    };
  }
  return {
    artistes,
    concerts,
    derniereVerif: texteOuRien(d.derniereVerif),
    dernierBilan: texteOuRien(d.dernierBilan),
  };
}

/** Lit les données stockées (texte JSON) ; données vides si absentes ou abîmées. */
export function lireStockage(texte: string | null | undefined): Donnees {
  if (!texte) return donneesVides();
  try {
    const d = JSON.parse(texte);
    if (d && Array.isArray(d.artistes) && d.concerts && typeof d.concerts === 'object') return d as Donnees;
  } catch {
    // Données illisibles : on repart de zéro plutôt que de planter.
  }
  return donneesVides();
}
