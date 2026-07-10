import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
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