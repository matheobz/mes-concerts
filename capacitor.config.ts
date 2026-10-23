import type { CapacitorConfig } from '@capacitor/cli';

// Garder ces valeurs alignées avec shared/config.ts (APP_ID, TACHE_FOND, EVENEMENT_FOND).
const config: CapacitorConfig = {
  appId: 'fr.berrez.mesconcerts',
  appName: 'Mes concerts',
  webDir: 'dist',
  android: {
    // Pas de contenu mixte ni de débogage distant dans la version installée.
    allowMixedContent: false,
  },
  plugins: {
    // Les appels à Ticketmaster passent par le réseau natif d'Android (pas de souci de CORS).
    CapacitorHttp: { enabled: true },
    LocalNotifications: {
      smallIcon: 'ic_stat_concert',
      iconColor: '#c9a15b',
    },
    BackgroundRunner: {
      label: 'fr.berrez.mesconcerts.verification',
      src: 'runners/verification.js',
      event: 'verifierConcerts',
      repeat: true,
      // Toutes les 4 heures environ (Android décide du moment exact). La tâche ne joint
      // Ticketmaster qu'une fois par jour et ne notifie qu'entre 8h et 21h.
      interval: 240,
      autoStart: true,
    },
  },
};

export default config;
