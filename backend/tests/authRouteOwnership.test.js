import { test } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

const { default: authRoutes } = await import("../routes/auth.js");
const { default: userRoutes } = await import("../routes/userRoutes.js");

const routePaths = (router) =>
  router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));

test("public registration and login exist only under /api/auth", () => {
  const authPaths = routePaths(authRoutes);
  const userPaths = routePaths(userRoutes);

  assert.ok(
    authPaths.some(({ path, methods }) => path === "/register" && methods.includes("post")),
  );
  assert.ok(authPaths.some(({ path, methods }) => path === "/login" && methods.includes("post")));
  assert.equal(
    userPaths.some(({ path }) => path === "/register"),
    false,
  );
  assert.equal(
    userPaths.some(({ path }) => path === "/login"),
    false,
  );
});
