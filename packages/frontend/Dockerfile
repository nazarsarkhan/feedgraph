# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
ENV HUSKY=0
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@feedgraph/frontend --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/frontend ./packages/frontend
RUN npm run build --workspace=@feedgraph/frontend

FROM nginx:1.27-alpine AS runtime
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/packages/frontend/dist /usr/share/nginx/html
EXPOSE 80
