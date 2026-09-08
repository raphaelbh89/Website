export function isValidLocale(locale: string): boolean {
  const trimmed = locale.trim();
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,4})*$/.test(trimmed)) {
    return false;
  }
  try {
    Intl.getCanonicalLocales(trimmed);
    return true;
  } catch {
    return false;
  }
}

export function normalizeLocale(locale: string): string {
  return Intl.getCanonicalLocales(locale.trim())[0]!;
}
