# Developer Tips

## Angular

Follow the  [official Angular style guide](https://angular.dev/style-guide).

### Modern API

Use the modern Angular APIs:
* use the new structural directives, e.g. `@if` over `*ngIf`
* use the new functions like `viewChild.required`, `inject` over the annotation style

Read the [Angular recommended LLM prompt](https://angular.dev/ai/develop-with-ai#custom-prompts-and-system-instructions),
which is a good guideline for modern Angular.

### Debugging

[Angular DevTools Extenion](https://angular.dev/tools/devtools) for Chrome and Firefox.

Chrome Dev Tools now has support for
[Angular performance profiling](https://angular.dev/best-practices/profiling-with-chrome-devtools).

## RxJS

### Debugging

The `rxjs-util.ts` file has a `tapDebug` function that can be helpful.

### Error Management
A function that returns an `Observable` should throw errors via an `Observable`; otherwise there are two error paths: synchronous, and via the observable, which is confusing.

```javascript
return throwError(() => new Error('my error'));
```

### Subscription Cleanup

Cleanup un-tracked subscriptions tied to the life of a component using [takeUntilDestroyed](https://angular.dev/ecosystem/rxjs-interop/take-until-destroyed) 
