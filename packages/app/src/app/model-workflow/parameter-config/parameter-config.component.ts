// src/app/model-workflow/parameter-config/parameter-config.component.ts
import { Component, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatButtonModule } from '@angular/material/button';
import { CommonModule } from '@angular/common';
import { AdriaModelRunInput } from '@reefguide/types';

interface ParameterRange {
  lower: number;
  upper: number;
}

export interface ModelParameters {
  runName: string;
  numScenarios: number;
  tabularAcropora: ParameterRange;
  corymboseAcropora: ParameterRange;
  smallMassives: ParameterRange;
}

@Component({
  selector: 'app-parameter-config',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSliderModule,
    MatButtonModule
  ],
  templateUrl: './parameter-config.component.html',
  styleUrl: './parameter-config.component.scss'
})
export class ParameterConfigComponent {
  // Output event when user submits configuration
  parametersSubmitted = output<ModelParameters>();

  // Available scenario options (powers of 2)
  scenarioOptions = [1, 2, 4, 8, 16, 32, 64, 128, 256];

  configForm = new FormGroup({
    runName: new FormControl('example_run', [Validators.required]),
    numScenarios: new FormControl(64, [Validators.required]),
    taLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    taUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),
    caLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    caUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),
    smLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    smUpper: new FormControl(1000000, [Validators.required, Validators.min(0)])
  });

  // Computed signals for range displays
  taRange = signal<ParameterRange>({ lower: 0, upper: 1000000 });
  caRange = signal<ParameterRange>({ lower: 0, upper: 1000000 });
  smRange = signal<ParameterRange>({ lower: 0, upper: 1000000 });

  constructor() {
    // Subscribe to form changes to update range displays
    this.configForm.valueChanges.subscribe(() => {
      this.updateRangeSignals();
    });

    // Initialize range displays
    this.updateRangeSignals();
  }

  formatMillions(value: number): string {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  canSubmit(): boolean {
    return this.configForm.valid && this.validateRanges();
  }

  private validateRanges(): boolean {
    const form = this.configForm.value;
    return (
      form.taLower! <= form.taUpper! &&
      form.caLower! <= form.caUpper! &&
      form.smLower! <= form.smUpper!
    );
  }

  updateRangeSignals(): void {
    const form = this.configForm.value;
    this.taRange.set({ lower: form.taLower || 0, upper: form.taUpper || 1000000 });
    this.caRange.set({ lower: form.caLower || 0, upper: form.caUpper || 1000000 });
    this.smRange.set({ lower: form.smLower || 0, upper: form.smUpper || 1000000 });
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    const formValue = this.configForm.value;
    const parameters: ModelParameters = {
      runName: formValue.runName!,
      numScenarios: formValue.numScenarios!,
      tabularAcropora: {
        lower: formValue.taLower!,
        upper: formValue.taUpper!
      },
      corymboseAcropora: {
        lower: formValue.caLower!,
        upper: formValue.caUpper!
      },
      smallMassives: {
        lower: formValue.smLower!,
        upper: formValue.smUpper!
      }
    };

    this.parametersSubmitted.emit(parameters);
  }

  // Convert ModelParameters to AdriaModelRunInput for API
  static toAdriaModelRunInput(params: ModelParameters): AdriaModelRunInput {
    return {
      num_scenarios: params.numScenarios,
      rcp_scenario: '45', // Hardcoded for now
      model_params: [
        {
          param_name: 'N_seed_TA',
          third_param_flag: true,
          lower: params.tabularAcropora.lower,
          upper: params.tabularAcropora.upper,
          optional_third: 100000 // Step size
        },
        {
          param_name: 'N_seed_CA',
          third_param_flag: true,
          lower: params.corymboseAcropora.lower,
          upper: params.corymboseAcropora.upper,
          optional_third: 100000 // Step size
        },
        {
          param_name: 'N_seed_SM',
          third_param_flag: true,
          lower: params.smallMassives.lower,
          upper: params.smallMassives.upper,
          optional_third: 100000 // Step size
        }
      ]
    };
  }
}
