const User = require('../models/User');
const Station = require('../models/Station');
const Booking = require('../models/Booking');
const Review = require('../models/Review');
const { asyncHandler, sendSuccess, sendPaginated } = require('../utils/errors');

// ─── Dashboard Overview ───────────────────────────────────────────────────────
exports.getDashboard = asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalUsers, newUsersThisMonth,
    totalStations, activeStations,
    totalBookings, bookingsThisMonth,
    revenueResult, lastMonthRevenue,
    recentBookings, topStations
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    User.countDocuments({ role: 'user', createdAt: { $gte: startOfMonth } }),
    Station.countDocuments(),
    Station.countDocuments({ status: 'active' }),
    Booking.countDocuments({ status: 'completed' }),
    Booking.countDocuments({ status: 'completed', createdAt: { $gte: startOfMonth } }),
    Booking.aggregate([
      { $match: { status: 'completed', 'payment.status': 'paid', createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$pricing.finalAmount' } } }
    ]),
    Booking.aggregate([
      { $match: { status: 'completed', 'payment.status': 'paid', createdAt: { $gte: startOfLastMonth, $lt: startOfMonth } } },
      { $group: { _id: null, total: { $sum: '$pricing.finalAmount' } } }
    ]),
    Booking.find({ status: { $in: ['confirmed', 'in_progress'] } })
      .populate('user', 'name phone')
      .populate('station', 'name address.city')
      .sort({ scheduledStart: 1 })
      .limit(10),
    Station.find({ status: 'active' }).sort({ 'stats.totalSessions': -1 }).limit(5).select('name address.city stats')
  ]);

  const thisMonthRev = revenueResult[0]?.total || 0;
  const lastMonthRev = lastMonthRevenue[0]?.total || 0;

  sendSuccess(res, {
    overview: {
      totalUsers,
      newUsersThisMonth,
      totalStations,
      activeStations,
      totalBookings,
      bookingsThisMonth,
      revenueThisMonth: Math.round(thisMonthRev),
      revenueTrend: lastMonthRev ? Math.round(((thisMonthRev - lastMonthRev) / lastMonthRev) * 100) : 0
    },
    recentBookings,
    topStations
  }, 'Admin dashboard fetched');
});

// ─── Manage Users ─────────────────────────────────────────────────────────────
exports.getUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, role, search, isActive } = req.query;
  const query = {};
  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';
  if (search) query.$or = [
    { name: new RegExp(search, 'i') },
    { email: new RegExp(search, 'i') },
    { phone: new RegExp(search, 'i') }
  ];

  const [users, total] = await Promise.all([
    User.find(query).sort({ createdAt: -1 }).limit(parseInt(limit)).skip((parseInt(page) - 1) * parseInt(limit)),
    User.countDocuments(query)
  ]);

  sendPaginated(res, users, total, page, limit, 'Users fetched');
});

exports.toggleUserStatus = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);
  if (!user) throw new AppError('User not found.', 404);
  user.isActive = !user.isActive;
  await user.save();
  sendSuccess(res, { isActive: user.isActive }, `User ${user.isActive ? 'activated' : 'deactivated'}`);
});

exports.changeUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const user = await User.findByIdAndUpdate(req.params.userId, { role }, { new: true });
  if (!user) throw new AppError('User not found.', 404);
  sendSuccess(res, { user: user.toPublic() }, 'User role updated');
});

// ─── Manage Stations ──────────────────────────────────────────────────────────
exports.getPendingStations = asyncHandler(async (req, res) => {
  const stations = await Station.find({ isVerified: false }).populate('operator', 'name email phone');
  sendSuccess(res, { stations }, 'Pending stations fetched');
});

exports.verifyStation = asyncHandler(async (req, res) => {
  const station = await Station.findByIdAndUpdate(
    req.params.stationId,
    { isVerified: true, status: 'active' },
    { new: true }
  );
  if (!station) throw new AppError('Station not found.', 404);
  sendSuccess(res, { station }, 'Station verified and activated');
});

exports.deleteStation = asyncHandler(async (req, res) => {
  await Station.findByIdAndUpdate(req.params.stationId, { status: 'inactive' });
  sendSuccess(res, {}, 'Station deactivated');
});

// ─── Revenue Analytics ────────────────────────────────────────────────────────
exports.getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period = 'monthly', year = new Date().getFullYear() } = req.query;

  const groupBy = period === 'daily'
    ? { $dateToString: { format: '%Y-%m-%d', date: '$payment.paidAt' } }
    : { $dateToString: { format: '%Y-%m', date: '$payment.paidAt' } };

  const analytics = await Booking.aggregate([
    { $match: { status: 'completed', 'payment.status': 'paid', 'payment.paidAt': { $gte: new Date(`${year}-01-01`) } } },
    { $group: { _id: groupBy, revenue: { $sum: '$pricing.finalAmount' }, sessions: { $sum: 1 }, kwhDelivered: { $sum: '$pricing.actualKwh' } } },
    { $sort: { _id: 1 } }
  ]);

  sendSuccess(res, { analytics }, 'Revenue analytics fetched');
});
