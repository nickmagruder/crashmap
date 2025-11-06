import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '^/api': {
        target: process.env.SERVER_URL || 'https://localhost:7292',
        changeOrigin: true,
        secure: true
      }
    }
  }
});
