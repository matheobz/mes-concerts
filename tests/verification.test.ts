import { describe, expect, it } from 'vitest';
import { donneesVides, fusionner, lireTicketmaster } from '../shared/logique';
import type { Donnees, Notif } from '../shared/types';
import { type Ports, verificationDue, verifieAujourdhui, verifier } from '../shared/verification';
import { evenementTM, reponseTM, vianney } from './fixtures';

const MAINTENANT = new Date('2026-10-11T08:00:00Z');

function telephone(depart: Donnees) {
  let stock = JSON.stringify(depart);
  const envoyees: Notif[] = [];
  let reponse: unknown = reponseTM;
  let notifsOk = true;
  const ports: Ports = {
    lire: async () => JSON.parse(stock),
    ecrire: async (d) => {
      stock = JSON.stringify(d);
    },
    chercher: async (a) => {
      if (reponse instanceof Error) throw reponse;
      return lireTicketmaster(reponse, a);
    },
    notifier: async (n) => {
      if (!notifsOk) throw new Error('les notifications ne sont pas autorisées');
      envoyees.push(...n);
    },
    maintenant: () => MAINTENANT,
  };
  return {
    ports,
    envoyees,
    donnees: (): Donnees => JSON.parse(stock),
    modifierStock: (f: (d: Donnees) => void) => {
      const d = JSON.parse(stock);
      f(d);
      stock = JSON.stringify(d);
    },
    repondre: (r: unknown) => {
      reponse = r;
    },
    notifs: (ok: boolean) => {
      notifsOk = ok;
    },
  };
}

/** Delphine suit Vianney, dont les dates de reponseTM sont déjà connues. */
function depart(): Donnees {
  const d = donneesVides();
  d.artistes.push(vianney);
  fusionner(d, vianney, lireTicketmaster(reponseTM, vianney), {
    maintenant: '2026-10-01T00:00:00Z',
    aujourdhui: '2026-10-01',
    dejaConnus: true,
  });
  return d;
}

const avecLille = { _embedded: { events: reponseTM._embedded.events.concat([evenementTM('e9', '2027-01-10', 'Lille')]) } };

describe('vérification', () => {
  it('ne notifie rien quand rien ne change, puis annonce une nouvelle date une seule fois', async () => {
    const t = telephone(depart());
    expect(await verifier(t.ports, { reseau: true })).toBe('1/1 artiste vérifié, aucune nouvelle date');
    expect(t.envoyees).toHaveLength(0);

    t.repondre(avecLille);
    const bilan = await verifier(t.ports, { reseau: true });
    expect(bilan).toBe('1/1 artiste vérifié, 1 nouvelle date');
    expect(t.envoyees.map((n) => n.titre)).toEqual(['Nouveau concert : Vianney']);
    expect(t.envoyees[0]!.texte).toBe('dimanche 10 janvier 2027 à 20h00, Lille (Salle de Lille)');
    expect(t.donnees().derniereVerif).toBe(MAINTENANT.toISOString());

    await verifier(t.ports, { reseau: true });
    expect(t.envoyees).toHaveLength(1);
  });

  it('garde les alertes pour plus tard si les notifications sont bloquées', async () => {
    const t = telephone(depart());
    t.repondre(avecLille);
    t.notifs(false);
    expect(await verifier(t.ports, { reseau: true })).toContain('problèmes : notification');
    expect(t.envoyees).toHaveLength(0);
    t.notifs(true);
    await verifier(t.ports, { reseau: false });
    expect(t.envoyees).toHaveLength(1);
  });

  it("ne compte pas la vérification comme faite si Ticketmaster ne répond pas", async () => {
    const t = telephone(depart());
    t.repondre(new Error('Pas de réseau'));
    expect(await verifier(t.ports, { reseau: true })).toContain('Vianney : Pas de réseau');
    expect(t.donnees().derniereVerif).toBeUndefined();
  });

  it('ne perd pas un concert suivi pendant la vérification', async () => {
    const t = telephone(depart());
    const chercher = t.ports.chercher;
    t.ports.chercher = async (a) => {
      // Pendant l'appel réseau, Delphine touche « Suivre ».
      t.modifierStock((d) => {
        for (const c of Object.values(d.concerts)) c.suivi = true;
      });
      return chercher(a);
    };
    await verifier(t.ports, { reseau: true });
    expect(Object.values(t.donnees().concerts).every((c) => c.suivi)).toBe(true);
  });

  it('envoie le rappel 3 jours avant un concert suivi, une seule fois', async () => {
    const t = telephone(depart());
    t.modifierStock((d) => {
      const lyon = Object.values(d.concerts).find((c) => c.ville === 'Lyon')!;
      lyon.suivi = true;
    });
    t.ports.maintenant = () => new Date('2026-11-11T09:00:00Z');
    expect(await verifier(t.ports, { reseau: false, fond: true })).toBe('1 rappel');
    expect(t.envoyees[0]!.titre).toBe('Rappel : Vianney, dans 3 jours');
    expect(t.donnees().derniereVerifFond).toBe('2026-11-11T09:00:00.000Z');
    await verifier(t.ports, { reseau: false });
    expect(t.envoyees).toHaveLength(1);
  });

  it('décide quand rappeler Ticketmaster', () => {
    const d = donneesVides();
    expect(verificationDue(d, MAINTENANT, 6)).toBe(true);
    d.derniereVerif = '2026-10-11T05:00:00Z';
    expect(verificationDue(d, MAINTENANT, 6)).toBe(false);
    expect(verificationDue(d, new Date('2026-10-11T11:00:00Z'), 6)).toBe(true);
    expect(verifieAujourdhui(d, MAINTENANT)).toBe(true);
    expect(verifieAujourdhui(d, new Date('2026-10-12T06:00:00Z'))).toBe(false);
  });
});
