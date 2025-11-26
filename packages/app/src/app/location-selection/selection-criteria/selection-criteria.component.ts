import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatSliderModule } from '@angular/material/slider';
import {
  FormBuilder,
  FormControl,
  FormControlStatus,
  FormGroup,
  FormRecord,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { ReefGuideMapService } from '../reef-guide-map.service';
import { CriteriaPayloads, SuitabilityAssessmentExclusiveInput } from '../reef-guide-api.types';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import {
  catchError,
  combineLatestWith,
  debounceTime,
  EMPTY,
  filter,
  map,
  Observable,
  shareReplay,
  skip,
  startWith,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap
} from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';
import { CriteriaRangeOutput, SuitabilityAssessmentInput, SharedCriteria } from '@reefguide/types';
import { MatTooltip } from '@angular/material/tooltip';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { LayerController } from '../../map/layer-controller';
import { retryHTTPErrors } from '../../../util/http-util';
import { AsyncPipe } from '@angular/common';
import {
  WorkspacePersistenceService,
  WorkspaceState
} from '../persistence/workspace-persistence.service';
import { UserMessageService } from '../../user-messages/user-message.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

/**
 * All information about a criteria and its slider.
 */
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

/**
 * List of criteria sliders
 *
 * Lifecycle: component reused when open/closed, but new component when panel switches from other content.
 */
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
    MatProgressSpinner,
    AsyncPipe
  ],
  templateUrl: './selection-criteria.component.html',
  styleUrl: './selection-criteria.component.scss'
})
export class SelectionCriteriaComponent {
  private readonly api = inject(WebApiService);
  private readonly formBuilder = inject(FormBuilder);
  readonly mapService = inject(ReefGuideMapService);
  readonly userMessageService = inject(UserMessageService);

  readonly persistenceService = inject(WorkspacePersistenceService);

  /**
   * How many milliseconds to debounce the save
   */
  readonly saveDebounceTime = 2_000;

  // HACK order regions from North to South
  // ideally regions would already be ordered by API or have geometry property to sort by.
  private regionOrder = [
    'FarNorthern',
    'Cairns-Cooktown',
    'Townsville-Whitsunday',
    'Mackay-Capricorn'
  ];

  regions$ = this.api.getRegions().pipe(
    retryHTTPErrors(3),
    map(resp => {
      const { regions } = resp;
      const regionOrder = this.regionOrder;
      // sort the regions by the hardcoded order
      return regions.sort((a, b) => {
        // -1 if not found, but not important to handle that explicitly for this ordering hack.
        return regionOrder.indexOf(a.name) - regionOrder.indexOf(b.name);
      });
    })
  );

  /**
   * The slider definitions in the original order from the API.
   */
  sliderDefs = signal<SliderDef[] | undefined>(undefined);

  /**
   * Slider definitions that are enabled, ordered according to criteriaOrder.
   * The template uses this to render sliders.
   */
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

  /**
   * Enable the Site Suitability section and launch that job on Assess.
   *
   * Initially false, but default value is set in constructor from persistence serviec.
   */
  enableSiteSuitability = signal(false);

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

  protected readonly form: FormGroup<{
    region: FormControl<string | null>;
    reef_type: FormControl<string>;
    criteria: FormRecord<FormControl<number>>;
    siteSuitability: FormGroup<{
      x_dist: FormControl<number>;
      y_dist: FormControl<number>;
      threshold: FormControl<number>;
    }>;
  }>;

  /**
   * form.statusChanges with replay
   */
  readonly formStatus$: Observable<FormControlStatus>;

  /**
   * Criteria layer ID that was automatically set to visible for pixel filtering
   */
  private _autoVisible: string | undefined = undefined;
  /**
   * Emits when criteria form controls are building.
   */
  private resetCriteria$ = new Subject<void>();

  // TODO move to persistence service or a utility class?
  private saveTrigger = new Subject<void>();
  private saveEnabled = false;
  private save$ = this.saveTrigger.pipe(
    // emit while saving is enabled
    filter(() => this.saveEnabled),
    debounceTime(this.saveDebounceTime)
  );

  constructor() {
    // start with initial default state, but this will quickly be changed once state
    // is loaded from the persistence service.
    const defaultState = this.persistenceService.generateDefaultWorkspaceState();
    const { region, reef_type, suitabilityAssessmentCriteria } = defaultState.selectionCriteria;

    // add type safety where payload property names must match.
    type SharedProps = Pick<SharedCriteria, 'region' | 'reef_type'> | { siteSuitability: any };

    // FIXME setup form types correctly, nonNullable FormBuilder?
    // @ts-expect-error types not happy
    this.form = this.formBuilder.group<Record<keyof SharedProps, any>>({
      region: [region, Validators.required],
      reef_type: [reef_type],
      // entries are added by load workspace state or on region change
      criteria: this.formBuilder.record({}),
      siteSuitability: this.formBuilder.group<
        Record<keyof SuitabilityAssessmentExclusiveInput, any>
      >({
        x_dist: [suitabilityAssessmentCriteria.x_dist, [Validators.min(1), Validators.required]],
        y_dist: [suitabilityAssessmentCriteria.y_dist, [Validators.min(1), Validators.required]],
        threshold: [suitabilityAssessmentCriteria.threshold, Validators.required]
      })
    });

    this.formStatus$ = this.form.statusChanges.pipe(shareReplay(1));
    // need to subscribe now so capture and replay status
    this.formStatus$.pipe(takeUntilDestroyed()).subscribe();

    const regionControl = this.form.get('region')!;
    regionControl.valueChanges
      .pipe(
        tap(x => {
          // TODO need loading indicator?
          this.sliderDefs.set(undefined);
        }),
        filter(Boolean), // ignore null | undefined | ''
        switchMap(region =>
          this.api.getRegionCriteria(region).pipe(
            // catch error to prevent it from breaking parent observable
            catchError((err, caught) => {
              console.error(`${region} criteria request failed`, err);
              this.userMessageService.error('Failed to load region information');
              return EMPTY;
            })
          )
        )
      )
      .subscribe(regionCriteria => {
        this.buildCriteriaFormRecord(regionCriteria);
        this.setupLayerPixelFiltering();
      });

    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.saveTrigger.next();
    });

    // Trigger save on toggle Site Suitability section
    // TODO consider moving this to the form control
    effect(() => {
      this.enableSiteSuitability(); // react to changes
      this.saveTrigger.next();
    });

    this.save$.pipe(takeUntilDestroyed()).subscribe(() => this.save());
  }

  ngOnInit() {
    // TODO loading UI blocker until done, @defer?
    // this could be cached, so
    this.persistenceService.firstState$.pipe(take(1)).subscribe(state => {
      try {
        if (state == null) {
          // TODO can we remove null type from observable now?
          console.warn('got null state!?');
          return;
        }

        this.loadFromState(state);
      } finally {
        // always enable saving regardless
        // allow saving workspace state now that initial state loaded
        this.saveEnabled = true;
      }
    });
  }

  /**
   * Build and set the FormRecord and controls.
   * Sets regionCriteriaRanges signal.
   * @param regionCriteria
   */
  private buildCriteriaFormRecord(regionCriteria: CriteriaRangeOutput) {
    this.resetCriteria$.next();

    const enableLowHighDepthMode =
      'LowTide' in regionCriteria && 'HighTide' in regionCriteria && 'Depth' in regionCriteria;

    const availableCriteria = Object.values(regionCriteria);

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

    for (const c of availableCriteria) {
      const sliderDef = this.createSliderDef(c);
      regionCriteriaRanges.push(sliderDef);

      if (!sliderDef.slider.disabled) {
        // ensure that default values are not outside the slider range.
        // TODO test what happens if stored criteria value is outside min/max
        const minKey = `${sliderDef.criteria.payload_property_prefix}min`;
        const minValue = Math.max(sliderDef.slider.min, sliderDef.slider.default_min);
        this.addMissingCriteriaControl(minKey, minValue);

        const maxKey = `${sliderDef.criteria.payload_property_prefix}max`;
        const maxValue = Math.min(sliderDef.slider.max, sliderDef.slider.default_max);
        this.addMissingCriteriaControl(maxKey, maxValue);
      }
    }

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
          .pipe(skip(1), takeUntil(this.resetCriteria$))
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

    // validation and make types happy
    if (formValue.region == null) {
      throw new Error('region not defined!');
    }
    if (formValue.reef_type == null) {
      throw new Error('reef_type not defined!');
    }

    const sharedCriteria: SharedCriteria = {
      region: formValue.region,
      reef_type: formValue.reef_type,
      // the *_min, *_max values
      ...formValues
    };

    let siteSuitability: SuitabilityAssessmentInput | undefined = undefined;
    const siteForm = this.form.get('siteSuitability')!;
    if (this.enableSiteSuitability() && siteForm.valid) {
      siteSuitability = {
        ...sharedCriteria,
        ...siteForm.value
      };
    }

    return {
      regionalAssessment: {
        ...sharedCriteria,
        // greyscale is assumed/required by ReefGuideMapService.addRegionalAssessmentLayer
        // see: docs/clearing-job-cache.md
        cogColor: 'greyscale'
      },
      suitabilityAssessment: siteSuitability
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

  /**
   * Save current state to the persistence service.
   */
  save() {
    // value property type is deep partial, so using getRawValue()
    const formValue = this.form.getRawValue();
    const ss = formValue.siteSuitability;

    const state: WorkspaceState = {
      version: '1.0',
      selectionCriteria: {
        region: formValue.region,
        reef_type: formValue.reef_type,
        criteria: formValue.criteria,
        enableSuitabilityAssessment: this.enableSiteSuitability(),
        suitabilityAssessmentCriteria: {
          x_dist: ss.x_dist,
          y_dist: ss.y_dist,
          threshold: ss.threshold
        }
      }
    };

    this.persistenceService.saveWorkspaceState(state).subscribe();
  }

  /**
   * Update form to match the workspace state
   * @param state
   */
  private loadFromState(state: WorkspaceState) {
    const {
      region,
      reef_type,
      criteria,
      enableSuitabilityAssessment,
      suitabilityAssessmentCriteria
    } = state.selectionCriteria;

    this.enableSiteSuitability.set(enableSuitabilityAssessment);

    for (const key in criteria) {
      this.addMissingCriteriaControl(key, criteria[key]);
    }

    this.form.setValue({
      region,
      reef_type,
      criteria,
      siteSuitability: {
        ...suitabilityAssessmentCriteria
      }
    });
  }

  /**
   * Add FormControl<number> for the criteria key if it's missing from the 'criteria' FormRecord.
   * @param key
   * @param value
   */
  private addMissingCriteriaControl(key: string, value: number) {
    const criteriaFormRecord = this.form.get('criteria') as FormRecord<FormControl<number>>;
    if (!criteriaFormRecord.get(key)) {
      criteriaFormRecord.addControl(key, new FormControl(value, { nonNullable: true }), {
        emitEvent: false
      });
    }
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
