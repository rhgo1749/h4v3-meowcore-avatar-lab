# Meowcore Avatar Runtime — reproducible container image (PR-001)
# Zero runtime dependencies: only Node.js standard library is used.
FROM node:22-alpine

WORKDIR /srv/avatar-runtime

# Copy lockfile first so dependency layers stay reproducible.
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && \
    npm cache clean --force

COPY server ./server
COPY public ./public

# Defaults match the repository contract (.env.example). Override at runtime.
ENV AVATAR_BIND=127.0.0.1 \
    AVATAR_PORT=8930 \
    NODE_ENV=production

EXPOSE 8930

USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8930/healthz | grep -q '"status": "ok"' || exit 1

ENTRYPOINT ["node", "server/server.js"]
