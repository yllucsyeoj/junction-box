FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    unzip \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash appuser || true

ARG NU_VERSION=0.111.0
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      arm64) NU_ARCH="aarch64-unknown-linux-musl" ;; \
      *)   NU_ARCH="x86_64-unknown-linux-musl"  ;; \
    esac && \
    curl -fsSL "https://github.com/nushell/nushell/releases/download/${NU_VERSION}/nu-${NU_VERSION}-${NU_ARCH}.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin \
        "nu-${NU_VERSION}-${NU_ARCH}/nu" \
        "nu-${NU_VERSION}-${NU_ARCH}/nu_plugin_query"

COPY bin/nu_plugin_htmd /usr/local/bin/nu_plugin_htmd

WORKDIR /app

COPY --chown=appuser:appuser primitives.nu ./
COPY --chown=appuser:appuser extensions/ ./extensions/

RUN curl -fsSL https://bun.sh/install | bash && \
    mv /root/.bun/bin/bun /usr/local/bin/bun

COPY server/package.json server/bun.lock* ./server/
RUN cd /app/server && /usr/local/bin/bun install --frozen-lockfile

COPY server/ ./server/

ENV GONUDE_DATA_DIR=/app/data
RUN mkdir -p /app/data/patches

EXPOSE 3001

COPY bin/start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

USER appuser
ENV GONUDE_UNSAFE_DISABLED=1

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["/usr/local/bin/start.sh"]