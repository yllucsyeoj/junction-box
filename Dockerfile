FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Nushell
ARG NU_VERSION=0.101.0
RUN curl -fsSL "https://github.com/nushell/nushell/releases/download/${NU_VERSION}/nu-${NU_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
    | tar -xz --strip-components=1 -C /usr/local/bin "nu-${NU_VERSION}-x86_64-unknown-linux-musl/nu"

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
