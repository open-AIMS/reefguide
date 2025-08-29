import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SplashDialogComponent } from './splash-dialog.component';

describe('SplashDialogComponent', () => {
  let component: SplashDialogComponent;
  let fixture: ComponentFixture<SplashDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplashDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SplashDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
