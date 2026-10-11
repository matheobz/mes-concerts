// La vérification des concerts, commune à l'appli (à l'ouverture, bouton "Vérifier maintenant")
// et à la tâche de fond Android. Le stockage, le réseau et les notifications sont fournis
// par l'appelant ("ports"), ce qui permet de tester sans téléphone.
import { MAX_ARTISTES, RAPPEL_JOURS } from './config';
import {
  type ConcertTrouve,
  aAnnoncer,
  aRappeler,
  aujourdhuiParis,
  fusionner,
  notifRappel,
  notifsNouveaux,
  purgerPasses,
} from './logique';
import { CleManquante } from './ticketmaster';
import type { Artiste, Donnees, Notif } from './types';

export interface Ports {
  lire(): Promise<Donnees>;
  ecrire(d: Donnees): Promise<void>;
  chercher(a: Artiste): Promise<ConcertTrouve[]>;
  notifier(n: Notif[]): Promise<void>;
  maintenant?: () => Date;
  /** Exécute la relecture + écriture finale sans être interrompue par une autre action (dans l'appli). */
  section?: <T>(f: () => Promise<T>) => Promise<T>;
}

export interface Options {
  /** false : pas d'appel à Ticketmaster, seulement les rappels et les annonces en attente. */
  reseau: boolean;
  /** true pour la tâche de fond (on note son passage, utile pour vérifier qu'Android la laisse tourner). */
  fond?: boolean;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`;
}

/** Vérifie les concerts, envoie les notifications et enregistre. Renvoie un bilan lisible. */
export async function verifier(ports: Ports, opts: Options): Promise<string> {
  const maintenant = (ports.maintenant ?? (() => new Date()))();
  const iso = maintenant.toISOString();
  const auj = aujourdhuiParis(maintenant);
  const erreurs: string[] = [];

  // 1. Les appels réseau (longs) se font sur une copie des données...
  const resultats: Record<string, ConcertTrouve[]> = {};
  let nbArtistes = 0;
  let verifies = 0;
  if (opts.reseau) {
    const instantane = await ports.lire();
    nbArtistes = instantane.artistes.length;
    for (const a of instantane.artistes.slice(0, MAX_ARTISTES)) {
      try {
        resultats[a.id] = await ports.chercher(a);
        verifies++;
      } catch (e) {
        erreurs.push(`${a.nom} : ${message(e)}`);
        // Clé absente ou refusée, pas de réseau : inutile d'insister sur tous les artistes.
        if (e instanceof CleManquante || (erreurs.length >= 3 && verifies === 0)) break;
      }
    }
  }

  // 2. ...puis on relit les données juste avant d'écrire, pour ne rien écraser
  // (un artiste ajouté ou un concert suivi pendant la vérification).
  const section = ports.section ?? (<T>(f: () => Promise<T>) => f());
  return section(async () => {
    const d = await ports.lire();
    purgerPasses(d, auj);
    for (const a of d.artistes) {
      const trouves = resultats[a.id];
      if (!trouves) continue;
      fusionner(d, a, trouves, { maintenant: iso, aujourdhui: auj, dejaConnus: false });
      a.verifieLe = iso;
    }

    const nouveaux = aAnnoncer(d, auj);
    const rappels = aRappeler(d, auj, RAPPEL_JOURS);
    const notifs = notifsNouveaux(nouveaux, auj).concat(rappels.map((c) => notifRappel(c, auj)));
    let envoye = false;
    if (notifs.length) {
      try {
        await ports.notifier(notifs);
        for (const c of nouveaux) c.notifie = true;
        for (const c of rappels) c.rappelEnvoye = true;
        envoye = true;
      } catch (e) {
        erreurs.push(`notification : ${message(e)}`);
      }
    }

    const morceaux: string[] = [];
    if (opts.reseau) {
      const s = nbArtistes > 1 ? 's' : '';
      morceaux.push(`${verifies}/${nbArtistes} artiste${s} vérifié${s}`);
    }
    if (nouveaux.length) morceaux.push(pluriel(nouveaux.length, 'nouvelle date') + (envoye ? '' : ' en attente'));
    else if (opts.reseau) morceaux.push('aucune nouvelle date');
    if (envoye && rappels.length) morceaux.push(pluriel(rappels.length, 'rappel'));
    if (erreurs.length) morceaux.push(`problèmes : ${erreurs.join(' ; ')}`);
    const bilan = morceaux.join(', ') || 'rien de nouveau';

    if (opts.reseau) {
      // La vérification ne compte comme faite que si Ticketmaster a répondu (sinon on réessaie plus tard).
      if (verifies > 0 || nbArtistes === 0) d.derniereVerif = iso;
      d.dernierBilan = bilan;
    }
    if (opts.fond) d.derniereVerifFond = iso;
    await ports.ecrire(d);
    return bilan;
  });
}

/** Faut-il rappeler Ticketmaster ? Oui si la dernière vérification date de plus de X heures. */
export function verificationDue(d: Donnees, maintenant: Date, heures: number): boolean {
  if (!d.derniereVerif) return true;
  return maintenant.getTime() - Date.parse(d.derniereVerif) >= heures * 3_600_000;
}

/** Pour la tâche de fond : une vérification Ticketmaster par jour (heure de Paris). */
export function verifieAujourdhui(d: Donnees, maintenant: Date): boolean {
  return !!d.derniereVerif && aujourdhuiParis(new Date(d.derniereVerif)) === aujourdhuiParis(maintenant);
}
