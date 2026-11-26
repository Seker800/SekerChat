#!/bin/sh
set -eu

SEKERCHAT_TRUSTED_EDGE_PROXY=${SEKERCHAT_TRUSTED_EDGE_PROXY:-127.0.0.1/32}
case "$SEKERCHAT_TRUSTED_EDGE_PROXY" in
  *[!0-9a-fA-F:./]*|0.0.0.0/0|::/0)
    printf '%s\n' 'SEKERCHAT_TRUSTED_EDGE_PROXY must be one explicit proxy IP or CIDR, not all addresses.' >&2
    exit 1
    ;;
esac
export SEKERCHAT_TRUSTED_EDGE_PROXY

S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT:-}
if [ -n "$S3_PUBLIC_ENDPOINT" ]; then
  if ! printf '%s\n' "$S3_PUBLIC_ENDPOINT" | grep -Eq "^https?://[^[:space:];\"']+$"; then
    printf '%s\n' 'S3_PUBLIC_ENDPOINT must be an http(s) URL without whitespace, quotes, or semicolons.' >&2
    exit 1
  fi
  SEKERCHAT_CSP_OBJECT_SOURCE=$S3_PUBLIC_ENDPOINT
else
  SEKERCHAT_CSP_OBJECT_SOURCE=
fi
export SEKERCHAT_CSP_OBJECT_SOURCE

# Default to same-origin framing. Set this to an explicit origin (for example
# `'self' https://portal.example.com`) when embedding the app in an internal
# portal; never allow `*`.
SEKERCHAT_CSP_FRAME_ANCESTORS=${SEKERCHAT_CSP_FRAME_ANCESTORS:-"'self'"}
case "$SEKERCHAT_CSP_FRAME_ANCESTORS" in
  *";"*|*'"'*)
    printf '%s\n' 'SEKERCHAT_CSP_FRAME_ANCESTORS must not contain semicolons or double quotes.' >&2
    exit 1
    ;;
esac
case " $SEKERCHAT_CSP_FRAME_ANCESTORS " in
  *" * "*)
    printf '%s\n' 'SEKERCHAT_CSP_FRAME_ANCESTORS must list explicit origins, not a wildcard.' >&2
    exit 1
    ;;
esac
export SEKERCHAT_CSP_FRAME_ANCESTORS

# 删掉中英文 index.html 里的 Vite 开发用 CSP meta 标签；生产以响应头为准
for index_file in /usr/share/nginx/html/index.html /usr/share/nginx/html/en/index.html; do
  if [ -f "$index_file" ]; then
    sed -i '/<!-- Vite dev server CSP/,/\/>/d' "$index_file"
  fi
done

exec /docker-entrypoint.sh nginx -g "daemon off;"
