#!/bin/bash
# Register Nushell plugins
nu -c "plugin add /usr/local/bin/nu_plugin_query" 2>/dev/null || true
nu -c "plugin add /usr/local/bin/nu_plugin_htmd" 2>/dev/null || true

exec /usr/local/bin/bun run /app/server/index.ts