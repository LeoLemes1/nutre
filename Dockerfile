FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm install && npm --prefix backend install && npm --prefix frontend install
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3333
CMD ["npm", "start"]
