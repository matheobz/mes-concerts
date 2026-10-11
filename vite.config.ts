import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, l'API tourne avec "wrangler dev" sur le port 8787.
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
});
