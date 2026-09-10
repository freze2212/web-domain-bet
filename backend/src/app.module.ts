import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { OwnershipModule } from './ownership/ownership.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { DomainOrdersModule } from './domain-orders/domain-orders.module.js';
import { SpaceshipModule } from './spaceship/spaceship.module.js';
import { CloudflareModule } from './cloudflare/cloudflare.module.js';
import { TemplatesModule } from './templates/templates.module.js';
import { DomainsModule } from './domains/domains.module.js';
import { BatchModule } from './batch/batch.module.js';
import { HealthModule } from './health/health.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { HistoryModule } from './history/history.module.js';
import { ClonerModule } from './cloner/cloner.module.js';
import { TelegramModule } from './telegram/telegram.module.js';

@Module({
  imports: [
    AuthModule,
    OwnershipModule,
    WalletModule,
    DomainOrdersModule,
    SpaceshipModule,
    CloudflareModule,
    TemplatesModule,
    DomainsModule,
    BatchModule,
    HealthModule,
    TasksModule,
    HistoryModule,
    ClonerModule,
    TelegramModule,
  ],
})
export class AppModule {}
