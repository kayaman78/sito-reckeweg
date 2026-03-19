'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const zlib    = require('zlib');  // built-in Node.js, nessuna dipendenza

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

// ── PNG generator (solo zlib built-in) ───────────────────────────────
// Genera un PNG RGBA solid-color con una "R" stilizzata disegnata pixel per pixel.
// Nessuna dipendenza esterna richiesta.

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Disegna una "R" stilizzata su una griglia normalizzata [0..1]
// Restituisce true se il pixel (nx, ny) cade dentro la lettera R (in bianco)
function isInR(nx, ny, boldFactor) {
  // Normalizza su una griglia 10x14 logica centrata
  const gx = (nx - 0.28) / 0.44 * 10;  // 0-10
  const gy = (ny - 0.12) / 0.76 * 14;  // 0-14
  const stroke = 1.8 * boldFactor;      // spessore tratto

  // Gamba verticale sinistra
  if (gx >= 0 && gx < stroke && gy >= 0 && gy <= 14) return true;

  // Arco superiore (semicerchio): da gy=0 a gy=7, parte destra
  const cy = 3.5, cr = 3.5;
  const dx = gx - stroke / 2, dy = gy - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (gy >= 0 && gy <= 7 && dist >= cr - stroke && dist <= cr + stroke * 0.6 && gx >= 0) return true;

  // Barra orizzontale centrale
  if (gy >= 7 - stroke / 2 && gy <= 7 + stroke / 2 && gx >= 0 && gx <= 6) return true;

  // Gamba diagonale destra (va da centro-destra in basso a destra)
  // Linea da (6, 7) a (10, 14)
  if (gx >= 2 && gx <= 10 && gy >= 7 && gy <= 14) {
    // Distanza dalla linea parametrica
    const lx1 = stroke * 0.5, ly1 = 7;
    const lx2 = 9.5, ly2 = 14;
    const ldx = lx2 - lx1, ldy = ly2 - ly1;
    const len2 = ldx * ldx + ldy * ldy;
    const t = Math.max(0, Math.min(1, ((gx - lx1) * ldx + (gy - ly1) * ldy) / len2));
    const px = lx1 + t * ldx, py = ly1 + t * ldy;
    const d = Math.sqrt((gx - px) ** 2 + (gy - py) ** 2);
    if (d < stroke * 0.85) return true;
  }

  return false;
}

// Genera PNG RGBA di dimensione `size` x `size`
// BG: rosso Reckeweg (#C0392B), lettera R in bianco
function makePng(size) {
  const bg  = { r: 0xC0, g: 0x39, b: 0x2B, a: 0xFF };
  const fg  = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0xFF };
  const cornerR = Math.round(size * 0.18); // raggio angoli arrotondati
  const bold = size >= 256 ? 1.1 : 1.0;

  // Crea buffer RGBA
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;

      // Angoli arrotondati: controlla se il pixel è fuori dal rettangolo arrotondato
      let alpha = 255;
      const cx = x < cornerR ? cornerR : x > size - 1 - cornerR ? size - 1 - cornerR : x;
      const cy2 = y < cornerR ? cornerR : y > size - 1 - cornerR ? size - 1 - cornerR : y;
      const dx2 = x - cx, dy2 = y - cy2;
      if (dx2 * dx2 + dy2 * dy2 > cornerR * cornerR) {
        // fuori dall'angolo → trasparente
        const idx = (y * size + x) * 4;
        pixels[idx] = 0; pixels[idx+1] = 0; pixels[idx+2] = 0; pixels[idx+3] = 0;
        continue;
      }

      const inLetter = isInR(nx, ny, bold);
      const c = inLetter ? fg : bg;
      const idx = (y * size + x) * 4;
      pixels[idx]   = c.r;
      pixels[idx+1] = c.g;
      pixels[idx+2] = c.b;
      pixels[idx+3] = alpha;
    }
  }

  // Costruisce PNG raw
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // IDAT: ogni riga ha un filtro byte 0 (None) davanti
  const rawRows = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rawRows[y * (1 + size * 4)] = 0; // filtro None
    pixels.copy(rawRows, y * (1 + size * 4) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const compressed = zlib.deflateSync(rawRows, { level: 6 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// Cache icone (generate una volta sola all'avvio)
const iconCache = {};
function getIcon(size) {
  if (!iconCache[size]) {
    console.log(`🎨 Generazione icona PNG ${size}x${size}...`);
    iconCache[size] = makePng(size);
    console.log(`   → ${iconCache[size].length} bytes`);
  }
  return iconCache[size];
}
// Pre-genera le icone all'avvio
setImmediate(() => { getIcon(192); getIcon(512); });

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

// ── Icone PNG vere ────────────────────────────────────────────────────
app.get('/icon-192.png', (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(getIcon(192));
});

app.get('/icon-512.png', (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(getIcon(512));
});

app.get('/apple-touch-icon.png', (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(getIcon(192));
});

// Favicon 32x32
app.get('/favicon.ico', (_req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(getIcon(192)); // Chrome usa il PNG anche come favicon
});

// ── PWA: Service Worker ───────────────────────────────────────────────
app.get('/sw.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(`
const CACHE = 'reckeweg-v2';
const STATIC = [
  '/',
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500&family=Source+Sans+3:wght@300;400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/flag-icons/7.2.3/css/flag-icons.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
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
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/data.js')) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }
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
  etag: false, lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
}));

// ── API ───────────────────────────────────────────────────────────────
app.get('/api/ping',    (_req, res) => res.json({ ok: true }));
app.get('/api/version', (_req, res) => { res.setHeader('Cache-Control','no-store'); res.json({ v: dataVersion }); });

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
      .filter(f => f.startsWith('rimedi_bak_') && f.endsWith('.json')).sort();
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
  console.log(`   PWA         : manifest.json + sw.js + icone PNG attivi`);
});