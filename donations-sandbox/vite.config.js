import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const modules = (name) => here(`./node_modules/${name}`);

// The components live in ../app and ../frontend, which have no node_modules of their own,
// so bare imports are pinned to this sandbox's copies (and react-native is served by react-native-web).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^react-native$/, replacement: modules('react-native-web') },
      { find: /^react$/, replacement: modules('react') },
      { find: /^react\/(.*)$/, replacement: `${modules('react')}/$1` },
      { find: /^react-dom$/, replacement: modules('react-dom') },
      { find: /^react-dom\/(.*)$/, replacement: `${modules('react-dom')}/$1` },
      { find: /^react-leaflet$/, replacement: modules('react-leaflet') },
      { find: /^leaflet\/(.*)$/, replacement: `${modules('leaflet')}/$1` },
      { find: /^leaflet$/, replacement: modules('leaflet') },
    ],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-native-web', 'leaflet', 'react-leaflet'],
  },
  server: { port: 5173, fs: { allow: [here('..')] } },
});
