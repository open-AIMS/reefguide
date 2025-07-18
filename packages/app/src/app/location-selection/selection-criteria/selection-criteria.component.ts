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
import { CriteriaPayloads, SiteSuitabilityCriteria } from '../reef-guide-api.types';
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

  regionCriteriaRanges = signal<CriteriaRangeList | undefined>(undefined);

  enableSiteSuitability = signal(true);

  /**
   * IDs of Criteria that are flipped to positive values for the UI.
   */
  negativeFlippedCriteria = new Set(['Depth']);

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
      const { min_val, max_val, default_min_val, default_max_val } = c;
      if (this.negativeFlippedCriteria.has(c.id)) {
        c.min_val = -max_val;
        c.max_val = -min_val;
        c.default_min_val = -default_max_val;
        c.default_max_val = -default_min_val;
      }

      c.min_val = Math.floor(c.min_val);
      c.max_val = Math.ceil(c.max_val);
      const diff = c.max_val - c.min_val;
      c.step = diff > 40 ? 1 : 0.1;

      criteriaControlDefs[`${c.payload_property_prefix}min`] = [c.default_min_val];
      criteriaControlDefs[`${c.payload_property_prefix}max`] = [c.default_max_val];
    }

    const formGroup = this.formBuilder.group(criteriaControlDefs);
    this.form.setControl('criteria', formGroup);

    this.regionCriteriaRanges.set(regionCriteriaRanges);
  }

  /**
   * Get Job payload criteria values
   */
  getCriteriaPayloads(): CriteriaPayloads {
    const formValue = this.form.value;
    const criteriaRanges = this.regionCriteriaRanges()!;

    if (!this.form.valid) {
      // this causes required form inputs to show error state
      this.form.markAllAsTouched();
      throw new Error('Form invalid!');
    }

    const criteria: Record<string, number | undefined> = {
      ...formValue.criteria
    };

    // fix values of negative-flipped criteria
    for (const c of criteriaRanges) {
      if (this.negativeFlippedCriteria.has(c.id)) {
        const minKey = `${c.payload_property_prefix}min`;
        const minValue = criteria[minKey]!;
        const maxKey = `${c.payload_property_prefix}max`;
        const maxValue = criteria[maxKey]!;

        criteria[minKey] = -maxValue;
        criteria[maxKey] = -minValue;
      }
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
    const criteriaRanges = this.regionCriteriaRanges();
    if (criteriaRanges === undefined) {
      return;
    }

    for (const c of criteriaRanges) {
      // don't need to worry about negative-flipping here since we mutated min/max values
      const minControl = criteriaFormGroup.get(`${c.payload_property_prefix}min`);
      minControl?.setValue(c.default_min_val);
      const maxControl = criteriaFormGroup.get(`${c.payload_property_prefix}max`);
      maxControl?.setValue(c.default_max_val);
    }

    // TODO reset site suitability?
  }
}
