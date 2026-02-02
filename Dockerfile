# Use the official Node.js Debian image as the base image
FROM node:22-bookworm-slim AS base

ENV NODE_ENV="production"

WORKDIR /usr/src/app

FROM base AS deps

COPY package*.json ./
COPY patches ./patches

RUN npm ci --only=production

# Create the final stage
FROM base

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    fonts-freefont-ttf \
    chromium \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy only production dependencies from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application code
COPY . .

EXPOSE 80

CMD ["npm", "start"]
