FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM alpine:3.20
COPY --from=build /app/dist /dist
# Build-only: no server process. Copies the built static assets into the shared
# volume nginx serves from, then exits — this container is not meant to keep running.
CMD ["sh", "-c", "rm -rf /output/* && cp -a /dist/. /output/ && echo 'frontend build copied to shared volume'"]
