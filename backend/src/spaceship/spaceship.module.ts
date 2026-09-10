import { Module, Global } from '@nestjs/common';
import { SpaceshipService } from './spaceship.service.js';

@Global()
@Module({
  providers: [SpaceshipService],
  exports: [SpaceshipService],
})
export class SpaceshipModule {}
