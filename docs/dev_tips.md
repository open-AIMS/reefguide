# Developer Tips

## VSCode

A few notes about this project and VSCode.

### VSCode Settings

Compare your _.vscode/settings.json_ and _.vscode/settings.default.json_

### Extensions

_.vscode/extensions.json_ should cause VScode to prompt you to install the recommended
extensions for this project.

### Search Tips

VSCode file search is more capable now. Using file search like this is a good way to jump around the repo:

- "map routes" - to goto [web-api map-layers routes](../packages/web-api/src/map-layers/routes.ts)
- "app package" - to goto [app package.json](../packages/app/package.json)

## Linux

If you're using a Linux environment such as WSL.

### Bash Aliases

You may want to create _~/.bash_aliases_ similar to this for quick reefguide development commands.
These quickly get you to the most used directories and run common developer commands.

```bash
export REEFGUIDE_REPO="${HOME}/code/reefguide"

alias rg-cd="cd $REEFGUIDE_REPO"
alias rg-ng="cd $REEFGUIDE_REPO/packages/app && ng serve"
alias rg-api="cd $REEFGUIDE_REPO/packages/web-api && turbo watch api"
alias rg-ld="cd $REEFGUIDE_REPO && ./local-dev.sh"
alias rg-db="cd $REEFGUIDE_REPO/packages/db && pnpm prisma migrate status"
alias rg-studio="cd $REEFGUIDE_REPO/packages/db && pnpm prisma studio"

alias rg-infra-test="cd $REEFGUIDE_REPO/packages/infra && . ./configs/test_env.sh"
alias rg-infra-prod="cd $REEFGUIDE_REPO/packages/infra && . ./configs/prod_env.sh"
```

You'll need to create the above _\*\_env.sh_ files with the environment variables for [infra](../packages/infra/README.md).

```bash
export CONFIG_FILE_NAME=test.json
export AWS_DEFAULT_REGION=ap-southeast-2
export AWS_PROFILE=rrapopsbuildpoweruser
export PORT_FWD_HOST="test-reefguide-dbinstanceXXXXX.YYYYY.ap-southeast-2.rds.amazonaws.com"
export PORT_FWD_PORT=5432
export PORT_FWD_LOCALPORT=25432
```

**Note:** you will also need to authenticate with AWS: `aws sso login`

### What's using that port?

Sometimes dev servers don't shutdown and keep listening on the port. For example,
if you can't start web-api because 5000 is in use.

1. `lsof -i :5000` (may need to use `sudo`)
2. ps -p PID -f
3. kill PID

Also useful: `ps -eaf|grep reefguide`
