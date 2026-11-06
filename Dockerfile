FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/data/app.db
RUN mkdir -p /app/data && chown -R node:node /app
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# The database is migrated automatically on start. Production NEVER seeds demo users: provide BOOTSTRAP_ADMIN_EMAIL and
# BOOTSTRAP_ADMIN_PASSWORD (policy-compliant; must be changed at first login) on the first start, or run once:
#   docker run --rm -v data:/app/data -e BOOTSTRAP_ADMIN_EMAIL=you@example.com image node server/seed.js --bootstrap
# Without an admin or these variables the container exits with a clear message.
CMD ["node", "--disable-warning=ExperimentalWarning", "server/server.js"]
