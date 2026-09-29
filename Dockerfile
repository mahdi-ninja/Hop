# Hop on Node + SQLite. Built and run by compose.yaml; see docs/deploy/docker.md.
# The build output is plain JavaScript and static files, so build once on the native platform
# and only the runtime stage is per-architecture.
FROM --platform=$BUILDPLATFORM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY dashboard/package.json dashboard/
# Install scripts are skipped: workerd's only matters for wrangler, which the image never runs, and
# esbuild works from its platform package without its own.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build:node

FROM node:24-slim
ENV NODE_ENV=production DATABASE_PATH=/data/hop.db PORT=8787
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY migrations ./migrations
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "--enable-source-maps", "--disable-warning=ExperimentalWarning", "dist/node.mjs"]
