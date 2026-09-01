import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    proxy: {
      // Whenever your frontend makes a request starting with '/api',
      // it will securely redirect it to your live Render backend database server
      '/api': {
        target: 'https://onrender.com', // 👈 Replace with your real Render URL
        changeOrigin: true,
        secure: true,
      }
    }
  }
});
