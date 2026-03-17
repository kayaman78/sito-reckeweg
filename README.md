# docker-reckeweg

Prontuario omeopatico Dr. Reckeweg — stack Docker.

## Struttura

```
docker-reckeweg/
├── .env.example          # variabili d'ambiente
├── docker-compose.yml    # stack deploy
└── docker/
    ├── Dockerfile        # build Komodo
    ├── package.json
    ├── server.js         # Express: serve static + /api/save
    └── public/
        └── index.html    # frontend SPA
```

I dati (`rimedi.json`, `data.js`, backup) vivono **solo sul volume host** — mai in git.

---

## Deploy

### Prima installazione

```bash
git clone https://forgejo.tuoserver/tuaorg/docker-reckeweg
cd docker-reckeweg
cp .env.example .env
# edita .env con i tuoi valori

mkdir -p /opt/reckeweg/data
# copia rimedi.json nella cartella data
cp /percorso/rimedi.json /opt/reckeweg/data/

docker compose up -d
```

Il server genera `data.js` automaticamente all'avvio.

### Aggiornamento

```bash
git pull
docker compose pull
docker compose up -d
```

---

## Nginx (auth_basic)

```nginx
location / {
    auth_basic           "Reckeweg";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass           http://127.0.0.1:3000;
    proxy_set_header     Host $host;
}
```

Genera la password:
```bash
htpasswd -c /etc/nginx/.htpasswd nomeutente
```

---

## Variabili d'ambiente

| Variabile     | Default       | Descrizione                            |
|---------------|---------------|----------------------------------------|
| `GHCR_ORG`    | —             | Org su ghcr.io                         |
| `IMAGE_TAG`   | `latest`      | Tag immagine                           |
| `DATA_PATH`   | —             | Path assoluto cartella dati sull'host  |
| `APP_PORT`    | `3000`        | Porta esposta sull'host                |
| `BIND_HOST`   | `127.0.0.1`   | Bind address (lascia loopback)         |
| `MAX_BACKUPS` | `20`          | Backup automatici rimedi.json          |

---

## Komodo build

Punta il build al `Dockerfile` in `docker/`.  
Pusha su `ghcr.io/${GHCR_ORG}/reckeweg:latest`.
