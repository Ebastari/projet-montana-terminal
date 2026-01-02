import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      // Note: Removed manual process.env.API_KEY definition as it is injected automatically by the environment.
      resolve: {
        alias: {
          // Fix: __dirname is not available in ESM environments. 
          // path.resolve('.') resolves to the current project root in Vite.
          '@': path.resolve('.'),
        }
      }
    };
});
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/projet-montana-terminal/", // <--- TAMBAHKAN BARIS INI (sesuai nama repo)
})
