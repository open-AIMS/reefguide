import { Component, inject, signal } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ReefGuideMapService } from '../reef-guide-map.service';
import { CriteriaAssessment, SiteSuitabilityCriteria } from '../reef-guide-api.types';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { ReefGuideConfigService } from '../reef-guide-config.service';

interface SelectionCriteriaInputDef {
  // field/id used by API
  id: string;
  payloadPropertyPrefix: string;
  name: string;
  desc?: string;
  min: number;
  minValue?: number;
  max: number;
  maxValue?: number;
  step?: number;
  // Value converter from displayed values to value in CriteriaAssessment
  convertValue?: (value: number) => number;
  // swap the final values
  reverseValues?: boolean;
}

@Component({
  selector: 'app-selection-criteria',
  imports: [
    MatSliderModule,
    FormsModule,
    MatIconButton,
    MatIcon,
    MatFormFieldModule,
    MatInput,
    MatSlideToggle,
    ReactiveFormsModule
  ],
  templateUrl: './selection-criteria.component.html',
  styleUrl: './selection-criteria.component.scss'
})
export class SelectionCriteriaComponent {
  readonly mapService = inject(ReefGuideMapService);
  readonly formBuilder = inject(FormBuilder);
  readonly config = inject(ReefGuideConfigService);

  /*
  Distance to Nearest Port (NM): 0.0:200.0
  Good if you add just a little bit beyond these bounds, like +1, except where the lower bound is zero.
   */

  criteria: Array<SelectionCriteriaInputDef> = [
    {
      id: 'Depth',
      payloadPropertyPrefix: 'depth',
      name: 'Depth (m)',
      // Bathy: -9.0:-2.0
      // UI is positive, but API takes negative numbers
      min: 0,
      max: 16,
      minValue: 2,
      maxValue: 10,
      step: 0.5,
      // convert Depth to negative values required by API. [-10, -2]
      convertValue: v => -v,
      reverseValues: true
    },
    {
      id: 'Slope',
      payloadPropertyPrefix: 'slope',
      name: 'Slope (degrees)',
      // Slope: 0.0:40.0
      min: 0,
      max: 45
    },
    {
      id: 'WavesHs',
      payloadPropertyPrefix: 'waves_height',
      name: ' Significant Wave Height (Hs)',
      min: 0,
      max: 6,
      maxValue: 1,
      step: 0.1
    },
    {
      id: 'WavesTp',
      payloadPropertyPrefix: 'waves_period',
      name: 'Wave Period',
      // Wave Period: 0.0:6.0
      min: 0,
      max: 9,
      maxValue: 6,
      step: 0.5
    }
  ];

  enableSiteSuitability = signal(true);

  form: FormGroup;

  constructor() {
    const criteriaControlDefs: Record<string, any> = {
      reef_type: ['slopes']
    };

    for (const c of this.criteria) {
      criteriaControlDefs[`${c.payloadPropertyPrefix}_min`] = [c.minValue ?? c.min];
      criteriaControlDefs[`${c.payloadPropertyPrefix}_max`] = [c.maxValue ?? c.max];
    }

    this.form = this.formBuilder.group({
      criteria: this.formBuilder.group(criteriaControlDefs),
      siteSuitability: this.formBuilder.group<Record<keyof SiteSuitabilityCriteria, any>>({
        x_dist: [450, [Validators.min(1), Validators.required]],
        y_dist: [20, [Validators.min(1), Validators.required]],
        threshold: [95, Validators.required]
      })
    });
  }

  getCriteria(): CriteriaAssessment {
    const formValue = this.form.value;
    // NOW :RegionAssesInput
    const criteria = { ...formValue.criteria };
    for (const c of this.criteria) {
      const minKey = `${c.payloadPropertyPrefix}_min`;
      let minValue = criteria[minKey];
      const maxKey = `${c.payloadPropertyPrefix}_max`;
      let maxValue = criteria[maxKey];

      // convert values if function defined
      const { convertValue, reverseValues } = c;
      if (convertValue !== undefined) {
        minValue = convertValue(minValue);
        maxValue = convertValue(maxValue);
      }

      if (reverseValues === true) {
        // swap values
        const temp = minValue;
        minValue = maxValue;
        maxValue = temp;
      }

      criteria[minKey] = minValue;
      criteria[maxKey] = maxValue;
    }

    let siteSuitability: SiteSuitabilityCriteria | undefined = undefined;
    const siteForm = this.form.get('siteSuitability')!;
    if (this.enableSiteSuitability() && siteForm.valid) {
      siteSuitability = siteForm.value;
    }

    return {
      criteria,
      siteSuitability
    };
  }

  /**
   * Reset all criteria to default values.
   */
  reset() {
    const criteriaFormGroup = this.form.get('criteria')!;
    for (const c of this.criteria) {
      const start = criteriaFormGroup.get(`${c.payloadPropertyPrefix}_min`);
      start?.setValue(c.minValue ?? c.min);
      const end = criteriaFormGroup.get(`${c.payloadPropertyPrefix}_max`);
      end?.setValue(c.maxValue ?? c.max);
    }
  }
}
