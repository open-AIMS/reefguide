import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FailedProjectLoadDialogComponent } from './failed-project-load-dialog.component';

describe('FailedProjectLoadDialogComponent', () => {
  let component: FailedProjectLoadDialogComponent;
  let fixture: ComponentFixture<FailedProjectLoadDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FailedProjectLoadDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(FailedProjectLoadDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
