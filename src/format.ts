// Mise en forme des dates, en français.

function enDate(date: string): Date {
  return new Date(`${date}T12:00:00`);
}

export function jourCourt(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(enDate(date)).replace('.', '');
}

export function numeroJour(date: string): string {
  return String(enDate(date).getDate());
}

export function moisCourt(date: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(enDate(date)).replace('.', '');
}

export function moisAnnee(date: string): string {
  const texte = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(enDate(date));
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

export function dateEtHeure(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function heure(h?: string): string {
  return h ? h.replace(':', 'h') : '';
}

/** Annoncé il y a moins de 7 jours. */
export function estRecent(iso: string): boolean {
  return Date.now() - Date.parse(iso) < 7 * 86_400_000;
}

/** "Ce soir", "Demain", "Dans 12 jours", "Dans 3 mois". */
export function compteARebours(date: string, aujourdhui: string): string {
  const j = Math.round((enDate(date).getTime() - enDate(aujourdhui).getTime()) / 86_400_000);
  if (j <= 0) return "Aujourd'hui";
  if (j === 1) return 'Demain';
  if (j < 45) return `Dans ${j} jours`;
  const m = Math.round(j / 30.4);
  return `Dans ${m} mois`;
}

/** "samedi 14 novembre 2026". */
export function dateComplete(date: string): string {
  const t = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(
    enDate(date),
  );
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Ouverture de billetterie : "ven. 31 oct. à 10h". */
export function quandVente(iso: string): string {
  const d = new Date(iso);
  const jour = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(d);
  const h = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })
    .format(d)
    .replace(':', 'h')
    .replace('h00', 'h');
  return `${jour} à ${h}`;
}

const FESTIVAL = /festival|fest\b|f[eê]te de l|eurock|solidays|vieilles charrues|hellfest|printemps de bourges|francofolies|garorock|we love green|rock en seine|lollapalooza/i;

export function estFestival(titre: string): boolean {
  return FESTIVAL.test(titre);
}

export function pluriel(n: number, mot: string, motPluriel = `${mot}s`): string {
  return `${n} ${n > 1 ? motPluriel : mot}`;
}
