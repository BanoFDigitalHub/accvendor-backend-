const Subscriber = require('../models/Subscriber');

async function subscribe(email) {
  try {
    await Subscriber.create({ email });
  } catch (err) {
    if (err.code !== 11000) throw err;
    // Already subscribed — treat as success, don't leak/error on repeat submissions.
  }
}

module.exports = { subscribe };
