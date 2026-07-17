FROM node:22.17.0-bookworm-slim AS client-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html postcss.config.js tailwind.config.js vite.config.js ./
COPY public ./public
COPY src ./src
COPY server/lib/sharedConstants.js ./server/lib/sharedConstants.js
RUN npm run build

FROM node:22.17.0-bookworm-slim AS runtime-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

RUN mkdir -p /home/data/prism

FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app
COPY --from=runtime-deps --chown=65532:65532 /app/server/node_modules ./server/node_modules
COPY --chown=65532:65532 server ./server
COPY --from=client-build --chown=65532:65532 /app/dist ./dist
COPY --from=runtime-deps --chown=65532:65532 /home/data/prism /home/data/prism

USER 65532:65532
EXPOSE 3001

CMD ["server/index.js"]