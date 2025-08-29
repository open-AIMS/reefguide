import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ForgotPasswordConfirmComponent } from './forgot-password-confirm.component';

describe('ForgotPasswordConfirmComponent', () => {
  let component: ForgotPasswordConfirmComponent;
  let fixture: ComponentFixture<ForgotPasswordConfirmComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordConfirmComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordConfirmComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
