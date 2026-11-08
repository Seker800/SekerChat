FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS builder

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

FROM node:22.23.4-bookworm-slim@sha256:5ec23b7c622b00547753bc6ffd78085dd868a68aeb41c8e0a1418f033e13d96d AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV MALLOC_ARENA_MAX=2

RUN apt-get update -y \
  && apt-get upgrade -y --no-install-recommends \
  && apt-get install -y --no-install-recommends ffmpeg libheif-examples openssl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/packages/shared ./packages/shared

# Deployment invokes the installed CLI from the workspace root, independently
# of the backend working directory. Fail this build if it is not available.
RUN test -x /app/node_modules/.bin/prisma

# npm is a build-time tool. Keeping it in the runtime image needlessly expands
# the executable and vulnerability surface; Prisma is invoked directly below.
RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

WORKDIR /app/apps/backend

EXPOSE 3100

CMD ["node", "dist/src/main.js"]
