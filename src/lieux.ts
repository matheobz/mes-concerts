// Où ont lieu les concerts : région (d'après le code postal) et distance depuis la ville de Delphine.
import type { Concert } from '../shared/types';

const REGIONS: Record<string, string[]> = {
  'Auvergne-Rhône-Alpes': ['01', '03', '07', '15', '26', '38', '42', '43', '63', '69', '73', '74'],
  'Bourgogne-Franche-Comté': ['21', '25', '39', '58', '70', '71', '89', '90'],
  Bretagne: ['22', '29', '35', '56'],
  'Centre-Val de Loire': ['18', '28', '36', '37', '41', '45'],
  Corse: ['20'],
  'Grand Est': ['08', '10', '51', '52', '54', '55', '57', '67', '68', '88'],
  'Hauts-de-France': ['02', '59', '60', '62', '80'],
  'Île-de-France': ['75', '77', '78', '91', '92', '93', '94', '95'],
  Normandie: ['14', '27', '50', '61', '76'],
  'Nouvelle-Aquitaine': ['16', '17', '19', '23', '24', '33', '40', '47', '64', '79', '86', '87'],
  Occitanie: ['09', '11', '12', '30', '31', '32', '34', '46', '48', '65', '66', '81', '82'],
  'Pays de la Loire': ['44', '49', '53', '72', '85'],
  "Provence-Alpes-Côte d'Azur": ['04', '05', '06', '13', '83', '84'],
  'Outre-mer': ['97', '98'],
};

const PAR_DEPARTEMENT: Record<string, string> = {};
for (const [region, deps] of Object.entries(REGIONS)) for (const d of deps) PAR_DEPARTEMENT[d] = region;

export function region(c: Concert): string | undefined {
  if (c.pays && c.pays !== 'FR') return undefined;
  const cp = (c.cp ?? '').trim();
  return /^\d{5}$/.test(cp) ? PAR_DEPARTEMENT[cp.slice(0, 2)] : undefined;
}

export interface Ville {
  nom: string;
  lat: number;
  lon: number;
}

export const VILLES: Ville[] = [
  { nom: 'Nantes', lat: 47.2184, lon: -1.5536 },
  { nom: 'Angers', lat: 47.4784, lon: -0.5632 },
  { nom: 'Bordeaux', lat: 44.8378, lon: -0.5792 },
  { nom: 'Brest', lat: 48.3904, lon: -4.4861 },
  { nom: 'Caen', lat: 49.1829, lon: -0.3707 },
  { nom: 'Cholet', lat: 47.06, lon: -0.8794 },
  { nom: 'La Roche-sur-Yon', lat: 46.6705, lon: -1.426 },
  { nom: 'La Rochelle', lat: 46.1603, lon: -1.1511 },
  { nom: 'Laval', lat: 48.0706, lon: -0.7734 },
  { nom: 'Le Mans', lat: 48.0061, lon: 0.1996 },
  { nom: 'Lille', lat: 50.6292, lon: 3.0573 },
  { nom: 'Lyon', lat: 45.764, lon: 4.8357 },
  { nom: 'Marseille', lat: 43.2965, lon: 5.3698 },
  { nom: 'Montpellier', lat: 43.6108, lon: 3.8767 },
  { nom: 'Nice', lat: 43.7102, lon: 7.262 },
  { nom: 'Niort', lat: 46.3237, lon: -0.4648 },
  { nom: 'Paris', lat: 48.8566, lon: 2.3522 },
  { nom: 'Poitiers', lat: 46.5802, lon: 0.3404 },
  { nom: 'Rennes', lat: 48.1173, lon: -1.6778 },
  { nom: 'Rouen', lat: 49.4432, lon: 1.0999 },
  { nom: 'Saint-Nazaire', lat: 47.2735, lon: -2.2138 },
  { nom: 'Strasbourg', lat: 48.5734, lon: 7.7521 },
  { nom: 'Toulouse', lat: 43.6047, lon: 1.4442 },
  { nom: 'Tours', lat: 47.3941, lon: 0.6848 },
  { nom: 'Vannes', lat: 47.6582, lon: -2.7608 },
];

export const RAYONS = [50, 100, 200];

/** Distance à vol d'oiseau, en km. */
export function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function distanceDe(c: Concert, v: Ville): number | undefined {
  if (c.lat === undefined || c.lon === undefined) {
    // Position inconnue (concert enregistré avant cette version) : la ville elle-même, si on la connaît.
    const connue = VILLES.find((x) => x.nom.toLowerCase() === c.ville.trim().toLowerCase());
    return connue ? distance(connue, v) : undefined;
  }
  return distance({ lat: c.lat, lon: c.lon }, v);
}

// ---------- Préférence "ma ville" (gardée sur le téléphone) ----------

export interface PrefLieu {
  ville: string;
  rayon: number;
}

const CLE = 'mes-concerts.lieu';

export function lirePrefLieu(): PrefLieu {
  try {
    const p = JSON.parse(localStorage.getItem(CLE) ?? '');
    if (VILLES.some((v) => v.nom === p.ville) && RAYONS.includes(p.rayon)) return p;
  } catch {
    // Pas encore réglé.
  }
  return { ville: 'Nantes', rayon: 100 };
}

export function ecrirePrefLieu(p: PrefLieu): void {
  localStorage.setItem(CLE, JSON.stringify(p));
}

export function villeDe(p: PrefLieu): Ville {
  return VILLES.find((v) => v.nom === p.ville) ?? VILLES[0]!;
}
