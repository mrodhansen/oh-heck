FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

FROM node:22-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && exec npx nest start --watch"]

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY rules ./rules
EXPOSE 3000
CMD ["node", "dist/main.js"]

FROM node:22-alpine AS build-sqlite
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN sed 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma > prisma/schema.sqlite.prisma \
  && npx prisma generate --schema=prisma/schema.sqlite.prisma \
  && npm run build

FROM node:22-alpine AS box
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build-sqlite /app/dist ./dist
COPY --from=build-sqlite /app/node_modules ./node_modules
COPY --from=build-sqlite /app/package.json ./package.json
COPY --from=build-sqlite /app/prisma ./prisma
COPY --from=build-sqlite /app/rules ./rules
COPY docker-entrypoint-sqlite.sh ./
RUN chmod +x docker-entrypoint-sqlite.sh && mkdir -p /data
EXPOSE 3000
CMD ["./docker-entrypoint-sqlite.sh"]
