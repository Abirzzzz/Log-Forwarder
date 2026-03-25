FROM node:20-slim

WORKDIR /app

COPY selfbot/package.json selfbot/package-lock.json ./

RUN npm ci --omit=dev

COPY selfbot/ ./

CMD ["node", "index.mjs"]
