// Types partagés entre l'interface (src/) et le Worker (worker/).

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

export type Source = 'ticketmaster' | 'bandsintown';

export interface Concert {
  /** Clé stable : artiste + date + ville (évite les doublons entre sources). */
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
  source: Source;
  annule?: boolean;
  trouveLe: string;
  /** Mail "nouvelle date" déjà envoyé (ou date déjà connue à l'ajout de l'artiste). */
  notifie: boolean;
  /** Delphine suit ce concert : elle recevra un rappel quelques jours avant. */
  suivi: boolean;
  rappelEnvoye: boolean;
}

/** Tout ce qui est stocké dans KV, sous une seule clé. */
export interface Donnees {
  artistes: Artiste[];
  concerts: Record<string, Concert>;
  derniereVerif?: string;
  dernierBilan?: string;
}

/** Ce que l'API renvoie à l'interface. */
export interface Etat {
  artistes: Artiste[];
  concerts: Concert[];
  derniereVerif?: string;
  dernierBilan?: string;
  rappelJours: number;
}

export interface Suggestion {
  tmId: string;
  nom: string;
  image?: string;
  genre?: string;
  nbConcerts?: number;
}
