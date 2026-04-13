require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Station = require('../models/Station');
const logger = require('../utils/logger');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/nextcharge');
  logger.info('Connected to DB for seeding...');

  // Clean up
  await Promise.all([User.deleteMany({}), Station.deleteMany({})]);

  // ─── Create Users ─────────────────────────────────────────────────────────
  const admin = await User.create({
    name: 'Arjun Sharma',
    email: 'admin@nextcharge.in',
    phone: '9876543210',
    password: 'Admin@1234',
    role: 'admin',
    isPhoneVerified: true,
    isEmailVerified: true
  });

  const operator = await User.create({
    name: 'Priya Patel',
    email: 'operator@nextcharge.in',
    phone: '9876543211',
    password: 'Operator@1234',
    role: 'operator',
    isPhoneVerified: true
  });

  const user1 = await User.create({
    name: 'Rahul Mehta',
    email: 'rahul@example.com',
    phone: '9876543212',
    password: 'User@1234',
    role: 'user',
    isPhoneVerified: true,
    vehicles: [{
      make: 'Tata', model: 'Nexon EV Max', year: 2023,
      connectorType: 'CCS2', batteryCapacity: 40.5,
      licensePlate: 'MH01AB1234', isPrimary: true
    }]
  });

  // ─── Create Stations ──────────────────────────────────────────────────────
  const stations = [
    {
      name: 'Tata Power EV Hub — BKC',
      operator: operator._id, network: 'TataPower',
      address: { line1: 'G Block, BKC', city: 'Mumbai', state: 'Maharashtra', pincode: '400051', landmark: 'Near Jio World Drive' },
      location: { type: 'Point', coordinates: [72.8656, 19.0596] },
      connectors: [
        { id: 'C001', type: 'CCS2', powerKw: 150, currentType: 'DC', status: 'available', pricePerKwh: 15, sessionStartFee: 20 },
        { id: 'C002', type: 'CCS2', powerKw: 150, currentType: 'DC', status: 'available', pricePerKwh: 15, sessionStartFee: 20 },
        { id: 'C003', type: 'CHAdeMO', powerKw: 50, currentType: 'DC', status: 'available', pricePerKwh: 12, sessionStartFee: 10 },
        { id: 'C004', type: 'Type2AC', powerKw: 7.2, currentType: 'AC', status: 'available', pricePerKwh: 8 },
        { id: 'C005', type: 'Type2AC', powerKw: 7.2, currentType: 'AC', status: 'charging', pricePerKwh: 8 }
      ],
      amenities: [{ name: 'Restroom' }, { name: 'Cafe' }, { name: 'WiFi' }, { name: 'Parking' }],
      is24x7: true, isVerified: true, isFeatured: true,
      tags: ['mall', 'fast_charging', '24x7'],
      operatingHours: []
    },
    {
      name: 'Ather Grid — Andheri West',
      operator: operator._id, network: 'Ather',
      address: { line1: 'Versova Road, Andheri West', city: 'Mumbai', state: 'Maharashtra', pincode: '400058' },
      location: { type: 'Point', coordinates: [72.8264, 19.1224] },
      connectors: [
        { id: 'C001', type: 'AtherProprietary', powerKw: 7.2, currentType: 'AC', status: 'available', pricePerKwh: 8 },
        { id: 'C002', type: 'AtherProprietary', powerKw: 7.2, currentType: 'AC', status: 'available', pricePerKwh: 8 },
        { id: 'C003', type: 'Type2AC', powerKw: 7.2, currentType: 'AC', status: 'available', pricePerKwh: 8 }
      ],
      is24x7: false, isVerified: true,
      tags: ['two_wheeler', 'residential'],
      operatingHours: [
        { day: 'mon', open: '06:00', close: '22:00' }, { day: 'tue', open: '06:00', close: '22:00' },
        { day: 'wed', open: '06:00', close: '22:00' }, { day: 'thu', open: '06:00', close: '22:00' },
        { day: 'fri', open: '06:00', close: '22:00' }, { day: 'sat', open: '07:00', close: '21:00' },
        { day: 'sun', open: '08:00', close: '20:00' }
      ]
    },
    {
      name: 'ChargeZone — Powai',
      operator: operator._id, network: 'ChargeZone',
      address: { line1: 'Hiranandani Gardens, Powai', city: 'Mumbai', state: 'Maharashtra', pincode: '400076' },
      location: { type: 'Point', coordinates: [72.9081, 19.1197] },
      connectors: [
        { id: 'C001', type: 'CCS2', powerKw: 60, currentType: 'DC', status: 'available', pricePerKwh: 12, sessionStartFee: 15 },
        { id: 'C002', type: 'CCS2', powerKw: 60, currentType: 'DC', status: 'available', pricePerKwh: 12, sessionStartFee: 15 },
        { id: 'C003', type: 'BharatDC', powerKw: 15, currentType: 'DC', status: 'available', pricePerKwh: 10 },
        { id: 'C004', type: 'Type2AC', powerKw: 7.2, currentType: 'AC', status: 'faulted', pricePerKwh: 8 }
      ],
      is24x7: true, isVerified: true, tags: ['residential', 'fast_charging']
    },
    {
      name: 'BPCL Pulse — Worli',
      operator: operator._id, network: 'BPCL',
      address: { line1: 'Annie Besant Road, Worli', city: 'Mumbai', state: 'Maharashtra', pincode: '400018' },
      location: { type: 'Point', coordinates: [72.8178, 19.0096] },
      connectors: [
        { id: 'C001', type: 'CCS2', powerKw: 30, currentType: 'DC', status: 'available', pricePerKwh: 10 },
        { id: 'C002', type: 'CHAdeMO', powerKw: 30, currentType: 'DC', status: 'available', pricePerKwh: 10 },
        { id: 'C003', type: 'Type2AC', powerKw: 7.2, currentType: 'AC', status: 'available', pricePerKwh: 7 }
      ],
      is24x7: false, isVerified: true, tags: ['petrol_station', 'highway']
    },
    {
      name: 'Reliance BP — Vashi',
      operator: operator._id, network: 'Reliance',
      address: { line1: 'Sector 30A, Vashi', city: 'Navi Mumbai', state: 'Maharashtra', pincode: '400703' },
      location: { type: 'Point', coordinates: [73.0071, 19.0771] },
      connectors: [
        { id: 'C001', type: 'CCS2', powerKw: 240, currentType: 'DC', status: 'available', pricePerKwh: 18, sessionStartFee: 30 },
        { id: 'C002', type: 'CCS2', powerKw: 240, currentType: 'DC', status: 'available', pricePerKwh: 18, sessionStartFee: 30 },
        { id: 'C003', type: 'CHAdeMO', powerKw: 50, currentType: 'DC', status: 'available', pricePerKwh: 14 },
        { id: 'C004', type: 'Type2AC', powerKw: 22, currentType: 'AC', status: 'available', pricePerKwh: 10 }
      ],
      is24x7: true, isVerified: true, isFeatured: true, tags: ['ultra_fast', 'highway', '24x7']
    }
  ];

  await Station.insertMany(stations);

  logger.info('✅ Seed complete!');
  logger.info(`   Admin:    admin@nextcharge.in    / Admin@1234`);
  logger.info(`   Operator: operator@nextcharge.in / Operator@1234`);
  logger.info(`   User:     rahul@example.com      / User@1234`);
  logger.info(`   Stations: ${stations.length} created`);

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch(err => {
  logger.error('Seed failed:', err);
  process.exit(1);
});
