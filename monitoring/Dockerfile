# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY monitor-package.json ./package.json

# Install dependencies
RUN npm install --production && \
    npm install -D typescript @types/node

# Copy source code
COPY monitor.ts ./

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Run the monitor
CMD ["npm", "start"]

