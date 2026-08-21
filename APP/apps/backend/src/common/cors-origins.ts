const loopbackHostnames = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function resolveCorsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.CORS_ORIGINS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  const origins: string[] = [];
  const appBaseUrl = env.APP_BASE_URL?.trim();
  if (appBaseUrl) {
    origins.push(appBaseUrl);
  }
  const apiBaseUrl = env.API_BASE_URL?.trim();
  if (apiBaseUrl) {
    origins.push(apiBaseUrl);
  }

  return origins.length ? origins : ['http://localhost:5173'];
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return (protocol === 'http:' || protocol === 'https:') && loopbackHostnames.has(hostname);
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
): boolean {
  if (!requestOrigin) {
    return true;
  }

  // Dev mode allows all origins so the app is reachable from LAN devices
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }

  return allowedOrigins.includes(requestOrigin) || isLoopbackOrigin(requestOrigin);
}
