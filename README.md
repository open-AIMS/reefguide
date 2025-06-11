# ReefGuide

## Quick start

We are using pnpm, so install it (using npm, ideally at v20 +)

```
npm install pnpm -g
```

## Install dependencies

```
pnpm i
```

## API Configuration & Setup

Follow [web-api](./packages/web-api/README.md) instructions on creating config file,
Prisma setup, and database setup.

1. Create `packages/web-api/.env`
2. Generate Prisma types - `pnpm run prisma-generate`
  (this is also triggered by web-api `prebuild`)
3. Setup/Reset database - `pnpm run db-reset`

## Run turbo commands

Using the installed turbo

```
npx turbo ...
```

Or global install turbo: `npm install turbo -g`

```
turbo ...
```

## Build

Full build of web-api and app.

```
turbo build
```

## Dev

Run all packages in development mode:

```
turbo dev
```

---

Alternatively, you can run the packages separately, which can be useful to seperate
output and see the errors obscured by turbo.

1. `cd packages/types; pnpm run dev`
2. `cd packages/web-api; pnpm run dev`
3. `cd packages/app; pnpm run dev` (runs `ng serve`)

## Format

```
turbo format:write
turbo format:check
```

## Linting and fixing

```
turbo lint
turbo fix
```

## Notes & Troubleshooting
If you see this prisma error, you need to build web-api (`prebuild`) or alternatively run
 `prisma-generate` in web-api package.
> no exported member 'PrismaClient'"

---

`turbo dev` will NOT forward environment variables to the package commands.
So instead define env variables (e.g. `AWS_*`) in `packages/web-api/.env`
