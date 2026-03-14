import { Client, TextChannel } from 'discord.js';
import pino from 'pino';
import { getDueReminders, deleteReminder } from '../db/queries.js';

const logger = pino({ name: 'reminder-service' });
const POLL_INTERVAL_MS = 15_000;
let timer: ReturnType<typeof setInterval> | null = null;

export function startReminderService(client: Client): void {
  if (timer) return;
  logger.info('Starting reminder service');
  timer = setInterval(() => checkReminders(client), POLL_INTERVAL_MS);
  checkReminders(client);
}

export function stopReminderService(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
    logger.info('Stopped reminder service');
  }
}

async function checkReminders(client: Client): Promise<void> {
  try {
    const due = getDueReminders();
    for (const reminder of due) {
      try {
        if (reminder.dm) {
          const user = await client.users.fetch(reminder.user_id);
          await user.send(`**Reminder:** ${reminder.message}`);
        } else {
          const channel = await client.channels.fetch(reminder.channel_id);
          if (channel && channel.isTextBased()) {
            await (channel as TextChannel).send(`<@${reminder.user_id}> **Reminder:** ${reminder.message}`);
          } else {
            const user = await client.users.fetch(reminder.user_id);
            await user.send(`**Reminder:** ${reminder.message}\n*(Original channel is no longer available)*`);
          }
        }
        logger.info({ id: reminder.id, userId: reminder.user_id }, 'Reminder fired');
      } catch (err) {
        logger.error({ err, id: reminder.id }, 'Failed to deliver reminder');
      }
      deleteReminder(reminder.id);
    }
  } catch (err) {
    logger.error({ err }, 'Error checking reminders');
  }
}
