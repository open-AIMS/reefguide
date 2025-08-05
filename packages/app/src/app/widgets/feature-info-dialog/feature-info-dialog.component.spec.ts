import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FeatureInfoDialogComponent } from './feature-info-dialog.component';

describe('FeatureInfoDialogComponent', () => {
  let component: FeatureInfoDialogComponent;
  let fixture: ComponentFixture<FeatureInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeatureInfoDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureInfoDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
