FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
RUN npm install
COPY . .
RUN npm run build --workspace=@quality/contracts && npm run build --workspace=@quality/api
USER node
EXPOSE 4100
CMD ["npm","run","start","--workspace=@quality/api"]
