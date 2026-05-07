import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PdpHeuristicComponent } from './pdp-heuristic.component';

describe('PdpHeuristicComponent', () => {
  let component: PdpHeuristicComponent;
  let fixture: ComponentFixture<PdpHeuristicComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PdpHeuristicComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PdpHeuristicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
