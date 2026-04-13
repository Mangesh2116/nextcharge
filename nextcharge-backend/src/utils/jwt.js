require('dotenv').config(); // 🔥 ADD THIS LINE

const jwt = require('jsonwebtoken');
const { setCache } = require('../config/redis');

const generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );

  // Cache access token validity for quick auth checks
  await setCache(`token:valid:${accessToken}`, userId, 7 * 24 * 3600);

  return { accessToken, refreshToken };
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

const blacklistToken = async (token) => {
  const decoded = jwt.decode(token);
  if (!decoded) return;
  const ttl = decoded.exp - Math.floor(Date.now() / 1000);
  if (ttl > 0) await setCache(`blacklist:${token}`, true, ttl);
};

module.exports = { generateTokens, verifyRefreshToken, blacklistToken };
