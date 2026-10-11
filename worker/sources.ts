// Appels réseau : Ticketmaster, Bandsintown, Resend.
import type { Artiste, Suggestion } from '../shared/types';
import { type ConcertTrouve, type Mail, lireBandsintown, lireSuggestions, lireTicketmaster } from './logique';
import type { Env } from './index';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ticketmaster limite à 5 requêtes par seconde. */
const PAUSE_TM = 250;

export async function chercherTicketmaster(env: Env, artiste: Artiste, pays: string[]): Promise<ConcertTrouve[]> {
  if (!env.TICKETMASTER_KEY) throw new Error('clé Ticketmaster manquante (secret TICKETMASTER_KEY)');
  const resultat: ConcertTrouve[] = [];
  for (const code of pays) {
    const u = new URL('https://app.ticketmaster.com/discovery/v2/events.json');
    u.searchParams.set('apikey', env.TICKETMASTER_KEY);
    u.searchParams.set('countryCode', code);
    u.searchParams.set('size', '100');
    u.searchParams.set('sort', 'date,asc');
    u.searchParams.set('locale', '*');
    if (artiste.tmId) {
      u.searchParams.set('attractionId', artiste.tmId);
    } else {
      u.searchParams.set('keyword', artiste.nom);
      u.searchParams.set('classificationName', 'music');
    }
    const r = await fetch(u.toString());
    if (!r.ok) throw new Error(`Ticketmaster a répondu ${r.status}`);
    resultat.push(...lireTicketmaster(await r.json(), artiste));
    await pause(PAUSE_TM);
  }
  return resultat;
}

export async function chercherBandsintown(env: Env, artiste: Artiste, pays: string[]): Promise<ConcertTrouve[]> {
  if (!env.BANDSINTOWN_APP_ID) return [];
  // Bandsintown demande un double encodage de certains caractères.
  const nom = encodeURIComponent(artiste.nom)
    .replace(/%2F/g, '%252F')
    .replace(/%3F/g, '%253F')
    .replace(/\*/g, '%252A')
    .replace(/%22/g, '%27C');
  const u = `https://rest.bandsintown.com/artists/${nom}/events?app_id=${encodeURIComponent(env.BANDSINTOWN_APP_ID)}&date=upcoming`;
  const r = await fetch(u, { headers: { Accept: 'application/json' } });
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`Bandsintown a répondu ${r.status}`);
  const texte = await r.text();
  if (!texte.trim()) return [];
  return lireBandsintown(JSON.parse(texte), artiste, pays);
}

/** Ticketmaster d'abord (prioritaire en cas de doublon), puis Bandsintown si configuré. */
export async function chercherConcerts(env: Env, artiste: Artiste, pays: string[]): Promise<ConcertTrouve[]> {
  const tm = await chercherTicketmaster(env, artiste, pays);
  let bit: ConcertTrouve[] = [];
  try {
    bit = await chercherBandsintown(env, artiste, pays);
  } catch {
    // Bandsintown est un complément : une panne ne doit pas bloquer Ticketmaster.
  }
  return [...tm, ...bit];
}

export async function suggererArtistes(env: Env, recherche: string): Promise<Suggestion[]> {
  if (!env.TICKETMASTER_KEY) throw new Error('clé Ticketmaster manquante (secret TICKETMASTER_KEY)');
  const u = new URL('https://app.ticketmaster.com/discovery/v2/attractions.json');
  u.searchParams.set('apikey', env.TICKETMASTER_KEY);
  u.searchParams.set('keyword', recherche);
  u.searchParams.set('size', '8');
  u.searchParams.set('locale', '*');
  u.searchParams.set('classificationName', 'music');
  const r = await fetch(u.toString());
  if (!r.ok) throw new Error(`Ticketmaster a répondu ${r.status}`);
  return lireSuggestions(await r.json());
}

export async function envoyerMail(env: Env, mail: Mail): Promise<void> {
  if (!env.RESEND_KEY) throw new Error('clé Resend manquante (secret RESEND_KEY)');
  const destinataires = (env.MAIL_DESTINATAIRE ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!destinataires.length) throw new Error('adresse manquante (secret MAIL_DESTINATAIRE)');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: env.MAIL_EXPEDITEUR || 'Mes concerts <onboarding@resend.dev>',
      to: destinataires,
      subject: mail.sujet,
      html: mail.html,
      text: mail.texte,
    }),
  });
  if (!r.ok) throw new Error(`Resend a répondu ${r.status} : ${(await r.text()).slice(0, 200)}`);
}
