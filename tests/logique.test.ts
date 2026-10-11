import { describe, expect, it } from 'vitest';
import {
  aAnnoncer,
  aRappeler,
  adresse,
  aujourdhuiParis,
  cleConcert,
  dateCourte,
  dateLongue,
  donneesVides,
  fusionner,
  idNotif,
  joursEntre,
  lireSauvegarde,
  lireStockage,
  lireSuggestions,
  lireTicketmaster,
  maintenantParis,
  notifRappel,
  notifsNouveaux,
  purgerPasses,
  versSauvegarde,
} from '../shared/logique';
import type { Concert } from '../shared/types';
import { evenementTM, reponseTM, vianney } from './fixtures';

const opts = { maintenant: '2026-10-11T06:00:00Z', aujourdhui: '2026-10-11' };

describe('dates (sans Intl)', () => {
  it("donne la date et l'heure de Paris, été comme hiver", () => {
    expect(aujourdhuiParis(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12');
    expect(aujourdhuiParis(new Date('2026-12-01T22:30:00Z'))).toBe('2026-12-01');
    expect(aujourdhuiParis(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02');
    expect(maintenantParis(new Date('2026-07-01T06:00:00Z')).heure).toBe(8);
    expect(maintenantParis(new Date('2026-01-15T06:00:00Z')).heure).toBe(7);
  });
  it("suit les changements d'heure (dernier dimanche de mars et d'octobre)", () => {
    expect(maintenantParis(new Date('2026-03-29T00:59:00Z')).heure).toBe(1);
    expect(maintenantParis(new Date('2026-03-29T01:00:00Z')).heure).toBe(3);
    expect(maintenantParis(new Date('2026-10-25T00:59:00Z')).heure).toBe(2);
    expect(maintenantParis(new Date('2026-10-25T01:00:00Z')).heure).toBe(2);
  });
  it('écrit les dates en français', () => {
    expect(dateLongue('2026-11-14')).toBe('samedi 14 novembre 2026');
    expect(dateCourte('2026-11-14', '2026-10-11')).toBe('samedi 14 novembre');
    expect(dateCourte('2027-02-01', '2026-10-11')).toBe('lundi 1 février 2027');
    expect(joursEntre('2026-10-11', '2026-10-14')).toBe(3);
  });
});

describe('outils', () => {
  it('normalise les clés de concert', () => {
    expect(cleConcert('a1', '2026-11-14', 'Saint-Étienne')).toBe('a1|2026-11-14|saint etienne');
  });
  it('construit les adresses sans URL', () => {
    expect(adresse('https://x.fr/e', { keyword: 'Zaz & co', size: '8' })).toBe('https://x.fr/e?keyword=Zaz%20%26%20co&size=8');
  });
  it('fabrique des identifiants de notification stables et valides pour Android', () => {
    const id = idNotif('rappel|a1|2026-11-14|lyon');
    expect(id).toBe(idNotif('rappel|a1|2026-11-14|lyon'));
    expect(Number.isInteger(id) && id > 0 && id <= 0x7fffffff).toBe(true);
    expect(idNotif('autre')).not.toBe(id);
  });
});

describe('Ticketmaster', () => {
  it('lit les événements et ignore parkings et dates inconnues', () => {
    const liste = lireTicketmaster(reponseTM, vianney);
    expect(liste).toHaveLength(3);
    expect(liste[0]).toMatchObject({ date: '2026-11-14', heure: '20:00', ville: 'Lyon', pays: 'FR' });
  });
  it("filtre par nom quand l'artiste n'a pas d'identifiant Ticketmaster", () => {
    const sansId = Object.assign({}, vianney, { tmId: undefined, nom: 'Zaz' });
    expect(lireTicketmaster(reponseTM, sansId)).toHaveLength(0);
  });
  it('lit les suggestions', () => {
    const s = lireSuggestions({
      _embedded: {
        attractions: [
          {
            id: 'K8vZ1',
            name: 'Vianney',
            images: [
              { ratio: '16_9', url: 'large', width: 1000 },
              { ratio: '1_1', url: 'carre', width: 300 },
            ],
            classifications: [{ genre: { name: 'Pop' } }],
          },
        ],
      },
    });
    expect(s).toEqual([{ tmId: 'K8vZ1', nom: 'Vianney', image: 'carre', genre: 'Pop', nbConcerts: undefined }]);
  });
});

describe('détection des nouvelles dates', () => {
  it("n'annonce pas les dates connues à l'ajout, puis annonce les nouvelles", () => {
    const d = donneesVides();
    d.artistes.push(vianney);
    const premiers = fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), Object.assign({ dejaConnus: true }, opts));
    expect(premiers).toHaveLength(2); // Lyon + Paris (doublon fusionné)
    expect(aAnnoncer(d, opts.aujourdhui)).toHaveLength(0);

    const encore = fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), Object.assign({ dejaConnus: false }, opts));
    expect(encore).toHaveLength(0);

    const nouvelle = lireTicketmaster({ _embedded: { events: [evenementTM('e9', '2027-01-10', 'Lille')] } }, vianney);
    fusionner(d, vianney, nouvelle, Object.assign({ dejaConnus: false }, opts));
    expect(aAnnoncer(d, opts.aujourdhui).map((c) => c.ville)).toEqual(['Lille']);
  });

  it('ne garde pas les dates passées', () => {
    const d = donneesVides();
    const passe = lireTicketmaster({ _embedded: { events: [evenementTM('p', '2026-10-01', 'Lyon')] } }, vianney);
    expect(fusionner(d, vianney, passe, Object.assign({ dejaConnus: false }, opts))).toHaveLength(0);
    fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), Object.assign({ dejaConnus: true }, opts));
    purgerPasses(d, '2026-11-20');
    expect(Object.keys(d.concerts)).toHaveLength(1);
  });

  it('prépare les rappels des concerts suivis, une seule fois', () => {
    const d = donneesVides();
    fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), Object.assign({ dejaConnus: true }, opts));
    const lyon = Object.values(d.concerts).find((c) => c.ville === 'Lyon')!;
    expect(aRappeler(d, '2026-11-11', 3)).toHaveLength(0);
    lyon.suivi = true;
    expect(aRappeler(d, '2026-11-10', 3)).toHaveLength(0);
    expect(aRappeler(d, '2026-11-11', 3)).toHaveLength(1);
    lyon.rappelEnvoye = true;
    expect(aRappeler(d, '2026-11-12', 3)).toHaveLength(0);
  });
});

describe('notifications', () => {
  function concerts(n: number): Concert[] {
    const d = donneesVides();
    const villes = ['Lyon', 'Paris', 'Lille', 'Nantes', 'Rennes'];
    const evts = villes.slice(0, n).map((v, i) => evenementTM(`x${i}`, `2026-11-1${i}`, v));
    return fusionner(d, vianney, lireTicketmaster({ _embedded: { events: evts } }, vianney), Object.assign({ dejaConnus: false }, opts));
  }

  it('annonce une nouvelle date en français', () => {
    const [n] = notifsNouveaux(concerts(1), opts.aujourdhui);
    expect(n!.titre).toBe('Nouveau concert : Vianney');
    expect(n!.texte).toBe('mardi 10 novembre à 20h00, Lyon (Salle de Lyon)');
  });

  it('regroupe au-delà de 3 nouvelles dates', () => {
    expect(notifsNouveaux(concerts(3), opts.aujourdhui)).toHaveLength(3);
    const resume = notifsNouveaux(concerts(5), opts.aujourdhui);
    expect(resume).toHaveLength(1);
    expect(resume[0]!.titre).toBe('5 nouveaux concerts annoncés');
    expect(resume[0]!.texte).toBe('Vianney');
  });

  it('rédige le rappel', () => {
    const [c] = concerts(1);
    expect(notifRappel(c!, '2026-11-07').titre).toBe('Rappel : Vianney, dans 3 jours');
    expect(notifRappel(c!, '2026-11-09').titre).toBe("Rappel : Vianney, c'est demain");
    expect(notifRappel(c!, '2026-11-10').titre).toBe("Rappel : Vianney, c'est aujourd'hui");
  });
});

describe('sauvegarde', () => {
  it('exporte puis réimporte sans perte, sans relancer les alertes', () => {
    const d = donneesVides();
    d.artistes.push(vianney);
    fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), Object.assign({ dejaConnus: false }, opts));
    const lyon = Object.values(d.concerts).find((c) => c.ville === 'Lyon')!;
    lyon.suivi = true;
    const relu = lireSauvegarde(versSauvegarde(d));
    expect(relu.artistes).toEqual([vianney]);
    expect(Object.keys(relu.concerts)).toEqual(Object.keys(d.concerts));
    expect(relu.concerts[lyon.id]!.suivi).toBe(true);
    expect(Object.values(relu.concerts).every((c) => c.notifie)).toBe(true);
  });

  it('refuse un fichier qui ne convient pas, et ignore les concerts orphelins', () => {
    expect(() => lireSauvegarde('pas du json')).toThrow("n'est pas une sauvegarde");
    expect(() => lireSauvegarde('{"bonjour": 1}')).toThrow("n'est pas une sauvegarde");
    const brut = { artistes: [vianney], concerts: { x: { date: '2026-12-01', artisteId: 'inconnu' } } };
    expect(Object.keys(lireSauvegarde(JSON.stringify(brut)).concerts)).toHaveLength(0);
  });

  it('repart de zéro si le stockage est abîmé', () => {
    expect(lireStockage(null)).toEqual(donneesVides());
    expect(lireStockage('{abîmé')).toEqual(donneesVides());
  });
});
