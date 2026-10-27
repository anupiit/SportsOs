# SportsOS web — multi-stage build from the monorepo root:
#   docker build -f apps/web/Dockerfile -t sportsos-web .
FROM node:22-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
# The API workspace is listed in the root workspaces; copy its manifest so npm can resolve the tree.
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @sportsos/shared --workspace @sportsos/web --include-workspace-root --ignore-scripts

FROM node:22-alpine AS build
WORKDIR /repo
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=1
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @sportsos/shared && npm run build -w @sportsos/web

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
