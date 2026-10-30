import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vitest configuration for TerraResponse AI.
 *
 * - jsdom environment so component tests can render React.
 * - `@/` alias mirrors the Next.js tsconfig `paths`.
 * - Excludes the pre-existing example & skill folders so they don't pollute
 *   the test run.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "examples", "skills", "tests"],
    coverage: {
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
