FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# postgresql16-client provides pg_dump, used by the weekly database-backup job
# (src/infrastructure/backup/pg-dump.ts) — pinned to match docker-compose.yml's
# postgres:16-alpine rather than the plain `postgresql-client` package, which
# pulls in whatever major Alpine currently defaults to (18, as of writing).
RUN apk add --no-cache postgresql16-client
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.js"]
