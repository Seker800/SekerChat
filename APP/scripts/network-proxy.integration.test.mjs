import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import test from 'node:test';

const enabled = process.env.SEKERCHAT_PROXY_INTEGRATION === '1';
const frontend = resolve('apps/frontend-react');

function runProxy(trustedProxy, forwardedFor) {
  return spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--network',
      'none',
      '--entrypoint',
      'sh',
      '-e',
      `SEKERCHAT_TRUSTED_EDGE_PROXY=${trustedProxy}`,
      '-e',
      `TEST_FORWARDED_FOR=${forwardedFor}`,
      '-v',
      `${frontend}/nginx.conf.template:/etc/nginx/templates/default.conf.template:ro`,
      '-v',
      `${frontend}/docker-entrypoint.sh:/tmp/start-frontend.sh:ro`,
      'sekerchat-frontend:v0.9.22',
      '-s',
    ],
    {
      encoding: 'utf8',
      timeout: 20_000,
      input: `
set -eu
cat >/etc/nginx/conf.d/test-upstream.conf <<'NGINX'
server { listen 3100; location / { return 200 "$http_x_forwarded_for"; } }
NGINX
# Use a loopback upstream; this container has no network or application data.
mkdir -p /tmp/templates
sed 's@http://sekerchat-backend:3100@http://127.0.0.1:3100@' /etc/nginx/templates/default.conf.template >/tmp/templates/default.conf.template
export NGINX_ENVSUBST_TEMPLATE_DIR=/tmp/templates
sh /tmp/start-frontend.sh >/tmp/start.log 2>&1 &
for attempt in $(seq 1 50); do
  if result=$(wget -qO- --header "X-Forwarded-For: $TEST_FORWARDED_FOR" http://127.0.0.1/api/network/status); then
    printf 'RESULT=%s\\n' "$result"
    exit 0
  fi
  sleep 0.1
done
cat /tmp/start.log
exit 1
`,
    },
  );
}

test('frontend replaces spoofed client headers from an untrusted peer', { skip: !enabled }, () => {
  const result = runProxy('192.0.2.1/32', '8.8.8.8');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /RESULT=127\.0\.0\.1/);
});

test(
  'frontend uses the last untrusted address forwarded by an explicitly trusted edge',
  { skip: !enabled },
  () => {
    const result = runProxy('127.0.0.1/32', '1.2.3.4, 8.8.8.8');
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /RESULT=8\.8\.8\.8/);
  },
);

test(
  'frontend rejects proxy configuration that could inject nginx directives',
  { skip: !enabled },
  () => {
    const result = runProxy('127.0.0.1; allow all', '8.8.8.8');
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /SEKERCHAT_TRUSTED_EDGE_PROXY/);
  },
);
