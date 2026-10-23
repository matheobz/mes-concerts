// Accès au téléphone : stockage, notifications, batterie, tâche de fond, partage de fichier.
// Dans un navigateur (npm run dev), chaque fonction a un équivalent simple pour tester l'interface.
import { App as AppCap } from '@capacitor/app';
import { BackgroundRunner } from '@capacitor/background-runner';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { CLE_DONNEES, EVENEMENT_FOND, TACHE_FOND } from '../shared/config';
import { lireStockage } from '../shared/logique';
import type { Donnees, Notif } from '../shared/types';

export const surTelephone = Capacitor.isNativePlatform();

// ---------- Stockage ----------

let configure: Promise<void> | null = null;

/** Même fichier de stockage que la tâche de fond (voir shared/config.ts). */
function pret(): Promise<void> {
  configure ??= Preferences.configure({ group: TACHE_FOND });
  return configure;
}

export async function lireDonnees(): Promise<Donnees> {
  await pret();
  const { value } = await Preferences.get({ key: CLE_DONNEES });
  return lireStockage(value);
}

export async function ecrireDonnees(d: Donnees): Promise<void> {
  await pret();
  await Preferences.set({ key: CLE_DONNEES, value: JSON.stringify(d) });
}

// ---------- Notifications ----------

export type Autorisation = 'oui' | 'non' | 'a-demander';

export async function autorisationNotifs(): Promise<Autorisation> {
  try {
    const p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return 'oui';
    if (p.display === 'denied') return 'non';
    return 'a-demander';
  } catch {
    return 'a-demander';
  }
}

/** Sur Android 13 et plus, affiche la demande d'autorisation (POST_NOTIFICATIONS). */
export async function demanderNotifs(): Promise<Autorisation> {
  try {
    const p = await LocalNotifications.requestPermissions();
    return p.display === 'granted' ? 'oui' : 'non';
  } catch {
    return 'non';
  }
}

export async function notifier(notifs: Notif[]): Promise<void> {
  if ((await autorisationNotifs()) !== 'oui') {
    // On ne marque rien comme envoyé : l'alerte repartira quand les notifications seront autorisées.
    throw new Error('les notifications ne sont pas autorisées');
  }
  await LocalNotifications.schedule({
    notifications: notifs.map((n) => ({
      id: n.id,
      title: n.titre,
      body: n.texte,
      largeBody: n.texte,
      smallIcon: 'ic_stat_concert',
      iconColor: '#c9a15b',
      // Rappels de billetterie : à l'heure dite, même téléphone en veille.
      schedule: n.a ? { at: new Date(n.a), allowWhileIdle: true } : undefined,
    })),
  });
}

/** Annule des notifications programmées (artiste retiré). */
export async function annulerNotifs(ids: number[]): Promise<void> {
  if (!ids.length) return;
  try {
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch {
    // Rien de programmé ou navigateur : sans importance.
  }
}

export async function quandNotifTouchee(f: () => void): Promise<void> {
  try {
    await LocalNotifications.addListener('localNotificationActionPerformed', f);
  } catch {
    // Navigateur sans notifications : rien à faire.
  }
}

// ---------- Batterie (plugin maison, android/app/src/main/java/fr/berrez/mesconcerts/BatteriePlugin.java) ----------

interface BatteriePlugin {
  etat(): Promise<{ ignoree: boolean; fabricant: string }>;
  demander(): Promise<void>;
  ouvrirReglagesAppli(): Promise<void>;
}

const Batterie = registerPlugin<BatteriePlugin>('Batterie');

export interface EtatBatterie {
  /** true : Android laisse l'appli tourner en arrière-plan sans la restreindre. */
  libre: boolean;
  fabricant: string;
}

export async function etatBatterie(): Promise<EtatBatterie> {
  if (!surTelephone) return { libre: true, fabricant: '' };
  try {
    const r = await Batterie.etat();
    return { libre: r.ignoree, fabricant: r.fabricant ?? '' };
  } catch {
    return { libre: true, fabricant: '' };
  }
}

/** Ouvre la fenêtre Android "Autoriser l'appli à toujours fonctionner en arrière-plan ?". */
export async function demanderBatterie(): Promise<void> {
  if (surTelephone) await Batterie.demander();
}

/** Ouvre la page de l'appli dans les Paramètres (batterie, notifications). */
export async function ouvrirReglagesAppli(): Promise<void> {
  if (surTelephone) await Batterie.ouvrirReglagesAppli();
}

// ---------- Tâche de fond ----------

/** Lance tout de suite la tâche de fond, comme Android le fera chaque jour (pour tester). */
export async function lancerTacheFond(): Promise<string> {
  if (!surTelephone) throw new Error('Disponible seulement sur le téléphone.');
  const r = await BackgroundRunner.dispatchEvent<{ bilan?: string } | undefined>({
    label: TACHE_FOND,
    event: EVENEMENT_FOND,
    details: {},
  });
  return r?.bilan ?? 'terminée';
}

// ---------- Appli ----------

export async function quandRetour(f: () => void): Promise<void> {
  if (!surTelephone) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') f();
    });
    return;
  }
  await AppCap.addListener('resume', f);
}

export async function versionAppli(): Promise<string> {
  if (!surTelephone) return 'web';
  try {
    const i = await AppCap.getInfo();
    return `${i.version} (${i.build})`;
  } catch {
    return '';
  }
}

// ---------- Sauvegarde ----------

/** Propose d'enregistrer ou d'envoyer le fichier (Drive, Gmail, WhatsApp...). */
export async function partagerFichier(nom: string, texte: string): Promise<void> {
  if (!surTelephone) {
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([texte], { type: 'application/json' }));
    lien.download = nom;
    lien.click();
    URL.revokeObjectURL(lien.href);
    return;
  }
  const { uri } = await Filesystem.writeFile({
    path: nom,
    data: texte,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({
      title: 'Sauvegarde Mes concerts',
      text: 'Sauvegarde de Mes concerts (à garder précieusement)',
      files: [uri],
      dialogTitle: 'Où ranger la sauvegarde ?',
    });
  } catch (e) {
    // Fenêtre de partage fermée sans choisir : ce n'est pas une erreur.
    if (!String(e instanceof Error ? e.message : e).toLowerCase().includes('cancel')) throw e;
  }
}
