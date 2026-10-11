import { describe, expect, it } from 'vitest';
import type { Artiste } from '../shared/types';
import {
  aAnnoncer,
  aRappeler,
  artistesAVerifier,
  aujourdhuiParis,
  cleConcert,
  donneesVides,
  fusionner,
  joursEntre,
  lireBandsintown,
  lireSuggestions,
  lireTicketmaster,
  listePays,
  mailNouveaux,
  mailRappel,
  purgerPasses,
} from '../worker/logique';

const vianney: Artiste = { id: 'a1', nom: 'Vianney', tmId: 'K8vZ1', ajouteLe: '2026-10-01T00:00:00Z' };

function evenementTM(id: string, date: string, ville: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Vianney - Tournée',
    url: `https://www.ticketmaster.fr/${id}`,
    dates: { start: { localDate: date, localTime: '20:00:00' }, status: { code: 'onsale' } },
    _embedded: {
      venues: [{ name: `Salle de ${ville}`, city: { name: ville }, country: { countryCode: 'FR' } }],
      attractions: [{ name: 'Vianney' }],
    },
    ...extra,
  };
}

const reponseTM = {
  _embedded: {
    events: [
      evenementTM('e1', '2026-11-14', 'Lyon'),
      evenementTM('e2', '2026-12-02', 'Paris'),
      evenementTM('e3', '2026-12-02', 'Paris'), // doublon (autre billetterie)
      { ...evenementTM('e4', '2026-12-03', 'Paris'), name: 'Parking - Vianney' },
      { id: 'e5', name: 'Sans date', dates: { start: { dateTBD: true } } },
    ],
  },
};

describe('outils', () => {
  it('normalise les clés de concert', () => {
    expect(cleConcert('a1', '2026-11-14', 'Saint-Étienne')).toBe('a1|2026-11-14|saint etienne');
  });
  it('calcule la date de Paris et les écarts', () => {
    expect(aujourdhuiParis(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
    expect(joursEntre('2026-10-11', '2026-10-14')).toBe(3);
  });
  it('lit la liste des pays', () => {
    expect(listePays(undefined)).toEqual(['FR']);
    expect(listePays('fr, be,xx1')).toEqual(['FR', 'BE']);
  });
});

describe('Ticketmaster', () => {
  it('lit les événements et ignore parkings et dates inconnues', () => {
    const liste = lireTicketmaster(reponseTM, vianney);
    expect(liste).toHaveLength(3);
    expect(liste[0]).toMatchObject({ date: '2026-11-14', heure: '20:00', ville: 'Lyon', pays: 'FR', source: 'ticketmaster' });
  });
  it("filtre par nom quand l'artiste n'a pas d'identifiant Ticketmaster", () => {
    const sansId = { ...vianney, tmId: undefined, nom: 'Zaz' };
    expect(lireTicketmaster(reponseTM, sansId)).toHaveLength(0);
  });
  it('lit les suggestions', () => {
    const s = lireSuggestions({
      _embedded: {
        attractions: [
          {
            id: 'K8vZ1',
            name: 'Vianney',
            images: [{ ratio: '16_9', url: 'large', width: 1000 }, { ratio: '1_1', url: 'carre', width: 300 }],
            classifications: [{ genre: { name: 'Pop' } }],
          },
        ],
      },
    });
    expect(s).toEqual([{ tmId: 'K8vZ1', nom: 'Vianney', image: 'carre', genre: 'Pop', nbConcerts: undefined }]);
  });
});

describe('Bandsintown', () => {
  it('garde seulement les pays demandés', () => {
    const liste = lireBandsintown(
      [
        { datetime: '2026-11-20T20:30:00', venue: { name: 'Zénith', city: 'Nantes', country: 'France' }, offers: [{ url: 'https://bit/1' }] },
        { datetime: '2026-11-22T20:00:00', venue: { name: 'Forest', city: 'Bruxelles', country: 'Belgium' } },
      ],
      vianney,
      ['FR'],
    );
    expect(liste).toHaveLength(1);
    expect(liste[0]).toMatchObject({ date: '2026-11-20', heure: '20:30', ville: 'Nantes', url: 'https://bit/1' });
  });
});

describe('détection des nouvelles dates', () => {
  const opts = { maintenant: '2026-10-11T06:00:00Z', aujourdhui: '2026-10-11' };

  it("n'annonce pas les dates connues à l'ajout, puis annonce les nouvelles", () => {
    const d = donneesVides();
    d.artistes.push(vianney);
    const premiers = fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), { ...opts, dejaConnus: true });
    expect(premiers).toHaveLength(2); // Lyon + Paris (doublon fusionné)
    expect(aAnnoncer(d, opts.aujourdhui)).toHaveLength(0);

    const encore = fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), { ...opts, dejaConnus: false });
    expect(encore).toHaveLength(0);

    const nouvelle = lireTicketmaster({ _embedded: { events: [evenementTM('e9', '2027-01-10', 'Lille')] } }, vianney);
    fusionner(d, vianney, nouvelle, { ...opts, dejaConnus: false });
    const annonces = aAnnoncer(d, opts.aujourdhui);
    expect(annonces.map((c) => c.ville)).toEqual(['Lille']);
  });

  it('ne garde pas les dates passées et ne mélange pas les sources', () => {
    const d = donneesVides();
    const passe = lireTicketmaster({ _embedded: { events: [evenementTM('p', '2026-10-01', 'Lyon')] } }, vianney);
    expect(fusionner(d, vianney, passe, { ...opts, dejaConnus: false })).toHaveLength(0);

    fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), { ...opts, dejaConnus: true });
    const bit = lireBandsintown(
      [{ datetime: '2026-11-14T20:00:00', venue: { name: 'Halle', city: 'Lyon', country: 'France' } }],
      vianney,
      ['FR'],
    );
    expect(fusionner(d, vianney, bit, { ...opts, dejaConnus: false })).toHaveLength(0);

    purgerPasses(d, '2026-11-20');
    expect(Object.keys(d.concerts)).toHaveLength(1);
  });

  it('prépare les rappels des concerts suivis', () => {
    const d = donneesVides();
    fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), { ...opts, dejaConnus: true });
    const lyon = Object.values(d.concerts).find((c) => c.ville === 'Lyon')!;
    expect(aRappeler(d, '2026-11-11', 3)).toHaveLength(0);
    lyon.suivi = true;
    expect(aRappeler(d, '2026-11-10', 3)).toHaveLength(0);
    expect(aRappeler(d, '2026-11-11', 3)).toHaveLength(1);
    lyon.rappelEnvoye = true;
    expect(aRappeler(d, '2026-11-12', 3)).toHaveLength(0);
  });

  it('vérifie en priorité les artistes les moins récents', () => {
    const a = { ...vianney, id: 'a', verifieLe: '2026-10-10' };
    const b = { ...vianney, id: 'b', verifieLe: '2026-10-09' };
    const c = { ...vianney, id: 'c' };
    expect(artistesAVerifier([a, b, c], 2).map((x) => x.id)).toEqual(['c', 'b']);
  });
});

describe('mails', () => {
  it('rédige les mails en français', () => {
    const d = donneesVides();
    const [concert] = fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), {
      maintenant: '2026-10-11T06:00:00Z',
      aujourdhui: '2026-10-11',
      dejaConnus: false,
    });
    const m = mailNouveaux([concert!], 'https://exemple.fr');
    expect(m.sujet).toBe('Nouveau concert : Vianney à Lyon');
    expect(m.html).toContain('samedi 14 novembre 2026');
    expect(m.html).toContain('20h00');
    expect(mailRappel(concert!, 1).sujet).toBe('Rappel : Vianney demain');
  });
});
