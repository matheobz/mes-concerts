// Mise à jour de l'appli depuis l'appli : la dernière version publiée sur GitHub Releases,
// téléchargée puis installée par l'installateur Android (plugin maison MiseAJourPlugin.java).
import { App as AppCap } from '@capacitor/app';
import { registerPlugin } from '@capacitor/core';
import { surTelephone } from './natif';

/** Dépôt GitHub où sont publiées les versions (onglet Releases). */
export const DEPOT = 'matheobz/mes-concerts';
const NOM_APK = 'mes-concerts.apk';

interface MiseAJourPlugin {
  autorisation(): Promise<{ ok: boolean }>;
  demanderAutorisation(): Promise<void>;
  installer(o: { url: string }): Promise<void>;
  addListener(e: 'progression', f: (p: { pourcent: number }) => void): Promise<{ remove: () => Promise<void> }>;
}

const MiseAJour = registerPlugin<MiseAJourPlugin>('MiseAJour');

export interface Publication {
  version: string;
  url: string;
  notes: string;
  date: string;
}

/** "v2.1.0" ou "2.1.0" -> [2, 1, 0]. */
function chiffres(v: string): number[] {
  return v
    .replace(/^v/i, '')
    .split(/[.-]/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n));
}

/** true si a est plus récente que b. */
export function plusRecente(a: string, b: string): boolean {
  const x = chiffres(a);
  const y = chiffres(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d > 0;
  }
  return false;
}

/** Version installée ("v2.1.0"), ou '' dans le navigateur. */
export async function versionInstallee(): Promise<string> {
  if (!surTelephone) return '';
  try {
    return (await AppCap.getInfo()).version;
  } catch {
    return '';
  }
}

export async function dernierePublication(): Promise<Publication | null> {
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/releases/latest`, {
    // GitHub refuse les demandes sans User-Agent (le navigateur l'ignore et met le sien).
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'mes-concerts' },
  });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub a répondu ${r.status}`);
  const j = await r.json();
  const apk = (j.assets ?? []).find((a: { name?: string }) => a.name === NOM_APK);
  if (!apk) return null;
  return {
    version: String(j.tag_name),
    url: String(apk.browser_download_url),
    notes: String(j.body ?? ''),
    date: String(j.published_at ?? ''),
  };
}

/** La nouvelle version si elle est plus récente que celle installée, sinon null. */
export async function chercherMiseAJour(): Promise<Publication | null> {
  const [installee, derniere] = await Promise.all([versionInstallee(), dernierePublication()]);
  if (!derniere || !installee) return null;
  return plusRecente(derniere.version, installee) ? derniere : null;
}

// ---------- Vérification automatique (une fois par jour, à l'ouverture) ----------

const CLE_AUTO = 'mes-concerts.maj-auto';
const CLE_DERNIER = 'mes-concerts.maj-derniere';

export function majAuto(): boolean {
  return localStorage.getItem(CLE_AUTO) !== 'non';
}

export function setMajAuto(oui: boolean): void {
  localStorage.setItem(CLE_AUTO, oui ? 'oui' : 'non');
}

export async function chercherSiBesoin(): Promise<Publication | null> {
  if (!surTelephone || !majAuto()) return null;
  const dernier = Number(localStorage.getItem(CLE_DERNIER) ?? 0);
  if (Date.now() - dernier < 20 * 3_600_000) return null;
  try {
    const p = await chercherMiseAJour();
    localStorage.setItem(CLE_DERNIER, String(Date.now()));
    return p;
  } catch {
    return null;
  }
}

// ---------- Installation ----------

export type ResultatInstallation = 'installateur' | 'autorisation';

/**
 * Télécharge et ouvre l'installateur. Si Android n'autorise pas encore l'appli à installer,
 * ouvre le réglage et renvoie 'autorisation' : il faudra relancer après.
 */
export async function installer(p: Publication, progression: (pourcent: number) => void): Promise<ResultatInstallation> {
  if (!surTelephone) {
    window.open(p.url, '_blank');
    return 'installateur';
  }
  if (!(await MiseAJour.autorisation()).ok) {
    await MiseAJour.demanderAutorisation();
    return 'autorisation';
  }
  const ecoute = await MiseAJour.addListener('progression', (e) => progression(e.pourcent));
  try {
    await MiseAJour.installer({ url: p.url });
    return 'installateur';
  } finally {
    await ecoute.remove();
  }
}
