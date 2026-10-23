import { describe, expect, it } from 'vitest';
import {
  donneesVides,
  enParis,
  fusionner,
  idsRappelsVente,
  lireTicketmaster,
  notifsNouveaux,
  notifsRappelsVentes,
  notifsVentes,
  prochaineVente,
  ventesAAnnoncer,
  ventesAProgrammer,
} from '../shared/logique';
import type { Donnees, Notif } from '../shared/types';
import { verifier } from '../shared/verification';
import { evenementTM, vianney } from './fixtures';

// Ouverture le vendredi 30 octobre 2026 à 10h, heure de Paris (heure d'hiver : 9h UTC).
const OUVERTURE = '2026-10-30T09:00:00Z';
const ventesTM = {
  sales: {
    public: { startDateTime: OUVERTURE, endDateTime: '2027-03-01T19:00:00Z' },
    presales: [{ name: 'Prévente fan club', startDateTime: '2026-10-28T09:00:00Z', endDateTime: '2026-10-29T22:00:00Z' }],
  },
};
const lieuTM = {
  _embedded: {
    venues: [
      {
        name: 'Zénith Nantes Métropole',
        city: { name: 'Saint-Herblain' },
        country: { countryCode: 'FR' },
        postalCode: '44800',
        location: { latitude: '47.2290', longitude: '-1.6303' },
      },
    ],
    attractions: [{ name: 'Vianney' }],
  },
  images: [
    { ratio: '16_9', width: 205, url: 'https://img/petite.jpg' },
    { ratio: '16_9', width: 1024, url: 'https://img/grande.jpg' },
    { ratio: '16_9', width: 640, url: 'https://img/moyenne.jpg' },
  ],
};

const lundi = new Date('2026-10-26T08:00:00Z');

describe('lecture Ticketmaster : billetterie et lieu', () => {
  it('lit les ouvertures, le code postal, la position et une affiche', () => {
    const [c] = lireTicketmaster({ _embedded: { events: [evenementTM('e1', '2027-02-14', 'x', { ...lieuTM, ...ventesTM })] } }, vianney);
    expect(c!.cp).toBe('44800');
    expect(c!.lat).toBeCloseTo(47.229);
    expect(c!.lon).toBeCloseTo(-1.6303);
    expect(c!.image).toBe('https://img/moyenne.jpg');
    expect(c!.ventes!.map((v) => v.nom)).toEqual(['Prévente fan club', 'Mise en vente']);
  });

  it('ignore une ouverture « à déterminer »', () => {
    const [c] = lireTicketmaster(
      { _embedded: { events: [evenementTM('e1', '2027-02-14', 'Nantes', { sales: { public: { startDateTime: OUVERTURE, startTBD: true } } })] } },
      vianney,
    );
    expect(c!.ventes).toBeUndefined();
  });

  it('prochaine ouverture : la première pas encore commencée', () => {
    const [c] = lireTicketmaster({ _embedded: { events: [evenementTM('e1', '2027-02-14', 'x', ventesTM)] } }, vianney);
    expect(prochaineVente(c!, lundi)!.nom).toBe('Prévente fan club');
    expect(prochaineVente(c!, new Date('2026-10-29T12:00:00Z'))!.debut).toBe(OUVERTURE);
    expect(prochaineVente(c!, new Date('2026-11-01T00:00:00Z'))).toBeUndefined();
  });

  it("donne l'heure de Paris d'un instant", () => {
    expect(enParis(OUVERTURE)).toEqual({ date: '2026-10-30', hm: '10:00' });
    expect(enParis('2026-07-01T08:00:00Z').hm).toBe('10:00');
  });
});

function donneesAvecTournee(dejaConnus: boolean): Donnees {
  const d = donneesVides();
  d.artistes.push(vianney);
  const evts = ['Nantes', 'Rennes', 'Angers'].map((v, i) =>
    evenementTM(`e${i}`, `2027-02-1${i}`, v, { sales: { public: { startDateTime: OUVERTURE } } }),
  );
  const trouves = lireTicketmaster({ _embedded: { events: evts } }, vianney);
  fusionner(d, vianney, trouves, { maintenant: lundi.toISOString(), aujourdhui: '2026-10-26', dejaConnus });
  return d;
}

describe('notifications de billetterie', () => {
  it("une tournée qui ouvre à la même heure = une seule annonce", () => {
    const d = donneesAvecTournee(false);
    for (const c of Object.values(d.concerts)) c.notifie = true;
    const aAnnoncer = ventesAAnnoncer(d, '2026-10-26', lundi);
    expect(aAnnoncer).toHaveLength(3);
    const n = notifsVentes(aAnnoncer, '2026-10-26', lundi);
    expect(n).toHaveLength(1);
    expect(n[0]!.titre).toBe('Billetterie Vianney : vendredi 30 octobre à 10h');
    expect(n[0]!.texte).toBe('3 dates : Nantes, Rennes, Angers');
  });

  it("à l'ajout d'un artiste, pas d'annonce mais des rappels", () => {
    const d = donneesAvecTournee(true);
    expect(ventesAAnnoncer(d, '2026-10-26', lundi)).toHaveLength(0);
    expect(ventesAProgrammer(d, '2026-10-26', lundi)).toHaveLength(3);
  });

  it('programme les rappels 24 h et 1 h avant, une fois par tournée', () => {
    const d = donneesAvecTournee(true);
    const n = notifsRappelsVentes(ventesAProgrammer(d, '2026-10-26', lundi), lundi);
    expect(n.map((x) => [x.titre, x.a])).toEqual([
      ['Billetterie Vianney demain à 10h', '2026-10-29T09:00:00.000Z'],
      ['Billetterie Vianney dans 1 heure', '2026-10-30T08:00:00.000Z'],
    ]);
    expect(idsRappelsVente('Vianney', OUVERTURE)).toEqual(n.map((x) => x.id));
  });

  it("ne programme pas un rappel dont l'heure est passée", () => {
    const d = donneesAvecTournee(true);
    const tard = new Date('2026-10-29T20:00:00Z');
    const n = notifsRappelsVentes(ventesAProgrammer(d, '2026-10-29', tard), tard);
    expect(n.map((x) => x.titre)).toEqual(['Billetterie Vianney dans 1 heure']);
  });

  it('la notification de nouvelle date mentionne la billetterie', () => {
    const d = donneesAvecTournee(false);
    const [c] = Object.values(d.concerts);
    const [n] = notifsNouveaux([c!], '2026-10-26', lundi);
    expect(n!.texte).toContain('Billetterie vendredi 30 octobre à 10h');
  });
});

describe('vérification complète', () => {
  it("annonce une nouvelle date une fois, programme ses rappels, puis ne refait rien", async () => {
    let stock = donneesVides();
    stock.artistes.push(vianney);
    const envoyees: Notif[] = [];
    const ports = {
      lire: async () => JSON.parse(JSON.stringify(stock)) as Donnees,
      ecrire: async (d: Donnees) => {
        stock = d;
      },
      chercher: async () =>
        lireTicketmaster(
          { _embedded: { events: [evenementTM('e1', '2027-02-14', 'Nantes', { sales: { public: { startDateTime: OUVERTURE } } })] } },
          vianney,
        ),
      notifier: async (n: Notif[]) => {
        envoyees.push(...n);
      },
      maintenant: () => lundi,
    };
    await verifier(ports, { reseau: true });
    expect(envoyees.map((n) => n.titre)).toEqual([
      'Nouveau concert : Vianney',
      'Billetterie Vianney demain à 10h',
      'Billetterie Vianney dans 1 heure',
    ]);
    envoyees.length = 0;
    await verifier(ports, { reseau: true });
    expect(envoyees).toHaveLength(0);
  });
});
