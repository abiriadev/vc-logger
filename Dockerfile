FROM node:24.12.0-bookworm-slim AS builder

WORKDIR /app

COPY ./pnpm-workspace.yaml ./.swcrc ./
COPY ./package.json ./pnpm-lock.yaml ./

RUN ["corepack", "enable"]
RUN ["pnpm", "install"]

COPY ./src ./src

RUN ["pnpm", "run", "build"]
RUN ["pnpm", "prune", "--prod"]

FROM node:24.12.0-bookworm-slim AS runner

WORKDIR /app

RUN ["apt", "update", "-y"]
RUN ["apt", "install", "-y", "sqlite3"]

COPY --from=builder /app/package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENTRYPOINT ["node", "--enable-source-maps", "./dist/index.js"]

