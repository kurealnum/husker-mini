# Production image for the Next.js web app.
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# The standalone build (enabled via next.config.ts `output: "standalone"`)
# bundles only the node_modules actually used at runtime.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
