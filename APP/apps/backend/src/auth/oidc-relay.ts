export function renderOidcRelayPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Completing Sign-In</title>
  </head>
  <body>
    <script src="/api/auth/browser/oidc/implicit/relay.js" defer></script>
  </body>
</html>`;
}

export function renderOidcRelayScript(): string {
  return `(() => {
  const complete = async () => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    const params = new URLSearchParams(hash);
    const response = await fetch('/api/auth/browser/oidc/implicit/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: params.get('access_token') || undefined,
        idToken: params.get('id_token') || undefined,
        state: params.get('state') || undefined,
        error: params.get('error') || undefined,
      }),
    });
    const payload = await response.json().catch(() => ({ redirectUrl: '/' }));
    window.location.replace(payload.redirectUrl || '/');
  };
  void complete().catch(() => window.location.replace('/'));
})();`;
}
