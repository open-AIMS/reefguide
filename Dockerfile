FROM node:24-alpine AS base

# Install pnpm
RUN npm install -g pnpm turbo

FROM base AS pruner
ARG APP_NAME
WORKDIR /app
COPY . .
# Generate a partial monorepo with only the files needed for the target app
RUN turbo prune --scope=${APP_NAME} --docker

FROM base AS installer
ARG APP_NAME
WORKDIR /app

# First install dependencies (this is done before copying the full source code to optimize layer caching)
COPY .gitignore .gitignore
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

# Grab the root tsconfig too (before building)
COPY tsconfig.json ./tsconfig.json

# Build the project
COPY --from=pruner /app/out/full/ .
COPY turbo.json turbo.json
RUN turbo build --filter=${APP_NAME}

ARG PORT=3000
EXPOSE ${PORT}

# TODO reinstate the below runner stage which does a better job of only getting
# necessary things

#FROM base AS runner
#
## The port the server is running on
#ARG PORT=3000
## The turbo app name (e.g. @reefguide/web-api)
#ARG APP_NAME
## The file path for this package (e.g. web-api)
#ARG PACKAGE_NAME
## The path to the build output in the built asset e.g. dist, build - this will be copied into the ./dist relative path
#ARG BUILD_PATH
#
#WORKDIR /app
#
## Optimised version WIP below
## Only copy over the node modules and build outputs needed
## COPY --from=installer /app/packages/${PACKAGE_NAME}/${BUILD_PATH} ./packages/${PACKAGE_NAME}/
## Copy over node modules from the package
## COPY --from=installer /app/packages/${PACKAGE_NAME}/node_modules ./dist/packages/${PACKAGE_NAME}
## COPY --from=installer /app/node_modules ./node_modules
#
#COPY 
#
#EXPOSE ${PORT}
#ENV PORT=${PORT}
