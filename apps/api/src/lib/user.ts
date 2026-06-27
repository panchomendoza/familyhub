/**
 * Elimina campos sensibles del objeto usuario antes de enviarlo al cliente.
 */
export function sanitizeUser(user: {
  id:    string;
  name:  string;
  email: string;
  [key: string]: unknown;
}) {
  const { password: _, ...safe } = user as typeof user & { password?: string };
  return safe;
}
