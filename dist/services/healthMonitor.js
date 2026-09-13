"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHealthMonitor = startHealthMonitor;
exports.stopHealthMonitor = stopHealthMonitor;
const discord_js_1 = require("discord.js");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ name: 'health-monitor' });
const CHECK_INTERVAL_MS = 30_000;
// If the gateway has not been in the Ready state for this long, the process is
// treated as a zombie and exits so PM2 can restart it. discord.js normally
// reconnects on its own; this only fires when that has stalled.
const MAX_DISCONNECTED_MS = 5 * 60_000;
let timer = null;
let lastReadyAt = Date.now();
function startHealthMonitor(client) {
    if (timer)
        return;
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
function stopHealthMonitor() {
    if (timer) {
        clearInterval(timer);
        timer = null;
        logger.info('Stopped health monitor');
    }
}
function check(client) {
    const status = client.ws.status;
    if (status === discord_js_1.Status.Ready) {
        lastReadyAt = Date.now();
        return;
    }
    const disconnectedMs = Date.now() - lastReadyAt;
    logger.warn({ status: discord_js_1.Status[status], disconnectedMs }, 'Gateway not ready');
    if (disconnectedMs > MAX_DISCONNECTED_MS) {
        logger.fatal({ status: discord_js_1.Status[status], disconnectedMs }, 'Gateway disconnected too long, exiting for restart');
        // Non-zero exit so PM2 treats this as a crash and restarts immediately.
        process.exit(1);
    }
}
//# sourceMappingURL=healthMonitor.js.map