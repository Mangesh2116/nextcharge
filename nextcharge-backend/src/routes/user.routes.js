const express = require('express');
const router = express.Router();
const userCtrl = require('../controllers/user.controller');
const { protect } = require('../middleware/auth');

// All routes require authentication
router.use(protect);

router.get('/dashboard',                  userCtrl.getDashboard);
router.patch('/profile',                  userCtrl.updateProfile);
router.patch('/password',                 userCtrl.changePassword);
router.patch('/preferences',              userCtrl.updatePreferences);

// Vehicles
router.post('/vehicles',                  userCtrl.addVehicle);
router.patch('/vehicles/:vehicleId',      userCtrl.updateVehicle);
router.delete('/vehicles/:vehicleId',     userCtrl.deleteVehicle);

// Favorites
router.get('/favorites',                  userCtrl.getFavorites);
router.post('/favorites/:stationId',      userCtrl.toggleFavorite);
router.delete('/favorites/:stationId',    userCtrl.toggleFavorite);

module.exports = router;
