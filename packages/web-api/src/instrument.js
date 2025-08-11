import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://14c18aa8e1334e44b43722502e1397eb@sentry.reefguide.mds.gbrrestoration.org/2",
  sendDefaultPii: true,
});
