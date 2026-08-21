import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { FILE_SHARE_PASSWORD_LENGTH } from './file-share-password-policy';

const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const ALL_PASSWORD_CHARACTERS = `${UPPERCASE}${LOWERCASE}${DIGITS}`;

@Injectable()
export class FileShareCredentialsService {
  private readonly encryptionKey: Buffer;

  constructor(configService: ConfigService) {
    const secret = configService.getOrThrow<string>('FILE_ACCESS_SECRET');
    this.encryptionKey = createHash('sha256').update(secret, 'utf8').digest();
  }

  generatePassword(): string {
    const characters = [
      this.pick(UPPERCASE),
      this.pick(LOWERCASE),
      this.pick(DIGITS),
    ];

    while (characters.length < FILE_SHARE_PASSWORD_LENGTH) {
      characters.push(this.pick(ALL_PASSWORD_CHARACTERS));
    }

    for (let index = characters.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(index + 1);
      [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
    }

    return characters.join('');
  }

  generatePublicToken(): string {
    return randomBytes(32).toString('base64url');
  }

  generateSessionToken(): string {
    return randomBytes(32).toString('base64url');
  }

  createDownloadSession(shareId: string, expiresAt: Date, tokenHash = ''): string {
    const payload = Buffer.from(JSON.stringify({ shareId, expiresAt: expiresAt.getTime(), tokenHash })).toString('base64url');
    const signature = createHmac('sha256', this.encryptionKey).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  verifyDownloadSession(session: string, shareId: string, now = new Date(), tokenHash = ''): boolean {
    const [payload, signature] = session.split('.');
    if (!payload || !signature) return false;

    const expected = createHmac('sha256', this.encryptionKey).update(payload).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        shareId?: unknown;
        expiresAt?: unknown;
        tokenHash?: unknown;
      };
      return decoded.shareId === shareId
        && typeof decoded.expiresAt === 'number'
        && decoded.expiresAt > now.getTime()
        && decoded.tokenHash === tokenHash;
    } catch {
      return false;
    }
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  fingerprintClientAddress(address: string): string {
    return createHmac('sha256', this.encryptionKey)
      .update(`file-share-client:${address.trim() || 'unknown'}`, 'utf8')
      .digest('hex');
  }

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  encryptPassword(password: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
  }

  decryptPassword(value: string): string {
    const [version, ivValue, tagValue, ciphertextValue] = value.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || ciphertextValue === undefined) {
      throw new Error('Invalid encrypted file-share password.');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivValue, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private pick(characters: string): string {
    return characters[randomInt(characters.length)];
  }
}
