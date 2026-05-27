# Stage 1: Build native dependencies and bundle server
FROM node:20-alpine AS builder
WORKDIR /app

# Install native compilation dependencies
RUN apk add --no-cache python3 make g++ gcc libc6-compat

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Minimal runtime execution layer
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built assets and production runtime modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Safe optional copy trick: copies the config if present, does not fail if absent
COPY --from=builder /app/firebase-applet-config.json* ./

EXPOSE 3000
CMD ["node", "dist/server.cjs"]
