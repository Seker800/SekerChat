import { Controller, Get } from '@nestjs/common';
import { HealthReadinessService } from './health-readiness.service';

@Controller()
export class AppController {
  constructor(private readonly readiness: HealthReadinessService) {}

  @Get('health')
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/live')
  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('health/ready')
  getReadiness(): Promise<{ status: 'ready' }> {
    return this.readiness.check();
  }
}
