import { Injectable, signal } from '@angular/core';
import { environment } from '../environments/environment';

/**
 * Feature flag service.
 *
 * Static for now, but could be tied to the user in the future, hence the use
 * of signals for feature flags.
 */
@Injectable({
  providedIn: 'root'
})
export class FeaturesService {
  siteSuitability = signal(environment.features.siteSuitability);
}
