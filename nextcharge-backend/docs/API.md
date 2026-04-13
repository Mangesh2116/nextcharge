# NextCharge Backend — API Documentation
**Base URL:** `https://api.nextcharge.in/api/v1`  
**Version:** 1.0.0

---

## Authentication
All protected routes require a Bearer token in the Authorization header:
```
Authorization: Bearer <accessToken>
```

---

## 🔐 AUTH  `/api/v1/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | — | Register new user |
| POST | `/login` | — | Login with email/phone + password |
| POST | `/logout` | ✅ | Invalidate current token |
| POST | `/refresh` | — | Get new access token using refresh token |
| POST | `/send-otp` | — | Send OTP to phone |
| POST | `/verify-otp` | — | Verify phone OTP |
| POST | `/forgot-password` | — | Request password reset email |
| POST | `/reset-password` | — | Reset password with token |
| GET | `/me` | ✅ | Get current user profile |

### POST /register
```json
{
  "name": "Rahul Mehta",
  "email": "rahul@example.com",
  "phone": "9876543210",
  "password": "Password@123"
}
```
**Response:** `{ token, refreshToken, user }`

### POST /login
```json
{ "emailOrPhone": "rahul@example.com", "password": "Password@123" }
```

---

## 👤 USERS  `/api/v1/users`  (all protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | User stats + upcoming/recent bookings |
| PATCH | `/profile` | Update name/email |
| PATCH | `/password` | Change password |
| PATCH | `/preferences` | Update notification prefs |
| POST | `/vehicles` | Add a vehicle |
| PATCH | `/vehicles/:id` | Update vehicle |
| DELETE | `/vehicles/:id` | Remove vehicle |
| GET | `/favorites` | Get favorite stations |
| POST | `/favorites/:stationId` | Toggle favorite |

### PATCH /profile
```json
{ "name": "Rahul M.", "email": "new@example.com" }
```

### POST /vehicles
```json
{
  "make": "Tata", "model": "Nexon EV Max", "year": 2023,
  "connectorType": "CCS2", "batteryCapacity": 40.5,
  "licensePlate": "MH01AB1234", "isPrimary": true
}
```

---

## ⚡ STATIONS  `/api/v1/stations`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/nearby` | Optional | Find stations by lat/lng |
| GET | `/` | Optional | List all stations with filters |
| GET | `/:id` | Optional | Get single station details |
| GET | `/:id/availability` | — | Get slot grid for a date |
| POST | `/` | Operator/Admin | Create station |
| PUT | `/:id` | Operator/Admin | Update station |
| PATCH | `/:stationId/connectors/:connectorId/status` | Operator/Admin | Update connector status |

### GET /nearby
```
?lat=19.0596&lng=72.8656&radius=10&connectorType=CCS2&available=true&page=1&limit=20
```

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `lat` | number | **Required.** User latitude |
| `lng` | number | **Required.** User longitude |
| `radius` | number | Search radius in km (default: 10) |
| `connectorType` | string | CCS2, CHAdeMO, Type2AC, BharatDC |
| `minPower` | number | Minimum power in kW |
| `network` | string | TataPower, Ather, BPCL, etc. |
| `available` | boolean | Only show stations with free ports |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 20) |

### GET /:id/availability
```
?date=2024-12-25&connectorType=CCS2
```
Returns 30-min slot grid from 6 AM to 10 PM showing available/booked slots.

### POST / (create station)
```json
{
  "name": "My EV Hub — Bandra",
  "network": "Independent",
  "address": {
    "line1": "12, Hill Road, Bandra West",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400050"
  },
  "location": { "type": "Point", "coordinates": [72.8311, 19.0596] },
  "connectors": [
    {
      "id": "C001", "type": "CCS2", "powerKw": 50,
      "currentType": "DC", "pricePerKwh": 12, "sessionStartFee": 15
    }
  ],
  "is24x7": true,
  "amenities": [{ "name": "Parking" }, { "name": "Restroom" }]
}
```

---

## 📅 BOOKINGS  `/api/v1/bookings`  (all protected)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/` | Create a new booking |
| GET | `/` | My bookings (filterable by status) |
| GET | `/:id` | Single booking details |
| PATCH | `/:id/cancel` | Cancel a booking |
| POST | `/check-in` | Start charging via QR code |
| POST | `/complete` | End charging session (operator/admin) |

### POST / (create booking)
```json
{
  "stationId": "674abc123...",
  "connectorId": "C001",
  "vehicleId": "vehicle_object_id",
  "scheduledStart": "2024-12-25T10:00:00.000Z",
  "durationMinutes": 60
}
```
**Returns:** Booking with estimated cost. Payment required to confirm.

### POST /check-in
```json
{ "qrToken": "uuid-from-booking" }
```

### PATCH /:id/cancel
```json
{ "reason": "Plans changed" }
```
Free cancellation if more than 30 minutes before slot start.

### Booking Status Flow
```
pending → confirmed → in_progress → completed
                   ↘ cancelled
                   ↘ no_show (if missed 15min grace)
pending → expired  (if not paid within 15 min)
```

---

## 💳 PAYMENTS  `/api/v1/payments`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/webhook` | (Razorpay sig) | Razorpay webhook handler |
| POST | `/create-order` | ✅ | Create Razorpay order for booking |
| POST | `/verify` | ✅ | Verify payment + confirm booking |
| POST | `/wallet/topup` | ✅ | Add money to NextCharge wallet |
| GET | `/history` | ✅ | Payment history |
| POST | `/refund/:bookingId` | Admin | Initiate refund |

### Payment Flow
```
1. POST /bookings         → creates booking (status: pending)
2. POST /payments/create-order  → creates Razorpay order
3. [User pays on frontend via Razorpay SDK]
4. POST /payments/verify  → verifies signature, confirms booking
5. Booking status: confirmed ✅
```

### POST /create-order
```json
{ "bookingId": "674abc123..." }
```

### POST /verify
```json
{
  "bookingId": "674abc123...",
  "razorpay_order_id": "order_xxx",
  "razorpay_payment_id": "pay_xxx",
  "razorpay_signature": "signature_hash"
}
```

---

## ⭐ REVIEWS  `/api/v1/reviews`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/station/:stationId` | — | Get station reviews |
| POST | `/` | ✅ | Submit a review (requires completed booking) |
| POST | `/:reviewId/reply` | Operator | Reply to a review |
| DELETE | `/:reviewId` | ✅/Admin | Delete review |

### POST / (create review)
```json
{
  "bookingId": "674abc123...",
  "rating": 5,
  "title": "Super fast charging!",
  "body": "Charged from 20% to 80% in under 30 mins. Great location.",
  "tags": ["fast_charging", "clean", "good_amenities"]
}
```

---

## 🛠️ ADMIN  `/api/v1/admin`  (admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Platform overview + KPIs |
| GET | `/analytics/revenue` | Revenue analytics (daily/monthly) |
| GET | `/users` | List all users with filters |
| PATCH | `/users/:id/status` | Activate/deactivate user |
| PATCH | `/users/:id/role` | Change user role |
| GET | `/stations/pending` | Stations awaiting verification |
| PATCH | `/stations/:id/verify` | Approve a station |
| DELETE | `/stations/:id` | Deactivate a station |

---

## 📡 WebSocket Events

Connect to `wss://api.nextcharge.in` using Socket.IO client.

### Client → Server
```js
socket.emit('subscribe:station', stationId)    // Listen to station updates
socket.emit('unsubscribe:station', stationId)
```

### Server → Client
```js
socket.on('connector:status', ({ connectorId, status }) => { ... })
// status: 'available' | 'charging' | 'reserved' | 'faulted' | 'offline'

socket.on('booking:confirmed', ({ connectorId, scheduledStart, scheduledEnd }) => { ... })
socket.on('booking:cancelled', ({ bookingId, connectorId }) => { ... })
```

---

## Error Responses
All errors follow this shape:
```json
{
  "success": false,
  "message": "Human-readable error message"
}
```

| Code | Meaning |
|------|---------|
| 400 | Bad request / validation failed |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient role) |
| 404 | Resource not found |
| 409 | Conflict (duplicate, already booked) |
| 422 | Validation error |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Rate Limits
| Endpoint group | Limit |
|----------------|-------|
| Global | 100 req / 15 min |
| Auth (login/register) | 10 req / 15 min |
| OTP send | 3 req / 1 min |

---

## Setup & Running

```bash
# Install dependencies
npm install

# Copy env file and fill in your credentials
cp .env.example .env

# Seed database with sample data
npm run seed

# Start development server (with hot reload)
npm run dev

# Start production server
npm start
```

**Requirements:** Node.js >= 18, MongoDB, Redis
