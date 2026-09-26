# The authoritative game server, for Cloud Run. The client is the Android app in android/.
FROM node:22-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=build /app/dist/server.cjs /app/dist/server.cjs.map ./dist/
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.cjs"]
