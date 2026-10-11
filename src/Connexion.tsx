import { useState } from 'react';

export function Connexion({ valider, message }: { valider: (code: string) => void; message?: string }) {
  const [code, setCode] = useState('');
  return (
    <div className="connexion">
      <img src="/icon-192.png" alt="" width={96} height={96} />
      <h1>Mes concerts</h1>
      <p>Saisissez le code d'accès qu'on vous a donné.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) valider(code.trim());
        }}
      >
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Code d'accès"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
        />
        <button type="submit" className="principal">
          Entrer
        </button>
      </form>
      {message && <p className="alerte">{message}</p>}
    </div>
  );
}
