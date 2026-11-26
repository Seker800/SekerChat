import { GoneException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Single server-side switch for the QQ bridge runtime.
 *
 * The bridge is an optional integration: when it is off, connector routes must
 * not touch the database, and message writes must not enqueue bridge work.
 * Admin endpoints stay available so an operator can inspect or clean up the
 * existing configuration; they are not part of the polling path.
 */
@Injectable()
export class QqBridgeAvailabilityService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled(): boolean {
    return this.configService.get<boolean>('QQ_BRIDGE_ENABLED') === true;
  }

  assertEnabled(): void {
    if (!this.isEnabled()) {
      throw new GoneException('QQ 桥接已停用。');
    }
  }
}
