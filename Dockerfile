FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=base /app/node_modules ./node_modules
COPY . .
RUN mkdir -p logs && chown -R appuser:appgroup /app
USER appuser
EXPOSE 5000
CMD ["node", "src/index.js"]
