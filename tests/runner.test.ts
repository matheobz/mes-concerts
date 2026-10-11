// Compile la tâche de fond comme pour le téléphone, puis l'exécute dans un bac à sable
// qui imite le moteur Android : ni Intl, ni URL, ni DOM ; seulement fetch, setTimeout,
// CapacitorKV, CapacitorNotifications et addEventListener.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { build } from 'vite';
import { beforeAll, describe, expect, it } from 'vitest';
import { CLE_DONNEES, EVENEMENT_FOND } from '../shared/config';
import { donneesVides, fusionner, lireTicketmaster } from '../shared/logique';
import type { Donnees } from '../shared/types';
import { evenementTM, reponseTM, vianney } from './fixtures';

const SORTIE = 'tests/.sortie';
let code = '';

beforeAll(async () => {
  await build({
    configFile: 'vite.runner.config.ts',
    logLevel: 'silent',
    define: { 'import.meta.env.VITE_TICKETMASTER_KEY': JSON.stringify('cle-test') },
    build: { outDir: SORTIE, emptyOutDir: true },
  });
  code = readFileSync(`${SORTIE}/verification.js`, 'utf8');
}, 60_000);

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

interface Resultat {
  retour: any;
  stock: Donnees;
  notifs: any[];
  appels: string[];
}

function lancer(stock: Donnees, reponse: unknown, instant: string): Promise<Resultat> {
  const kv = new Map<string, string>([[CLE_DONNEES, JSON.stringify(stock)]]);
  const notifs: any[] = [];
  const appels: string[] = [];
  let ecouteur: { nom: string; f: Function } | undefined;
  const bac: any = {
    console,
    setTimeout: (f: () => void) => setTimeout(f, 0),
    CapacitorKV: {
      get: (k: string) => ({ value: kv.get(k) ?? null }),
      set: (k: string, v: string) => kv.set(k, v),
    },
    CapacitorNotifications: { schedule: (n: any[]) => notifs.push(...n) },
    fetch: async (url: string) => {
      appels.push(url);
      return { status: 200, ok: true, text: async () => JSON.stringify(reponse) };
    },
    addEventListener: (nom: string, f: Function) => {
      ecouteur = { nom, f };
    },
  };
  const fixe = Date.parse(instant);
  runInNewContext(
    `delete globalThis.Intl;
     const VraieDate = Date;
     globalThis.Date = class extends VraieDate {
       constructor(...a) { if (a.length) super(...a); else super(${fixe}); }
       static now() { return ${fixe}; }
     };`,
    bac,
  );
  runInNewContext(code, bac);
  expect(ecouteur?.nom).toBe(EVENEMENT_FOND);
  return new Promise((resolve, reject) => {
    ecouteur!.f(
      (retour: unknown) => resolve({ retour, stock: JSON.parse(kv.get(CLE_DONNEES)!), notifs, appels }),
      (e: unknown) => reject(new Error(JSON.stringify(e))),
      {},
    );
  });
}

describe('tâche de fond (bac à sable sans Intl ni URL)', () => {
  it("est un script autonome qui n'utilise ni Intl ni URL", () => {
    expect(code).not.toMatch(/\bIntl\.|new URL\(/);
    expect(code).toContain('cle-test');
  });

  it('en journée : vérifie Ticketmaster et notifie la nouvelle date', async () => {
    const r = await lancer(depart(), avecLille, '2026-10-11T10:00:00Z');
    expect(r.retour).toEqual({ bilan: '1/1 artiste vérifié, 1 nouvelle date' });
    expect(r.appels).toHaveLength(1);
    expect(r.appels[0]).toContain('apikey=cle-test');
    expect(r.appels[0]).toContain('attractionId=K8vZ1');
    expect(r.appels[0]).toContain('countryCode=FR');
    expect(r.notifs).toHaveLength(1);
    expect(r.notifs[0]).toMatchObject({
      title: 'Nouveau concert : Vianney',
      body: 'dimanche 10 janvier 2027 à 20h00, Lille (Salle de Lille)',
      smallIcon: 'ic_stat_concert',
    });
    expect(typeof r.notifs[0].scheduleAt).toBe('string');
    expect(r.stock.derniereVerif).toBe('2026-10-11T10:00:00.000Z');
    expect(r.stock.derniereVerifFond).toBe('2026-10-11T10:00:00.000Z');
  });

  it('la nuit : ne fait rien, mais note son passage', async () => {
    const r = await lancer(depart(), avecLille, '2026-10-11T01:00:00Z');
    expect(r.retour).toEqual({ bilan: 'la nuit, rien à faire' });
    expect(r.appels).toHaveLength(0);
    expect(r.notifs).toHaveLength(0);
    expect(r.stock.derniereVerifFond).toBe('2026-10-11T01:00:00.000Z');
  });

  it('déjà vérifié aujourd’hui : pas de réseau, mais les rappels partent', async () => {
    const d = depart();
    d.derniereVerif = '2026-11-11T07:00:00Z';
    const lyon = Object.values(d.concerts).find((c) => c.ville === 'Lyon')!;
    lyon.suivi = true;
    const r = await lancer(d, avecLille, '2026-11-11T15:00:00Z');
    expect(r.appels).toHaveLength(0);
    expect(r.notifs.map((n) => n.title)).toEqual(['Rappel : Vianney, dans 3 jours']);
    expect(r.stock.concerts[lyon.id]!.rappelEnvoye).toBe(true);
  });
});
