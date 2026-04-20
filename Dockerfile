FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    git \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Nushell + nu_plugin_query (multi-arch: amd64 or arm64)
ARG NU_VERSION=0.111.0
ARG TARGETARCH
RUN case "${TARGETARCH}" in \
      arm64) NU_ARCH="aarch64-unknown-linux-musl" ;; \
      *)     NU_ARCH="x86_64-unknown-linux-musl"  ;; \
    esac && \
    curl -fsSL "https://github.com/nushell/nushell/releases/download/${NU_VERSION}/nu-${NU_VERSION}-${NU_ARCH}.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin \
        "nu-${NU_VERSION}-${NU_ARCH}/nu" \
        "nu-${NU_VERSION}-${NU_ARCH}/nu_plugin_query" && \
    nu -c "plugin add /usr/local/bin/nu_plugin_query"

# Build nu_plugin_htmd from source
RUN git clone --depth 1 https://github.com/yllucsyeoj/nu_plugin_htmd.git /tmp/nu_plugin_htmd && \
    cd /tmp/nu_plugin_htmd && \
    cargo build --release && \
    mv target/release/nu_plugin_htmd /usr/local/bin/ && \
    rm -rf /tmp/nu_plugin_htmd
RUN nu -c "plugin add /usr/local/bin/nu_plugin_htmd"

WORKDIR /app

# Copy primitives and extensions first (they change less often)
COPY primitives.nu ./
COPY extensions/ ./extensions/

# Install server dependencies
COPY server/package.json server/bun.lock* ./server/
RUN cd server && bun install --frozen-lockfile

# Copy server source
COPY server/ ./server/

# Data directory — mount a volume here for persistent patches and logs
# e.g. docker run -v gonude-data:/app/data ...
ENV GONUDE_DATA_DIR=/app/data
RUN mkdir -p /app/data/patches

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["bun", "run", "/app/server/index.ts"]
