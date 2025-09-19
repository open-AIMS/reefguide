import { TestBed } from '@angular/core/testing';

import { ReefSearchService } from './reef-search.service';

describe('ReefSearchService', () => {
  let service: ReefSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ReefSearchService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
