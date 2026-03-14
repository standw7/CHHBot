"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startReminderService = startReminderService;
exports.stopReminderService = stopReminderService;
const pino_1 = __importDefault(require("pino"));
const queries_js_1 = require("../db/queries.js");
const logger = (0, pino_1.default)({ name: 'reminder-service' });
const POLL_INTERVAL_MS = 15_000;
let timer = null;
function startReminderService(client) {
    if (timer)
        return;
    logger.info('Starting reminder service');
    timer = setInterval(() => checkReminders(client), POLL_INTERVAL_MS);
    checkReminders(client);
}
function stopReminderService() {
    if (timer) {
        clearInterval(timer);
        timer = null;
        logger.info('Stopped reminder service');
    }
}
async function checkReminders(client) {
    try {
        const due = (0, queries_js_1.getDueReminders)();
        for (const reminder of due) {
            try {
                if (reminder.dm) {
                    const user = await client.users.fetch(reminder.user_id);
                    await user.send(`**Reminder:** ${reminder.message}`);
                }
                else {
                    const channel = await client.channels.fetch(reminder.channel_id);
                    if (channel && channel.isTextBased()) {
                        await channel.send(`<@${reminder.user_id}> **Reminder:** ${reminder.message}`);
                    }
                    else {
                        const user = await client.users.fetch(reminder.user_id);
                        await user.send(`**Reminder:** ${reminder.message}\n*(Original channel is no longer available)*`);
                    }
                }
                logger.info({ id: reminder.id, userId: reminder.user_id }, 'Reminder fired');
            }
            catch (err) {
                logger.error({ err, id: reminder.id }, 'Failed to deliver reminder');
            }
            (0, queries_js_1.deleteReminder)(reminder.id);
        }
    }
    catch (err) {
        logger.error({ err }, 'Error checking reminders');
    }
}
//# sourceMappingURL=reminderService.js.map