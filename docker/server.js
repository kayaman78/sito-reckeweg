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
    console.log(`✅ data.js rigenerato [${reason}] — ${Math.round(raw.length / 1024)} KB`);
    return true;
  } catch (e) {
    console.error('❌ rimedi.json non valido:', e.message);
    return false;
  }
}

// ── Watcher: rigenera se rimedi.json cambia sul bind mount ────────────
let watchDebounce = null;
fs.watch(DATA_DIR, (event, filename) => {
  if (filename !== 'rimedi.json') return;
  clearTimeout(watchDebounce);
  watchDebounce = setTimeout(() => generateDataJs('file changed'), 500);
});

generateDataJs('startup');

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

// data.js dal bind mount — no cache
app.get('/data.js', (_req, res) => {
  if (!fs.existsSync(DATAJS_FILE))
    return res.status(503).send('// data.js non disponibile — carica rimedi.json\n');
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(DATAJS_FILE);
});

// File statici (index.html) — no cache per vedere subito i rebuild
app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  lastModified: false,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
}));

// ── API ───────────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

app.post('/api/auth', (req, res) => {
  const editPwd = process.env.EDIT_PASSWORD;
  if (!editPwd) return res.json({ ok: false }); // se non configurata, edit disabilitato
  res.json({ ok: req.body?.pwd === editPwd });
});

app.post('/api/save', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data))
    return res.status(400).json({ ok: false, error: 'Payload deve essere un array JSON' });

  if (fs.existsSync(JSON_FILE)) {
    const ts  = new Date().toISOString().replace(/\D/g, '').slice(0, 15);
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
});