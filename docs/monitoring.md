# ReefGuide Monitoring

ReefGuide is a complex system which includes multiple components. Each can produce errors, or experience issues/downtime. For production systems, where we care about user experience, it is good to add external monitoring services which can

- observe uptime by pinging services at configurable endpoints
- receive logs, errors and other details from running services

## Open-source first

The monitoring stack for ReefGuide has avoided any encumberence or license costs by using open-source, self-hostable services only.

## Compatibility

ReefGuide's source code has minimal intervention to integrate monitoring solution(s). The only dependency introduced is the Sentry SDK. This SDK is widely available and utilised, and is compatible with our chosen open-source replacements for the error monitoring component.

## Components

**[uptime-kuma](https://github.com/louislam/uptime-kuma)**

[uptime kuma docs](https://github.com/louislam/uptime-kuma/wiki)

"Uptime Kuma is an easy-to-use self-hosted monitoring tool." It is configurable entirely from the user interface, and can interface with a variety of service types. We utilise it in our deployment to ping/monitor

- ReefGuide API
- ReefGuide App
- ReefGuide PostgreSQL DB

It also publishes a public status page (which we can share with internal users, and also use to advertise downtime/incidents).

**[BugSink](https://github.com/bugsink/bugsink)**

[BugSink docs](https://www.bugsink.com/docs/)

Bugsink is a completely open-sourced, simple alternative to a solution such as Bugsnag, Sentry or similar. It focuses entirely on errors and alerts. It is very easy to deploy, runs on minimal hardware, and is easy to maintain.

We utilise it to integrate into our components using the Sentry SDK:

- web-api (express API monitoring)
- capacity-manager (monitors errors/logged issues)
- app (Angular SDK integration reports errors/console errors)
- [ReefGuideWorker.jl](https://github.com/open-AIMS/ReefGuideWorker.jl) - Julia Job Worker to run ReefGuide algorithms (reports errors)
- [ADRIAReefGuideWorker.jl](https://github.com/open-AIMS/ADRIAReefGuideWorker.jl) - Julia Job Worker to run ADRIA algorithms for ReefGuide (reports errors)

## Deployment

The deployment of these systems is not part of `ReefGuide`, nor documented in this repository. We intentionally keep this as a separate component to encourage plugging in/out your desired (currently) sentry-compatible monitoring stack. AWS CDK is used to deploy both components to a single EC2 node with HTTPS and persistent storage, behind a reverse proxy. The details of this deployment is available at:

[cdk-monitoring-stack](https://github.com/csiro/cdk-monitoring-stack)

## Configuration

To configure Sentry SDK error monitoring for ReefGuide - simply set the sentry DSN configuration variables in your CDK infrastructure configuration JSON file.

```json
    "monitoring": {
        "webApiSentryDsn": "https://example.com",
        "appSentryDsn": "https://example.com",
        "capacityManagerSentryDsn": "https://example.com",
        "adriaWorkerSentryDsn": "https://example.com",
        "reefguideWorkerSentryDsn": "https://example.com"
    }
```
