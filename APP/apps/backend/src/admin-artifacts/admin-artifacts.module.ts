import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { AdminArtifactsController } from './admin-artifacts.controller';

@Module({
  imports: [ArtifactsModule],
  controllers: [AdminArtifactsController],
})
export class AdminArtifactsModule {}
