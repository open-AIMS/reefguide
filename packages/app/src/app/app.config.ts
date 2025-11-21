import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, provideZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth-http-interceptor';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import * as Sentry from '@sentry/angular';
import { environment } from '../environments/environment';

const enableSentry = Boolean(environment.sentryDsn);

if (enableSentry) {
  console.info('Enabling Sentry with DSN:', environment.sentryDsn);
  Sentry.init({
    dsn: environment.sentryDsn,
    sendDefaultPii: false,
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    // was specified in bugsink documentation.
    tracesSampleRate: 0
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // For debugging change detection, exhaustive false by default
    // provideCheckNoChangesConfig({ exhaustive: true, interval: 1_000}),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    // TODO remove uses of old animations system
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),

    // Set the mat-form-field to have outline by default
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline' }
    }
  ]
};

if (enableSentry) {
  appConfig.providers.push({
    provide: ErrorHandler,
    useValue: Sentry.createErrorHandler()
  });
}
