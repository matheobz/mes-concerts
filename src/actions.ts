// Toutes les actions de l'interface. Les données vivent sur le téléphone ; Ticketmaster
// est appelé directement, avec la clé intégrée à la construction de l'appli.
import { PAYS, RAPPEL_JOURS, VERIF_OUVERTURE_HEURES } from '../shared/config';
import {
  aujourdhuiParis,
  fusionner,
  idsRappelsVente,
  lireSauvegarde,
  normaliser,
  versEtat,
  versSauvegarde,
} from '../shared/logique';
import { chercherConcerts, suggererArtistes } from '../shared/ticketmaster';
import type { Artiste, Donnees, Etat, Notif, Suggestion } from '../shared/types';
import { verificationDue, verifier } from '../shared/verification';
import { annulerNotifs, ecrireDonnees, lireDonnees, notifier } from './natif';

export const CLE_TM: string = import.meta.env.VITE_TICKETMASTER_KEY ?? '';

// Une action à la fois sur les données (évite qu'un clic en écrase un autre).
let file: Promise<unknown> = Promise.resolve();
function enSerie<T>(f: () => Promise<T>): Promise<T> {
  const suite = file.then(f, f);
  file = suite.catch(() => undefined);
  return suite;
}

async function modifier(f: (d: Donnees) => void | Promise<void>): Promise<Etat> {
  return enSerie(async () => {
    const d = await lireDonnees();
    await f(d);
    await ecrireDonnees(d);
    return versEtat(d, RAPPEL_JOURS);
  });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function nouvelId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const ports = {
  lire: lireDonnees,
  ecrire: ecrireDonnees,
  chercher: (a: Artiste) => chercherConcerts(CLE_TM, a, PAYS),
  notifier,
  section: enSerie,
};

export const actions = {
  etat: async (): Promise<Etat> => versEtat(await lireDonnees(), RAPPEL_JOURS),

  rechercher: (q: string): Promise<Suggestion[]> => suggererArtistes(CLE_TM, q),

  async ajouterArtiste(nom: string, tmId?: string, image?: string) {
    nom = nom.trim().slice(0, 120);
    if (!nom) throw new Error("Il manque le nom de l'artiste.");
    const maintenant = new Date();
    const artiste: Artiste = { id: nouvelId(), nom, tmId, image, ajouteLe: maintenant.toISOString() };
    await modifier((d) => {
      const doublon = d.artistes.find((a) => (tmId && a.tmId === tmId) || normaliser(a.nom) === normaliser(nom));
      if (doublon) throw new Error(`${doublon.nom} est déjà dans la liste.`);
      d.artistes.push(artiste);
    });
    let trouves = 0;
    let avertissement: string | undefined;
    try {
      const liste = await chercherConcerts(CLE_TM, artiste, PAYS);
      await modifier((d) => {
        const a = d.artistes.find((x) => x.id === artiste.id);
        if (!a) return;
        // Les dates déjà publiées s'affichent tout de suite, sans notification.
        trouves = fusionner(d, a, liste, {
          maintenant: maintenant.toISOString(),
          aujourdhui: aujourdhuiParis(maintenant),
          dejaConnus: true,
        }).length;
        a.verifieLe = maintenant.toISOString();
      });
    } catch (e) {
      avertissement = `${nom} est ajouté, mais la recherche de concerts n'a pas marché (${message(e)}). Nouvel essai à la prochaine vérification.`;
    }
    return { etat: await actions.etat(), trouves, avertissement };
  },

  retirerArtiste: async (id: string) => {
    const ids: number[] = [];
    const etat = await modifier((d) => {
      d.artistes = d.artistes.filter((a) => a.id !== id);
      for (const cle of Object.keys(d.concerts)) {
        const c = d.concerts[cle]!;
        if (c.artisteId !== id) continue;
        // Rappels de billetterie déjà programmés pour cet artiste : on les annule.
        if (c.venteRappels) ids.push(...idsRappelsVente(c.artisteNom, c.venteRappels));
        delete d.concerts[cle];
      }
    });
    await annulerNotifs(ids);
    return etat;
  },

  suivre: (id: string, suivi: boolean) =>
    modifier((d) => {
      const c = d.concerts[id];
      if (!c) throw new Error('Concert introuvable.');
      c.suivi = suivi;
      if (!suivi) c.rappelEnvoye = false;
    }),

  /** Bouton "Vérifier maintenant". */
  async verifier() {
    const bilan = await verifier(ports, { reseau: true });
    return { bilan, etat: await actions.etat() };
  },

  /** À l'ouverture de l'appli : Ticketmaster si la dernière vérification est ancienne, rappels toujours. */
  async verifierSiBesoin(): Promise<Etat> {
    const d = await lireDonnees();
    await verifier(ports, { reseau: verificationDue(d, new Date(), VERIF_OUVERTURE_HEURES) });
    return actions.etat();
  },

  notifTest: () => {
    const n: Notif = {
      id: 1,
      titre: 'Mes concerts : notification d’essai',
      texte: 'Tout fonctionne : vous serez prévenue ici des nouvelles dates.',
    };
    return notifier([n]);
  },

  async exporter(): Promise<{ nom: string; texte: string }> {
    const d = await lireDonnees();
    return { nom: `mes-concerts-${aujourdhuiParis()}.json`, texte: versSauvegarde(d) };
  },

  /** Lit un fichier de sauvegarde (sans rien changer) : pour demander confirmation avant. */
  lireSauvegarde,

  importer: (nouvelles: Donnees) =>
    enSerie(async () => {
      await ecrireDonnees(nouvelles);
      return versEtat(nouvelles, RAPPEL_JOURS);
    }),
};
