import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, effect, inject, signal, viewChild, ViewChild } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatDrawer, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { combineLatest, filter, map, Observable } from 'rxjs';
import { AdminPanelComponent } from '../admin/user-panel/user-panel.component';
import { AuthService } from '../auth/auth.service';
import { LoginDialogComponent } from '../auth/login-dialog/login-dialog.component';
import { ClusterAdminDialogComponent } from '../admin/cluster/ClusterAdminDialog.component';
import { ConfigDialogComponent } from './config-dialog/config-dialog.component';
import { CriteriaAssessment } from './reef-guide-api.types';
import { ReefGuideConfigService } from './reef-guide-config.service';
import { MAP_UI, MapUI, ReefGuideMapService } from './reef-guide-map.service';
import { SelectionCriteriaComponent } from './selection-criteria/selection-criteria.component';
import { WebApiService } from '../../api/web-api.service';
import { SuitabilityAssessmentInput } from '@reefguide/types';
import { ReefMapComponent } from '../reef-map/reef-map.component';
import { fromLonLat } from 'ol/proj';
import Layer from 'ol/layer/Layer';
import { LayerStyleEditorComponent } from '../widgets/layer-style-editor/layer-style-editor.component';

type DrawerModes = 'criteria' | 'style';

/**
 * Reef Guide criteria assessment and site suitability.
 *
 * Drawer layout with criteria assessment in left panel. Map component is main content.
 */
@Component({
  selector: 'app-location-selection',
  imports: [
    CommonModule,
    MatSidenavModule,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    SelectionCriteriaComponent,
    MatTooltip,
    AsyncPipe,
    MatProgressSpinner,
    MatExpansionModule,
    CommonModule,
    MatMenuModule,
    ReefMapComponent,
    LayerStyleEditorComponent
  ],
  providers: [ReefGuideMapService, { provide: MAP_UI, useExisting: LocationSelectionComponent }],
  templateUrl: './location-selection.component.html',
  styleUrl: './location-selection.component.scss'
})
export class LocationSelectionComponent implements MapUI {
  readonly config = inject(ReefGuideConfigService);
  readonly authService = inject(AuthService);
  readonly api = inject(WebApiService);
  readonly dialog = inject(MatDialog);
  readonly mapService = inject(ReefGuideMapService);

  map = viewChild.required(ReefMapComponent);

  // TODO consider component slots like approach instead
  drawerMode = signal<DrawerModes | undefined>(undefined);

  /**
   * Layer style that is currently being edited
   */
  editingLayerStyle = signal<Layer | undefined>(undefined);

  /**
   * Assess related layer is loading.
   */
  isAssessing$: Observable<boolean>;

  @ViewChild('drawer') drawer!: MatDrawer;

  constructor() {
    // track the signals that indicate a current request/job in progress
    // related to the Assess panel.
    this.isAssessing$ = combineLatest([
      toObservable(this.mapService.siteSuitabilityLoading),
      toObservable(this.mapService.regionAssessmentLoading)
    ]).pipe(
      // any loading=true indicates busy
      map(vals => vals.includes(true))
    );

    // Note: this executes before ReefMapComponent.ngAfterViewInit, execute once
    const effectRef = effect(
      () => {
        effectRef.destroy();
        this.setupMap(this.map());
      },
      { manualCleanup: true }
    );
  }

  openLayerStyleEditor(layer: Layer): void {
    this.editingLayerStyle.set(layer);
    this.openDrawer('style');
  }

  /**
   * One-time setup of Map
   */
  private setupMap(map: ReefMapComponent) {
    // Note: cannot View.setProjection, need to set at View construction
    const projection = map.view.getProjection();
    console.log('Map View projection', projection);
    const units = projection.getUnits();
    // TODO does OpenLayers have higher-level coord API to do equivalent?
    const point = [148, -18];
    if (units === 'm') {
      // convert to Web Mercator meter coords from lon/lat
      map.view.setCenter(fromLonLat(point));
    } else {
      map.view.setCenter(point);
    }

    // Note: zoom values differ between projections
    // TODO how to normalize zoom values?
    map.view.setZoom(units === 'm' ? 8 : 6);
    map.view.setMinZoom(4);
    map.view.setMaxZoom(19);
  }

  openDrawer(mode: DrawerModes) {
    this.drawerMode.set(mode);
    this.drawer.toggle(true);
  }

  onDrawerClose() {
    // clear drawer state
    this.editingLayerStyle.set(undefined);
    this.drawerMode.set(undefined);
  }

  openAdminPanel() {
    this.dialog.open(AdminPanelComponent, {
      width: '800px'
    });
  }

  openConfig() {
    this.dialog.open(ConfigDialogComponent);
  }

  openLogin() {
    this.dialog.open(LoginDialogComponent);
  }

  openClusterAdmin() {
    this.dialog.open(ClusterAdminDialogComponent, {
      width: '800px'
    });
  }

  /**
   * User submitted new criteria, clear current layers and request new layers.
   * This starts jobs; their results will be used by map layers.
   * @param assessment
   */
  onAssess(assessment: CriteriaAssessment) {
    const { criteria, siteSuitability } = assessment;

    this.mapService.clearAssessedLayers();

    // no need to await
    void this.drawer.close();

    const jobsManager = this.mapService.addJobLayers('REGIONAL_ASSESSMENT', criteria);
    // could load previous job result like this:
    // this.mapService.loadLayerFromJobResults(31);

    if (siteSuitability) {
      const ssPayload: SuitabilityAssessmentInput = {
        ...criteria,
        ...siteSuitability
      };

      // start the site suitability job after the regional assessment job succeeds
      const ssJobTrigger$ = jobsManager.jobUpdate$.pipe(filter(j => j.status === 'SUCCEEDED'));
      ssJobTrigger$.subscribe(job => {
        this.mapService.addSiteSuitabilityLayer(ssPayload);
      });
    }
  }
}
