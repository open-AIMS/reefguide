import {
  BaseWorkspacePersistenceService,
  LoadWorkspaceStateContext,
  WorkspaceStateMigrationError
} from '../../projects/services/base-workspace-persistence.service';
import { Injectable } from '@angular/core';
import { RegionalAssessmentInput } from '@reefguide/types';
import { Observable, throwError } from 'rxjs';

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
     *
     * IMPORTANT: this is in app-space, the representation within SelectionCriteriaComponent.
     * These are not the same properties or values as the job payload.
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

  regionalAssessmentJob?: {
    jobId: number;
    region: string;
  };

  suitabilityAssessmentJob?: {
    jobId: number;
    region: string;
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
   * Save the selection criteria.
   * This patches other state but discards jobs
   * @param selectionCriteria selectionCriteria part of workspace state
   */
  public saveCriteria(selectionCriteria: WorkspaceState['selectionCriteria']): Observable<void> {
    const lastState = this.lastSavedState;
    if (lastState === undefined) {
      return throwError(() => new Error('cannot patch, initial state never loaded'));
    }

    console.log('saveCriteria', selectionCriteria);

    const newState: WorkspaceState = {
      ...lastState,
      selectionCriteria
    };

    delete newState.regionalAssessmentJob;
    delete newState.suitabilityAssessmentJob;

    return this.saveWorkspaceState(newState);
  }

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
