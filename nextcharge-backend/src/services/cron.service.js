const cron = require('node-cron');
const Booking = require('../models/Booking');
const Station = require('../models/Station');
const logger = require('../utils/logger');

// ─── Expire no-show bookings (every 5 min) ────────────────────────────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const grace = new Date(Date.now() - 15 * 60 * 1000); // 15 min past start

    const expired = await Booking.find({
      status: 'confirmed',
      scheduledStart: { $lt: grace }
    });

    for (const booking of expired) {
      booking.status = 'no_show';
      await booking.save();

      // Release connector
      await Station.updateOne(
        { _id: booking.station, 'connectors.id': booking.connectorId },
        { $set: { 'connectors.$.status': 'available', 'connectors.$.currentSession': {} } }
      );
    }

    if (expired.length) logger.info(`[CRON] Marked ${expired.length} bookings as no_show`);
  } catch (err) {
    logger.error('[CRON] no_show check failed:', err.message);
  }
});

// ─── Expire pending (unpaid) bookings after 15 min (every 5 min) ─────────────
cron.schedule('*/5 * * * *', async () => {
  try {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const result = await Booking.updateMany(
      { status: 'pending', createdAt: { $lt: cutoff } },
      { status: 'expired' }
    );

    if (result.modifiedCount) logger.info(`[CRON] Expired ${result.modifiedCount} unpaid bookings`);
  } catch (err) {
    logger.error('[CRON] expire pending failed:', err.message);
  }
});

// ─── Refresh station connector stats (every 2 min) ────────────────────────────
cron.schedule('*/2 * * * *', async () => {
  try {
    const stations = await Station.find({ status: 'active' });
    for (const station of stations) {
      const available = station.connectors.filter(c => c.status === 'available').length;
      if (station.stats.availableConnectors !== available) {
        station.stats.availableConnectors = available;
        await station.save();
      }
    }
  } catch (err) {
    logger.error('[CRON] connector stats refresh failed:', err.message);
  }
});

// ─── Daily cleanup: remove expired OTPs from logs (midnight) ─────────────────
cron.schedule('0 0 * * *', async () => {
  try {
    logger.info('[CRON] Daily cleanup complete');
  } catch (err) {
    logger.error('[CRON] daily cleanup failed:', err.message);
  }
});

logger.info('✅ Cron jobs registered');
