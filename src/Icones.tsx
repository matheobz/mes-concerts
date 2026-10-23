// Icônes dessinées au trait (même épaisseur partout), à la couleur du texte.
import type { ReactNode } from 'react';

function Icone({ children, taille = 22 }: { children: ReactNode; taille?: number }) {
  return (
    <svg
      className="icone"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

type P = { taille?: number };

export const IconeBillet = (p: P) => (
  <Icone {...p}>
    <path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" />
    <path d="M14 6v12" strokeDasharray="1.5 2.5" />
  </Icone>
);

export const IconeEtoile = (p: P) => (
  <Icone {...p}>
    <path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
  </Icone>
);

export const IconeReglages = (p: P) => (
  <Icone {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icone>
);

export const IconeCloche = ({ pleine, ...p }: P & { pleine?: boolean }) => (
  <Icone {...p}>
    <path
      d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"
      fill={pleine ? 'currentColor' : 'none'}
    />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Icone>
);

export const IconeLieu = (p: P) => (
  <Icone {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </Icone>
);

export const IconeHorloge = (p: P) => (
  <Icone {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icone>
);

export const IconeCalendrier = (p: P) => (
  <Icone {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icone>
);

export const IconeItineraire = (p: P) => (
  <Icone {...p}>
    <path d="M12 3 20 20l-8-4-8 4z" />
  </Icone>
);

export const IconeFermer = (p: P) => (
  <Icone {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icone>
);

export const IconePlus = (p: P) => (
  <Icone {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icone>
);

export const IconeRecherche = (p: P) => (
  <Icone {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Icone>
);

export const IconeFleche = (p: P) => (
  <Icone {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icone>
);

export const IconeMaj = (p: P) => (
  <Icone {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </Icone>
);
