'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app         = express();
const PORT        = process.env.PORT        || 3000;
const DATA_DIR    = process.env.DATA_DIR    || '/app/data';
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '20');

const JSON_FILE   = path.join(DATA_DIR, 'rimedi.json');
const DATAJS_FILE = path.join(DATA_DIR, 'data.js');

fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Genera data.js da rimedi.json ─────────────────────────────────────
function generateDataJs(reason) {
  if (!fs.existsSync(JSON_FILE)) {
    console.warn('⚠️  rimedi.json non trovato — caricalo in DATA_DIR');
    return false;
  }
  try {
    const raw = fs.readFileSync(JSON_FILE, 'utf8');
    JSON.parse(raw);
    fs.writeFileSync(DATAJS_FILE, `const RIMEDI = ${raw};\n`, 'utf8');
    dataVersion = Date.now();
    console.log(`✅ data.js rigenerato [${reason}] — ${Math.round(raw.length / 1024)} KB`);
    return true;
  } catch (e) {
    console.error('❌ rimedi.json non valido:', e.message);
    return false;
  }
}

let watchDebounce = null;
fs.watch(DATA_DIR, (event, filename) => {
  if (filename !== 'rimedi.json') return;
  clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => generateDataJs('file changed'), 500);
});

let dataVersion = Date.now();
generateDataJs('startup');

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

// ── PWA: manifest.json ────────────────────────────────────────────────
app.get('/manifest.json', (_req, res) => {
  const manifest = {
    name: 'Dr. Reckeweg Prontuario',
    short_name: 'Reckeweg',
    description: 'Prontuario omeopatico Dr. Reckeweg',
    start_url: '/',
    display: 'standalone',
    background_color: '#FAF8F5',
    theme_color: '#C0392B',
    orientation: 'any',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
    ]
  };
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.json(manifest);
});

// ── PWA: icone SVG inline (nessuna dipendenza esterna) ────────────────
// Quadrato rosso con angoli arrotondati e "R" bianca — stile Reckeweg
function makeIconSvg(size) {
  const half    = size / 2;
  const radius  = Math.round(size * 0.22);
  const fsize   = Math.round(size * 0.52);
  const offsetY = Math.round(half + fsize * 0.36);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#C0392B"/>
  <text x="${half}" y="${offsetY}"
    text-anchor="middle" dominant-baseline="auto"
    font-family="Georgia, 'Times New Roman', serif"
    font-weight="700" font-size="${fsize}"
    fill="white">R</text>
</svg>`;
}

app.get('/icon-192.png', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(makeIconSvg(192));
});

app.get('/icon-512.png', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(makeIconSvg(512));
});

app.get('/apple-touch-icon.png', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(makeIconSvg(180));
});

// ── PWA: Service Worker ───────────────────────────────────────────────
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(`
const CACHE = 'reckeweg-v1';
const STATIC = [
  '/',
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500&family=Source+Sans+3:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.3/css/flag-icons.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API e data.js sempre dal network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data.js')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }
  // Resto: cache-first con fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
        }
        return resp;
      });
    })
  );
});
`);
});

// ── data.js ───────────────────────────────────────────────────────────
app.get('/data.js', (_req, res) => {
  if (!fs.existsSync(DATAJS_FILE))
    return res.status(503).send('// data.js non disponibile\n');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(DATAJS_FILE);
});

// File statici
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
}));

// ── API ───────────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.get('/api/version', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ v: dataVersion });
});

app.post('/api/auth', (req, res) => {
  const editPwd = process.env.EDIT_PASSWORD;
  if (!editPwd) return res.json({ ok: false });
  res.json({ ok: req.body?.pwd === editPwd });
});

app.post('/api/save', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data))
    return res.status(400).json({ ok: false, error: 'Payload deve essere un array JSON' });

  if (fs.existsSync(JSON_FILE)) {
    const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 15);
    fs.copyFileSync(JSON_FILE, path.join(DATA_DIR, `rimedi_bak_${ts}.json`));
    const baks = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('rimedi_bak_') && f.endsWith('.json'))
      .sort();
    baks.slice(0, Math.max(0, baks.length - MAX_BACKUPS))
      .forEach(f => { try { fs.unlinkSync(path.join(DATA_DIR, f)); } catch {} });
  }

  fs.writeFileSync(JSON_FILE, JSON.stringify(data, null, 2), 'utf8');
  generateDataJs('api/save');
  console.log(`💾 Salvati ${data.length} rimedi`);
  res.json({ ok: true, rimedi: data.length });
});

// ── Start ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 Reckeweg → http://0.0.0.0:${PORT}`);
  console.log(`   DATA_DIR    : ${DATA_DIR}`);
  console.log(`   rimedi.json : ${fs.existsSync(JSON_FILE) ? '✓ trovato' : '✗ mancante'}`);
  console.log(`   PWA         : manifest.json + sw.js attivi`);
});