FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm ci --omit=dev

COPY server.js .
COPY public/ public/

# rimedi.json e data.js vengono dal volume
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["node", "server.js"]
