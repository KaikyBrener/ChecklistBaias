# --- compilação (front + servidor) ---
FROM node:26-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY server/package.json server/package-lock.json server/
COPY web/package.json web/package-lock.json web/
RUN cd server && npm ci && cd ../web && npm ci
COPY server server
COPY web web
RUN cd web && npm run build
RUN cd server && npm run build && npm prune --omit=dev

# --- imagem final ---
FROM node:26-bookworm-slim
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/checklist.db WEB_DIR=/app/web/dist
WORKDIR /app/server
COPY --from=build /app/server/node_modules node_modules
COPY --from=build /app/server/dist dist
COPY --from=build /app/server/package.json package.json
COPY --from=build /app/web/dist /app/web/dist
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/publico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
