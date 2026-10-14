FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/prisma apps/server/prisma
RUN npm install
COPY . .
RUN npx prisma generate --schema apps/server/prisma/schema.prisma && npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATABASE_URL=file:/data/agent-office.db
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps /app/apps
COPY --from=build /app/packages /app/packages
RUN mkdir -p /data
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy --schema apps/server/prisma/schema.prisma && node apps/server/dist/index.js"]
