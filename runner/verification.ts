// Tâche de fond Android (Capacitor Background Runner).
// Android la lance toutes les 4 heures environ (WorkManager), même appli fermée, si le téléphone
// ne la bloque pas (voir l'écran "Batterie" de l'appli). Elle :
//  - vérifie Ticketmaster une fois par jour,
//  - envoie les notifications de nouvelles dates et les rappels, entre 8h et 21h (heure de Paris).
// Ce fichier est compilé à part (vite.runner.config.ts) en un script autonome : dist/runners/verification.js.
// Le moteur qui l'exécute est minimal : fetch, setTimeout, CapacitorKV, CapacitorNotifications.
import { CLE_DONNEES, EVENEMENT_FOND, HEURE_DEBUT, HEURE_FIN, PAYS } from '../shared/config';
import { decalageParis, lireStockage, maintenantParis } from '../shared/logique';
import { chercherConcerts } from '../shared/ticketmaster';
import type { Donnees, Notif } from '../shared/types';
import { type Ports, verifieAujourdhui, verifier } from '../shared/verification';

interface KV {
  get(cle: string): { value?: string | null } | string | null | undefined;
  set(cle: string, valeur: string): void;
}
interface Notifications {
  schedule(n: object[]): void;
}

const g = globalThis as unknown as {
  CapacitorKV: KV;
  CapacitorNotifications: Notifications;
  addEventListener(
    evenement: string,
    f: (resolve: (v?: unknown) => void, reject: (e?: unknown) => void, args?: unknown) => void,
  ): void;
};

const CLE_TM: string = import.meta.env.VITE_TICKETMASTER_KEY ?? '';

/** Le stockage de la tâche de fond (CapacitorKV) est le même fichier que celui de l'appli. */
function lireTexte(): string | null {
  const r = g.CapacitorKV.get(CLE_DONNEES);
  if (r == null) return null;
  if (typeof r === 'string') return r;
  return r.value ?? null;
}

function ecrireDonnees(d: Donnees): void {
  g.CapacitorKV.set(CLE_DONNEES, JSON.stringify(d));
}

/**
 * Le plugin Android lit "scheduleAt" comme une heure locale du téléphone, en ignorant le "Z" final.
 * On lui donne donc l'heure de Paris écrite au format ISO (le téléphone de Delphine est à l'heure de Paris).
 */
function heureMurale(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + decalageParis(d) * 3_600_000).toISOString();
}

function notifier(notifs: Notif[]): void {
  g.CapacitorNotifications.schedule(
    notifs.map((n) => ({
      id: n.id,
      title: n.titre,
      body: n.texte,
      // Tout de suite, ou à l'heure dite pour les rappels de billetterie.
      scheduleAt: n.a ? heureMurale(n.a) : new Date().toISOString(),
      smallIcon: 'ic_stat_concert',
      autoCancel: true,
    })),
  );
}

const ports: Ports = {
  lire: async () => lireStockage(lireTexte()),
  ecrire: async (d) => ecrireDonnees(d),
  chercher: (a) => chercherConcerts(CLE_TM, a, PAYS),
  notifier: async (n) => notifier(n),
};

async function executer(): Promise<string> {
  const maintenant = new Date();
  const { heure } = maintenantParis(maintenant);
  const d = lireStockage(lireTexte());
  if (heure < HEURE_DEBUT || heure > HEURE_FIN) {
    // La nuit, on ne dérange pas : on note seulement le passage.
    d.derniereVerifFond = maintenant.toISOString();
    ecrireDonnees(d);
    return 'la nuit, rien à faire';
  }
  return verifier(ports, { reseau: !verifieAujourdhui(d, maintenant), fond: true });
}

g.addEventListener(EVENEMENT_FOND, (resolve, reject) => {
  executer().then(
    (bilan) => resolve({ bilan }),
    (e) => reject({ name: 'Erreur', message: e instanceof Error ? e.message : String(e) }),
  );
});
