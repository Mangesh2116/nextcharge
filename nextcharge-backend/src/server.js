require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const stationRoutes = require('./routes/station.routes');
const bookingRoutes = require('./routes/booking.routes');
const paymentRoutes = require('./routes/payment.routes');
const reviewRoutes = require('./routes/review.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();
const server = http.createServer(app);

// ─── Socket.IO (Real-time station status) ────────────────────────────────────
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || '*', methods: ['GET', 'POST'] }
});

// Attach io to app so controllers can emit events
app.set('io', io);

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  socket.on('subscribe:station', (stationId) => {
    socket.join(`station:${stationId}`);
    logger.info(`Socket ${socket.id} subscribed to station ${stationId}`);
  });

  socket.on('unsubscribe:station', (stationId) => {
    socket.leave(`station:${stationId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// ─── API Routes ───────────────────────────────────────────────────────────────
// Health check
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'NextCharge API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV
  });
});

app.use('/api/v1/auth',     authRoutes);
app.use('/api/v1/users',    userRoutes);
app.use('/api/v1/stations', stationRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/reviews',  reviewRoutes);
app.use('/api/v1/admin',    adminRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await connectDB();

// 🔥 Only connect Redis if enabled
if (process.env.DISABLE_REDIS !== "true") {
  try {
    await connectRedis();
    logger.info("✅ Redis connected");
  } catch (err) {
    logger.warn("⚠️ Redis not available, continuing without it");
  }
} else {
  logger.info("🚫 Redis disabled");
}

    server.listen(PORT, () => {
      logger.info(`🚀 NextCharge API running on port ${PORT} [${process.env.NODE_ENV}]`);
      logger.info(`📡 WebSocket server active`);
      logger.info(`📖 Docs: http://localhost:${PORT}/api/v1/docs`);
    });
  } catch (err) {
    logger.error('Failed to start server:', err);
    process.exit(1);
  }
};

start();

module.exports = { app, io };

console.log("JWT_SECRET:", process.env.JWT_SECRET);
