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
import {
  catchError,
  combineLatestWith,
  EMPTY,
  Observable,
  skip,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap
} from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';
import { CriteriaRangeOutput } from '@reefguide/types';
import { MatTooltip } from '@angular/material/tooltip';

// add app properties, but keep original from API readonly
type CriteriaRangeOutput2 = Readonly<CriteriaRangeOutput[string]> & {
  // slider code may change these, min/max are rounded
  slider_min: number;
  slider_max: number;
  // default values may differ due to negativeFlippedCriteria
  slider_default_min: number;
  slider_default_max: number;
  // currently determined by app code, though could define server-side
  slider_step: number;
};

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

  private reset$ = new Subject<void>();

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
        this.setupLayerPixelFiltering();
      });
  }

  private buildCriteriaFormGroup(regionCriteria: CriteriaRangeOutput) {
    this.reset$.next();

    // TODO order?
    const regionCriteriaRanges = Object.values(regionCriteria) as CriteriaRangeList;

    // formBuilder definitions for 'criteria' group
    const criteriaControlDefs: Record<string, any> = {};

    for (const c of regionCriteriaRanges) {
      const { min_val, max_val, default_min_val, default_max_val } = c;
      if (default_min_val < min_val) {
        console.warn(`criteria ${c.id} default_min_val=${default_min_val} < min_val=${min_val}`);
      }

      if (default_max_val > max_val) {
        console.warn(`criteria ${c.id} default_max_val=${default_max_val} > max_val=${max_val}`);
      }

      // this feature is for criteria like Depth
      // round the min/max outward, otherwise the slider step values will be long
      // floating point numbers that are visible to user on slider thumb.
      // Note that values will be clamped by getCriteriaPayloads
      if (this.negativeFlippedCriteria.has(c.id)) {
        c.slider_min = Math.floor(-max_val);
        c.slider_max = Math.ceil(-min_val);
        c.slider_default_min = -default_max_val;
        c.slider_default_max = -default_min_val;
      } else {
        c.slider_min = Math.floor(min_val);
        c.slider_max = Math.ceil(max_val);
        c.slider_default_min = default_min_val;
        c.slider_default_max = default_max_val;
      }

      // use step 1 for large ranges, step 0.1 for smaller. (40 is arbitrary)
      const diff = c.max_val - c.min_val;
      c.slider_step = diff > 40 ? 1 : 0.1;

      // ensure that default values are not outside the slider range.
      const minValue = Math.max(c.slider_min, c.slider_default_min);
      const maxValue = Math.min(c.slider_max, c.slider_default_max);

      criteriaControlDefs[`${c.payload_property_prefix}min`] = [minValue];
      criteriaControlDefs[`${c.payload_property_prefix}max`] = [maxValue];
    }

    const formGroup = this.formBuilder.group(criteriaControlDefs);
    this.form.setControl('criteria', formGroup);

    this.regionCriteriaRanges.set(regionCriteriaRanges);
  }

  /**
   * For criteria with a map layer, listen to slider min/max changes and pixel-filter.
   * Sets layer visible (exclusive to other criteria layers) on min|max change
   */
  private setupLayerPixelFiltering() {
    const regionCriteriaRanges = this.regionCriteriaRanges();
    const formGroup = this.form.get('criteria');
    if (!regionCriteriaRanges || !formGroup) {
      return;
    }
    for (const c of regionCriteriaRanges) {
      const layerController = this.mapService.criteriaLayers[c.id];
      if (layerController) {
        const { min_val, max_val } = c;
        const range = max_val - min_val;
        const minKey = `${c.payload_property_prefix}min`;
        const maxKey = `${c.payload_property_prefix}max`;

        const min$ = formGroup
          .get(minKey)!
          .valueChanges.pipe(startWith(c.default_min_val)) as Observable<number>;
        const max$ = formGroup
          .get(maxKey)!
          .valueChanges.pipe(startWith(c.default_max_val)) as Observable<number>;

        min$
          .pipe(combineLatestWith(max$))
          .pipe(skip(1), takeUntil(this.reset$))
          .subscribe(([min, max]) => {
            if (!layerController.visible()) {
              layerController.visible.set(true);
              this.mapService.showCriteriaLayer(c.id);
            }

            // normalized 0:1
            const nMin = (min - min_val) / range;
            const nMax = (max - min_val) / range;
            layerController.filterLayerPixels(nMin, nMax);
          });
      }
    }
  }

  /**
   * Get Job payload criteria values
   * Ensures that values are within criteria min/max
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
      const isFlipped = this.negativeFlippedCriteria.has(c.id);
      const minKey = `${c.payload_property_prefix}min`;
      const maxKey = `${c.payload_property_prefix}max`;

      // convert back to un-flipped criteria coordinates if needed
      const minValue = isFlipped ? -criteria[maxKey]! : criteria[minKey]!;
      const maxValue = isFlipped ? -criteria[minKey]! : criteria[maxKey]!;

      // clamp values since could be outside range due to slider floor(min), ceil(max)
      criteria[minKey] = Math.max(minValue, c.min_val);
      criteria[maxKey] = Math.min(maxValue, c.max_val);
    }

    // console.log('criteria before/after', formValue.criteria, criteria);

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
      minControl?.setValue(c.slider_default_min);
      const maxControl = criteriaFormGroup.get(`${c.payload_property_prefix}max`);
      maxControl?.setValue(c.slider_default_max);
    }

    // TODO reset site suitability?
  }

  onBlurSlider(criteriaId: string) {
    const lc = this.mapService.criteriaLayers[criteriaId];
    lc?.resetStyle();
  }
}
