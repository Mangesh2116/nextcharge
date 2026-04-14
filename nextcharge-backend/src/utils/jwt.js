const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET missing");
  throw new Error("JWT_SECRET must have a value");
}

exports.generateTokens = async (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    JWT_SECRET,
    { expiresIn: "7d" }
  );

  const refreshToken = jwt.sign(
    { id: userId },
    JWT_SECRET,
    { expiresIn: "30d" }
  );

  return { accessToken, refreshToken };
};