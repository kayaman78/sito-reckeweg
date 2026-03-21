# sito-reckeweg

**GitHub:** https://github.com/kayaman78/sito-reckeweg  
**Immagine:** `ghcr.io/kayaman78/sito-reckeweg:latest`

## Struttura repo

```
sito-reckeweg/
├── .env.example
├── docker-compose.yml
└── docker/
    ├── Dockerfile        ← punta Komodo qui per il build
    ├── package.json
    ├── server.js
    └── public/
        └── index.html    ← aggiornare via git + rebuild
```

## Dati (bind mount)

```
/srv/docker/reckeweg/
    rimedi.json             ← sorgente dati (master)
    data.js                 ← generato automaticamente, non toccare
    rimedi_bak_*.json       ← backup automatici da edit inline
```

`rimedi.json` e backup non entrano mai in git.

Il server rileva automaticamente le modifiche a `rimedi.json`:
basta copiare il nuovo file nella cartella, `data.js` si rigenera in ~1 secondo senza restart.


## Aggiornare i dati

```bash
# Sostituisci rimedi.json — data.js si rigenera da solo
cp nuovo_rimedi.json /srv/docker/reckeweg/rimedi.json
```

## Variabili d'ambiente

| Variabile      | Default                 | Descrizione                 |
|----------------|-------------------------|-----------------------------|
| `IMAGE_TAG`    | `latest`                | Tag immagine                |
| `DATA_PATH`    | `/srv/docker/reckeweg`  | Bind mount host             |
| `NETWORK_NAME` | `kayabridge`            | Network esterno NPM         |
| `MAX_BACKUPS`  | `20`                    | Backup automatici da tenere |

## Komodo build

- Repository: `https://github.com/kayaman78/sito-reckeweg`
- Context: `docker/`
- Dockerfile: `docker/Dockerfile`
- Push: `ghcr.io/kayaman78/sito-reckeweg:latest`
