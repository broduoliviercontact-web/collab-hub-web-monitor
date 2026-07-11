import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Lot Ops Debug §4 : injection à la build des infos de version/config runtime.
// Les globals __APP_VERSION__ / __GIT_COMMIT_SHA__ / __BUILD_TIMESTAMP__ /
// __VERCEL_ENV__ sont remplacées par des littéraux JSON dans le bundle. Aucun
// secret n'est injecté ici (les secrets LIVEKIT_* restent serveur, jamais VITE_).
// En l'absence de valeur (ex. build local sans git/CI), on injecte null -> le
// panneau affiche « — » plutôt que d'inventer une valeur.
let gitSha = null;
try {
  gitSha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
} catch { /* pas de git dispo -> null -> « — » */ }

export default defineConfig({
  server: { port: 5173 },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __GIT_COMMIT_SHA__: JSON.stringify(gitSha),
    __BUILD_TIMESTAMP__: JSON.stringify(new Date().toISOString()),
    __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV || null),
  },
  build: {
    rollupOptions: {
      // Lot 4E : second point d'entrée HTML pour /control-room (shell minimal ;
      // le DOM est construit côté client). Vite émet index.html + control-room.html.
      input: {
        main: 'index.html',
        controlRoom: 'control-room.html',
      },
    },
  },
});