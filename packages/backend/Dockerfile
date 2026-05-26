# syntax=docker/dockerfile:1

# Stage 1: install full workspace deps (incl. dev) needed for the TS build.
FROM node:20-alpine AS deps
# Husky's prepare script tries to set git hooks; the image has no .git.
ENV HUSKY=0
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm ci --workspace=@feedgraph/backend --include-workspace-root

# Stage 2: compile TS, then prune devDependencies in place so the runtime
# stage can copy a slim node_modules without re-installing.
FROM node:20-alpine AS build
ENV HUSKY=0
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/backend ./packages/backend
COPY packages/shared/package.json ./packages/shared/
COPY packages/frontend/package.json ./packages/frontend/
RUN npm run build --workspace=@feedgraph/backend
RUN npm prune --omit=dev

# Stage 3: minimal runtime image. curl is included because the compose
# healthcheck shells out to it.
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache curl \
  && addgroup -S nodejs \
  && adduser -S -G nodejs node-app
WORKDIR /app
COPY --from=build --chown=node-app:nodejs /repo/node_modules ./node_modules
COPY --from=build --chown=node-app:nodejs /repo/packages/backend/dist ./packages/backend/dist
COPY --from=build --chown=node-app:nodejs /repo/packages/backend/package.json ./packages/backend/
USER node-app
WORKDIR /app/packages/backend
EXPOSE 3000
CMD ["node", "dist/main.js"]
