// src/app/model-workflow/workspace-name-dialog/workspace-name-dialog.component.ts
import { Component, inject, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-workspace-name-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule
  ],
  templateUrl: './workspace-name-dialog.component.html',
  styleUrl: './workspace-name-dialog.component.scss'
})
export class WorkspaceNameDialogComponent implements AfterViewInit {
  @ViewChild('nameInput') nameInput!: ElementRef<HTMLInputElement>;

  workspaceName: string = '';
  isRename: boolean = false;

  private dialogRef = inject(MatDialogRef<WorkspaceNameDialogComponent>);

  ngAfterViewInit() {
    // Focus and select the input field after view initialization
    if (this.nameInput) {
      setTimeout(() => {
        this.nameInput.nativeElement.focus();
        this.nameInput.nativeElement.select();
      });
    }
  }

  onSave() {
    if (this.workspaceName?.trim()) {
      this.dialogRef.close(this.workspaceName.trim());
    }
  }

  onCancel() {
    this.dialogRef.close();
  }
}
