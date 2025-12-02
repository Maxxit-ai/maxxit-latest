# Use Node.js 18
FROM node:18-alpine

# Install system dependencies including bash for Railway workers
RUN apk add --no-cache libc6-compat bash

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Copy Prisma schema before npm install (needed for postinstall hook)
COPY prisma ./prisma

# Install all dependencies (needed for build)
RUN npm ci --legacy-peer-deps && npm cache clean --force

# Copy rest of source code
COPY . .

# Set build-time environment variables
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"
ENV SKIP_ENV_VALIDATION=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client
RUN npx prisma generate

# Build the application with increased memory
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# Remove dummy DATABASE_URL
ENV DATABASE_URL=""

# Expose port
EXPOSE 3000

# Set runtime environment variables
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Start the application
CMD ["npm", "start"]
