const CURRENCIES = ['PKR', 'USD', 'EUR'];
const DEFAULT_CURRENCY = 'USD';
const SYMBOLS = { PKR: 'Rs', USD: '$', EUR: '€' };

// PKR is a zero-decimal presentation currency here; USD/EUR carry cents.
const DECIMALS = { PKR: 0, USD: 2, EUR: 2 };

function isCurrency(value) {
  return CURRENCIES.includes(value);
}

function round(amount, currency) {
  const factor = 10 ** (DECIMALS[currency] ?? 2);
  return Math.round((Number(amount) + Number.EPSILON) * factor) / factor;
}

function formatMoney(amount, currency) {
  const decimals = DECIMALS[currency] ?? 2;
  const value = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${SYMBOLS[currency] || ''}${currency === 'PKR' ? ' ' : ''}${value}`;
}

function rateFor(currency, rates) {
  if (currency === 'USD') return Number(rates?.usdRate) || 0;
  if (currency === 'EUR') return Number(rates?.eurRate) || 0;
  return 1;
}

/** Converts a PKR amount into `currency` using the supplied Settings rates (PKR per 1 unit). */
function fromPkr(pkrAmount, currency, rates) {
  if (currency === 'PKR') return round(pkrAmount, 'PKR');
  const rate = rateFor(currency, rates);
  if (!rate) return round(pkrAmount, currency);
  return round(Number(pkrAmount) / rate, currency);
}

/** Converts an amount in `currency` back to PKR — used for cross-currency admin reporting. */
function toPkr(amount, currency, rates) {
  if (currency === 'PKR') return round(amount, 'PKR');
  const rate = rateFor(currency, rates);
  if (!rate) return round(amount, 'PKR');
  return round(Number(amount) * rate, 'PKR');
}

/**
 * Resolves the authoritative price of a product in one currency.
 *
 * Each currency has its own admin-entered amount; a currency left blank falls back to converting
 * the PKR price at the current Settings rate. The fallback is read-only — `explicit` tells the
 * caller (and the admin UI) which of the two it got, and nothing is ever written back.
 */
function priceInCurrency(product, currency, rates) {
  const cur = isCurrency(currency) ? currency : DEFAULT_CURRENCY;

  const explicitPrice = cur === 'PKR' ? product.price : cur === 'USD' ? product.usdPrice : product.eurPrice;
  const explicitSale =
    cur === 'PKR' ? product.salePrice : cur === 'USD' ? product.usdSalePrice : product.eurSalePrice;

  const price = explicitPrice != null ? round(explicitPrice, cur) : fromPkr(product.price, cur, rates);

  let salePrice = null;
  if (explicitSale != null) {
    salePrice = round(explicitSale, cur);
  } else if (product.salePrice != null && explicitPrice == null) {
    // Only auto-convert the sale price when this currency is entirely rate-driven. If the admin
    // set an explicit base price for this currency but no sale price, the product is simply not
    // on sale here — converting the PKR sale price against an unrelated base would be nonsense.
    salePrice = fromPkr(product.salePrice, cur, rates);
  }

  if (salePrice != null && salePrice >= price) salePrice = null;

  return {
    currency: cur,
    price,
    salePrice,
    effectivePrice: salePrice != null ? salePrice : price,
    explicit: explicitPrice != null,
  };
}

/** Every currency at once — what the product API returns so the client can switch instantly. */
function allPrices(product, rates) {
  return CURRENCIES.reduce((acc, cur) => {
    acc[cur] = priceInCurrency(product, cur, rates);
    return acc;
  }, {});
}

module.exports = {
  CURRENCIES,
  DEFAULT_CURRENCY,
  SYMBOLS,
  DECIMALS,
  isCurrency,
  round,
  formatMoney,
  fromPkr,
  toPkr,
  priceInCurrency,
  allPrices,
};
