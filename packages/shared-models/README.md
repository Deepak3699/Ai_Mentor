# Shared models

This package is the single source of truth for Sequelize models that are used by
more than one service.

## Current layout

- `Course.js` exports `defineCourse(sequelize, DataTypes)`.
- `backend/models/Course.js` calls `defineCourse` with the learner backend's
  Sequelize instance.
- `backendAdmin/models/Course.js` calls `defineCourse` with the admin backend's
  Sequelize instance.

The shared file does not create its own database connection. Each service keeps
ownership of its `sequelize` instance in its own `config/db.js`, so connection
settings, pooling, TLS and environment variables stay service-specific.

## Model registration and associations

Each service registers the returned model through its own model module:

```js
const Course = defineCourse(sequelize, DataTypes);
export default Course;
```

Associations remain in the service that owns them. For example, the admin
backend adds the `Course` ↔ `Module` and `Module` ↔ `Lesson` associations in
`backendAdmin/models/index.js`.

`defineCourse` is idempotent for a given Sequelize instance. If the model is
already registered, it returns the existing model instead of registering the
same model name twice.

## Imports and deployment

Both services import the package with a repository-relative path:

```js
import { defineCourse } from "../../packages/shared-models/Course.js";
```

This works from the repository root, including CI. Deployments that package a
single service directory must include `packages/shared-models` alongside
`backend` or `backendAdmin`, or run from the repository root. The repository
currently contains no Dockerfile or platform deployment manifest, so this
requirement must be preserved by whichever deployment configuration is used.

If the project later adds npm workspaces, the imports can be changed to the
package name `@ai-mentor/shared-models` without changing the model definitions.

## Schema changes

The shared model describes the existing `Courses` table. This change does not
add or alter database columns. Future schema changes need an explicit migration
that both services can run against the shared database; do not rely on
`sequelize.sync({ alter: true })` in production.

## Scope

This package currently contains only the `Course` model. The `User` model and
the rest of the shared-model work requested in issue #4 can be moved here
incrementally using the same pattern.
