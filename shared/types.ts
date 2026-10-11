// Types partagés entre l'interface (src/) et la vérification en arrière-plan (runner/).

export interface Artiste {
  id: string;
  nom: string;
  /** Identifiant Ticketmaster de l'artiste ("attraction"), plus précis qu'une recherche par nom. */
  tmId?: string;
  image?: string;
  ajouteLe: string;
  /** Dernière fois que ses concerts ont été vérifiés. */
  verifieLe?: string;
}

export interface Concert {
  /** Clé stable : artiste + date + ville (évite les doublons entre billetteries). */
  id: string;
  artisteId: string;
  artisteNom: string;
  titre: string;
  /** AAAA-MM-JJ, heure locale du concert. */
  date: string;
  /** HH:MM si connue. */
  heure?: string;
  ville: string;
  salle: string;
  /** Code pays (FR, BE...). */
  pays: string;
  url?: string;
  annule?: boolean;
  trouveLe: string;
  /** Notification "nouvelle date" déjà envoyée (ou date déjà connue à l'ajout de l'artiste). */
  notifie: boolean;
  /** Delphine suit ce concert : elle aura un rappel quelques jours avant. */
  suivi: boolean;
  rappelEnvoye: boolean;
}

/** Tout ce qui est stocké sur le téléphone, sous une seule clé. */
export interface Donnees {
  artistes: Artiste[];
  concerts: Record<string, Concert>;
  /** Dernière vérification complète (appels Ticketmaster), par l'appli ou en arrière-plan. */
  derniereVerif?: string;
  dernierBilan?: string;
  /** Dernier passage de la vérification en arrière-plan (même sans appel réseau). */
  derniereVerifFond?: string;
}

/** Ce que l'interface affiche. */
export interface Etat {
  artistes: Artiste[];
  concerts: Concert[];
  derniereVerif?: string;
  dernierBilan?: string;
  derniereVerifFond?: string;
  rappelJours: number;
}

export interface Suggestion {
  tmId: string;
  nom: string;
  image?: string;
  genre?: string;
  nbConcerts?: number;
}

/** Notification locale à afficher sur le téléphone. */
export interface Notif {
  /** Entier 32 bits (exigence Android). */
  id: number;
  titre: string;
  texte: string;
}
