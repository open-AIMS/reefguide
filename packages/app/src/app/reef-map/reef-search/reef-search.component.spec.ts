import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReefSearchComponent } from './reef-search.component';

describe('ReefSearchComponent', () => {
  let component: ReefSearchComponent;
  let fixture: ComponentFixture<ReefSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReefSearchComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ReefSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
