// Génère toutes les images de l'appli (fond nuit, double croche dorée), sans dépendance :
//  - public/ : icônes de la version web,
//  - android/... : icône du lanceur (classique, ronde, adaptative), petite icône des notifications,
//    écran de démarrage.
// Usage : npm run icones
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';

const NUIT = [0x0b, 0x0a, 0x10];
const OR = [0xdc, 0xb8, 0x74];
const BLANC = [0xff, 0xff, 0xff];

// ---------- La note, en coordonnées normalisées (0..1) ----------

function dansEllipse(x, y, cx, cy, rx, ry, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  const u = (dx * c + dy * s) / rx;
  const v = (-dx * s + dy * c) / ry;
  return u * u + v * v <= 1;
}

function dansPolygone(x, y, pts) {
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

const angle = -0.35;
const tetes = [
  [0.34, 0.69],
  [0.66, 0.61],
];
const rx = 0.105;
const ry = 0.075;
const epaisseur = 0.045;
// Bord droit des têtes, où montent les hampes.
const hampes = tetes.map(([cx, cy]) => [cx + rx * Math.cos(angle) - epaisseur, cy + rx * Math.sin(angle)]);
const hautG = 0.27;
const hautD = 0.19;
const poutre = 0.085;

function dansNote(x, y) {
  if (tetes.some(([cx, cy]) => dansEllipse(x, y, cx, cy, rx, ry, angle))) return true;
  const [[xg, yg], [xd, yd]] = hampes;
  if (x >= xg && x <= xg + epaisseur && y >= hautG && y <= yg) return true;
  if (x >= xd && x <= xd + epaisseur && y >= hautD && y <= yd) return true;
  return dansPolygone(x, y, [
    [xg, hautG],
    [xd + epaisseur, hautD],
    [xd + epaisseur, hautD + poutre],
    [xg, hautG + poutre],
  ]);
}

// ---------- PNG (RVBA) ----------

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, donnees) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), donnees]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}

/**
 * Dessine une image. fond : couleur RVB, ou null pour un fond transparent ; rond : fond en disque ;
 * note : carré (x, y, taille en pixels) dans lequel la note est dessinée.
 */
function dessiner(largeur, hauteur, { fond, rond = false, note, couleur = BLANC }) {
  const ss = 4; // sur-échantillonnage pour lisser les bords
  const rayon = Math.min(largeur, hauteur) * 0.5;
  const lignes = Buffer.alloc(hauteur * (largeur * 4 + 1));
  for (let py = 0; py < hauteur; py++) {
    const debut = py * (largeur * 4 + 1);
    lignes[debut] = 0;
    for (let px = 0; px < largeur; px++) {
      let nNote = 0;
      let nFond = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = px + (sx + 0.5) / ss;
          const y = py + (sy + 0.5) / ss;
          const dx = x - largeur * 0.5;
          const dy = y - hauteur * 0.5;
          const dansFond = !!fond && (!rond || dx * dx + dy * dy <= rayon * rayon);
          const nx = (x - note.x) / note.taille;
          const ny = (y - note.y) / note.taille;
          const n = nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1 && dansNote(nx, ny);
          if (n && (dansFond || !fond)) nNote++;
          else if (dansFond) nFond++;
        }
      }
      const aNote = nNote / (ss * ss);
      const aFond = nFond / (ss * ss);
      const alpha = aNote + aFond;
      const o = debut + 1 + px * 4;
      for (let k = 0; k < 3; k++) {
        lignes[o + k] = alpha ? Math.round((couleur[k] * aNote + (fond ? fond[k] : 0) * aFond) / alpha) : 0;
      }
      lignes[o + 3] = Math.round(alpha * 255);
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(largeur, 0);
  entete.writeUInt32BE(hauteur, 4);
  entete[8] = 8; // 8 bits
  entete[9] = 6; // RVBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(lignes, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

function ecrire(chemin, png) {
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, png);
  console.log(chemin);
}

/** Taille d'un PNG existant (pour remplacer les écrans de démarrage à l'identique). */
function taillePng(chemin) {
  const b = readFileSync(chemin);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

// ---------- Sorties ----------

const pleine = (t) => ({ x: 0, y: 0, taille: t });

// Version web.
for (const [nom, t] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  ecrire(join('public', nom), dessiner(t, t, { fond: NUIT, note: pleine(t), couleur: OR }));
}

// Android.
const RES = join('android', 'app', 'src', 'main', 'res');
const DENSITES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [densite, f] of Object.entries(DENSITES)) {
  // Icône du lanceur (Android 7) : carrée et ronde.
  const t = Math.round(48 * f);
  ecrire(join(RES, `mipmap-${densite}`, 'ic_launcher.png'), dessiner(t, t, { fond: NUIT, note: pleine(t), couleur: OR }));
  ecrire(join(RES, `mipmap-${densite}`, 'ic_launcher_round.png'), dessiner(t, t, { fond: NUIT, rond: true, note: pleine(t), couleur: OR }));

  // Icône adaptative (Android 8 et plus) : la note seule, dans la zone sûre (66 sur 108).
  const a = Math.round(108 * f);
  const zone = Math.round(66 * f);
  const marge = Math.round((a - zone) * 0.5);
  ecrire(
    join(RES, `mipmap-${densite}`, 'ic_launcher_foreground.png'),
    dessiner(a, a, { fond: null, note: { x: marge, y: marge, taille: zone }, couleur: OR }),
  );

  // Petite icône des notifications : blanche sur fond transparent (Android la colore lui-même).
  const n = Math.round(24 * f);
  ecrire(join(RES, `drawable-${densite}`, 'ic_stat_concert.png'), dessiner(n, n, { fond: null, note: pleine(n) }));
}

// Écrans de démarrage : fond nuit, note dorée au centre, mêmes tailles que ceux de Capacitor.
const ecrans = ['drawable'];
for (const d of Object.keys(DENSITES)) ecrans.push(`drawable-land-${d}`, `drawable-port-${d}`);
for (const dossier of ecrans) {
  const chemin = join(RES, dossier, 'splash.png');
  let largeur;
  let hauteur;
  try {
    [largeur, hauteur] = taillePng(chemin);
  } catch {
    continue; // pas de projet Android (npx cap add android pas encore lancé)
  }
  const t = Math.round(Math.min(largeur, hauteur) * 0.35);
  const note = { x: Math.round((largeur - t) * 0.5), y: Math.round((hauteur - t) * 0.5), taille: t };
  ecrire(chemin, dessiner(largeur, hauteur, { fond: NUIT, note, couleur: OR }));
}
