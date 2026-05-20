FROM node:20-bullseye-slim

WORKDIR /app

COPY package.json ./package.json
RUN npm install --omit=dev

COPY server.js ./server.js
COPY public ./public

EXPOSE 3000

CMD ["node", "server.js"]
