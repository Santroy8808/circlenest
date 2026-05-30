const commonWeakPasswords = new Set([
  "password",
  "password123",
  "12345678",
  "qwerty123",
  "letmein123",
  "admin123",
]);

export function validateStrongPassword(password: string) {
  if (password.length < 8 || password.length > 72) return "Password must be 8-72 characters.";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include a symbol.";
  if (commonWeakPasswords.has(password.toLowerCase())) return "Password is too common.";
  return null;
}

export function isPasswordExpired(passwordUpdatedAt: Date, maxAgeDays = 90) {
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return Date.now() - passwordUpdatedAt.getTime() > maxAgeMs;
}
