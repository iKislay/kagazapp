# ============================================================
# Kagaz backend image.
#
# LibreOffice and poppler must live in the image (§14) — a plain buildpack
# host cannot run this. The image is built from the REPO ROOT, not from
# apps/backend, because pnpm needs the workspace manifests:
#
#   docker build -f apps/backend/Dockerfile \
#     --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) .
# ============================================================

# ---------- stage 1: install + build ----------
FROM node:20-slim AS builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /repo

# Manifests first, so a dependency-free code change reuses the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/

RUN pnpm install --frozen-lockfile --filter @kagaz/backend... --filter @kagaz/config

COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/backend apps/backend

RUN pnpm --filter @kagaz/shared build \
 && pnpm --filter @kagaz/backend build

# Strip dev dependencies from the tree we are about to copy out.
RUN pnpm install --frozen-lockfile --prod --filter @kagaz/backend... --filter @kagaz/config

# ---------- stage 2: runtime ----------
FROM node:20-slim AS runtime

# LibreOffice headless for DOCX/PPTX/XLSX -> PDF (Phase 8),
# poppler for page-1 thumbnails, and a font set wide enough that a student's
# Devanagari or symbol-heavy document does not come out as boxes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-core \
      libreoffice-writer \
      libreoffice-impress \
      libreoffice-calc \
      poppler-utils \
      fonts-liberation \
      fonts-dejavu \
      fonts-noto-core \
      fonts-noto-devanagari \
      openssl \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f \
 # Fail the build now, not at the first conversion, if either tool is missing.
 && soffice --version \
 && pdftoppm -v

ENV NODE_ENV=production
ENV PORT=8080
# LibreOffice needs a writable profile directory.
ENV HOME=/tmp

WORKDIR /repo

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/packages/config ./packages/config
COPY --from=builder /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /repo/packages/shared/dist ./packages/shared/dist
COPY --from=builder /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=builder /repo/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /repo/apps/backend/dist ./apps/backend/dist
COPY --from=builder /repo/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /repo/apps/backend/node_modules ./apps/backend/node_modules

ARG APP_VERSION=0.1.0
ARG GIT_COMMIT=unknown
ENV APP_VERSION=$APP_VERSION
ENV GIT_COMMIT=$GIT_COMMIT

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:${PORT}/health || exit 1

WORKDIR /repo/apps/backend
CMD ["node", "dist/server.js"]
