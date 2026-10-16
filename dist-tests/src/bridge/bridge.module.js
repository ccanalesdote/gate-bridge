var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { loadConfig } from '../config.js';
import { BRIDGE_CONFIG } from './config.token.js';
import { BridgeService } from './bridge.service.js';
let BridgeModule = class BridgeModule {
};
BridgeModule = __decorate([
    Module({
        providers: [{ provide: BRIDGE_CONFIG, useFactory: () => loadConfig() }, BridgeService],
    })
], BridgeModule);
export { BridgeModule };
