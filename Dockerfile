FROM node:22.17.0-bookworm-slim AS client-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html postcss.config.js tailwind.config.js vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22.17.0-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3001

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY server ./
WORKDIR /app
COPY --from=client-build /app/dist ./dist

RUN mkdir -p /home/data/prism && chown -R node:node /app /home/data/prism

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((response)=>process.exit(response.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]