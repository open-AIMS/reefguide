// src/app/model-workflow/parameter-config/parameter-config.component.ts
import { CommonModule } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdriaModelRunInput } from '@reefguide/types';
import { debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';

type DataPackage = 'MOORE' | 'GBR';
type RcpScenario = AdriaModelRunInput['rcp_scenario'];

const DEFAULT_RCP : RcpScenario = '45';

function availableScenariosFromDataPackage(
  dataPackage: DataPackage | null | undefined
): RcpScenario[] {
  if (dataPackage === 'MOORE') {
    return ['26', '45', '60', '85'];
  } else {
    return ['26', '45', '85'];
  }
}

interface ParameterRange {
  lower: number;
  upper: number;
}

export interface ModelParameters {
  runName: string;
  // RCP scenario as a string
  rcpScenario: RcpScenario;
  // Available data packages
  dataPackage: DataPackage;
  numScenarios: number;
  // Coral seeding parameters
  tabularAcropora: ParameterRange;
  corymboseAcropora: ParameterRange;
  smallMassives: ParameterRange;
  // Intervention parameters
  minIvLocations: ParameterRange;
  fogging: ParameterRange;
  srm: ParameterRange;
  assistedAdaptation: ParameterRange;
  // Timing parameters
  seedYears: ParameterRange;
  shadeYears: ParameterRange;
  fogYears: ParameterRange;
  planHorizon: ParameterRange;
  // Deployment strategy parameters
  seedDeploymentFreq: ParameterRange;
  fogDeploymentFreq: ParameterRange;
  shadeDeploymentFreq: ParameterRange;
  seedYearStart: ParameterRange;
  shadeYearStart: ParameterRange;
  fogYearStart: ParameterRange;
}

// Parameter configuration organized by category
interface ParameterConfig {
  min: number;
  max: number;
  step: number;
  format: 'millions' | 'decimal' | 'number';
  discrete: boolean;
  displayWith?: string;
  description: string;
  units?: string;
  defaultLower: number;
  defaultUpper: number;
  triangular?: boolean;
}

interface ParameterCategory {
  title: string;
  subtitle: string;
  parameters: { [key: string]: ParameterConfig };
}

const PARAMETER_CATEGORIES: { [key: string]: ParameterCategory } = {
  coralSeeding: {
    title: 'Coral Seeding',
    subtitle: 'Number of coral larvae to deploy per intervention event',
    parameters: {
      tabularAcropora: {
        min: 0,
        max: 10000000,
        step: 50000,
        format: 'millions',
        discrete: false,
        displayWith: 'formatMillions',
        description: 'Seeded Tabular Acropora (per deployment)',
        units: 'larvae',
        defaultLower: 0,
        defaultUpper: 1000000
      },
      corymboseAcropora: {
        min: 0,
        max: 10000000,
        step: 50000,
        format: 'millions',
        discrete: false,
        displayWith: 'formatMillions',
        description: 'Seeded Corymbose Acropora (per deployment)',
        units: 'larvae',
        defaultLower: 0,
        defaultUpper: 1000000
      },
      smallMassives: {
        min: 0,
        max: 10000000,
        step: 50000,
        format: 'millions',
        discrete: false,
        displayWith: 'formatMillions',
        description: 'Seeded Small Massives (per deployment)',
        units: 'larvae',
        defaultLower: 0,
        defaultUpper: 1000000
      }
    }
  },
  environmentalInterventions: {
    title: 'Environmental Interventions',
    subtitle: 'Active interventions to protect corals from environmental stressors',
    parameters: {
      minIvLocations: {
        min: 1,
        max: 50,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Minimum Intervention Locations',
        units: 'sites',
        defaultLower: 5,
        defaultUpper: 20
      },
      fogging: {
        min: 0,
        max: 1.0,
        step: 0.01,
        format: 'decimal',
        discrete: false,
        displayWith: 'formatDecimal',
        description: 'Fogging Effectiveness (0.0 = no effect, 1.0 = complete protection)',
        units: 'effectiveness',
        defaultLower: 0,
        defaultUpper: 0.3,
        triangular: true
      },
      srm: {
        min: 0,
        max: 20,
        step: 0.1,
        format: 'decimal',
        discrete: false,
        displayWith: 'formatDecimal',
        description: 'Solar Radiation Management - DHW reduction due to shading',
        units: 'DHW reduction',
        defaultLower: 0,
        defaultUpper: 7
      },
      assistedAdaptation: {
        min: 0,
        max: 30,
        step: 0.5,
        format: 'decimal',
        discrete: false,
        displayWith: 'formatDecimal',
        description: 'Assisted Adaptation - Enhanced DHW resistance',
        units: 'DHW enhancement',
        defaultLower: 0,
        defaultUpper: 15
      }
    }
  },
  interventionTiming: {
    title: 'Intervention Duration',
    subtitle: 'How long each type of intervention should be conducted',
    parameters: {
      seedYears: {
        min: 1,
        max: 100,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Seeding Duration',
        units: 'years',
        defaultLower: 5,
        defaultUpper: 75
      },
      shadeYears: {
        min: 1,
        max: 100,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Shading Duration',
        units: 'years',
        defaultLower: 5,
        defaultUpper: 75
      },
      fogYears: {
        min: 1,
        max: 100,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Fogging Duration',
        units: 'years',
        defaultLower: 5,
        defaultUpper: 75
      },
      planHorizon: {
        min: 0,
        max: 50,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Planning Horizon (0 = current year only)',
        units: 'years',
        defaultLower: 0,
        defaultUpper: 20
      }
    }
  },
  deploymentStrategy: {
    title: 'Deployment Strategy',
    subtitle: 'Frequency and timing of intervention deployments',
    parameters: {
      seedDeploymentFreq: {
        min: 0,
        max: 30,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Seeding Deployment Frequency (0 = deploy once)',
        units: 'frequency',
        defaultLower: 0,
        defaultUpper: 15
      },
      fogDeploymentFreq: {
        min: 0,
        max: 30,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Fogging Deployment Frequency (0 = deploy once)',
        units: 'frequency',
        defaultLower: 0,
        defaultUpper: 15
      },
      shadeDeploymentFreq: {
        min: 1,
        max: 30,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Shading Deployment Frequency',
        units: 'frequency',
        defaultLower: 1,
        defaultUpper: 15
      },
      seedYearStart: {
        min: 0,
        max: 50,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Seeding Start Year - Years to wait before starting',
        units: 'years',
        defaultLower: 0,
        defaultUpper: 25
      },
      shadeYearStart: {
        min: 1,
        max: 50,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Shading Start Year - Years to wait before starting',
        units: 'years',
        defaultLower: 2,
        defaultUpper: 25
      },
      fogYearStart: {
        min: 1,
        max: 50,
        step: 1,
        format: 'number',
        discrete: true,
        displayWith: 'formatNumber',
        description: 'Fogging Start Year - Years to wait before starting',
        units: 'years',
        defaultLower: 2,
        defaultUpper: 25
      }
    }
  }
};

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
    MatButtonModule,
    MatExpansionModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './parameter-config.component.html',
  styleUrl: './parameter-config.component.scss'
})
export class ParameterConfigComponent {
  // Output event when user submits configuration
  parametersSubmitted = output<ModelParameters>();

  // Output event when parameters change (auto-save)
  parametersChanged = output<ModelParameters>();

  // Input: Initial parameters to populate the form
  initialParameters = input<ModelParameters | null>(null);

  // Expose parameter categories to template
  parameterCategories = PARAMETER_CATEGORIES;
  categoryKeys = Object.keys(PARAMETER_CATEGORIES);

  // Available scenario options (powers of 2)
  scenarioOptions = [1, 2, 4, 8, 16, 32, 64, 128, 256];

  baseRCPScenarioOptions: RcpScenario[] = ['26', '45', '60', '85'];
  rmeRCPScenarioOptions: RcpScenario[] = ['26', '45', '85'];
  dataPackageOptions: DataPackage[] = ['MOORE', 'GBR'];
  dataPackageSpec: Record<DataPackage, { displayName: string }> = {
    MOORE: { displayName: 'Moore Reef cluster (site scale)' },
    GBR: { displayName: 'Great Barrier Reef (reef scale)' }
  };

  configForm = new FormGroup({
    runName: new FormControl('example_run', [Validators.required]),
    dataPackage: new FormControl<DataPackage>('MOORE', [Validators.required]),
    rcpScenario: new FormControl<RcpScenario>(DEFAULT_RCP, [Validators.required]),

    numScenarios: new FormControl(64, [Validators.required]),

    // Coral seeding parameters (original working ones)
    taLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    taUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),
    caLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    caUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),
    smLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    smUpper: new FormControl(1000000, [Validators.required, Validators.min(0)]),

    // Environmental intervention parameters
    minIvLocationsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    minIvLocationsUpper: new FormControl(20, [Validators.required, Validators.min(1)]),
    foggingLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    foggingUpper: new FormControl(0.3, [Validators.required, Validators.min(0)]),
    srmLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    srmUpper: new FormControl(7, [Validators.required, Validators.min(0)]),
    assistedAdaptationLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    assistedAdaptationUpper: new FormControl(15, [Validators.required, Validators.min(0)]),

    // Timing parameters
    seedYearsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    seedYearsUpper: new FormControl(75, [Validators.required, Validators.min(1)]),
    shadeYearsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    shadeYearsUpper: new FormControl(75, [Validators.required, Validators.min(1)]),
    fogYearsLower: new FormControl(5, [Validators.required, Validators.min(1)]),
    fogYearsUpper: new FormControl(75, [Validators.required, Validators.min(1)]),
    planHorizonLower: new FormControl(0, [Validators.required, Validators.min(0)]),
    planHorizonUpper: new FormControl(20, [Validators.required, Validators.min(0)]),

    // Deployment strategy parameters
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

  // Computed signals for range displays
  dataPackage = signal<DataPackage>('MOORE');
  rcpScenarioOptions = computed(() => {
    return availableScenariosFromDataPackage(this.dataPackage());
  });

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
    // Single subscription to form changes with proper handling
    this.configForm.valueChanges
      .pipe(
        tap(() => {
          console.log('Tap first change');
          // Update range signals immediately for UI responsiveness
          this.updateRangeSignals();
        }),
        debounceTime(500), // Debounce only the auto-save, not the UI updates
        distinctUntilChanged((prev, curr) => {
          console.log('Debounced param check');
          // Only emit if form values actually changed (deep comparison)
          return JSON.stringify(prev) === JSON.stringify(curr);
        })
      )
      .subscribe(formValue => {
        const currentRcpScenario = formValue.rcpScenario;
        const availableScenarios = availableScenariosFromDataPackage(formValue.dataPackage);

        // If current RCP scenario is not available for the selected data package
        if (currentRcpScenario && !availableScenarios.includes(currentRcpScenario)) {
          // Reset to the first available scenario (or a sensible default)
          const defaultScenario = availableScenarios.includes(DEFAULT_RCP) ? DEFAULT_RCP : availableScenarios[0];
          this.configForm.patchValue({ rcpScenario: defaultScenario });
        }

        // Auto-save: emit parameters when form changes and is valid
        if (this.configForm.valid && this.validateRanges()) {
          const parameters = this.buildModelParameters();
          this.parametersChanged.emit(parameters);
        }
      });

    // Initialize range displays
    this.updateRangeSignals();

    // Effect to populate form with initial parameters (one-time setup)
    effect(() => {
      const params = this.initialParameters();
      if (params) {
        this.populateFormFromParameters(params);
      }
    });
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

  // Helper method to get parameter config by key
  getParameterConfig(paramKey: string): ParameterConfig | null {
    for (const category of Object.values(PARAMETER_CATEGORIES)) {
      if (category.parameters[paramKey]) {
        return category.parameters[paramKey];
      }
    }
    return null;
  }

  // Helper method to get range signal by parameter key
  getRangeSignal(paramKey: string): any {
    const signalMap: { [key: string]: any } = {
      tabularAcropora: this.taRange,
      corymboseAcropora: this.caRange,
      smallMassives: this.smRange,
      minIvLocations: this.minIvLocationsRange,
      fogging: this.foggingRange,
      srm: this.srmRange,
      assistedAdaptation: this.assistedAdaptationRange,
      seedYears: this.seedYearsRange,
      shadeYears: this.shadeYearsRange,
      fogYears: this.fogYearsRange,
      planHorizon: this.planHorizonRange,
      seedDeploymentFreq: this.seedDeploymentFreqRange,
      fogDeploymentFreq: this.fogDeploymentFreqRange,
      shadeDeploymentFreq: this.shadeDeploymentFreqRange,
      seedYearStart: this.seedYearStartRange,
      shadeYearStart: this.shadeYearStartRange,
      fogYearStart: this.fogYearStartRange
    };
    return signalMap[paramKey];
  }

  // Helper method to get form control names by parameter key
  getFormControlNames(paramKey: string): { lower: string; upper: string } {
    const controlMap: { [key: string]: { lower: string; upper: string } } = {
      tabularAcropora: { lower: 'taLower', upper: 'taUpper' },
      corymboseAcropora: { lower: 'caLower', upper: 'caUpper' },
      smallMassives: { lower: 'smLower', upper: 'smUpper' },
      minIvLocations: { lower: 'minIvLocationsLower', upper: 'minIvLocationsUpper' },
      fogging: { lower: 'foggingLower', upper: 'foggingUpper' },
      srm: { lower: 'srmLower', upper: 'srmUpper' },
      assistedAdaptation: { lower: 'assistedAdaptationLower', upper: 'assistedAdaptationUpper' },
      seedYears: { lower: 'seedYearsLower', upper: 'seedYearsUpper' },
      shadeYears: { lower: 'shadeYearsLower', upper: 'shadeYearsUpper' },
      fogYears: { lower: 'fogYearsLower', upper: 'fogYearsUpper' },
      planHorizon: { lower: 'planHorizonLower', upper: 'planHorizonUpper' },
      seedDeploymentFreq: { lower: 'seedDeploymentFreqLower', upper: 'seedDeploymentFreqUpper' },
      fogDeploymentFreq: { lower: 'fogDeploymentFreqLower', upper: 'fogDeploymentFreqUpper' },
      shadeDeploymentFreq: { lower: 'shadeDeploymentFreqLower', upper: 'shadeDeploymentFreqUpper' },
      seedYearStart: { lower: 'seedYearStartLower', upper: 'seedYearStartUpper' },
      shadeYearStart: { lower: 'shadeYearStartLower', upper: 'shadeYearStartUpper' },
      fogYearStart: { lower: 'fogYearStartLower', upper: 'fogYearStartUpper' }
    };
    return controlMap[paramKey];
  }

  // Helper methods for template
  trackByCategory(index: number, categoryKey: string): string {
    return categoryKey;
  }

  trackByParameter(index: number, paramKey: string): string {
    return paramKey;
  }

  getParameterKeys(categoryKey: string): string[] {
    return Object.keys(PARAMETER_CATEGORIES[categoryKey].parameters);
  }

  getDisplayWithFunction(paramKey: string): (value: number) => string {
    const config = this.getParameterConfig(paramKey);
    if (!config?.displayWith) {
      return this.formatNumber.bind(this); // Default fallback
    }

    // Return the appropriate formatting function
    switch (config.displayWith) {
      case 'formatMillions':
        return this.formatMillions.bind(this);
      case 'formatDecimal':
        return this.formatDecimal.bind(this);
      case 'formatNumber':
        return this.formatNumber.bind(this);
      default:
        return this.formatNumber.bind(this); // Default fallback
    }
  }

  // Format value based on format type
  formatValue(value: number, format: string, units?: string): string {
    let formatted: string;
    switch (format) {
      case 'millions':
        formatted = this.formatMillions(value);
        break;
      case 'decimal':
        formatted = this.formatDecimal(value);
        break;
      case 'number':
      default:
        formatted = this.formatNumber(value);
        break;
    }
    return units ? `${formatted} ${units}` : formatted;
  }

  // Reset all parameters to their default values
  resetToDefaults(): void {
    // Build default values from the parameter configuration
    const defaultValues: any = {
      runName: 'example_run',
      dataPackage: 'MOORE',
      rcpScenario: DEFAULT_RCP,
      numScenarios: 64
    };

    // Add default values for all parameters
    for (const categoryKey of Object.keys(PARAMETER_CATEGORIES)) {
      const category = PARAMETER_CATEGORIES[categoryKey];
      for (const paramKey of Object.keys(category.parameters)) {
        const config = category.parameters[paramKey];
        const controlNames = this.getFormControlNames(paramKey);

        defaultValues[controlNames.lower] = config.defaultLower;
        defaultValues[controlNames.upper] = config.defaultUpper;
      }
    }

    // Update the form with default values
    this.configForm.patchValue(defaultValues);

    // Update range signals
    this.updateRangeSignals();

    console.log('Parameters reset to defaults');
  }

  // Build ModelParameters from current form values (for auto-save)
  private buildModelParameters(): ModelParameters {
    const formValue = this.configForm.value;

    return {
      runName: formValue.runName!,
      rcpScenario: formValue.rcpScenario!,
      dataPackage: formValue.dataPackage!,
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
    this.dataPackage.set(form.dataPackage || 'MOORE');
    this.taRange.set({ lower: form.taLower || 0, upper: form.taUpper || 1000000 });
    this.caRange.set({ lower: form.caLower || 0, upper: form.caUpper || 1000000 });
    this.smRange.set({ lower: form.smLower || 0, upper: form.smUpper || 1000000 });
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

  // Populate form from ModelParameters (one-time initialization)
  private populateFormFromParameters(params: ModelParameters): void {
    // Update form values without triggering valueChanges initially
    this.configForm.patchValue({
      runName: params.runName,
      rcpScenario: params.rcpScenario,
      dataPackage: params.dataPackage,
      numScenarios: params.numScenarios,

      // Coral seeding parameters
      taLower: params.tabularAcropora.lower,
      taUpper: params.tabularAcropora.upper,
      caLower: params.corymboseAcropora.lower,
      caUpper: params.corymboseAcropora.upper,
      smLower: params.smallMassives.lower,
      smUpper: params.smallMassives.upper,

      // Environmental intervention parameters
      minIvLocationsLower: params.minIvLocations.lower,
      minIvLocationsUpper: params.minIvLocations.upper,
      foggingLower: params.fogging.lower,
      foggingUpper: params.fogging.upper,
      srmLower: params.srm.lower,
      srmUpper: params.srm.upper,
      assistedAdaptationLower: params.assistedAdaptation.lower,
      assistedAdaptationUpper: params.assistedAdaptation.upper,

      // Timing parameters
      seedYearsLower: params.seedYears.lower,
      seedYearsUpper: params.seedYears.upper,
      shadeYearsLower: params.shadeYears.lower,
      shadeYearsUpper: params.shadeYears.upper,
      fogYearsLower: params.fogYears.lower,
      fogYearsUpper: params.fogYears.upper,
      planHorizonLower: params.planHorizon.lower,
      planHorizonUpper: params.planHorizon.upper,

      // Deployment strategy parameters
      seedDeploymentFreqLower: params.seedDeploymentFreq.lower,
      seedDeploymentFreqUpper: params.seedDeploymentFreq.upper,
      fogDeploymentFreqLower: params.fogDeploymentFreq.lower,
      fogDeploymentFreqUpper: params.fogDeploymentFreq.upper,
      shadeDeploymentFreqLower: params.shadeDeploymentFreq.lower,
      shadeDeploymentFreqUpper: params.shadeDeploymentFreq.upper,
      seedYearStartLower: params.seedYearStart.lower,
      seedYearStartUpper: params.seedYearStart.upper,
      shadeYearStartLower: params.shadeYearStart.lower,
      shadeYearStartUpper: params.shadeYearStart.upper,
      fogYearStartLower: params.fogYearStart.lower,
      fogYearStartUpper: params.fogYearStart.upper
    });

    // Update range signals with new values
    this.updateRangeSignals();
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    const formValue = this.configForm.value;
    const parameters: ModelParameters = {
      runName: formValue.runName!,
      rcpScenario: formValue.rcpScenario!,
      dataPackage: formValue.dataPackage!,
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
      data_package: params.dataPackage,
      rcp_scenario: params.rcpScenario,
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
          optional_third: params.fogging.lower // Mode set to lower bound for triangular distribution
        },
        {
          param_name: 'SRM',
          third_param_flag: true,
          lower: params.srm.lower,
          upper: params.srm.upper,
          optional_third: params.srm.lower // Mode set to lower bound for triangular distribution
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

        // DiscreteTriangularDist - These use triangular but are discrete,
        // keeping third param
        {
          param_name: 'seed_years',
          third_param_flag: true,
          lower: params.seedYears.lower,
          upper: params.seedYears.upper,
          optional_third: params.seedYears.lower // Mode for triangular distribution
        },
        {
          param_name: 'shade_years',
          third_param_flag: true,
          lower: params.shadeYears.lower,
          upper: params.shadeYears.upper,
          optional_third: params.shadeYears.lower // Mode for triangular distribution
        },
        {
          param_name: 'fog_years',
          third_param_flag: true,
          lower: params.fogYears.lower,
          upper: params.fogYears.upper,
          optional_third: params.fogYears.lower // Mode for triangular distribution
        }
      ]
    };
  }
}
