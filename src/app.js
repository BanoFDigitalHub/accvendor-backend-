const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

const { env } = require('./config/env');
const xssSanitize = require('./middlewares/sanitize.middleware');
const { globalLimiter } = require('./middlewares/rateLimit.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');
const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const categoryRoutes = require('./routes/category.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const couponRoutes = require('./routes/coupon.routes');
const paymentMethodRoutes = require('./routes/paymentMethod.routes');
const uploadRoutes = require('./routes/upload.routes');
const supportTicketRoutes = require('./routes/supportTicket.routes');
const reviewRoutes = require('./routes/review.routes');
const reviewToolRoutes = require('./routes/reviewTools.routes');
const adRoutes = require('./routes/ad.routes');
const settingsRoutes = require('./routes/settings.routes');
const newsletterRoutes = require('./routes/newsletter.routes');
const leadRoutes = require('./routes/lead.routes');
const notificationRoutes = require('./routes/notification.routes');
const twoFactorToolRoutes = require('./routes/twoFactorTool.routes');
const adminRoutes = require('./routes/admin');

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://res.cloudinary.com', 'https:'],
        // Ad network embed codes (Adsterra/AdSense, admin-entered in Ads.jsx) are inline
        // <script> blocks served from rotating third-party domains that can't be fully
        // enumerated — 'unsafe-inline' + a broad https: source is the deliberate trade-off
        // that makes them actually run, requested explicitly over the stricter 'self'-only
        // default. The `code` field is admin-only input (not public user input), which keeps
        // the practical XSS blast radius the same as any other admin-trusted config value.
        scriptSrc: ["'self'", "'unsafe-inline'", 'https:'],
        frameSrc: ["'self'", 'https:'],
        connectSrc: ["'self'", env.clientUrl, 'https:'],
      },
    },
  })
);
app.use(
  cors({
    // CLIENT_URL may list several origins (comma-separated) so a preview deploy can talk to
    // the same API. Anything not listed is refused — credentials are involved, so this must
    // stay an explicit whitelist, never a reflect-any-origin.
    origin(origin, callback) {
      if (!origin) return callback(null, true); // same-origin / curl / server-to-server
      return callback(null, env.clientOrigins.includes(origin));
    },
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(mongoSanitize());
app.use(hpp());
app.use(xssSanitize);
if (env.nodeEnv !== 'test') app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(globalLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'ok', data: { uptime: process.uptime() } });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/support/tickets', supportTicketRoutes);
app.use('/api/products/:slug/reviews', reviewRoutes);
app.use('/api/reviews', reviewToolRoutes);
app.use('/api/ads', adRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/2fa', twoFactorToolRoutes);
app.use('/api/admin', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
