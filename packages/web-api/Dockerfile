FROM node:24-slim

# install curl - needed for container health checks
RUN apt-get update && \
    apt-get install -y curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ARG PORT=3000

# context is parent
WORKDIR /app

# Copy package files
COPY package*.json ./

RUN npm ci

# Copy source code
COPY src/api ./src/api
COPY src/db ./src/db
COPY src/example-worker ./src/example-worker
COPY src/job-manager ./src/job-manager

# Generate Prisma client (needed for those importing the client)
RUN npx prisma generate

# Expose port for health checks
EXPOSE ${PORT}