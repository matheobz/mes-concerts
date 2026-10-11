// Réglages communs à l'appli et à la vérification en arrière-plan.

/** Identifiant Android de l'appli. Ne plus le changer une fois l'appli installée chez Delphine. */
export const APP_ID = 'fr.berrez.mesconcerts';

/**
 * Nom de la tâche de fond (Background Runner). Sert aussi de nom au fichier de stockage :
 * l'appli (Capacitor Preferences, groupe = ce nom) et la tâche de fond (CapacitorKV, rangé
 * sous le nom de la tâche) lisent et écrivent ainsi exactement les mêmes données.
 */
export const TACHE_FOND = `${APP_ID}.verification`;
export const EVENEMENT_FOND = 'verifierConcerts';

/** Clé unique sous laquelle toutes les données sont rangées. */
export const CLE_DONNEES = 'donnees';

/** Pays surveillés. */
export const PAYS = ['FR'];

/** Rappel X jours avant un concert suivi. */
export const RAPPEL_JOURS = 3;

/** Fenêtre (heure de Paris) pendant laquelle la tâche de fond a le droit de notifier. */
export const HEURE_DEBUT = 8;
export const HEURE_FIN = 21;

/** À l'ouverture de l'appli, on revérifie Ticketmaster si la dernière vérification date de plus de X heures. */
export const VERIF_OUVERTURE_HEURES = 6;

/** Garde-fou : nombre maximum d'artistes vérifiés par passage. */
export const MAX_ARTISTES = 150;
