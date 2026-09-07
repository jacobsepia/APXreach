/** Company names, made comparable: case, punctuation and the usual suffixes set aside. Pure, so it can be tested without a database. */
export const normalizeName = (value: string) =>
  value.toLowerCase().replace(/\b(inc|ltd|llc|corp|co|limited|incorporated|corporation|company)\b\.?/g, "").replace(/[^a-z0-9]+/g, " ").trim();
