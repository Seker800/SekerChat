import { isIP } from 'node:net';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { gunzip, gunzipSync } from 'node:zlib';
import { promisify } from 'node:util';
import { Reader, type CountryResponse } from 'mmdb-lib';
import * as ipaddr from 'ipaddr.js';

let countryReader: Reader<CountryResponse> | undefined;
const gunzipAsync = promisify(gunzip);

/** Warm the bundled snapshot before the first request instead of blocking it. */
export async function preloadNetworkStatus(): Promise<void> {
  if (countryReader) return;
  try {
    const compressed = await readFile(require.resolve('geolite2-country/GeoLite2-Country.mmdb.gz'));
    countryReader = new Reader<CountryResponse>(await gunzipAsync(compressed));
  } catch {
    // A missing snapshot only disables the warning; the app must still start.
  }
}

export function getNetworkStatus(ip: string | undefined): { showWarning: boolean } {
  try {
    if (!ip || !isIP(ip)) return { showWarning: false };
    const address = ipaddr.process(ip);
    if (address.range() !== 'unicast') return { showWarning: false };

    // Load the bundled country-only snapshot once, with no runtime network calls.
    // Unavailable data must never prevent startup or block the workspace.
    countryReader ??= new Reader<CountryResponse>(
      gunzipSync(readFileSync(require.resolve('geolite2-country/GeoLite2-Country.mmdb.gz'))),
    );
    const country = countryReader.get(address.toString())?.country?.iso_code;
    return {
      showWarning: !!country && /^[A-Z]{2}$/.test(country) && !['CN', 'ZZ', 'XX'].includes(country),
    };
  } catch {
    return { showWarning: false };
  }
}
