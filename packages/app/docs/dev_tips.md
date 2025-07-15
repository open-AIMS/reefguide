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

Chrome Dev Tools now has support for
[Angular performance profiling](https://angular.dev/best-practices/profiling-with-chrome-devtools).
