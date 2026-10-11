// Génère les icônes PNG de l'appli (fond violet, double croche blanche), sans dépendance.
// Usage : npm run icones
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FOND = [0x5b, 0x21, 0xb6];
const NOTE = [0xff, 0xff, 0xff];

// Formes en coordonnées normalisées (0..1).
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

function png(taille) {
  const ss = 4; // sur-échantillonnage pour lisser les bords
  const lignes = Buffer.alloc(taille * (taille * 3 + 1));
  for (let py = 0; py < taille; py++) {
    const debut = py * (taille * 3 + 1);
    lignes[debut] = 0;
    for (let px = 0; px < taille; px++) {
      let couverture = 0;
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++)
          if (dansNote((px + (sx + 0.5) / ss) / taille, (py + (sy + 0.5) / ss) / taille)) couverture++;
      const a = couverture / (ss * ss);
      for (let k = 0; k < 3; k++) lignes[debut + 1 + px * 3 + k] = Math.round(FOND[k] * (1 - a) + NOTE[k] * a);
    }
  }
  const entete = Buffer.alloc(13);
  entete.writeUInt32BE(taille, 0);
  entete.writeUInt32BE(taille, 4);
  entete[8] = 8; // 8 bits
  entete[9] = 2; // RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc('IHDR', entete),
    bloc('IDAT', deflateSync(lignes, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

for (const [nom, taille] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(new URL(`../public/${nom}`, import.meta.url), png(taille));
  console.log(`public/${nom}`);
}
