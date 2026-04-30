export const toISODate = (date: Date): string =>
  date.toISOString().slice(0, 10);

export const toISOTimestamp = (date: Date): string =>
  date.toISOString();

export const fromDateISO = (isoDate: string): Date =>
  new Date(`${isoDate}T00:00:00.000Z`);

export const nowISO = (): string =>
  new Date().toISOString();