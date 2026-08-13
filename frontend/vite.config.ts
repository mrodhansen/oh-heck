import path from 'node:path';
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE || '/';
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const backendTournaments = path.resolve(rootDir, '../backend/src/tournaments');

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.png',
        'favicon-32.png',
        'apple-touch-icon.png',
        'icon-192.png',
        'icon-512.png',
      ],
      manifest: {
        name: 'Oh Heck',
        short_name: 'Oh Heck',
        description: 'Oh Heck scorekeeper with offline play',
        theme_color: '#f5ebe2',
        background_color: '#f5ebe2',
        display: 'standalone',
        orientation: 'any',
        start_url: base,
        scope: base,
        // PNG only — iOS home screen ignores SVG favicons
        icons: [
          {
            src: 'apple-touch-icon.png',
            sizes: '180x180',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell offline; API is network-first via app offline layer
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: `${base}index.html`.replace(/\/+/g, '/'),
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/games') ||
              url.pathname.includes('/tournaments') ||
              url.pathname.includes('/live') ||
              url.pathname.includes('/stats') ||
              url.pathname.includes('/rules'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
    // After PWA rewrites index.html. GH Pages has no rewrite, so unknown
    // paths (refresh on /stats) serve this copy of the SPA shell.
    {
      name: 'spa-github-pages-404',
      apply: 'build',
      closeBundle: {
        sequential: true,
        order: 'post',
        handler() {
          const index = path.resolve(rootDir, 'dist/index.html');
          const dest = path.resolve(rootDir, 'dist/404.html');
          if (existsSync(index)) copyFileSync(index, dest);
        },
      },
    },
  ],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === 'true',
      interval: Number(process.env.CHOKIDAR_INTERVAL || 300),
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3010',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:3010',
        ws: true,
      },
    },
    // Frontend root plus shared tournament helpers. Do not allow the
    // monorepo root / backend .env.
    fs: { allow: [rootDir, backendTournaments] },
  },
});
