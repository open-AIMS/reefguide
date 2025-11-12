import type * as LercT from 'lerc';

export type Lerc = typeof LercT;

/**
 * Dynamic import lerc module and load wasm.
 */
async function _loadLerc(): Promise<Lerc> {
  /*
  See lerc-module script in angular.json

  Normal import only works with ng serve.
  import * as Lerc from 'lerc';

  ng build errors due to lerc module's init code trying to require Node modules.
  Note: there is both LercDecode.js and LercDecode.es.js, this is the .es file.
   */
  const lerc: Lerc = await import(/* @vite-ignore */ `${location.origin}/lerc-module.js`);
  await lerc.load({
    locateFile: wasmFileName => {
      // see angular.json assets configuration
      return `assets/lerc/${wasmFileName}`;
    }
  });
  return lerc;
}

let lercPromise: Promise<Lerc> | undefined = undefined;

/**
 * Load lerc module and wasm file.
 * @returns {Promise<Lerc>} cached promise that resolves with loaded lerc module.
 */
export async function loadLerc(): Promise<Lerc> {
  if (lercPromise) {
    return lercPromise;
  } else {
    lercPromise = _loadLerc();
    return lercPromise;
  }
}
