import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ParameterConfigComponent } from './parameter-config.component';

describe('ParameterConfigComponent', () => {
  let component: ParameterConfigComponent;
  let fixture: ComponentFixture<ParameterConfigComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ParameterConfigComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ParameterConfigComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
