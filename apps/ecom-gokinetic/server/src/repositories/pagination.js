'use strict';

/**
 * Runs a paginated query returning the platform envelope
 * `{ items, page, pageSize, total }`.
 *
 * @param {import('mongoose').Model} Model
 * @param {object} filter
 * @param {{page?: number, pageSize?: number, sort?: object, projection?: object}} options
 */
async function paginate(Model, filter, { page = 1, pageSize = 20, sort = { createdAt: -1 }, projection } = {}) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const [items, total] = await Promise.all([
    Model.find(filter, projection)
      .sort(sort)
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .lean({ virtuals: true }),
    Model.countDocuments(filter),
  ]);
  return { items: items.map(toPlain), page: safePage, pageSize: safeSize, total };
}

/** Maps a lean document's `_id` to `id` and strips internal fields. */
function toPlain(doc) {
  if (!doc) return doc;
  const { _id, __v, passwordHash, ...rest } = doc;
  return { id: String(_id), ...rest };
}

module.exports = { paginate, toPlain };
