FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS builder

WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/package.json
COPY apps/frontend-react/package.json apps/frontend-react/package.json
COPY apps/reminder/package.json apps/reminder/package.json
COPY apps/ui-lab/package.json apps/ui-lab/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY apps/frontend-react apps/frontend-react
COPY packages/contracts packages/contracts
COPY packages/shared packages/shared
COPY scripts/precompress-frontend-assets.mjs scripts/precompress-frontend-assets.mjs

RUN rm -rf apps/frontend-react/dist \
  && npm run build --workspace @sekerchat/frontend-react \
  && node ./scripts/precompress-frontend-assets.mjs apps/frontend-react/dist

FROM nginx:stable-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46 AS runner

RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/frontend-react/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/frontend-react/docker-entrypoint.sh /usr/local/bin/sekerchat-entrypoint.sh
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/apps/frontend-react/dist /usr/share/nginx/html

RUN chmod +x /usr/local/bin/sekerchat-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/sekerchat-entrypoint.sh"]
