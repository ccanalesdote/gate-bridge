# gate-bridge

Contenedor Node.js/TypeScript que corre en el mini-PC de casa. Se conecta **solo por
conexiones salientes** al MQTT público (EMQX en Coolify), escucha `gate/command` y,
según el modo, publica el pulso en el MQTT local de Zigbee2MQTT.

Mismo stack que `chargers`: Node 22, TypeScript estricto, NestJS, zod y mqtt.js.

## Modos

- `GATE_MODE=simulation` (Hito 2): valida, deduplica y rate-limita, y **solo registra**
  qué habría hecho. No publica al relé ni responde ACK.
- `GATE_MODE=live` (Hito 3): publica `zigbee2mqtt/rele_aqara_gate/set` con
  `{"state_l1":"ON"}` y responde en `gate/status`.

## Reglas aplicadas (ver `docs/seguridad.md`)

1. Solo acepta `command = "open"`; cualquier otro payload se rechaza.
2. Valida `id` UUID, `issued_at`/`expires_at` con ventana corta y tolerancia de reloj.
3. Rechaza vencidos, futuros fuera de tolerancia y mensajes `retained`.
4. Deduplica por `id` de forma persistente (`STATE_FILE`, sobrevive reinicios).
5. Rate limit: máximo una apertura cada `RATE_LIMIT_MS`.
6. Sin reintento automático ante resultado incierto.
7. Publica ACK correlacionado en `gate/status` con el mismo `id`.
8. Logs con fecha/hora, id y resultado.

## Configuración

Copia `.env.example` a `.env` y completa. Las claves no se commitean.

| Variable | Uso |
| --- | --- |
| `PUBLIC_MQTT_URL` | URL del MQTT público (`mqtts://…:8883` cuando haya TLS) |
| `PUBLIC_MQTT_USER` / `PUBLIC_MQTT_PASSWORD` | Credenciales `gate_bridge` |
| `COMMAND_TOPIC` / `STATUS_TOPIC` | `gate/command` / `gate/status` |
| `LOCAL_MQTT_URL` | MQTT local de Zigbee2MQTT |
| `LOCAL_MQTT_USER` / `LOCAL_MQTT_PASSWORD` | Credenciales locales (si aplican) |
| `LOCAL_GATE_TOPIC` | `zigbee2mqtt/rele_aqara_gate/set` |
| `GATE_MODE` | `simulation` o `live` |
| `COMMAND_MAX_SKEW_MS` | Tolerancia de reloj para `issued_at` |
| `RATE_LIMIT_MS` | Separación mínima entre aperturas |
| `STATE_FILE` | Archivo de ids procesados |

## Uso local

```sh
cp .env.example .env
npm install
npm run build
npm test     # pruebas unitarias del validador y del store persistente
npm start
```

## Docker

```sh
docker build -t gate-bridge .
docker run --rm --env-file .env -v gate_state:/app/state gate-bridge
```

## ACK (nivel alcanzado)

`gate/status` **no** significa "portón abierto". Informa solo el nivel alcanzado:
`rejected` (no ejecutada), `sent_to_local_broker` (orden enviada a Zigbee2MQTT) o
`uncertain` (resultado incierto; no se reintenta). Sin sensor de apertura, no se puede
afirmar que el portón abrió.
