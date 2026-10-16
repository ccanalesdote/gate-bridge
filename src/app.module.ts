import { Module } from '@nestjs/common';
import { BridgeModule } from './bridge/bridge.module.js';

@Module({
  imports: [BridgeModule],
})
export class AppModule {}
