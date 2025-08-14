import { effect, inject, Injectable, signal, WritableSignal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { toSignal } from '@angular/core/rxjs-interop';

interface StoredConfig {
  enableCOGBlob: boolean;
}

const VALUE_SEPARATOR = '\x1F';

function getArray(val: string): Array<string> {
  return val.split(VALUE_SEPARATOR);
}

function getBoolean(val: string): boolean {
  return val === 'true';
}

/**
 * Functions for converting localstorage string value for
 * variables that aren't a string type.
 *
 * TODO fix types so this errors if add property to StoredConfig
 */
const configVarGetters: Partial<Record<keyof StoredConfig, (val: string) => any>> = {
  enableCOGBlob: getBoolean
};

@Injectable({
  providedIn: 'root'
})
export class ReefGuideConfigService {
  readonly authService = inject(AuthService);

  /**
   * Enable copying of COG files to in-memory Blob, which improves performance.
   *
   * Currently this is always done if enabled; in the future only COGs under a
   * certain file size will be copied to Blob.
   */
  enableCOGBlob: WritableSignal<boolean>;

  isAdmin = toSignal(this.authService.isAdmin());

  /**
   * Disables set from writing to local storage
   */
  private readonly = true;

  private readonly prefix = 'rg.';

  constructor() {
    // default to false since ObjectURLs not working in deployed app
    // Also, should add file size condition
    this.enableCOGBlob = signal(this.get('enableCOGBlob', false));

    effect(() => this.set('enableCOGBlob', this.enableCOGBlob()));

    // ignore the first effect, which would set the initial value.
    // effects are async, so run in microtask.
    Promise.resolve().then(() => {
      this.readonly = false;
    });
  }

  private get<K extends keyof StoredConfig, V = StoredConfig[K]>(key: K): V | undefined;
  private get<K extends keyof StoredConfig, V = StoredConfig[K]>(key: K, dflt: V): V;
  private get<K extends keyof StoredConfig, V = StoredConfig[K]>(key: K, dflt?: V): V | undefined {
    let val = localStorage.getItem(`${this.prefix}${key}`);
    if (val == null) {
      return dflt ?? undefined;
    } else {
      const getFn = configVarGetters[key];
      // TODO fix this
      // @ts-ignore
      return getFn !== undefined ? getFn(val) : val;
    }
  }

  private set<K extends keyof StoredConfig, V = StoredConfig[K]>(key: K, value: V) {
    if (this.readonly) {
      return;
    }

    let storedVal: string;
    if (Array.isArray(value)) {
      // split with unit separator character
      storedVal = value.join(VALUE_SEPARATOR);
    } else {
      // local storage converts values to strings.
      storedVal = value as string;
    }

    localStorage.setItem(`${this.prefix}${key}`, storedVal);
  }
}
