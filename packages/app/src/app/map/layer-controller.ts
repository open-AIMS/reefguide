import { computed, effect, Signal, signal, WritableSignal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { LayerDef } from '@reefguide/types';
import type Layer from 'ol/layer/Layer';
import TileLayer from 'ol/layer/WebGLTile';
import { debounceTime, map, of, shareReplay, Subject, switchMap, takeUntil } from 'rxjs';
import { LayerProperties } from '../../types/layer.type';
import { fromOpenLayersEvent } from '../../util/openlayers/openlayers-util';

type LayerStyleModes = 'default' | 'pixel-filtering';

export type LayerControllerOptions = {
  /**
   * Layer definition used to create this layer
   */
  layerDef?: LayerDef;
  /**
   * create and set color value signal in LayerController
   */
  color?: string;
};

/**
 * Wraps an OpenLayers Layer with signals and abstract over the app's layer styling system.
 * Provides information about layer loading progress and errors.
 *
 * TODO lifecycle/dispose concerns, may need to cleanup listeners
 */
export class LayerController {
  readonly visible: WritableSignal<boolean>;
  readonly opacity: WritableSignal<number>;
  readonly styleMode = signal<LayerStyleModes>('default');
  readonly loading: Signal<boolean>;
  /**
   * Loading progress 0.0:1.0
   * defined if progress supported for the layer/source
   */
  loadingProgress?: Signal<number>;

  /**
   * number of tiles currently loading.
   * defined if TileLayer
   */
  tilesLoading?: Signal<number>;

  /**
   * Primary color of this layer
   */
  color?: WritableSignal<string>;
  /**
   * Download data file for the layer.
   */
  readonly download?: LayerProperties['download'];

  private destroyed$ = new Subject<void>();

  constructor(
    public readonly layer: Layer,
    public readonly options?: LayerControllerOptions
  ) {
    const download: LayerProperties['download'] = layer.get('download');
    this.download = typeof download === 'function' ? download : undefined;

    this.visible = signal(layer.getVisible());
    this.opacity = signal(layer.getOpacity());

    if (options?.color) {
      this.color = signal(options.color);
    }

    // Sync signal to layer state
    effect(() => {
      layer.setVisible(this.visible());
    });
    effect(() => {
      layer.setOpacity(this.opacity());
    });

    // Sync layer to signal (if changed externally)
    fromOpenLayersEvent(layer, 'change:visible')
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => {
        this.visible.set(layer.getVisible());
      });
    fromOpenLayersEvent(layer, 'change:opacity')
      .pipe(takeUntil(this.destroyed$))
      .subscribe(() => {
        this.opacity.set(layer.getOpacity());
      });

    // setup loading/progress listeners
    if (layer instanceof TileLayer) {
      this.loading = this.setupTileLoadingListeners(layer);
    } else {
      // TODO if (layer instanceof VectorLayer) {
      // const source: VectorSource = layer.getSource();
      // source.on('featuresloadstart')
      this.loading = signal(false);
    }
  }

  /**
   * Cleanup
   */
  public destroy() {
    this.destroyed$.next();
    this.destroyed$.complete();
  }

  /**
   * Get the layer's custom properties.
   */
  public getProperties(): LayerProperties {
    return this.layer.getProperties();
  }

  /**
   * Pixel-filter the primary band using normalized values 0-1
   * @param min normalized 0:1 minimum value
   * @param max normalized 0:1 maximum value
   */
  public filterLayerPixels(min: number, max: number) {
    const layer = this.layer;
    if (layer instanceof TileLayer) {
      if (this.styleMode() !== 'pixel-filtering') {
        this.enablePixelFiltering();
      }

      // values at the extreme or beyond can cause the full layer extent to render the color,
      // so offset number value slightly to prevent this.
      if (min <= 0) {
        min = Number.EPSILON;
      }
      if (max >= 1) {
        // offset by EPSILON did not work. Maybe float64 to float32 conversion issue with GPU?
        // max = 1 - Number.EPSILON;
        max = 0.999999;
      }
      layer.updateStyleVariables({ min, max });
    }
  }

  public resetStyle() {
    this.styleMode.set('default');
    const layer = this.layer;
    if (layer instanceof TileLayer) {
      layer.setStyle({});
    }
  }

  /**
   * Sets the layer style to filter pixels using min, max style variables.
   * Changes the styleMode to pixel-filtering
   */
  private enablePixelFiltering() {
    this.styleMode.set('pixel-filtering');

    const layer = this.layer;
    if (layer instanceof TileLayer) {
      // OpenLayers bands are normalized 0 to 1
      let metric: any[] = ['band', 1];
      if (this.options?.layerDef?.reverseRange) {
        // invert to align with values from criteria UI
        metric = ['-', 1, metric];
      }

      // if set to 0 or 1 entire layer extent renders color (depending on reverseRange)
      const flatColor = [
        'case',
        ['between', metric, ['var', 'min'], ['var', 'max']],
        [223, 19, 208, 1],
        [223, 19, 208, 0]
      ];

      layer.setStyle({
        variables: {
          // avoid full extent color render by offsetting numbers
          min: Number.EPSILON,
          max: 0.999999
        },
        color: flatColor
      });
    }
  }

  private setupTileLoadingListeners(layer: TileLayer): Signal<boolean> {
    const originalSource = layer.getSource();
    const sourceReady$ =
      originalSource != null
        ? of(originalSource)
        : fromOpenLayersEvent(layer, 'sourceready').pipe(
            map(() => {
              const source = layer.getSource();
              if (source == null) {
                throw new Error(`sourceready emitted, but source null`);
              }
              return source;
            }),
            shareReplay(1)
          );

    const tileLoadStart$ = sourceReady$.pipe(
      switchMap(source => fromOpenLayersEvent(source, 'tileloadstart')),
      takeUntil(this.destroyed$)
    );
    const tileLoadEnd$ = sourceReady$.pipe(
      switchMap(source => fromOpenLayersEvent(source, 'tileloadend')),
      takeUntil(this.destroyed$)
    );
    const tileLoadError$ = sourceReady$.pipe(
      switchMap(source => fromOpenLayersEvent(source, 'tileloaderror')),
      takeUntil(this.destroyed$)
    );

    const tilesStarted = signal(0);
    const tilesLoaded = signal(0);

    tileLoadStart$.subscribe(e => {
      tilesStarted.update(v => v + 1);
    });
    tileLoadEnd$.subscribe(e => {
      tilesLoaded.update(v => v + 1);
    });
    tileLoadError$.subscribe(e => {
      // not actually loaded, but for the purpose of progress consider this completed
      tilesLoaded.update(v => v + 1);

      // TODO log if not 404 error
      // if (e instanceof TileSourceEvent) {
      // console.warn(`tile load error coord=${e.tile.getTileCoord()}`, e);
      // }
    });

    this.loadingProgress = computed(() =>
      tilesStarted() === 0 ? 1.0 : tilesLoaded() / tilesStarted()
    );

    this.tilesLoading = computed(() => tilesStarted() - tilesLoaded());

    toObservable(this.loadingProgress)
      .pipe(debounceTime(500), takeUntil(this.destroyed$))
      .subscribe(progress => {
        if (progress >= 1.0) {
          tilesLoaded.set(0);
          tilesStarted.set(0);
        }
      });

    // is loading signal
    return computed(() => tilesLoaded() < tilesStarted());
  }
}
