import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Cloudflare Pages injects CF_PAGES_BRANCH at build time. All non-main
  // branches are Preview and must use the independently verified Preview
  // Supabase project, regardless of a stale dashboard VITE_SUPABASE_URL.
  const pagesBranch = String(process.env.CF_PAGES_BRANCH || '').trim();
  const isPreviewPagesBuild =
    process.env.CF_PAGES === '1' && pagesBranch.length > 0 && pagesBranch !== 'main';
  const verifiedPreviewSupabaseUrl = 'https://nflqxcrgwxoqvqbveisq.supabase.co';
  const buildSupabaseUrl = isPreviewPagesBuild
    ? verifiedPreviewSupabaseUrl
    : (
      process.env.VITE_SUPABASE_URL ||
      env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      env.SUPABASE_URL ||
      ''
    ).trim();
  const buildSupabaseAnonKey = (
    process.env.VITE_SUPABASE_ANON_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    env.SUPABASE_ANON_KEY ||
    ''
  ).trim();

  return {
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(buildSupabaseUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(buildSupabaseAnonKey),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'Vijay Visuals Business Platform',
          short_name: 'VijayVisuals',
          description: 'Multi-tenant website builder, e-commerce, delivery management, AI automation, and optional branded PWA platform.',
          theme_color: '#08080A',
          background_color: '#08080A',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          // Wait for an explicit user-approved reload instead of taking over mid-session.
          skipWaiting: false,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,jpg}'],
          // Only the platform start page gets an offline shell. Tenant, auth,
          // checkout and API routes must always go to the network so their
          // server-rendered branding and sensitive responses are never cached.
          navigateFallbackAllowlist: [/^\/$/],
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/auth\//,
            /^\/account\//,
            /^\/checkout\//,
            /^\/pay/,
            /^\/site\//,
            /^\/proposal\//,
            /^\/dashboard/,
          ],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      ws: process.env.DISABLE_HMR === 'true' || Boolean(process.env.APP_URL) ? (false as const) : undefined,
      hmr: process.env.DISABLE_HMR === 'true' || Boolean(process.env.APP_URL) ? false : undefined,
      watch: process.env.DISABLE_HMR === 'true' || Boolean(process.env.APP_URL) ? null : {},
    },
  };
});
