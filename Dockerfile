# syntax=docker/dockerfile:1

# ---- deps: install once, reused by build and pruned for runtime ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript with full (incl. dev) dependencies ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build \
  && npm prune --omit=dev

# ---- runtime: smallest image, no build tooling, no dev dependencies ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Run as an unprivileged user — never the container's default root.
RUN addgroup -S business-os && adduser -S business-os -G business-os
USER business-os

COPY --chown=business-os:business-os --from=build /app/node_modules ./node_modules
COPY --chown=business-os:business-os --from=build /app/dist ./dist
COPY --chown=business-os:business-os --from=build /app/drizzle ./drizzle
COPY --chown=business-os:business-os package.json ./

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
