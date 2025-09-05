import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ReefGuideConfigService } from '../reef-guide-config.service';
import { MatButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { AsyncPipe } from '@angular/common';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from '../../auth/auth.service';
import { ChangeMyPasswordComponent } from "../../auth/change-my-password/change-my-password.component";

@Component({
  selector: 'app-config-dialog',
  imports: [
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatButton,
    MatTooltip,
    AsyncPipe,
    MatCheckbox,
    MatTabsModule,
    ChangeMyPasswordComponent
],
  templateUrl: './config-dialog.component.html',
  styleUrl: './config-dialog.component.scss'
})
export class ConfigDialogComponent {
  readonly config = inject(ReefGuideConfigService);
  readonly dialogRef = inject(MatDialogRef<ConfigDialogComponent>);
  readonly authService = inject(AuthService);

  enableCOGBlob: FormControl;

  constructor() {
    this.enableCOGBlob = new FormControl(this.config.enableCOGBlob());
  }

  save() {
    const config = this.config;
    let reload = false;

    if (this.enableCOGBlob.dirty) {
      config.enableCOGBlob.set(this.enableCOGBlob.value);
    }

    this.dialogRef.close();

    if (reload) {
      alert('App needs to reload');
      window.location.reload();
    }
  }
}
