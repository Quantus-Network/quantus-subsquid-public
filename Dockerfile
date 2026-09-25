# Stage 1 — Builder
FROM node:22.18-alpine AS builder

# Install build tools (temporary, needed for node-gyp)
RUN apk add --no-cache python3 make g++ curl

WORKDIR /app

# Copy only dependency manifests first (for layer caching)
COPY package*.json ./

# Install ALL dependencies (including devDeps needed for build)
RUN npm ci --ignore-scripts

# Copy the rest of your code
COPY . .

# Build the TypeScript project (outputs to lib/) and patch deps
RUN npm run postinstall

# Stage 2 — Runtime
FROM node:22.18-alpine

RUN apk --no-cache add curl

WORKDIR /app

# Copy only the built output and essential runtime files
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/commands.json ./commands.json
COPY --from=builder /app/schema.graphql ./schema.graphql
COPY --from=builder /app/metadata.jsonl ./metadata.jsonl
COPY --from=builder /app/hasura_metadata.json ./hasura_metadata.json
COPY --from=builder /app/db ./db

# Install only production dependencies
RUN npm ci --production --ignore-scripts