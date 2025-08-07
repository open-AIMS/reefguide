import { Component, computed, inject, signal } from '@angular/core';
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
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LayerController } from '../../map/openlayers-model';

type SliderDef = {
  // original criteria definition from API
  readonly criteria: Readonly<CriteriaRangeOutput[string]>;
  slider: {
    // slider code may change these, min/max are rounded
    min: number;
    max: number;
    // default values may differ due to negativeFlippedCriteria
    default_min: number;
    default_max: number;
    // currently determined by app code, though could define server-side
    step: number;
    // user is not allowed to set this criteria via the UI.
    disabled: boolean;
    // criteria layer this slider pixel-filters
    criteriaLayerId: string;
    // warning message during slider pixel filtering
    previewAlert?: string;
  };
};

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
    MatTooltip,
    MatProgressSpinner
  ],
  templateUrl: './selection-criteria.component.html',
  styleUrl: './selection-criteria.component.scss'
})
export class SelectionCriteriaComponent {
  private readonly api = inject(WebApiService);
  private readonly formBuilder = inject(FormBuilder);
  readonly mapService = inject(ReefGuideMapService);

  regions = ALL_REGIONS;

  sliderDefs = signal<SliderDef[] | undefined>(undefined);
  enabledSliderDefs = computed(() => {
    const sliderDefs = this.sliderDefs();
    if (!sliderDefs) {
      return undefined;
    }

    const idOrder = this.criteriaOrder;
    return sliderDefs
      .filter(s => !s.slider.disabled)
      .sort((a, b) => idOrder.indexOf(a.criteria.id) - idOrder.indexOf(b.criteria.id));
  });

  enableSiteSuitability = signal(true);

  /**
   * Criteria ID that is currently pixel-filtering.
   */
  previewingCriteriaFilter = signal<string | undefined>(undefined);

  /**
   * Slider order (criteria IDs)
   * TODO specify order in ReefGuide.ASSESSMENT_CRITERIA
   */
  criteriaOrder = [
    'Depth',
    '_LowHighTideDepth',
    'LowTide',
    'HighTide',
    'Slope',
    'Rugosity',
    'Turbidity',
    'WavesHs',
    'WavesTp'
  ];

  /**
   * Do not show sliders for these criteria ids.
   * Turbidity data is not ready for use.
   * LowTide and HighTide are set by the Depth slider.
   */
  disabledCriteria = new Set<string>(['Turbidity', 'LowTide', 'HighTide']);

  /**
   * IDs of Criteria that are flipped to positive values for the UI.
   * TODO move to ReefGuide.ASSESSMENT_CRITERIA
   */
  negativeFlippedCriteria = new Set(['Depth', 'LowTide', 'HighTide', '_LowHighTideDepth']);

  form: FormGroup;

  /**
   * Criteria layer ID that was automatically set to visible for pixel filtering
   */
  private _autoVisible: string | undefined = undefined;
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
          this.sliderDefs.set(undefined);
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

  /**
   * Build and set the FormGroup and controls.
   * Sets regionCriteriaRanges signal.
   * @param regionCriteria
   */
  private buildCriteriaFormGroup(regionCriteria: CriteriaRangeOutput) {
    this.reset$.next();

    const enableLowHighDepthMode =
      'LowTide' in regionCriteria && 'HighTide' in regionCriteria && 'Depth' in regionCriteria;

    const availableCriteria = Object.values(regionCriteria);

    // TODO order?
    const regionCriteriaRanges: SliderDef[] = [];

    // this a virtual criteria that will set
    // in the future may add feature to toggle between
    // Depth, LowTide, HighTide, and this Low-High mode.
    if (enableLowHighDepthMode) {
      const depthCriteria = regionCriteria['Depth']!;
      // Use Depth params with a fe changes.
      availableCriteria.push({
        ...depthCriteria,
        id: '_LowHighTideDepth',
        display_title: 'Low-tide to High-tide depth',
        display_subtitle: 'Minimum depth at low tide to maximum depth at high tide',
        payload_property_prefix: '_low_high_tide_depth_',
        min_tooltip: 'Minimum depth at low tide',
        max_tooltip: 'Maximum depth at high tide'
      });

      // replaces Depth slider
      this.disabledCriteria.add('Depth');
    }

    // formBuilder definitions for 'criteria' group
    const criteriaControlDefs: Record<string, any> = {};

    for (const c of availableCriteria) {
      const sliderDef = this.createSliderDef(c);
      regionCriteriaRanges.push(sliderDef);

      if (!sliderDef.slider.disabled) {
        // ensure that default values are not outside the slider range.
        const minValue = Math.max(sliderDef.slider.min, sliderDef.slider.default_min);
        const maxValue = Math.min(sliderDef.slider.max, sliderDef.slider.default_max);

        criteriaControlDefs[`${sliderDef.criteria.payload_property_prefix}min`] = [minValue];
        criteriaControlDefs[`${sliderDef.criteria.payload_property_prefix}max`] = [maxValue];
      }
    }

    const formGroup = this.formBuilder.group(criteriaControlDefs);
    this.form.setControl('criteria', formGroup);

    this.sliderDefs.set(regionCriteriaRanges);
  }

  private createSliderDef(criteria: CriteriaRangeOutput[string]): SliderDef {
    const { id, min_val, max_val, default_min_val, default_max_val } = criteria;

    if (default_min_val < min_val) {
      console.warn(`criteria ${id} default_min_val=${default_min_val} < min_val=${min_val}`);
    }

    if (default_max_val > max_val) {
      console.warn(`criteria ${id} default_max_val=${default_max_val} > max_val=${max_val}`);
    }

    // this feature is for criteria like Depth
    // round the min/max outward, otherwise the slider step values will be long
    // floating point numbers that are visible to user on slider thumb.
    // Note that values will be clamped by getCriteriaPayloads
    let slider_min, slider_max, slider_default_min, slider_default_max;
    if (this.negativeFlippedCriteria.has(id)) {
      slider_min = Math.floor(-max_val);
      slider_max = Math.ceil(-min_val);
      slider_default_min = -default_max_val;
      slider_default_max = -default_min_val;
    } else {
      slider_min = Math.floor(min_val);
      slider_max = Math.ceil(max_val);
      slider_default_min = default_min_val;
      slider_default_max = default_max_val;
    }

    const diff = max_val - min_val;
    // use step 1 for large ranges, step 0.1 for smaller. (40 is arbitrary)
    const slider_step = diff > 40 ? 1 : diff > 4 ? 0.1 : 0.02;

    let previewAlert: string | undefined;
    let criteriaLayerId = criteria.id;

    if (id === '_LowHighTideDepth') {
      // Low-High Tide Depth is a virtual criteria, use Depth layer
      criteriaLayerId = 'Depth';
      previewAlert = 'Map preview uses MSL depth instead of tide depth';
    }

    return {
      criteria,
      slider: {
        disabled: this.disabledCriteria.has(id),
        step: slider_step,
        min: slider_min,
        max: slider_max,
        default_min: slider_default_min,
        default_max: slider_default_max,
        criteriaLayerId,
        previewAlert
      }
    };
  }

  /**
   * For criteria with a map layer, listen to slider min/max changes and pixel-filter.
   * Sets layer visible (exclusive to other criteria layers) on min|max change
   */
  private setupLayerPixelFiltering() {
    const slidersDefs = this.enabledSliderDefs();
    const formGroup = this.form.get('criteria');
    if (!slidersDefs || !formGroup) {
      return;
    }
    for (const def of slidersDefs) {
      const { criteria, slider } = def;
      const layerId = slider.criteriaLayerId;

      const layerController = layerId ? this.mapService.criteriaLayers[layerId] : undefined;
      if (layerController) {
        const minKey = `${criteria.payload_property_prefix}min`;
        const maxKey = `${criteria.payload_property_prefix}max`;

        const min$ = formGroup
          .get(minKey)!
          .valueChanges.pipe(startWith(slider.default_min)) as Observable<number>;
        const max$ = formGroup
          .get(maxKey)!
          .valueChanges.pipe(startWith(slider.default_max)) as Observable<number>;

        min$
          .pipe(combineLatestWith(max$))
          .pipe(skip(1), takeUntil(this.reset$))
          .subscribe(([min, max]) => {
            this.onSliderChange(def, layerController, min, max);
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
    const sliderDefs = this.enabledSliderDefs()!;

    if (!this.form.valid) {
      // this causes required form inputs to show error state
      this.form.markAllAsTouched();
      throw new Error('Form invalid!');
    }

    // form values for the criteria group.
    const formValues: Record<string, number | undefined> = {
      ...formValue.criteria
    };

    // fix values of negative-flipped criteria
    for (const sliderDef of sliderDefs) {
      const { criteria } = sliderDef;
      const isFlipped = this.negativeFlippedCriteria.has(criteria.id);
      const minKey = `${criteria.payload_property_prefix}min`;
      const maxKey = `${criteria.payload_property_prefix}max`;

      // convert back to un-flipped criteria coordinates if needed
      const minValue = isFlipped ? -formValues[maxKey]! : formValues[minKey]!;
      const maxValue = isFlipped ? -formValues[minKey]! : formValues[maxKey]!;

      // clamp values since could be outside range due to slider floor(min), ceil(max)
      formValues[minKey] = Math.max(minValue, criteria.min_val);
      formValues[maxKey] = Math.min(maxValue, criteria.max_val);

      if (criteria.id === '_LowHighTideDepth') {
        // Low-High tide mode
        // FUTURE Depth could toggle modes between LowTide, HighTide, MSL, and Low-High.
        // in this context, depth is already negative-flipped so more negative is deeper

        // depth_max is shallowest (least negative)
        formValues['low_tide_max'] = formValues['_low_high_tide_depth_max'];
        // omit low_tide_min, ReefGuideWorker will default to criteria bounds min.

        // depth_min is deepest (most negative)
        formValues['high_tide_min'] = formValues['_low_high_tide_depth_min'];
        // omit high_tide_max, ReefGuideWorker will default to criteria bounds max.

        // replace the virtual properties
        delete formValues['_low_high_tide_depth_min'];
        delete formValues['_low_high_tide_depth_max'];
      }
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
        ...formValues
      },
      siteSuitability
    };
  }

  /**
   * Reset all criteria to default values.
   */
  reset() {
    const criteriaFormGroup = this.form.get('criteria')!;
    const sliderDefs = this.enabledSliderDefs();
    if (sliderDefs === undefined) {
      return;
    }

    for (const sliderDef of sliderDefs) {
      const { criteria, slider } = sliderDef;
      // don't need to worry about negative-flipping here since we mutated min/max values
      const minControl = criteriaFormGroup.get(`${criteria.payload_property_prefix}min`);
      minControl?.setValue(slider.default_min);
      const maxControl = criteriaFormGroup.get(`${criteria.payload_property_prefix}max`);
      maxControl?.setValue(slider.default_max);
    }

    // TODO reset site suitability?
  }

  onSliderChange(sliderDef: SliderDef, layerController: LayerController, min: number, max: number) {
    const { criteria, slider } = sliderDef;
    if (!layerController.visible()) {
      layerController.visible.set(true);
      this.mapService.showCriteriaLayer(slider.criteriaLayerId);
      this._autoVisible = slider.criteriaLayerId;
    }

    const range = slider.max - slider.min;
    // normalized 0:1
    const nMin = (min - slider.min) / range;
    const nMax = (max - slider.min) / range;
    layerController.filterLayerPixels(nMin, nMax);
    this.previewingCriteriaFilter.set(criteria.id);
  }

  // stop pixel filtering and reset layer style and visibility
  onBlurSlider(sliderDef: SliderDef) {
    this.previewingCriteriaFilter.set(undefined);
    const lc = this.mapService.criteriaLayers[sliderDef.slider.criteriaLayerId];
    lc?.resetStyle();
    if (this._autoVisible === sliderDef.slider.criteriaLayerId) {
      lc?.visible.set(false);
      this._autoVisible = undefined;
    }
  }
}
