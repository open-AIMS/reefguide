import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapResultsViewComponent } from './map-results-view.component';

describe('MapResultsViewComponent', () => {
  let component: MapResultsViewComponent;
  let fixture: ComponentFixture<MapResultsViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapResultsViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapResultsViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
