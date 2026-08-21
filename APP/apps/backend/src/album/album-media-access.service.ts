import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface AlbumMediaTicket {
  v: 1;
  key: string;
  mimeType: string;
  expiresAt: number;
}

@Injectable()
export class AlbumMediaAccessService {
  private readonly secret: Buffer;
  private readonly lifetimeSeconds = 10 * 60;

  constructor(config: ConfigService) {
    this.secret = Buffer.from(config.getOrThrow<string>('FILE_ACCESS_SECRET'));
  }

  issue(storageKey: string, mimeType: string, now = Date.now()): string {
    const currentWindow = Math.floor(now / 1_000 / this.lifetimeSeconds);
    const payload = Buffer.from(
      JSON.stringify({
        v: 1,
        key: storageKey,
        mimeType,
        // Keep URLs stable within a cache window while retaining at least one full
        // window of validity for tickets issued near a boundary.
        expiresAt: (currentWindow + 2) * this.lifetimeSeconds,
      } satisfies AlbumMediaTicket),
    ).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  verify(value: string, now = Date.now()): AlbumMediaTicket | null {
    const [payload, signature, extra] = value.split('.');
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    try {
      const ticket = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as AlbumMediaTicket;
      if (
        ticket.v !== 1 ||
        !ticket.key?.startsWith('album/') ||
        (!ticket.mimeType?.startsWith('image/') && ticket.mimeType !== 'video/mp4') ||
        ticket.expiresAt <= Math.floor(now / 1_000)
      ) {
        return null;
      }
      return ticket;
    } catch {
      return null;
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }
}
