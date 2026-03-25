# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

ARG VITE_USER_API_URL=http://localhost:8001
ARG VITE_CONTEST_API_URL=http://localhost:8002
ARG VITE_IMPORT_EXPORT_API_URL=http://localhost:8002

ENV VITE_USER_API_URL=$VITE_USER_API_URL
ENV VITE_CONTEST_API_URL=$VITE_CONTEST_API_URL
ENV VITE_IMPORT_EXPORT_API_URL=$VITE_IMPORT_EXPORT_API_URL

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
