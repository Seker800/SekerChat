export function resolveTrustedProxyCidrs(
  raw = process.env.TRUSTED_PROXY_CIDRS,
): string[] | false {
  const cidrs = raw
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  return cidrs.length > 0 ? cidrs : false;
}
