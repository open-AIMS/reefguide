import {
  BaseWorkspacePersistenceService,
  LoadWorkspaceStateContext,
  WorkspaceStateMigrationError
} from '../../projects/services/base-workspace-persistence.service';
import { Injectable } from '@angular/core';
import { RegionalAssessmentInput } from '@reefguide/types';
import { shareReplay, tap } from 'rxjs';
import { tapDebug } from '../../../util/rxjs-util';

/**
 * Site Assessment project state.
 */
export interface WorkspaceState {
  version: '1.0';
  selectionCriteria: {
    region: string | null;

    reef_type: RegionalAssessmentInput['reef_type'];

    /**
     * Criteria min|max values
     */
    criteria: Record<string, number>;

    /**
     * Suitability Assessment section/job is enabled.
     */
    enableSuitabilityAssessment: boolean;
    /**
     * Additional properties for Suitability Assessment.
     */
    suitabilityAssessmentCriteria: {
      x_dist: number;
      y_dist: number;
      threshold: number;
    };
  };
}

/**
 * Site Assessment project workspace persistence.
 *
 * Provided by the project component.
 */
@Injectable()
export class WorkspacePersistenceService extends BaseWorkspacePersistenceService<WorkspaceState> {
  protected override STORAGE_KEY = 'site-assessment-workspace';

  /**
   * Replay of the first loaded state.
   *
   * Note: currently not coordinated with loadWorkspaceState, subscribers only interested in the
   * first state should prefer using this observable.
   */
  firstState$ = this.loadWorkspaceState().pipe(
    tap(state => {
      console.log('firstState$', state);
    }),
    shareReplay(1)
  );

  public override generateDefaultWorkspaceState(): WorkspaceState {
    return {
      version: '1.0',
      selectionCriteria: {
        region: null,
        reef_type: 'slopes',
        // default values come through API, cannot be defined here
        criteria: {},
        enableSuitabilityAssessment: false,
        suitabilityAssessmentCriteria: {
          x_dist: 100,
          y_dist: 20,
          threshold: 95
        }
      }
    };
  }
  protected override migrateWorkspaceState(
    state: unknown,
    context: LoadWorkspaceStateContext
  ): WorkspaceState {
    throw new WorkspaceStateMigrationError('migration not implemented', context);
  }
  protected override isValidWorkspaceState(
    state: WorkspaceState,
    repair: boolean
  ): state is WorkspaceState {
    const isRootValid =
      state &&
      typeof state === 'object' &&
      state.version === '1.0' &&
      typeof state.selectionCriteria === 'object';

    if (!isRootValid) return false;

    const selectionCriteria = state.selectionCriteria;
    const regionType = typeof selectionCriteria.region;
    const isSelectionCriteriaValid =
      (selectionCriteria.region === null || regionType === 'string') &&
      typeof selectionCriteria.enableSuitabilityAssessment === 'boolean' &&
      typeof selectionCriteria.criteria === 'object' &&
      typeof selectionCriteria.suitabilityAssessmentCriteria === 'object';

    return isSelectionCriteriaValid;

    // TODO full validation, consider Zod in app
  }
}
