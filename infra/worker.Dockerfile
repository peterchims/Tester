FROM mcr.microsoft.com/playwright:v1.49.1-noble AS build
WORKDIR /app
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/database/package.json packages/database/
COPY packages/storage/package.json packages/storage/
COPY packages/queue/package.json packages/queue/
COPY packages/browser/package.json packages/browser/
COPY packages/analyzers/package.json packages/analyzers/
COPY apps/worker/package.json apps/worker/
RUN npm install
COPY packages packages
COPY apps/worker apps/worker
RUN npm run build --workspace=@techtester/contracts \
 && npm run build --workspace=@techtester/database \
 && npm run build --workspace=@techtester/storage \
 && npm run build --workspace=@techtester/queue \
 && npm run build --workspace=@techtester/browser \
 && npm run build --workspace=@techtester/analyzers \
 && npm run build --workspace=@techtester/worker

FROM mcr.microsoft.com/playwright:v1.49.1-noble AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/packages packages
COPY --from=build /app/apps/worker apps/worker
RUN mkdir -p /artifacts && chown -R pwuser:pwuser /artifacts
USER pwuser
CMD ["node", "apps/worker/dist/main.js"]
