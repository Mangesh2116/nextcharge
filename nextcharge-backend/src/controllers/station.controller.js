const Station = require('../models/Station');
const { AppError, asyncHandler, sendSuccess, sendPaginated } = require('../utils/errors');
const { getCache, setCache, deleteCache, deleteCachePattern } = require('../config/redis');

// ─── Search / Nearby ──────────────────────────────────────────────────────────
exports.getNearbyStations = asyncHandler(async (req, res) => {
  const {
    lat, lng,
    radius = 10,        // km
    connectorType,
    minPower,
    network,
    status = 'active',
    available,          // true = only with available connectors
    page = 1,
    limit = 20
  } = req.query;

  if (!lat || !lng) throw new AppError('Latitude and longitude are required.', 400);

  const cacheKey = `stations:nearby:${lat}:${lng}:${radius}:${connectorType || ''}:${available || ''}`;
  const cached = await getCache(cacheKey);
  if (cached) return sendSuccess(res, { stations: cached }, 'Nearby stations fetched (cached)');

  const query = { status };

  // Connector type filter
  if (connectorType) query['connectors.type'] = connectorType;
  if (minPower) query['connectors.powerKw'] = { $gte: parseInt(minPower) };
  if (network) query.network = network;
  if (available === 'true') query['stats.availableConnectors'] = { $gt: 0 };

  const stations = await Station.find({
    ...query,
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: parseFloat(radius) * 1000  // convert km to meters
      }
    }
  })
    .select('-connectors.currentSession -__v')
    .populate('operator', 'name')
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit));

  // Attach distance in km
  const stationsWithDistance = stations.map(s => {
    const obj = s.toObject();
    const [sLng, sLat] = s.location.coordinates;
    const dist = getDistanceKm(parseFloat(lat), parseFloat(lng), sLat, sLng);
    return { ...obj, distanceKm: Math.round(dist * 10) / 10 };
  });

  await setCache(cacheKey, stationsWithDistance, 60); // 60s cache for live data

  sendSuccess(res, { count: stationsWithDistance.length, stations: stationsWithDistance }, 'Nearby stations fetched');
});

// ─── Get all stations (with filters) ─────────────────────────────────────────
exports.getAllStations = asyncHandler(async (req, res) => {
  const { city, state, network, page = 1, limit = 20, sortBy = '-createdAt', search } = req.query;

  const query = { status: 'active' };
  if (city) query['address.city'] = new RegExp(city, 'i');
  if (state) query['address.state'] = new RegExp(state, 'i');
  if (network) query.network = network;
  if (search) query.name = new RegExp(search, 'i');

  const [stations, total] = await Promise.all([
    Station.find(query)
      .select('-connectors.currentSession -__v')
      .sort(sortBy)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit)),
    Station.countDocuments(query)
  ]);

  sendPaginated(res, stations, total, page, limit, 'Stations fetched');
});

// ─── Get single station ───────────────────────────────────────────────────────
exports.getStation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const cacheKey = `station:${id}`;
  const cached = await getCache(cacheKey);
  if (cached) return sendSuccess(res, { station: cached }, 'Station fetched (cached)');

  const station = await Station.findById(id)
    .populate('operator', 'name email phone')
    .populate({ path: 'reviews', options: { limit: 5, sort: { createdAt: -1 } } });

  if (!station) throw new AppError('Station not found.', 404);

  await setCache(cacheKey, station, 120);
  sendSuccess(res, { station }, 'Station fetched');
});

// ─── Get station availability (slot grid) ────────────────────────────────────
exports.getStationAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { date, connectorType } = req.query;

  if (!date) throw new AppError('Date is required.', 400);

  const station = await Station.findById(id);
  if (!station) throw new AppError('Station not found.', 404);

  const Booking = require('../models/Booking');
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const existingBookings = await Booking.find({
    station: id,
    scheduledStart: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['confirmed', 'in_progress'] }
  }).select('connectorId scheduledStart scheduledEnd');

  // Build availability by connector
  const connectors = connectorType
    ? station.connectors.filter(c => c.type === connectorType)
    : station.connectors;

  const availability = connectors.map(connector => {
    const connectorBookings = existingBookings.filter(b => b.connectorId === connector.id);
    const slots = generateTimeSlots(startOfDay, connectorBookings);
    return {
      connectorId: connector.id,
      type: connector.type,
      powerKw: connector.powerKw,
      pricePerKwh: connector.pricePerKwh,
      currentStatus: connector.status,
      slots
    };
  });

  sendSuccess(res, { date, availability }, 'Availability fetched');
});

// ─── Create station (operator/admin) ─────────────────────────────────────────
exports.createStation = asyncHandler(async (req, res) => {
  const station = await Station.create({ ...req.body, operator: req.user._id });
  await deleteCachePattern('stations:nearby:*');
  sendSuccess(res, { station }, 'Station created successfully', 201);
});

// ─── Update station ───────────────────────────────────────────────────────────
exports.updateStation = asyncHandler(async (req, res) => {
  const station = await Station.findById(req.params.id);
  if (!station) throw new AppError('Station not found.', 404);

  if (station.operator.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    throw new AppError('You are not authorized to update this station.', 403);
  }

  const updated = await Station.findByIdAndUpdate(req.params.id, req.body, {
    new: true, runValidators: true
  });

  await deleteCache(`station:${req.params.id}`);
  await deleteCachePattern('stations:nearby:*');

  sendSuccess(res, { station: updated }, 'Station updated');
});

// ─── Update connector status (real-time) ─────────────────────────────────────
exports.updateConnectorStatus = asyncHandler(async (req, res) => {
  const { stationId, connectorId } = req.params;
  const { status } = req.body;

  const station = await Station.findById(stationId);
  if (!station) throw new AppError('Station not found.', 404);

  const connector = station.connectors.id(connectorId);
  if (!connector) throw new AppError('Connector not found.', 404);

  connector.status = status;
  station.stats.availableConnectors = station.connectors.filter(c => c.status === 'available').length;
  await station.save();

  // Emit real-time update via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.to(`station:${stationId}`).emit('connector:status', { connectorId, status });
  }

  await deleteCache(`station:${stationId}`);
  sendSuccess(res, { connectorId, status }, 'Connector status updated');
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function deg2rad(deg) { return deg * (Math.PI / 180); }

function generateTimeSlots(date, bookings) {
  const slots = [];
  const openHour = 6, closeHour = 22;
  for (let h = openHour; h < closeHour; h++) {
    for (let m = 0; m < 60; m += 30) {
      const slotStart = new Date(date);
      slotStart.setHours(h, m, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + 30);

      const isBooked = bookings.some(b =>
        slotStart < new Date(b.scheduledEnd) && slotEnd > new Date(b.scheduledStart)
      );

      slots.push({
        time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        available: !isBooked,
        start: slotStart,
        end: slotEnd
      });
    }
  }
  return slots;
}
