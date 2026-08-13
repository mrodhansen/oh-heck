# Build context is monorepo root (see docker-compose.yml) so offline
# code can import backend/src/tournaments/table-balance.
FROM node:22-alpine AS dev
WORKDIR /app
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=/api
ARG VITE_BASE=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE=$VITE_BASE
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
COPY backend/src/tournaments/table-balance.ts /backend/src/tournaments/table-balance.ts
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
