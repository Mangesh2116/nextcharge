const User = require('../models/User');
const Booking = require('../models/Booking');
const { AppError, asyncHandler, sendSuccess } = require('../utils/errors');
const { deleteCache } = require('../config/redis');

// ─── Update Profile ───────────────────────────────────────────────────────────
exports.updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const allowedFields = { name, email };
  Object.keys(allowedFields).forEach(k => allowedFields[k] === undefined && delete allowedFields[k]);

  const user = await User.findByIdAndUpdate(req.user._id, allowedFields, { new: true, runValidators: true });
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, { user: user.toPublic() }, 'Profile updated');
});

// ─── Change Password ──────────────────────────────────────────────────────────
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError('Current password is incorrect.', 400);
  }
  user.password = newPassword;
  await user.save();
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, {}, 'Password changed successfully');
});

// ─── Manage Vehicles ──────────────────────────────────────────────────────────
exports.addVehicle = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.vehicles.length >= 5) throw new AppError('Maximum 5 vehicles allowed.', 400);

  if (req.body.isPrimary) {
    user.vehicles.forEach(v => (v.isPrimary = false));
  }
  user.vehicles.push(req.body);
  await user.save();
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, { vehicles: user.vehicles }, 'Vehicle added', 201);
});

exports.updateVehicle = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const vehicle = user.vehicles.id(req.params.vehicleId);
  if (!vehicle) throw new AppError('Vehicle not found.', 404);

  if (req.body.isPrimary) user.vehicles.forEach(v => (v.isPrimary = false));
  Object.assign(vehicle, req.body);
  await user.save();
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, { vehicles: user.vehicles }, 'Vehicle updated');
});

exports.deleteVehicle = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  user.vehicles = user.vehicles.filter(v => v._id.toString() !== req.params.vehicleId);
  await user.save();
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, {}, 'Vehicle removed');
});

// ─── Favorite Stations ────────────────────────────────────────────────────────
exports.toggleFavorite = asyncHandler(async (req, res) => {
  const { stationId } = req.params;
  const user = await User.findById(req.user._id);
  const favs = user.preferences.favoriteStations.map(id => id.toString());
  const isFav = favs.includes(stationId);

  if (isFav) {
    user.preferences.favoriteStations = user.preferences.favoriteStations.filter(id => id.toString() !== stationId);
  } else {
    user.preferences.favoriteStations.push(stationId);
  }
  await user.save();
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, { isFavorite: !isFav }, isFav ? 'Removed from favorites' : 'Added to favorites');
});

exports.getFavorites = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('preferences.favoriteStations', 'name address stats coverPhoto');
  sendSuccess(res, { stations: user.preferences.favoriteStations }, 'Favorites fetched');
});

// ─── User Dashboard Stats ─────────────────────────────────────────────────────
exports.getDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const [user, recentBookings, upcomingBookings] = await Promise.all([
    User.findById(userId),
    Booking.find({ user: userId, status: 'completed' })
      .populate('station', 'name address.city')
      .sort({ actualEnd: -1 })
      .limit(5),
    Booking.find({ user: userId, status: 'confirmed', scheduledStart: { $gte: new Date() } })
      .populate('station', 'name address location')
      .sort({ scheduledStart: 1 })
      .limit(3)
  ]);

  sendSuccess(res, {
    stats: {
      totalSessions: user.totalSessionsCharged,
      totalKwh: Math.round(user.totalKwhCharged * 10) / 10,
      totalSpent: user.totalSpent,
      carbonSaved: Math.round(user.carbonSaved * 10) / 10,
      walletBalance: user.wallet.balance
    },
    upcomingBookings,
    recentBookings
  }, 'Dashboard fetched');
});

// ─── Update Notification Preferences ────────────────────────────────────────
exports.updatePreferences = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    { 'preferences.notifications': req.body.notifications },
    { new: true }
  );
  await deleteCache(`user:${req.user._id}`);
  sendSuccess(res, { preferences: user.preferences }, 'Preferences updated');
});
