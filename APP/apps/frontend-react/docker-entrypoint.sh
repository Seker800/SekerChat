#!/bin/sh
set -eu

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

# 删掉 index.html 里的 Vite CSP meta 标签
sed -i '/<!-- Vite dev server CSP/,/\/>/d' /usr/share/nginx/html/index.html

exec /docker-entrypoint.sh nginx -g "daemon off;"
