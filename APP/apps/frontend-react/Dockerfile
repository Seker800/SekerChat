FROM node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS builder

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

FROM nginx:1.31.0-alpine@sha256:2f07d83bf561b506400dc183b1b2003803e39efbd22451f848adaba14d28c7c7 AS runner

RUN apk upgrade --no-cache

RUN rm -f /etc/nginx/conf.d/default.conf
COPY apps/frontend-react/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY apps/frontend-react/docker-entrypoint.sh /usr/local/bin/sekerchat-entrypoint.sh
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/apps/frontend-react/dist /usr/share/nginx/html

RUN chmod +x /usr/local/bin/sekerchat-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/usr/local/bin/sekerchat-entrypoint.sh"]
