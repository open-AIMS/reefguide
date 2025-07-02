import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ModelWorkflowComponent } from './model-workflow.component';

describe('ModelWorkflowComponent', () => {
  let component: ModelWorkflowComponent;
  let fixture: ComponentFixture<ModelWorkflowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelWorkflowComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ModelWorkflowComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
