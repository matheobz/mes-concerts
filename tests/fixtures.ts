// Données d'essai communes aux tests.
import type { Artiste } from '../shared/types';

export const vianney: Artiste = { id: 'a1', nom: 'Vianney', tmId: 'K8vZ1', ajouteLe: '2026-10-01T00:00:00Z' };

export function evenementTM(id: string, date: string, ville: string, extra: Record<string, unknown> = {}) {
  return Object.assign(
    {
      id,
      name: 'Vianney - Tournée',
      url: `https://www.ticketmaster.fr/${id}`,
      dates: { start: { localDate: date, localTime: '20:00:00' }, status: { code: 'onsale' } },
      _embedded: {
        venues: [{ name: `Salle de ${ville}`, city: { name: ville }, country: { countryCode: 'FR' } }],
        attractions: [{ name: 'Vianney' }],
      },
    },
    extra,
  );
}

export const reponseTM = {
  _embedded: {
    events: [
      evenementTM('e1', '2026-11-14', 'Lyon'),
      evenementTM('e2', '2026-12-02', 'Paris'),
      evenementTM('e3', '2026-12-02', 'Paris'), // doublon (autre billetterie)
      evenementTM('e4', '2026-12-03', 'Paris', { name: 'Parking - Vianney' }),
      { id: 'e5', name: 'Sans date', dates: { start: { dateTBD: true } } },
    ],
  },
};
