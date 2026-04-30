export const generateId = (prefix: string): string => {
  const segment = () => Math.random().toString(36).slice(2, 10);

  return `${prefix}_${segment()}_${segment()}`;
};

export const parseIdPrefix = (id: string): string | undefined =>
  id.includes("_") ? id.split("_")[0] : undefined;
