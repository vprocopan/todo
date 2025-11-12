# Generic Web Application Dockerfile (Node build + Nginx runtime)
# Usage:
#   docker build --build-arg BUILD_DIR=dist -t my-web-app -f Dockerfile-todo .
#   docker run -p 8080:80 my-web-app

# --- Build stage ---
FROM node:20-alpine AS build

# Build arguments
ARG BUILD_DIR=dist

# Set workdir
WORKDIR /app

# Install dependencies first (better caching)
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./

# Select package manager based on lockfile
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && corepack prepare pnpm@latest --activate && pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy the rest of the source
COPY . .

# Build
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm run build; \
    elif [ -f yarn.lock ]; then \
      yarn build; \
    else \
      npm run build; \
    fi

# --- Runtime stage ---
FROM nginx:alpine AS runtime

# Build arguments (must be re-declared for runtime stage if used in COPY)
ARG BUILD_DIR=dist

# Copy build output
COPY --from=build /app/${BUILD_DIR} /usr/share/nginx/html

# Provide a default nginx config suitable for SPAs
RUN rm /etc/nginx/conf.d/default.conf

# Write nginx config
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  server_name _;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location / {' \
  '    try_files $uri /index.html;' \
  '  }' \
  '  # Static assets caching' \
  '  location ~* \\.(?:css|js|jpg|jpeg|gif|png|svg|ico|woff2?)$ {' \
  '    expires 30d;' \
  '    access_log off;' \
  '  }' \
  '}' \
  > /etc/nginx/conf.d/app.conf

# Expose port
EXPOSE 80

# Healthcheck (optional)
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
