var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BridgeService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { connect } from 'mqtt';
import { BRIDGE_CONFIG } from './config.token.js';
import { validateCommand } from '../command/command.schema.js';
import { ProcessedStore } from '../command/processed.store.js';
let BridgeService = BridgeService_1 = class BridgeService {
    config;
    logger = new Logger(BridgeService_1.name);
    processed;
    publicClient;
    localClient;
    lastExecutionAt = 0;
    constructor(config) {
        this.config = config;
        this.processed = new ProcessedStore(config.stateFile, config.processedMax);
    }
    async onModuleInit() {
        this.publicClient = connect(this.config.publicMqttUrl, {
            username: this.config.publicMqttUser,
            password: this.config.publicMqttPassword,
            clean: true,
            clientId: `gate_bridge_${randomUUID().slice(0, 8)}`,
            reconnectPeriod: 5000,
        });
        this.publicClient.on('connect', () => {
            this.logger.log(`conectado a MQTT público (${this.config.mode})`);
            this.publicClient?.subscribe(this.config.commandTopic, { qos: 0 }, (error) => {
                if (error)
                    this.logger.error(`fallo al suscribir ${this.config.commandTopic}: ${error.message}`);
            });
        });
        this.publicClient.on('reconnect', () => this.logger.warn('reconectando a MQTT público'));
        this.publicClient.on('error', (error) => this.logger.error(`MQTT público: ${error.message}`));
        this.publicClient.on('message', (topic, payload, packet) => {
            void this.onCommand(topic, payload, packet.retain);
        });
        if (this.config.mode === 'live') {
            this.localClient = connect(this.config.localMqttUrl, {
                username: this.config.localMqttUser || undefined,
                password: this.config.localMqttPassword || undefined,
                clean: true,
                clientId: `gate_bridge_local_${randomUUID().slice(0, 8)}`,
                reconnectPeriod: 5000,
            });
            this.localClient.on('connect', () => this.logger.log('conectado a MQTT local'));
            this.localClient.on('error', (error) => this.logger.error(`MQTT local: ${error.message}`));
        }
        else {
            this.logger.log('modo simulación: no se conecta al MQTT local ni se acciona el relé');
        }
    }
    async onCommand(topic, payload, retain) {
        const id = this.extractId(payload);
        if (retain) {
            this.reject(id, 'mensaje retained');
            return;
        }
        let raw;
        try {
            raw = JSON.parse(payload.toString('utf8'));
        }
        catch {
            this.reject(id, 'JSON inválido');
            return;
        }
        const result = validateCommand(raw, {
            now: Date.now(),
            maxSkewMs: this.config.commandMaxSkewMs,
            minTtlMs: this.config.commandMinTtlMs,
        });
        if (!result.ok) {
            this.reject(id, result.reason);
            return;
        }
        const command = result.command;
        if (this.processed.has(command.id)) {
            this.logger.warn(`duplicado ignorado id=${command.id}`);
            this.publishStatus(command.id, 'rejected', 'comando duplicado');
            return;
        }
        const now = Date.now();
        if (now - this.lastExecutionAt < this.config.rateLimitMs) {
            this.processed.add(command.id, 'rejected');
            this.reject(command.id, 'rate limit: apertura demasiado seguida');
            return;
        }
        if (this.config.mode === 'simulation') {
            this.lastExecutionAt = now;
            this.processed.add(command.id, 'simulated');
            this.logger.log(`SIMULACIÓN id=${command.id} topic=${topic} → publicaría ${this.config.localGateTopic} {"state_l1":"ON"} (sin accionar relé)`);
            this.publishStatus(command.id, 'sent_to_local_broker', `simulación: publicaría ${this.config.localGateTopic}`);
            return;
        }
        this.executeLive(command.id);
    }
    executeLive(id) {
        const local = this.localClient;
        if (!local || !local.connected) {
            this.processed.add(id, 'uncertain');
            this.logger.error(`sin MQTT local id=${id}: resultado incierto`);
            this.publishStatus(id, 'uncertain', 'MQTT local no disponible');
            return;
        }
        this.lastExecutionAt = Date.now();
        local.publish(this.config.localGateTopic, JSON.stringify({ state_l1: 'ON' }), { qos: 0, retain: false }, (error) => {
            if (error) {
                this.processed.add(id, 'uncertain');
                this.logger.error(`publish local falló id=${id}: ${error.message}`);
                this.publishStatus(id, 'uncertain', 'publish local falló');
                return;
            }
            this.processed.add(id, 'sent_to_local_broker');
            this.logger.log(`pulso enviado id=${id} topic=${this.config.localGateTopic}`);
            this.publishStatus(id, 'sent_to_local_broker', `publicado en ${this.config.localGateTopic}`);
        });
    }
    extractId(payload) {
        try {
            const parsed = JSON.parse(payload.toString('utf8'));
            return typeof parsed?.id === 'string' ? parsed.id : `desconocido-${randomUUID().slice(0, 8)}`;
        }
        catch {
            return `desconocido-${randomUUID().slice(0, 8)}`;
        }
    }
    reject(id, reason) {
        this.processed.add(id, 'rejected');
        this.logger.warn(`rechazado id=${id}: ${reason}`);
        this.publishStatus(id, 'rejected', reason);
    }
    publishStatus(id, result, detail) {
        this.publicClient?.publish(this.config.statusTopic, JSON.stringify({ id, result, detail, at: new Date().toISOString() }), { qos: 0, retain: false });
    }
    async onModuleDestroy() {
        await this.publicClient?.endAsync();
        await this.localClient?.endAsync();
    }
};
BridgeService = BridgeService_1 = __decorate([
    Injectable(),
    __param(0, Inject(BRIDGE_CONFIG)),
    __metadata("design:paramtypes", [Object])
], BridgeService);
export { BridgeService };
