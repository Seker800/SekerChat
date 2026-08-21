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

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY apps/backend apps/backend
COPY packages/contracts packages/contracts
COPY packages/shared packages/shared

RUN npm run prisma:generate --workspace @sekerchat/backend
RUN npm run build --workspace @sekerchat/backend
RUN npm prune --omit=dev

FROM node:22-bookworm-slim@sha256:d649c27dae7ba0137b3cef5dd75baa422c08dc3d9e3fc0c23dfb172dc3cc6436 AS runner

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends ffmpeg libheif-examples openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/packages/shared ./packages/shared

# npm is a build-time tool. Keeping it in the runtime image needlessly expands
# the executable and vulnerability surface; Prisma is invoked directly below.
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app/apps/backend

EXPOSE 3100

CMD ["node", "dist/src/main.js"]
