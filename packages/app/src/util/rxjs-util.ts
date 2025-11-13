import { MonoTypeOperatorFunction, tap } from 'rxjs';

export function tapDebug<T>(name: string): MonoTypeOperatorFunction<T> {
  const prefix = `TAP ${name}: `;
  let nextCount = 0;
  let subCount = 0;
  return tap<T>({
    next: v => {
      nextCount++;
      console.log(prefix + `next count=${nextCount}`, v);
    },
    error: err => {
      console.error(prefix + 'error', err);
    },
    complete: () => {
      console.log(prefix + 'complete');
    },
    subscribe: () => {
      subCount++;
      console.log(prefix + `subscribe subCount=${subCount}`);
    },
    unsubscribe: () => {
      subCount--;
      console.log(prefix + `unsubscribe subCount=${subCount}`);
    }
  });
}
