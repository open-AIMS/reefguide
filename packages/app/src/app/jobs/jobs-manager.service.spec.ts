import { TestBed } from '@angular/core/testing';

import { JobsManagerService } from './jobs-manager.service';

describe('JobsManagerService', () => {
  let service: JobsManagerService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JobsManagerService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
