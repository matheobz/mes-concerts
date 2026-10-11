// Worker Cloudflare : sert l'interface, l'API (/api/...) et la vérification quotidienne (cron).
import type { Artiste, Donnees } from '../shared/types';
import {
  aAnnoncer,
  aRappeler,
  artistesAVerifier,
  aujourdhuiParis,
  donneesVides,
  fusionner,
  joursEntre,
  listePays,
  mailNouveaux,
  mailRappel,
  normaliser,
  purgerPasses,
  versEtat,
} from './logique';
import { chercherConcerts, envoyerMail, suggererArtistes } from './sources';

export interface Env {
  DONNEES: KVNamespace;
  ASSETS: Fetcher;
  // Secrets (wrangler secret put ...)
  TICKETMASTER_KEY: string;
  RESEND_KEY: string;
  MAIL_DESTINATAIRE: string;
  ACCESS_CODE: string;
  BANDSINTOWN_APP_ID?: string;
  // Variables (wrangler.toml)
  MAIL_EXPEDITEUR?: string;
  PAYS?: string;
  RAPPEL_JOURS?: string;
  APP_URL?: string;
}

const CLE_KV = 'donnees';

/** Le plan gratuit limite à 50 requêtes sortantes par exécution : on garde de la marge pour les mails. */
const BUDGET_REQUETES = 40;

async function lire(env: Env): Promise<Donnees> {
  const d = await env.DONNEES.get<Donnees>(CLE_KV, 'json');
  return d ?? donneesVides();
}

async function ecrire(env: Env, d: Donnees): Promise<void> {
  await env.DONNEES.put(CLE_KV, JSON.stringify(d));
}

function rappelJours(env: Env): number {
  const n = Number.parseInt(env.RAPPEL_JOURS ?? '3', 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Vérifie les concerts de tous les artistes, envoie les mails. Renvoie un bilan lisible. */
export async function verifier(env: Env): Promise<string> {
  const d = await lire(env);
  const maintenant = new Date();
  const auj = aujourdhuiParis(maintenant);
  purgerPasses(d, auj);

  const pays = listePays(env.PAYS);
  const coutParArtiste = pays.length * (env.BANDSINTOWN_APP_ID ? 2 : 1);
  const lot = artistesAVerifier(d.artistes, Math.floor(BUDGET_REQUETES / coutParArtiste));
  const erreurs: string[] = [];
  let verifies = 0;

  for (const a of lot) {
    try {
      const trouves = await chercherConcerts(env, a, pays);
      fusionner(d, a, trouves, { maintenant: maintenant.toISOString(), aujourdhui: auj, dejaConnus: false });
      a.verifieLe = maintenant.toISOString();
      verifies++;
    } catch (e) {
      erreurs.push(`${a.nom} : ${message(e)}`);
    }
  }

  const appUrl = env.APP_URL || undefined;
  const nouveaux = aAnnoncer(d, auj);
  let annonces = 0;
  if (nouveaux.length) {
    try {
      await envoyerMail(env, mailNouveaux(nouveaux, appUrl));
      for (const c of nouveaux) c.notifie = true;
      annonces = nouveaux.length;
    } catch (e) {
      erreurs.push(`mail : ${message(e)}`);
    }
  }

  let rappels = 0;
  for (const c of aRappeler(d, auj, rappelJours(env))) {
    try {
      await envoyerMail(env, mailRappel(c, joursEntre(auj, c.date), appUrl));
      c.rappelEnvoye = true;
      rappels++;
    } catch (e) {
      erreurs.push(`rappel ${c.artisteNom} : ${message(e)}`);
    }
  }

  const morceaux = [`${verifies}/${d.artistes.length} artiste(s) vérifié(s)`];
  morceaux.push(annonces ? `${annonces} nouvelle(s) date(s) envoyée(s) par mail` : 'aucune nouvelle date');
  if (rappels) morceaux.push(`${rappels} rappel(s) envoyé(s)`);
  if (erreurs.length) morceaux.push(`problèmes : ${erreurs.join(' ; ')}`);
  d.derniereVerif = maintenant.toISOString();
  d.dernierBilan = morceaux.join(', ');
  await ecrire(env, d);
  return d.dernierBilan;
}

// ---------- API ----------

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function erreur(texte: string, status = 400): Response {
  return json({ erreur: texte }, status);
}

/** Comparaison à temps constant, pour ne pas laisser deviner le code caractère par caractère. */
function memesTextes(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

async function corps<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

async function api(req: Request, env: Env, url: URL): Promise<Response> {
  if (!env.ACCESS_CODE) return erreur("ACCESS_CODE n'est pas configuré sur le serveur", 500);
  const code = req.headers.get('X-Code') ?? '';
  if (!memesTextes(code, env.ACCESS_CODE)) {
    await new Promise((r) => setTimeout(r, 500));
    return erreur('Code incorrect', 401);
  }

  const chemin = url.pathname.replace(/\/+$/, '');
  const methode = req.method;
  const rj = rappelJours(env);

  if (chemin === '/api/etat' && methode === 'GET') {
    return json(versEtat(await lire(env), rj));
  }

  if (chemin === '/api/recherche' && methode === 'GET') {
    const q = (url.searchParams.get('q') ?? '').trim();
    if (q.length < 2) return json([]);
    try {
      return json(await suggererArtistes(env, q));
    } catch (e) {
      return erreur(message(e), 502);
    }
  }

  if (chemin === '/api/artistes' && methode === 'POST') {
    const b = await corps<{ nom: string; tmId: string; image: string }>(req);
    const nom = (b.nom ?? '').trim().slice(0, 120);
    if (!nom) return erreur("Il manque le nom de l'artiste");
    const d = await lire(env);
    const doublon = d.artistes.find(
      (a) => (b.tmId && a.tmId === b.tmId) || normaliser(a.nom) === normaliser(nom),
    );
    if (doublon) return erreur(`${doublon.nom} est déjà dans la liste`, 409);
    const maintenant = new Date();
    const artiste: Artiste = {
      id: crypto.randomUUID(),
      nom,
      tmId: b.tmId || undefined,
      image: b.image || undefined,
      ajouteLe: maintenant.toISOString(),
    };
    d.artistes.push(artiste);
    let trouves = 0;
    let avertissement: string | undefined;
    try {
      const liste = await chercherConcerts(env, artiste, listePays(env.PAYS));
      // Les dates déjà publiées sont affichées tout de suite, sans mail.
      trouves = fusionner(d, artiste, liste, {
        maintenant: maintenant.toISOString(),
        aujourdhui: aujourdhuiParis(maintenant),
        dejaConnus: true,
      }).length;
      artiste.verifieLe = maintenant.toISOString();
    } catch (e) {
      avertissement = `Artiste ajouté, mais la recherche de concerts a échoué (${message(e)}). Nouvel essai demain matin.`;
    }
    await ecrire(env, d);
    return json({ etat: versEtat(d, rj), trouves, avertissement });
  }

  const suppression = chemin.match(/^\/api\/artistes\/([\w-]+)$/);
  if (suppression && methode === 'DELETE') {
    const id = suppression[1];
    const d = await lire(env);
    d.artistes = d.artistes.filter((a) => a.id !== id);
    for (const [cle, c] of Object.entries(d.concerts)) if (c.artisteId === id) delete d.concerts[cle];
    await ecrire(env, d);
    return json(versEtat(d, rj));
  }

  if (chemin === '/api/suivi' && methode === 'POST') {
    const b = await corps<{ id: string; suivi: boolean }>(req);
    const d = await lire(env);
    const c = b.id ? d.concerts[b.id] : undefined;
    if (!c) return erreur('Concert introuvable', 404);
    c.suivi = Boolean(b.suivi);
    if (!c.suivi) c.rappelEnvoye = false;
    await ecrire(env, d);
    return json(versEtat(d, rj));
  }

  if (chemin === '/api/verifier' && methode === 'POST') {
    const bilan = await verifier(env);
    return json({ bilan, etat: versEtat(await lire(env), rj) });
  }

  if (chemin === '/api/test-mail' && methode === 'POST') {
    try {
      await envoyerMail(env, {
        sujet: 'Mes concerts : mail de test',
        html: '<p style="font-family:Arial,sans-serif;font-size:16px">Tout fonctionne : vous recevrez ici les nouvelles dates de vos artistes.</p>',
        texte: 'Tout fonctionne : vous recevrez ici les nouvelles dates de vos artistes.',
      });
      return json({ ok: true });
    } catch (e) {
      return erreur(message(e), 502);
    }
  }

  return erreur('Adresse inconnue', 404);
}

export default {
  async fetch(req, env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await api(req, env, url);
      } catch (e) {
        return erreur(`Erreur du serveur : ${message(e)}`, 500);
      }
    }
    return env.ASSETS.fetch(req);
  },

  async scheduled(_evenement, env, ctx): Promise<void> {
    ctx.waitUntil(verifier(env).then((bilan) => console.log(`Vérification : ${bilan}`)));
  },
} satisfies ExportedHandler<Env>;
