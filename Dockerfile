FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
COPY public ./public
EXPOSE 3000
CMD ["npm", "start"]
