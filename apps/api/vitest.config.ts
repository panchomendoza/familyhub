import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals:     true,    // describe/it/expect sin importar
    environment: "node",
    // Evita warnings de handles abiertos (setInterval del rate limiter)
    pool:        "forks",
  },
});
