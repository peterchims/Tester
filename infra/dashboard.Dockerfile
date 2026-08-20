FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:4100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
COPY apps/dashboard/package.json apps/dashboard/
RUN npm ci --workspace=@quality/dashboard --include-workspace-root
COPY apps/dashboard apps/dashboard
RUN npm run build --workspace=@quality/dashboard
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/dashboard/package.json apps/dashboard/
COPY --from=build /app/apps/dashboard/.next apps/dashboard/.next
COPY --from=build /app/node_modules node_modules
USER node
EXPOSE 3000
CMD ["npm","run","start","--workspace=@quality/dashboard"]
