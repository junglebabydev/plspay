# PocketBase backend (linux arm64, for the Mac mini's Colima VM).
#
# Upgrading PocketBase is a one-line PR: bump PB_VERSION and PB_SHA256
# (copy the linux_arm64 line from the release's checksums.txt).
# Never use the legacy v0.22.x line: its migration/hook API is different.
FROM alpine:3.24

ARG PB_VERSION=0.40.5
ARG PB_SHA256=570baa1c45d2fb92fc0073582b945ca0ece03cbf9837ccabf49a222f99dd02e3

# ca-certificates stays in the image (TLS for S3/R2 backups and the heartbeat).
# unzip is build-only. busybox (already in alpine) provides wget for HEALTHCHECK.
RUN apk add --no-cache ca-certificates \
 && apk add --no-cache --virtual .build-deps unzip \
 && wget -q -O /tmp/pb.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_arm64.zip" \
 && echo "${PB_SHA256}  /tmp/pb.zip" | sha256sum -c - \
 && mkdir -p /pb/pb_data \
 && unzip -q /tmp/pb.zip pocketbase -d /pb \
 && rm /tmp/pb.zip \
 && apk del .build-deps

# Schema as code + server-side JS. pb_data is NOT baked in: mount a volume at /pb/pb_data.
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Run as an unprivileged user (uid/gid 10001), so PocketBase and every hook are not root.
# Only pb_data is writable by it. A new, empty volume mounted at /pb/pb_data takes this
# ownership on first use. A volume created by an older (root) image needs a one-time
#   chown -R 10001:10001 /pb/pb_data      (see README "Upgrades")
RUN addgroup -S -g 10001 pb \
 && adduser -S -D -H -u 10001 -G pb pb \
 && chown pb:pb /pb/pb_data
USER pb

WORKDIR /pb

# Soft memory limit for the Go runtime (PRD: 256MiB per PocketBase).
ENV GOMEMLIMIT=256MiB

EXPOSE 8090

# /api/health answers 200 when the API is up. Keep the app's dashboard Healthcheck in
# Coolify DISABLED (its default): Coolify only reads this HEALTHCHECK then. With a consistent
# container name (this app) it only drives the status and proxy routing: Coolify does not
# wait for it before switching versions and never rolls back (see README).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8090/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
