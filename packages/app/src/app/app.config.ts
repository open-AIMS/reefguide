import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './auth/auth-http-interceptor';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // For debugging change detection, exhaustive false by default
    // provideCheckNoChangesConfig({ exhaustive: true, interval: 1_000}),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),

    // Set the mat-form-field to have outline by default
    {
      provide: MAT_FORM_FIELD_DEFAULT_OPTIONS,
      useValue: { appearance: 'outline' }
    }
  ]
};
