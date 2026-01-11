FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

# Install dependencies first (caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src ./src

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD node src/scripts/healthcheck.js || exit 1

# Run
CMD ["node", "src/index.js"]

