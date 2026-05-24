export const isValidDbName = (dbName) => {
  if (!dbName || typeof dbName !== "string") return false;

  const trimmed = dbName.trim();
  if (!trimmed) return false;

  const forbiddenDbNames = ["admin", "local", "config"];

  if (forbiddenDbNames.includes(trimmed)) return false;

  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
};

export const isValidCollectionName = (collection) => {
  if (!collection || typeof collection !== "string") return false;

  const trimmed = collection.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("system.")) return false;

  return /^[a-zA-Z0-9_-]+$/.test(trimmed);
};
