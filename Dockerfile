FROM node:22-alpine AS deps
WORKDIR /app
ARG DATABASE_URL=postgresql://unused:unused@localhost:5432/unused
ENV DATABASE_URL=$DATABASE_URL
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG DATABASE_URL=postgresql://unused:unused@localhost:5432/unused
ENV DATABASE_URL=$DATABASE_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-alpine AS prod-deps
WORKDIR /app
ARG DATABASE_URL=postgresql://unused:unused@localhost:5432/unused
ENV DATABASE_URL=$DATABASE_URL
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npx prisma generate

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/docs/contracts/schema.graphql ./docs/contracts/schema.graphql
USER node
CMD ["node", "dist/main.js"]
