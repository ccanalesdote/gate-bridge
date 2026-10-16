function required(name: string, raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function optional(raw: string | undefined): string {
  return raw?.trim() ?? '';
}

function positiveInteger(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

export type GateMode = 'simulation' | 'live';

export type BridgeConfig = {
  publicMqttUrl: string;
  publicMqttUser: string;
  publicMqttPassword: string;
  commandTopic: string;
  statusTopic: string;
  localMqttUrl: string;
  localMqttUser: string;
  localMqttPassword: string;
  localGateTopic: string;
  mode: GateMode;
  commandMaxSkewMs: number;
  commandMinTtlMs: number;
  rateLimitMs: number;
  processedMax: number;
  stateFile: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const mode = optional(env.GATE_MODE) || 'simulation';
  if (mode !== 'simulation' && mode !== 'live') throw new Error('GATE_MODE must be simulation or live');
  return {
    publicMqttUrl: required('PUBLIC_MQTT_URL', env.PUBLIC_MQTT_URL),
    publicMqttUser: required('PUBLIC_MQTT_USER', env.PUBLIC_MQTT_USER),
    publicMqttPassword: required('PUBLIC_MQTT_PASSWORD', env.PUBLIC_MQTT_PASSWORD),
    commandTopic: optional(env.COMMAND_TOPIC) || 'gate/command',
    statusTopic: optional(env.STATUS_TOPIC) || 'gate/status',
    localMqttUrl: required('LOCAL_MQTT_URL', env.LOCAL_MQTT_URL),
    localMqttUser: optional(env.LOCAL_MQTT_USER),
    localMqttPassword: optional(env.LOCAL_MQTT_PASSWORD),
    localGateTopic: optional(env.LOCAL_GATE_TOPIC) || 'zigbee2mqtt/rele_aqara_gate/set',
    mode,
    commandMaxSkewMs: positiveInteger('COMMAND_MAX_SKEW_MS', env.COMMAND_MAX_SKEW_MS, 5000),
    commandMinTtlMs: positiveInteger('COMMAND_MIN_TTL_MS', env.COMMAND_MIN_TTL_MS, 0),
    rateLimitMs: positiveInteger('RATE_LIMIT_MS', env.RATE_LIMIT_MS, 2500),
    processedMax: positiveInteger('PROCESSED_MAX', env.PROCESSED_MAX, 1000),
    stateFile: optional(env.STATE_FILE) || './state/processed.jsonl',
  };
}
