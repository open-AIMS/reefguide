import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SplashOverlayComponent } from './splash-overlay.component';

describe('SplashOverlayComponent', () => {
  let component: SplashOverlayComponent;
  let fixture: ComponentFixture<SplashOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplashOverlayComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SplashOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
