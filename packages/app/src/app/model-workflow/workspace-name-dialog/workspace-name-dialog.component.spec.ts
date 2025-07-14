import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkspaceNameDialogComponent } from './workspace-name-dialog.component';

describe('WorkspaceNameDialogComponent', () => {
  let component: WorkspaceNameDialogComponent;
  let fixture: ComponentFixture<WorkspaceNameDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceNameDialogComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WorkspaceNameDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
