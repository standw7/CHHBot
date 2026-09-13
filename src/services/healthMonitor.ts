import { Client, Status } from 'discord.js';
import pino from 'pino';

const logger = pino({ name: 'health-monitor' });

const CHECK_INTERVAL_MS = 30_000;
// If the gateway has not been in the Ready state for this long, the process is
// treated as a zombie and exits so PM2 can restart it. discord.js normally
// reconnects on its own; this only fires when that has stalled.
const MAX_DISCONNECTED_MS = 5 * 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let lastReadyAt = Date.now();

export function startHealthMonitor(client: Client): void {
  if (timer) return;
  logger.info({ maxDisconnectedMs: MAX_DISCONNECTED_MS }, 'Starting health monitor');
  lastReadyAt = Date.now();

  client.on('shardDisconnect', (event, shardId) => {
    logger.warn({ shardId, code: event.code }, 'Shard disconnected');
  });
  client.on('shardReconnecting', shardId => {
    logger.warn({ shardId }, 'Shard reconnecting');
  });
  client.on('shardResume', (shardId, replayed) => {
    lastReadyAt = Date.now();
    logger.info({ shardId, replayed }, 'Shard resumed');
  });
  client.on('shardReady', shardId => {
    lastReadyAt = Date.now();
    logger.info({ shardId }, 'Shard ready');
  });
  client.on('shardError', (error, shardId) => {
    logger.error({ err: error, shardId }, 'Shard error');
  });

  timer = setInterval(() => check(client), CHECK_INTERVAL_MS);
}

export function stopHealthMonitor(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Stopped health monitor');
  }
}

function check(client: Client): void {
  const status = client.ws.status;
  if (status === Status.Ready) {
    lastReadyAt = Date.now();
    return;
  }

  const disconnectedMs = Date.now() - lastReadyAt;
  logger.warn({ status: Status[status], disconnectedMs }, 'Gateway not ready');

  if (disconnectedMs > MAX_DISCONNECTED_MS) {
    logger.fatal(
      { status: Status[status], disconnectedMs },
      'Gateway disconnected too long, exiting for restart',
    );
    // Non-zero exit so PM2 treats this as a crash and restarts immediately.
    process.exit(1);
  }
}
