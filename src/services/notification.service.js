const nodemailer = require('nodemailer');
const axios = require('axios');
const { getPool } = require('../config/database');
const logger = require('../utils/logger');

/**
 * NotificationService
 *
 * Dispatches alerts via configured channels: email and/or webhook.
 * Each monitor can have its own notification settings pulled from DB.
 */
class NotificationService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(monitor, type, errorMsg) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT * FROM notification_channels WHERE user_id = $1 AND is_active = TRUE',
      [monitor.user_id]
    );

    const channels = result.rows;
    for (const channel of channels) {
      try {
        if (channel.type === 'email') await this._sendEmail(channel, monitor, type, errorMsg);
        if (channel.type === 'webhook') await this._sendWebhook(channel, monitor, type, errorMsg);
      } catch (err) {
        logger.error({ err, channel: channel.type }, 'Notification delivery failed');
      }
    }
  }

  async _sendEmail(channel, monitor, type, errorMsg) {
    const isDown = type === 'down';
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM || 'alerts@healthmon.dev',
      to: channel.config.email,
      subject: isDown
        ? `🔴 DOWN: ${monitor.name}`
        : `🟢 RECOVERED: ${monitor.name}`,
      html: `
        <h2>${isDown ? '🔴 Monitor Down' : '🟢 Monitor Recovered'}</h2>
        <p><strong>${monitor.name}</strong> (${monitor.url})</p>
        ${isDown ? `<p>Error: ${errorMsg}</p>` : '<p>The endpoint is responding normally.</p>'}
        <p>Time: ${new Date().toISOString()}</p>
      `,
    });
    logger.info({ monitorId: monitor.id, type }, 'Email alert sent');
  }

  async _sendWebhook(channel, monitor, type, errorMsg) {
    await axios.post(channel.config.url, {
      event: type,
      monitor: { id: monitor.id, name: monitor.name, url: monitor.url },
      error: errorMsg,
      timestamp: new Date().toISOString(),
    }, { timeout: 5000 });
    logger.info({ monitorId: monitor.id, type }, 'Webhook alert sent');
  }

  async addChannel(userId, type, config) {
    const pool = getPool();
    await pool.query(
      'INSERT INTO notification_channels (user_id, type, config) VALUES ($1, $2, $3)',
      [userId, type, JSON.stringify(config)]
    );
  }

  async listChannels(userId) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, type, config, is_active, created_at FROM notification_channels WHERE user_id = $1',
      [userId]
    );
    return result.rows;
  }
}

module.exports = new NotificationService();
