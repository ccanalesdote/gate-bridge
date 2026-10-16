import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { connect, type MqttClient } from 'mqtt';
import type { BridgeConfig } from '../config.js';
import { BRIDGE_CONFIG } from './config.token.js';
import { validateCommand } from '../command/command.schema.js';
import { ProcessedStore } from '../command/processed.store.js';

type StatusResult = 'rejected' | 'sent_to_local_broker' | 'uncertain';

@Injectable()
export class BridgeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BridgeService.name);
  private readonly processed: ProcessedStore;
  private publicClient?: MqttClient;
  private localClient?: MqttClient;
  private lastExecutionAt = 0;

  constructor(@Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig) {
    this.processed = new ProcessedStore(config.stateFile, config.processedMax);
  }

  async onModuleInit(): Promise<void> {
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
        if (error) this.logger.error(`fallo al suscribir ${this.config.commandTopic}: ${error.message}`);
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
    } else {
      this.logger.log('modo simulación: no se conecta al MQTT local ni se acciona el relé');
    }
  }

  private async onCommand(topic: string, payload: Buffer, retain: boolean): Promise<void> {
    const id = this.extractId(payload);
    if (retain) {
      this.reject(id, 'mensaje retained');
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(payload.toString('utf8'));
    } catch {
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
      this.logger.log(`SIMULACIÓN id=${command.id} topic=${topic} → publicaría ${this.config.localGateTopic} {"state_l1":"ON"} (sin accionar relé, sin ACK)`);
      return;
    }

    this.executeLive(command.id);
  }

  private executeLive(id: string): void {
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

  private extractId(payload: Buffer): string {
    try {
      const parsed = JSON.parse(payload.toString('utf8')) as { id?: unknown };
      return typeof parsed?.id === 'string' ? parsed.id : `desconocido-${randomUUID().slice(0, 8)}`;
    } catch {
      return `desconocido-${randomUUID().slice(0, 8)}`;
    }
  }

  private reject(id: string, reason: string): void {
    this.processed.add(id, 'rejected');
    this.logger.warn(`rechazado id=${id}: ${reason}`);
    this.publishStatus(id, 'rejected', reason);
  }

  private publishStatus(id: string, result: StatusResult, detail: string): void {
    this.publicClient?.publish(
      this.config.statusTopic,
      JSON.stringify({ id, result, detail, at: new Date().toISOString() }),
      { qos: 0, retain: false },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.publicClient?.endAsync();
    await this.localClient?.endAsync();
  }
}
