import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../system-config/system-config.module';
import { LoginRiskController } from './login-risk.controller';
import { LoginRiskService } from './login-risk.service';

@Module({
  imports: [SystemConfigModule],
  controllers: [LoginRiskController],
  providers: [LoginRiskService],
  exports: [LoginRiskService],
})
export class LoginRiskModule {}
