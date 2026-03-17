# docker-reckeweg

Prontuario omeopatico Dr. Reckeweg.

## Struttura repo

```
docker-reckeweg/
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
/srv/docker/reckeweg/       ← DATA_PATH
    rimedi.json             ← sorgente dati
    data.js                 ← generato automaticamente
    rimedi_bak_*.json       ← backup automatici da edit inline
```

`rimedi.json` e i backup non entrano mai in git.

Il server rileva automaticamente le modifiche a `rimedi.json`:
basta copiare il nuovo file nella cartella, `data.js` si rigenera in ~1 secondo senza restart.

## Deploy

```bash
git clone https://forgejo.tuoserver/tuaorg/docker-reckeweg
cd docker-reckeweg
cp .env.example .env        # imposta GHCR_ORG e DATA_PATH

mkdir -p /srv/docker/reckeweg
cp /percorso/rimedi.json /srv/docker/reckeweg/

docker compose up -d
```

NPM raggiunge il container come `http://reckeweg:3000` sulla rete `kayabridge`.

## Aggiornare l'HTML

```bash
# sul repo locale
vim docker/public/index.html
git push
# Komodo: build → push ghcr → redeploy
docker compose pull && docker compose up -d
```

## Aggiornare i dati

```bash
# Sostituisci rimedi.json — data.js si rigenera da solo
cp nuovo_rimedi.json /srv/docker/reckeweg/rimedi.json
```

## Variabili d'ambiente

| Variabile      | Default              | Descrizione                    |
|----------------|----------------------|--------------------------------|
| `GHCR_ORG`     | —                    | Org su ghcr.io                 |
| `IMAGE_TAG`    | `latest`             | Tag immagine                   |
| `DATA_PATH`    | `/srv/docker/reckeweg` | Bind mount host              |
| `NETWORK_NAME` | `kayabridge`         | Network esterno NPM            |
| `MAX_BACKUPS`  | `20`                 | Backup automatici da tenere    |

## Komodo build

- Context: `docker/`
- Dockerfile: `docker/Dockerfile`
- Push: `ghcr.io/${GHCR_ORG}/reckeweg:latest`
