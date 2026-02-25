# Stage 1: build Quasar app
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build-time API URL (override with build-arg; default for same-origin proxy)
ARG VITE_API_BASE_URL=/backend
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npx quasar build

# Stage 2: serve with nginx
FROM nginx:alpine

# SPA history mode: try files, then fallback to index.html
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
      try_files $uri $uri/ /index.html; \
    } \
  }' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist/spa /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
