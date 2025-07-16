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
import { ALL_REGIONS } from '../reef-guide-config.service';
import { MatSelectModule } from '@angular/material/select';
import { catchError, EMPTY, switchMap, tap } from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';
import { CriteriaRangeOutput } from '@reefguide/types';
import { MatTooltip } from '@angular/material/tooltip';

// add properties calculated here
type CriteriaRangeOutput2 = CriteriaRangeOutput[string] & { step: number };
type CriteriaRangeList = Array<CriteriaRangeOutput2>;

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
    ReactiveFormsModule,
    MatSelectModule,
    MatTooltip
  ],
  templateUrl: './selection-criteria.component.html',
  styleUrl: './selection-criteria.component.scss'
})
export class SelectionCriteriaComponent {
  private readonly api = inject(WebApiService);
  private readonly formBuilder = inject(FormBuilder);
  readonly mapService = inject(ReefGuideMapService);

  regions = ALL_REGIONS;

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

  regionCriteriaRanges = signal<CriteriaRangeList | undefined>(undefined);

  enableSiteSuitability = signal(true);

  form: FormGroup;

  constructor() {
    this.form = this.formBuilder.group({
      region: [null, Validators.required],
      reef_type: ['slopes'],
      siteSuitability: this.formBuilder.group<Record<keyof SiteSuitabilityCriteria, any>>({
        x_dist: [450, [Validators.min(1), Validators.required]],
        y_dist: [20, [Validators.min(1), Validators.required]],
        threshold: [95, Validators.required]
      })
    });

    const regionControl = this.form.get('region')!;
    regionControl.valueChanges
      .pipe(
        tap(x => {
          // TODO need loading indicator?
          this.regionCriteriaRanges.set(undefined);
        }),
        switchMap(region =>
          this.api.getRegionCriteria(region).pipe(
            // catch error to prevent it from breaking parent observable
            catchError((err, caught) => {
              console.error(`${region} criteria request failed`, err);
              return EMPTY;
            })
          )
        )
      )
      .subscribe(regionCriteria => {
        this.buildCriteriaFormGroup(regionCriteria);
      });
  }

  private buildCriteriaFormGroup(regionCriteria: CriteriaRangeOutput) {
    // TODO order?
    const regionCriteriaRanges = Object.values(regionCriteria) as CriteriaRangeList;

    const criteriaControlDefs: Record<string, any> = {};

    for (const c of regionCriteriaRanges) {
      c.min_val = Math.floor(c.min_val);
      c.max_val = Math.ceil(c.max_val);
      const diff = c.max_val - c.min_val;
      c.step = diff > 40 ? 1 : 0.1;

      criteriaControlDefs[`${c.payload_property_prefix}_min`] = [c.default_min_val];
      criteriaControlDefs[`${c.payload_property_prefix}_max`] = [c.default_max_val];
    }

    const formGroup = this.formBuilder.group(criteriaControlDefs);
    this.form.setControl('criteria', formGroup);

    this.regionCriteriaRanges.set(regionCriteriaRanges);
  }

  getCriteria(): CriteriaAssessment {
    const formValue = this.form.value;

    if (!this.form.valid) {
      // this causes required form inputs to show error state
      this.form.markAllAsTouched();
      throw new Error('Form invalid!');
    }

    const criteria: Record<string, number | undefined> = {
      ...formValue.criteria
    };

    for (const c of this.criteria) {
      const minKey = `${c.payloadPropertyPrefix}_min`;
      let minValue = criteria[minKey] as number | undefined;
      const maxKey = `${c.payloadPropertyPrefix}_max`;
      let maxValue = criteria[maxKey];

      // convert values if function defined
      const { convertValue, reverseValues } = c;
      if (convertValue !== undefined) {
        if (minValue !== undefined) {
          minValue = convertValue(minValue);
        }
        if (maxValue !== undefined) {
          maxValue = convertValue(maxValue);
        }
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
      criteria: {
        region: formValue.region,
        reef_type: formValue.reef_type,
        ...criteria
      },
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
