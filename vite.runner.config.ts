// Compile la tâche de fond (runner/verification.ts) en un seul script autonome,
// copié dans l'appli Android avec le reste de l'interface (dist/runners/verification.js).
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist/runners',
    emptyOutDir: false,
    // Moteur JavaScript minimal : syntaxe prudente, pas de modules.
    target: 'es2019',
    minify: false,
    lib: {
      entry: 'runner/verification.ts',
      formats: ['iife'],
      name: 'verificationConcerts',
      fileName: () => 'verification.js',
    },
  },
});
