const express = require('express');
const router = express.Router();
const adminCtrl = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware/auth');

// All admin routes: must be logged in as admin
router.use(protect, authorize('admin'));

router.get('/dashboard',                        adminCtrl.getDashboard);
router.get('/analytics/revenue',                adminCtrl.getRevenueAnalytics);

// Users
router.get('/users',                            adminCtrl.getUsers);
router.patch('/users/:userId/status',           adminCtrl.toggleUserStatus);
router.patch('/users/:userId/role',             adminCtrl.changeUserRole);

// Stations
router.get('/stations/pending',                 adminCtrl.getPendingStations);
router.patch('/stations/:stationId/verify',     adminCtrl.verifyStation);
router.delete('/stations/:stationId',           adminCtrl.deleteStation);

module.exports = router;
