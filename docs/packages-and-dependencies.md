# Packages & Dependencies

## pnpm

### Tips

`pnpm` has a recursive flag, which can be useful. For example, to check the version of
a dependency in every package:

`pnpm ls -r zod`

### Updates

`pnpm outdated --compatible`

`pnpm up <pkg-name>`

### Trust

Trust policy and minimum age are defined in
[pnpm-workspace.yaml](../pnpm-workspace.yaml)

### Reset/Clean

`pnpm purge` - remove all node_modules directories.

`pnpm clean-install` - purge then install from lockfile.

`turbo clean` - clean turbo cache.

### Catalog

For dependencies that we want consistent across the entire monorepo, prefer using
the [catalog](https://pnpm.io/catalogs)
(defined in [pnpm-workspace.yaml](../pnpm-workspace.yaml)).

Within _package.json_ `"foo": "catalog:"` means use default catalog version.

## Packages

### TypeScript Issues

Note that an override in tsconfig.json will replace the parent's value rather than
merge the values (e.g. merge arrays).

For example, if you set `lib`, make sure to specify all lib entries that
package should have:\
`"lib": ["ES2023", "dom"],`

Ideally, tests should have a separate tsconfig, see tsconfig.test.ts, tsconfig.spec.ts

To Review:

- consider using [project references](https://www.typescriptlang.org/docs/handbook/project-references.html)?
