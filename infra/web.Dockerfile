FROM node:22-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=@techtester/web --workspace=@techtester/contracts --include-workspace-root
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build --workspace=@techtester/contracts
RUN npm run build --workspace=@techtester/web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/web/package.json apps/web/
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/node_modules node_modules
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@techtester/web"]
