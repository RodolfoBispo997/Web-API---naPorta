FROM node:24.22.1-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY . .
# Prisma requires a configured URL to generate the client, without connecting.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
