import { AsyncPipe, CommonModule } from '@angular/common';
import { AfterViewInit, Component, inject, signal, ViewChild } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatAccordion, MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatDrawer, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltip } from '@angular/material/tooltip';
import { combineLatest, filter, map, Observable, of, switchMap } from 'rxjs';
import { AdminPanelComponent } from '../admin/user-panel/user-panel.component';
import { AuthService } from '../auth/auth.service';
import { LoginDialogComponent } from '../auth/login-dialog/login-dialog.component';
import { ClusterAdminDialogComponent } from '../admin/cluster/ClusterAdminDialog.component';
import { LayerStyleEditorComponent } from '../widgets/layer-style-editor/layer-style-editor.component';
import { ConfigDialogComponent } from './config-dialog/config-dialog.component';
import { ReefGuideApiService } from './reef-guide-api.service';
import { CriteriaAssessment, criteriaToJobPayload } from './reef-guide-api.types';
import { ReefGuideConfigService } from './reef-guide-config.service';
import { ReefGuideMapService } from './reef-guide-map.service';
import { SelectionCriteriaComponent } from './selection-criteria/selection-criteria.component';
import { WebApiService } from '../../api/web-api.service';
import { RegionalAssessmentInput, SuitabilityAssessmentInput } from '@reefguide/types';
import { JobStatusListComponent } from '../widgets/job-status-list/job-status-list.component';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';


type DrawerModes = 'criteria' | 'style';

/**
 * Prototype of Location Selection app.
 * Map be split-off as its own project in the future.
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
    LayerStyleEditorComponent,
    MatAccordion,
    MatExpansionModule,
    CommonModule,
    MatMenuModule,
    MatProgressBar,
    JobStatusListComponent
  ],
  providers: [ReefGuideMapService],
  templateUrl: './location-selection.component.html',
  styleUrl: './location-selection.component.scss'
})
export class LocationSelectionComponent implements AfterViewInit {
  readonly config = inject(ReefGuideConfigService);
  readonly authService = inject(AuthService);
  readonly api = inject(WebApiService);
  readonly reefGuideApi = inject(ReefGuideApiService);
  readonly dialog = inject(MatDialog);
  readonly mapService = inject(ReefGuideMapService);

  drawerMode = signal<DrawerModes>('criteria');

  /**
   * Assess related layer is loading.
   */
  isAssessing$: Observable<boolean>;

  // TODO OL API migration
  map!: any;  // Map
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
  }

  // TODO confirm on init or after view init
  // ngOnInit() {
  ngAfterViewInit() {
    this.map = new Map({
      target: 'ol-map',
      view: new View({
        center: [0, 0],
        zoom: 1,
      }),
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
    });

    this.mapService.setMap(this.map);
  }

  openDrawer(mode: DrawerModes) {
    if (mode === 'criteria') {
      this.mapService.updateCriteriaLayerStates();
    }
    this.drawerMode.set(mode);
    this.drawer.toggle(true);
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

    this.drawer.close();

    // convert criteria to job payload and start job
    const raPartialPayload = criteriaToJobPayload(criteria);
    const jobsManager = this.mapService.addJobLayers('REGIONAL_ASSESSMENT', raPartialPayload);
    // could load previous job result like this:
    // this.mapService.loadLayerFromJobResults(31);

    if (siteSuitability) {
      // run site suitability job after its corresponding REGIONAL_ASSESSMENT job for the region.
      const sequentialJobs = false;
      if (sequentialJobs) {
        // start the site suitability job after the regional assessment job succeeds
        const ssJobTrigger$ = jobsManager.jobUpdate$.pipe(filter(j => j.status === 'SUCCEEDED'));
        ssJobTrigger$.subscribe(job => {
          // can't use raPayload above as it's missing region
          if (job.input_payload == null) {
            throw new Error('REGIONAL_ASSESSMENT job input_payload missing!');
          }
          // this final payload contains the region
          const raFinalPayload: RegionalAssessmentInput = job.input_payload;

          const ssPayload: SuitabilityAssessmentInput = {
            ...raFinalPayload,
            threshold: siteSuitability.SuitabilityThreshold,
            x_dist: siteSuitability.xdist,
            y_dist: siteSuitability.ydist
          };

          this.mapService.addSiteSuitabilityLayer(ssPayload);
        });
      } else {
        // start site suitability jobs immediately
        this.mapService.addAllSiteSuitabilityLayers(criteria, siteSuitability);
      }
    }
  }

  getLoadingRegionsMessage(busyRegions: Set<string> | null): string {
    if (busyRegions == null) {
      return '';
    }
    const vals = Array.from(busyRegions).join(', ');
    return `Loading: ${vals}`;
  }
}
