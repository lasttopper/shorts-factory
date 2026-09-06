# Shorts Factory — all-in-one image (works on Hugging Face Spaces, Koyeb Docker, any Docker host)
FROM node:20-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/ ./

# Hugging Face Spaces serves apps on port 7860; ignored elsewhere.
EXPOSE 7860
ENV PORT=7860

# Create tables on boot, then serve. DATABASE_URL comes from the host's env/secrets.
CMD ["sh", "-c", "npx drizzle-kit push --force && npm run start"]
