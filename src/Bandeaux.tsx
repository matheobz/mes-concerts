// Bandeaux en haut de l'écran tant que le téléphone n'est pas prêt :
// notifications autorisées, et appli libre de tourner en arrière-plan (indispensable sur OnePlus).
import { useCallback, useEffect, useState } from 'react';
import type { Outils } from './App';
import {
  type Autorisation,
  type EtatBatterie,
  demanderBatterie,
  demanderNotifs,
  etatBatterie,
  autorisationNotifs,
  ouvrirReglagesAppli,
} from './natif';

export interface Autorisations {
  notifs: Autorisation | null;
  batterie: EtatBatterie | null;
  actualiser: () => Promise<void>;
}

export function useAutorisations(): Autorisations {
  const [notifs, setNotifs] = useState<Autorisation | null>(null);
  const [batterie, setBatterie] = useState<EtatBatterie | null>(null);
  const actualiser = useCallback(async () => {
    setNotifs(await autorisationNotifs());
    setBatterie(await etatBatterie());
  }, []);
  useEffect(() => {
    void actualiser();
  }, [actualiser]);
  return { notifs, batterie, actualiser };
}

/** Demande les notifications ; si Android a déjà refusé, ouvre les réglages de l'appli. */
export async function activerNotifs(a: Autorisations, outils: Outils): Promise<void> {
  try {
    if (a.notifs === 'non') {
      outils.informer('Touchez « Notifications » puis activez-les.');
      await ouvrirReglagesAppli();
    } else if ((await demanderNotifs()) !== 'oui') {
      outils.informer('Notifications refusées. Vous pourrez les activer plus tard dans Réglages.');
    }
  } catch (e) {
    outils.echec(e);
  }
  await a.actualiser();
}

export async function libererBatterie(outils: Outils): Promise<void> {
  try {
    await demanderBatterie();
  } catch (e) {
    outils.echec(e);
  }
  // Le résultat se lit au retour dans l'appli (événement "resume", voir App.tsx).
}

export function Bandeaux({ autorisations, outils }: { autorisations: Autorisations; outils: Outils }) {
  const { notifs, batterie } = autorisations;
  return (
    <>
      {notifs && notifs !== 'oui' && (
        <section className="bandeau">
          <p>
            <strong>Autorisez les notifications</strong>
            <br />
            Sinon, l'appli ne pourra pas vous prévenir des nouveaux concerts.
          </p>
          <button className="principal" onClick={() => void activerNotifs(autorisations, outils)}>
            Autoriser les notifications
          </button>
        </section>
      )}
      {batterie && !batterie.libre && (
        <section className="bandeau">
          <p>
            <strong>Laissez l'appli travailler en arrière-plan</strong>
            <br />
            Chaque jour, elle cherche les nouveaux concerts toute seule. Pour cela, le téléphone doit la laisser
            faire. Touchez le bouton, puis répondez « Autoriser ».
          </p>
          <button className="principal" onClick={() => void libererBatterie(outils)}>
            Autoriser
          </button>
        </section>
      )}
    </>
  );
}
