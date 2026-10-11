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

export function pluriel(n: number, mot: string, motPluriel = `${mot}s`): string {
  return `${n} ${n > 1 ? motPluriel : mot}`;
}
