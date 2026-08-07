const xss = require('xss');

function deepSanitize(value) {
  if (typeof value === 'string') return xss(value);
  if (Array.isArray(value)) return value.map(deepSanitize);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      value[key] = deepSanitize(value[key]);
    }
    return value;
  }
  return value;
}

function xssSanitize(req, res, next) {
  if (req.body) req.body = deepSanitize(req.body);
  if (req.query) deepSanitize(req.query);
  if (req.params) req.params = deepSanitize(req.params);
  next();
}

module.exports = xssSanitize;
