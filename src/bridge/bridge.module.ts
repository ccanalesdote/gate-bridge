import { Module } from '@nestjs/common';
import { loadConfig } from '../config.js';
import { BRIDGE_CONFIG } from './config.token.js';
import { BridgeService } from './bridge.service.js';

@Module({
  providers: [{ provide: BRIDGE_CONFIG, useFactory: () => loadConfig() }, BridgeService],
})
export class BridgeModule {}
