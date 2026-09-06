# Shorts Factory — all-in-one image (works on Hugging Face Spaces, Koyeb, any Docker host)
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
EXPOSE 7860
# Creates/updates tables, then starts. Hosts like HF Spaces route to PORT (we set 7860).
CMD ["sh", "-c", "npx drizzle-kit push --force && npm run start"]
