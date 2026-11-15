FROM node:24-bookworm-slim

# Install system certificates and required build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package definition and install dependencies
COPY package*.json tsconfig.json ./
RUN npm config set strict-ssl false && npm ci

# Copy application source code and assets
COPY src/ ./src/
COPY public/ ./public/

# Compile TypeScript
RUN npm run build

# Expose server port
EXPOSE 4000

ENV PORT=4000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Run with system root certificates for corporate & standard SSL
CMD ["node", "--use-system-ca", "dist/index.js"]
