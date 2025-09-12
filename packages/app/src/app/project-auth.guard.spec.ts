import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { projectAuthGuard } from './project-auth.guard';

describe('projectAuthGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => projectAuthGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
