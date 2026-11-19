FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
