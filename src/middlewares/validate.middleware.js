const ApiError = require('../utils/ApiError');

function validate(schemas) {
  return function validateMiddleware(req, res, next) {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      next();
    } catch (err) {
      if (err.issues) {
        const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
        next(new ApiError(400, 'Validation failed', details));
      } else {
        next(err);
      }
    }
  };
}

module.exports = validate;
