# StudAI Prism image (API + SPA in one container).
#
# Base images (PROD-READY Phase 7, P74): the tags below are mutable. Pin each
# one by digest before the next production build; the digest could not be
# determined offline on the engineering workstation, so this is an operator
# step (GO_LIVE_CHECKLIST.md):
#   docker buildx imagetools inspect gcr.io/distroless/nodejs22-debian12:nonroot
#   docker buildx imagetools inspect node:22.17.0-bookworm-slim
# then build with, for example,
#   --build-arg RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot@sha256:<digest>
# or change the defaults below in a reviewed commit, and record the digests in
# the release record. Re-check them when Dependabot or the ECR scan reports a
# base-image CVE.
#
# Runtime facts the Kubernetes Jobs rely on (infra/aws/eks/jobs): the runtime
# stage is distroless (no shell, no npm); its entrypoint is /nodejs/bin/node,
# WORKDIR /app, the server lives in /app/server, and the process runs as
# 65532:65532 (non-root). The only runtime writes go to DATA_DIR
# (/home/data/prism); the pod runs with a read-only root filesystem and an
# emptyDir on /tmp.
ARG BUILD_IMAGE=node:22.17.0-bookworm-slim
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot

FROM ${BUILD_IMAGE} AS client-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY index.html postcss.config.js tailwind.config.js vite.config.js ./
COPY public ./public
COPY src ./src
COPY server/lib/sharedConstants.js ./server/lib/sharedConstants.js
RUN npm run build

FROM ${BUILD_IMAGE} AS runtime-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

RUN mkdir -p /home/data/prism

FROM ${RUNTIME_IMAGE} AS runtime

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