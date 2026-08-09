const { z } = require('zod');

/**
 * Recursively removes `.default()` / `.prefault()` from a field while preserving every other
 * wrapper (`.optional()`, `.nullable()`) and the leaf type's own checks.
 */
function stripDefault(field) {
  const def = field?.def;
  if (!def) return field;

  switch (def.type) {
    case 'default':
    case 'prefault':
      return stripDefault(def.innerType);
    case 'optional':
      return stripDefault(def.innerType).optional();
    case 'nullable':
      return stripDefault(def.innerType).nullable();
    default:
      return field;
  }
}

/**
 * Builds the PATCH counterpart of a create schema.
 *
 * Zod's own `.partial()` makes every key optional but *keeps its default*, so a field the
 * client never sent still arrives in `req.body` carrying that default. For a PATCH that is
 * silent data loss: editing only a product's price would also push `tags: []`,
 * `isHotProduct: false` and `isActive: true` into the update, resetting whatever was there.
 *
 * Here the defaults are stripped first, so an absent key stays genuinely absent and the
 * service layer's "only assign what was sent" pass leaves the stored value alone.
 *
 * Create schemas keep their defaults — that is where a default is the correct behaviour.
 */
function partialUpdateSchema(createSchema) {
  const shape = {};
  for (const [key, field] of Object.entries(createSchema.shape)) {
    shape[key] = stripDefault(field).optional();
  }
  return z.object(shape);
}

module.exports = { partialUpdateSchema, stripDefault };
