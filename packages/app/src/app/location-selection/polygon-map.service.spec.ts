import { TestBed } from '@angular/core/testing';

import { PolygonMapService } from './polygon-map.service';

describe('PolygonMapService', () => {
  let service: PolygonMapService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PolygonMapService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
