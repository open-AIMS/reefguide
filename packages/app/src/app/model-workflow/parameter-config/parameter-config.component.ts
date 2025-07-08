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
  // Coral seeding parameters (existing)
  tabularAcropora: ParameterRange;
  corymboseAcropora: ParameterRange;
  smallMassives: ParameterRange;
  // New intervention parameters
  minIvLocations: ParameterRange;
  fogging: ParameterRange;
  srm: ParameterRange;
  assistedAdaptation: ParameterRange;
  seedYears: ParameterRange;
  shadeYears: ParameterRange;
  fogYears: ParameterRange;
  planHorizon: ParameterRange;
  seedDeploymentFreq: ParameterRange;
  fogDeploymentFreq: ParameterRange;
  shadeDeploymentFreq: ParameterRange;
  seedYearStart: ParameterRange;
  shadeYearStart: ParameterRange;
  fogYearStart: ParameterRange;
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

    // Coral seeding parameters (original working ones)
    taLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    taUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),
    caLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    caUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),
    smLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    smUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),

    // New intervention parameters
    minIvLocationsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    minIvLocationsUpper: new FormControl(20, [Validators.required, Validators.min(1)]),
    foggingLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    foggingUpper: new FormControl(0.3, [Validators.required, Validators.min(0)]),
    srmLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    srmUpper: new FormControl(7, [Validators.required, Validators.min(0)]),
    assistedAdaptationLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    assistedAdaptationUpper: new FormControl(15, [Validators.required, Validators.min(0)]),
    seedYearsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    seedYearsUpper: new FormControl(75, [Validators.required, Validators.min(1)]),
    shadeYearsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    shadeYearsUpper: new FormControl(75, [Validators.required, Validators.min(1)]),
    fogYearsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    fogYearsUpper: new FormControl(75, [Validators.required, Validators.min(1)]),
    planHorizonLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    planHorizonUpper: new FormControl(20, [Validators.required, Validators.min(0)]),
    seedDeploymentFreqLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    seedDeploymentFreqUpper: new FormControl(15, [Validators.required, Validators.min(0)]),
    fogDeploymentFreqLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    fogDeploymentFreqUpper: new FormControl(15, [Validators.required, Validators.min(0)]),
    shadeDeploymentFreqLower: new FormControl(1, [Validators.required, Validators.min(1)]),
    shadeDeploymentFreqUpper: new FormControl(15, [Validators.required, Validators.min(1)]),
    seedYearStartLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    seedYearStartUpper: new FormControl(25, [Validators.required, Validators.min(0)]),
    shadeYearStartLower: new FormControl(2, [Validators.required, Validators.min(1)]),
    shadeYearStartUpper: new FormControl(25, [Validators.required, Validators.min(1)]),
    fogYearStartLower: new FormControl(2, [Validators.required, Validators.min(1)]),
    fogYearStartUpper: new FormControl(25, [Validators.required, Validators.min(1)])
  });

  // Computed signals for range displays (using the EXACT same pattern as original)
  taRange = signal<ParameterRange>({ lower: 0, upper: 1000000 });
  caRange = signal<ParameterRange>({ lower: 0, upper: 1000000 });
  smRange = signal<ParameterRange>({ lower: 0, upper: 1000000 });
  minIvLocationsRange = signal<ParameterRange>({ lower: 5, upper: 20 });
  foggingRange = signal<ParameterRange>({ lower: 0, upper: 0.3 });
  srmRange = signal<ParameterRange>({ lower: 0, upper: 7 });
  assistedAdaptationRange = signal<ParameterRange>({ lower: 0, upper: 15 });
  seedYearsRange = signal<ParameterRange>({ lower: 5, upper: 75 });
  shadeYearsRange = signal<ParameterRange>({ lower: 5, upper: 75 });
  fogYearsRange = signal<ParameterRange>({ lower: 5, upper: 75 });
  planHorizonRange = signal<ParameterRange>({ lower: 0, upper: 20 });
  seedDeploymentFreqRange = signal<ParameterRange>({ lower: 0, upper: 15 });
  fogDeploymentFreqRange = signal<ParameterRange>({ lower: 0, upper: 15 });
  shadeDeploymentFreqRange = signal<ParameterRange>({ lower: 1, upper: 15 });
  seedYearStartRange = signal<ParameterRange>({ lower: 0, upper: 25 });
  shadeYearStartRange = signal<ParameterRange>({ lower: 2, upper: 25 });
  fogYearStartRange = signal<ParameterRange>({ lower: 2, upper: 25 });

  constructor() {
    // Subscribe to form changes to update range displays (EXACT same as original)
    this.configForm.valueChanges.subscribe(() => {
      this.updateRangeSignals();
    });

    // Initialize range displays
    this.updateRangeSignals();
  }

  // Keep the original working formatMillions method
  formatMillions(value: number): string {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  // Add helper format methods for other types
  formatDecimal(value: number): string {
    return value.toFixed(2);
  }

  formatNumber(value: number): string {
    return value.toString();
  }

  canSubmit(): boolean {
    return this.configForm.valid && this.validateRanges();
  }

  private validateRanges(): boolean {
    const form = this.configForm.value;
    return (
      form.taLower! <= form.taUpper! &&
      form.caLower! <= form.caUpper! &&
      form.smLower! <= form.smUpper! &&
      form.minIvLocationsLower! <= form.minIvLocationsUpper! &&
      form.foggingLower! <= form.foggingUpper! &&
      form.srmLower! <= form.srmUpper! &&
      form.assistedAdaptationLower! <= form.assistedAdaptationUpper! &&
      form.seedYearsLower! <= form.seedYearsUpper! &&
      form.shadeYearsLower! <= form.shadeYearsUpper! &&
      form.fogYearsLower! <= form.fogYearsUpper! &&
      form.planHorizonLower! <= form.planHorizonUpper! &&
      form.seedDeploymentFreqLower! <= form.seedDeploymentFreqUpper! &&
      form.fogDeploymentFreqLower! <= form.fogDeploymentFreqUpper! &&
      form.shadeDeploymentFreqLower! <= form.shadeDeploymentFreqUpper! &&
      form.seedYearStartLower! <= form.seedYearStartUpper! &&
      form.shadeYearStartLower! <= form.shadeYearStartUpper! &&
      form.fogYearStartLower! <= form.fogYearStartUpper!
    );
  }

  updateRangeSignals(): void {
    const form = this.configForm.value;

    // Original working updates
    this.taRange.set({ lower: form.taLower || 0, upper: form.taUpper || 1000000 });
    this.caRange.set({ lower: form.caLower || 0, upper: form.caUpper || 1000000 });
    this.smRange.set({ lower: form.smLower || 0, upper: form.smUpper || 1000000 });

    // New range updates following the same pattern
    this.minIvLocationsRange.set({
      lower: form.minIvLocationsLower || 5,
      upper: form.minIvLocationsUpper || 20
    });
    this.foggingRange.set({ lower: form.foggingLower || 0, upper: form.foggingUpper || 0.3 });
    this.srmRange.set({ lower: form.srmLower || 0, upper: form.srmUpper || 7 });
    this.assistedAdaptationRange.set({
      lower: form.assistedAdaptationLower || 0,
      upper: form.assistedAdaptationUpper || 15
    });
    this.seedYearsRange.set({ lower: form.seedYearsLower || 5, upper: form.seedYearsUpper || 75 });
    this.shadeYearsRange.set({
      lower: form.shadeYearsLower || 5,
      upper: form.shadeYearsUpper || 75
    });
    this.fogYearsRange.set({ lower: form.fogYearsLower || 5, upper: form.fogYearsUpper || 75 });
    this.planHorizonRange.set({
      lower: form.planHorizonLower || 0,
      upper: form.planHorizonUpper || 20
    });
    this.seedDeploymentFreqRange.set({
      lower: form.seedDeploymentFreqLower || 0,
      upper: form.seedDeploymentFreqUpper || 15
    });
    this.fogDeploymentFreqRange.set({
      lower: form.fogDeploymentFreqLower || 0,
      upper: form.fogDeploymentFreqUpper || 15
    });
    this.shadeDeploymentFreqRange.set({
      lower: form.shadeDeploymentFreqLower || 1,
      upper: form.shadeDeploymentFreqUpper || 15
    });
    this.seedYearStartRange.set({
      lower: form.seedYearStartLower || 0,
      upper: form.seedYearStartUpper || 25
    });
    this.shadeYearStartRange.set({
      lower: form.shadeYearStartLower || 2,
      upper: form.shadeYearStartUpper || 25
    });
    this.fogYearStartRange.set({
      lower: form.fogYearStartLower || 2,
      upper: form.fogYearStartUpper || 25
    });
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    const formValue = this.configForm.value;
    const parameters: ModelParameters = {
      runName: formValue.runName!,
      numScenarios: formValue.numScenarios!,

      // Original coral seeding parameters
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
      },

      // New intervention parameters
      minIvLocations: {
        lower: formValue.minIvLocationsLower!,
        upper: formValue.minIvLocationsUpper!
      },
      fogging: {
        lower: formValue.foggingLower!,
        upper: formValue.foggingUpper!
      },
      srm: {
        lower: formValue.srmLower!,
        upper: formValue.srmUpper!
      },
      assistedAdaptation: {
        lower: formValue.assistedAdaptationLower!,
        upper: formValue.assistedAdaptationUpper!
      },
      seedYears: {
        lower: formValue.seedYearsLower!,
        upper: formValue.seedYearsUpper!
      },
      shadeYears: {
        lower: formValue.shadeYearsLower!,
        upper: formValue.shadeYearsUpper!
      },
      fogYears: {
        lower: formValue.fogYearsLower!,
        upper: formValue.fogYearsUpper!
      },
      planHorizon: {
        lower: formValue.planHorizonLower!,
        upper: formValue.planHorizonUpper!
      },
      seedDeploymentFreq: {
        lower: formValue.seedDeploymentFreqLower!,
        upper: formValue.seedDeploymentFreqUpper!
      },
      fogDeploymentFreq: {
        lower: formValue.fogDeploymentFreqLower!,
        upper: formValue.fogDeploymentFreqUpper!
      },
      shadeDeploymentFreq: {
        lower: formValue.shadeDeploymentFreqLower!,
        upper: formValue.shadeDeploymentFreqUpper!
      },
      seedYearStart: {
        lower: formValue.seedYearStartLower!,
        upper: formValue.seedYearStartUpper!
      },
      shadeYearStart: {
        lower: formValue.shadeYearStartLower!,
        upper: formValue.shadeYearStartUpper!
      },
      fogYearStart: {
        lower: formValue.fogYearStartLower!,
        upper: formValue.fogYearStartUpper!
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
        // DiscreteOrderedUniformDist - SHOULD have third parameter (step size)
        {
          param_name: 'N_seed_TA',
          third_param_flag: true,
          lower: params.tabularAcropora.lower,
          upper: params.tabularAcropora.upper,
          optional_third: 50000
        },
        {
          param_name: 'N_seed_CA',
          third_param_flag: true,
          lower: params.corymboseAcropora.lower,
          upper: params.corymboseAcropora.upper,
          optional_third: 50000
        },
        {
          param_name: 'N_seed_SM',
          third_param_flag: true,
          lower: params.smallMassives.lower,
          upper: params.smallMassives.upper,
          optional_third: 50000
        },
        {
          param_name: 'a_adapt',
          third_param_flag: true,
          lower: params.assistedAdaptation.lower,
          upper: params.assistedAdaptation.upper,
          optional_third: 0.5
        },

        // TriangularDist - SHOULD have third parameter
        {
          param_name: 'fogging',
          third_param_flag: true,
          lower: params.fogging.lower,
          upper: params.fogging.upper,
          optional_third: 0.0 // Third parameter for triangular distribution (mode)
        },
        {
          param_name: 'SRM',
          third_param_flag: true,
          lower: params.srm.lower,
          upper: params.srm.upper,
          optional_third: 0.0 // Third parameter for triangular distribution (mode)
        },

        // DiscreteUniform - should NOT have third parameter
        {
          param_name: 'min_iv_locations',
          third_param_flag: false,
          lower: params.minIvLocations.lower,
          upper: params.minIvLocations.upper
        },
        {
          param_name: 'plan_horizon',
          third_param_flag: false,
          lower: params.planHorizon.lower,
          upper: params.planHorizon.upper
        },
        {
          param_name: 'seed_deployment_freq',
          third_param_flag: false,
          lower: params.seedDeploymentFreq.lower,
          upper: params.seedDeploymentFreq.upper
        },
        {
          param_name: 'fog_deployment_freq',
          third_param_flag: false,
          lower: params.fogDeploymentFreq.lower,
          upper: params.fogDeploymentFreq.upper
        },
        {
          param_name: 'shade_deployment_freq',
          third_param_flag: false,
          lower: params.shadeDeploymentFreq.lower,
          upper: params.shadeDeploymentFreq.upper
        },
        {
          param_name: 'seed_year_start',
          third_param_flag: false,
          lower: params.seedYearStart.lower,
          upper: params.seedYearStart.upper
        },
        {
          param_name: 'shade_year_start',
          third_param_flag: false,
          lower: params.shadeYearStart.lower,
          upper: params.shadeYearStart.upper
        },
        {
          param_name: 'fog_year_start',
          third_param_flag: false,
          lower: params.fogYearStart.lower,
          upper: params.fogYearStart.upper
        },

        // DiscreteTriangularDist - These use triangular but are discrete, keeping third param
        {
          param_name: 'seed_years',
          third_param_flag: true,
          lower: params.seedYears.lower,
          upper: params.seedYears.upper,
          optional_third: 5.0 // Mode for triangular distribution
        },
        {
          param_name: 'shade_years',
          third_param_flag: true,
          lower: params.shadeYears.lower,
          upper: params.shadeYears.upper,
          optional_third: 5.0 // Mode for triangular distribution
        },
        {
          param_name: 'fog_years',
          third_param_flag: true,
          lower: params.fogYears.lower,
          upper: params.fogYears.upper,
          optional_third: 5.0 // Mode for triangular distribution
        }
      ]
    };
  }
}
