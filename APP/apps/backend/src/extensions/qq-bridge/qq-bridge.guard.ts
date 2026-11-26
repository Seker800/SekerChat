import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { QqBridgeConnector } from '@prisma/client';
import { QqBridgeAccessService } from './qq-bridge-access.service';
import { QqBridgeAvailabilityService } from './qq-bridge-availability.service';

export type BridgeRequest = Request & { connector: QqBridgeConnector };
@Injectable()
export class QqBridgeGuard implements CanActivate {
  constructor(
    private readonly access: QqBridgeAccessService,
    private readonly availability: QqBridgeAvailabilityService,
  ) {}
  async canActivate(context: ExecutionContext) {
    // Reject before authenticating so a disabled bridge never reaches the database.
    this.availability.assertEnabled();
    const request = context.switchToHttp().getRequest<BridgeRequest>();
    request.connector = await this.access.authenticate(request.headers.authorization);
    return true;
  }
}
