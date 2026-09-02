const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hashed = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hashed}`;
}

function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || !encoded || !encoded.includes(':')) {
    return false;
  }
  const [salt, hash] = encoded.split(':');
  const hashedBuffer = Buffer.from(hash, 'hex');
  const verifyBuffer = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(hashedBuffer, verifyBuffer);
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    res.redirect('/login');
    return;
  }
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  requireAuth,
};
