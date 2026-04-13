const express = require('express');
const router = express.Router();
const stationCtrl = require('../controllers/station.controller');
const { protect, authorize, optionalAuth } = require('../middleware/auth');

// Public
router.get('/nearby',                         optionalAuth, stationCtrl.getNearbyStations);
router.get('/',                               optionalAuth, stationCtrl.getAllStations);
router.get('/:id',                            optionalAuth, stationCtrl.getStation);
router.get('/:id/availability',               stationCtrl.getStationAvailability);

// Operator / Admin
router.post('/',                              protect, authorize('operator', 'admin'), stationCtrl.createStation);
router.put('/:id',                            protect, authorize('operator', 'admin'), stationCtrl.updateStation);
router.patch('/:stationId/connectors/:connectorId/status',
                                              protect, authorize('operator', 'admin'), stationCtrl.updateConnectorStatus);

module.exports = router;
