# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=8080
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# R01 SOP sign-offs are stored here; mount a persistent volume at /app/data and set DATA_DIR=/app/data.
# Runs as root so a freshly mounted (root-owned) volume is writable.
RUN mkdir -p /app/data
EXPOSE 8080
CMD ["node", "server.js"]
