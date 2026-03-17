'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || '/app/data';
const JSON_FILE  = path.join(DATA_DIR, 'rimedi.json');
const DATAJS_FILE = path.join(DATA_DIR, 'data.js');
const MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '20');

// ── Assicura che la cartella data esista ──────────────────────────────
fs.mkdirSync(DATA_DIR, { recursive: true });

// ── Genera data.js da rimedi.json (chiamata all'avvio + dopo ogni save) ─
function generateDataJs() {
  if (!fs.existsSync(JSON_FILE)) {
    console.warn(`⚠️  ${JSON_FILE} non trovato — data.js non generato`);
    return;
  }
  const raw = fs.readFileSync(JSON_FILE, 'utf8');
  fs.writeFileSync(DATAJS_FILE, `const RIMEDI = ${raw};\n`, 'utf8');
  console.log(`✅ data.js rigenerato (${Math.round(raw.length / 1024)} KB)`);
}

generateDataJs();

// ── Middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));

// data.js servito dalla cartella DATA_DIR (volume)
app.get('/data.js', (req, res) => {
  if (!fs.existsSync(DATAJS_FILE)) {
    return res.status(404).send('// data.js non ancora generato — carica rimedi.json\n');
  }
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(DATAJS_FILE);
});

// File statici (index.html ecc.) dalla cartella public dentro il container
app.use(express.static(path.join(__dirname, 'public')));

// ── API ping ──────────────────────────────────────────────────────────
app.get('/api/ping', (_req, res) => res.json({ ok: true }));

// ── API save ──────────────────────────────────────────────────────────
app.post('/api/save', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) {
    return res.status(400).json({ ok: false, error: 'Payload deve essere un array JSON' });
  }

  // Backup con timestamp
  if (fs.existsSync(JSON_FILE)) {
    const ts  = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const bak = path.join(DATA_DIR, `rimedi_bak_${ts}.json`);
    fs.copyFileSync(JSON_FILE, bak);

    // Mantieni solo gli ultimi MAX_BACKUPS backup
    const baks = fs.readdirSync(DATA_DIR)
      .filter(f => f.startsWith('rimedi_bak_') && f.endsWith('.json'))
      .sort();
    baks.slice(0, Math.max(0, baks.length - MAX_BACKUPS))
      .forEach(f => fs.unlinkSync(path.join(DATA_DIR, f)));
  }

  // Salva JSON
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(JSON_FILE, json, 'utf8');

  // Rigenera data.js
  generateDataJs();

  console.log(`💾 Salvati ${data.length} rimedi`);
  res.json({ ok: true, rimedi: data.length });
});

// ── Avvio ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🟢 Reckeweg server → http://0.0.0.0:${PORT}`);
  console.log(`   DATA_DIR: ${DATA_DIR}`);
  console.log(`   rimedi.json: ${fs.existsSync(JSON_FILE) ? 'trovato ✓' : 'non trovato (caricalo nel volume)'}`);
});
