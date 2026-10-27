# SportsOS API — build from the repository root:
#   docker build -f apps/api/Dockerfile -t sportsos-api .
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts --no-audit --no-fund --workspace @sportsos/shared --workspace @sportsos/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @sportsos/shared \
 && npm exec -w @sportsos/api -- prisma generate \
 && npm run build -w @sportsos/api

FROM node:22-alpine
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000
# apply pending migrations, then serve
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
