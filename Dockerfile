FROM node:20-alpine

WORKDIR /app

# Install dependencies first (caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

# Run
CMD ["node", "src/index.js"]

