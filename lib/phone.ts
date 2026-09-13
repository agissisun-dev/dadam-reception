export function normalizePhone(s: string): string {
  return s.replace(/\D/g, "");
}

export function isValidPhone(s: string): boolean {
  const d = normalizePhone(s);
  return d.length === 10 || d.length === 11;
}

function split(d: string): [string, string, string] {
  if (d.length === 11) return [d.slice(0, 3), d.slice(3, 7), d.slice(7)];
  if (d.startsWith("02")) return ["02", d.slice(2, 6), d.slice(6)];
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)];
}

export function formatPhone(d: string): string {
  return split(normalizePhone(d)).join("-");
}

export function maskPhone(d: string): string {
  const [a, b, c] = split(normalizePhone(d));
  return `${a}-${"*".repeat(b.length)}-${c}`;
}
