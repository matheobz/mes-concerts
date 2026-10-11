import type { Etat, Suggestion } from '../shared/types';

const CLE_CODE = 'concerts.code';
const CLE_ETAT = 'concerts.etat';

export class CodeRefuse extends Error {}

export function lireCode(): string {
  // Le code peut arriver dans le lien : https://.../?code=XXXX (on le garde puis on le retire de l'adresse).
  const url = new URL(window.location.href);
  const dansLien = url.searchParams.get('code');
  if (dansLien) {
    localStorage.setItem(CLE_CODE, dansLien);
    url.searchParams.delete('code');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    return dansLien;
  }
  return localStorage.getItem(CLE_CODE) ?? '';
}

export function enregistrerCode(code: string): void {
  localStorage.setItem(CLE_CODE, code);
}

export function oublierCode(): void {
  localStorage.removeItem(CLE_CODE);
}

/** Dernier état connu, pour afficher quelque chose même hors connexion. */
export function etatEnCache(): Etat | null {
  try {
    const brut = localStorage.getItem(CLE_ETAT);
    return brut ? (JSON.parse(brut) as Etat) : null;
  } catch {
    return null;
  }
}

function memoriser(etat: Etat): Etat {
  localStorage.setItem(CLE_ETAT, JSON.stringify(etat));
  return etat;
}

async function appel<T>(code: string, chemin: string, options: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(chemin, {
      ...options,
      headers: { 'Content-Type': 'application/json', 'X-Code': code, ...(options.headers ?? {}) },
    });
  } catch {
    throw new Error('Pas de connexion internet. Réessayez dans un moment.');
  }
  if (r.status === 401) throw new CodeRefuse('Code incorrect');
  const donnees = (await r.json().catch(() => ({}))) as T & { erreur?: string };
  if (!r.ok) throw new Error(donnees.erreur ?? `Erreur ${r.status}`);
  return donnees;
}

export const api = {
  etat: (code: string) => appel<Etat>(code, '/api/etat').then(memoriser),

  rechercher: (code: string, q: string) =>
    appel<Suggestion[]>(code, `/api/recherche?q=${encodeURIComponent(q)}`),

  ajouterArtiste: async (code: string, nom: string, tmId?: string, image?: string) => {
    const r = await appel<{ etat: Etat; trouves: number; avertissement?: string }>(code, '/api/artistes', {
      method: 'POST',
      body: JSON.stringify({ nom, tmId, image }),
    });
    memoriser(r.etat);
    return r;
  },

  retirerArtiste: (code: string, id: string) =>
    appel<Etat>(code, `/api/artistes/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(memoriser),

  suivre: (code: string, id: string, suivi: boolean) =>
    appel<Etat>(code, '/api/suivi', { method: 'POST', body: JSON.stringify({ id, suivi }) }).then(memoriser),

  verifier: async (code: string) => {
    const r = await appel<{ bilan: string; etat: Etat }>(code, '/api/verifier', { method: 'POST' });
    memoriser(r.etat);
    return r;
  },

  mailTest: (code: string) => appel<{ ok: boolean }>(code, '/api/test-mail', { method: 'POST' }),
};
