/**
 * TEST UNITARIO — sanitizeUser
 *
 * Patrón: función pura → no necesita mocks, no necesita DB, no necesita red.
 * Dado un input, espero un output concreto. Así de simple.
 */
import { describe, it, expect } from "vitest";
import { sanitizeUser } from "../lib/user.js";

describe("sanitizeUser", () => {
  it("elimina el campo password del objeto usuario", () => {
    const user = {
      id:       "user-123",
      name:     "Juan",
      email:    "juan@test.com",
      password: "hash_secreto_$2b$12$...",
    };

    const result = sanitizeUser(user);

    expect(result).not.toHaveProperty("password");
    
  });

  it("mantiene todos los campos públicos intactos", () => {
    const user = {
      id:       "user-abc",
      name:     "María",
      email:    "maria@test.com",
      password: "otro_hash",
    };

    const result = sanitizeUser(user);

    expect(result).toEqual({
      id:    "user-abc",
      name:  "María",
      email: "maria@test.com",
    });
  });

  it("funciona aunque el usuario no tenga campo password (ej: OAuth)", () => {
    const user = {
      id:    "user-google",
      name:  "Carlos",
      email: "carlos@gmail.com",
    };

    const result = sanitizeUser(user);

    // No explota y devuelve el objeto igual
    expect(result).toEqual(user);
  });

  it("no muta el objeto original", () => {
    const user = {
      id:       "user-456",
      name:     "Ana",
      email:    "ana@test.com",
      password: "secreto",
    };

    sanitizeUser(user);

    // El objeto original sigue teniendo password
    expect(user).toHaveProperty("password", "secreto");
  });
});
