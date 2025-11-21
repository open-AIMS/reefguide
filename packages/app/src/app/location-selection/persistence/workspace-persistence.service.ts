import { BaseWorkspacePersistenceService } from '../../projects/services/base-workspace-persistence.service';
import { Injectable } from '@angular/core';

export interface WorkspaceState {
  version: '1.0';
}

/**
 * Site Assessment project workspace persistence.
 *
 * Provided by the project component.
 */
@Injectable()
export class WorkspacePersistenceService extends BaseWorkspacePersistenceService<WorkspaceState> {
  protected override STORAGE_KEY = 'site-assessment-workspace';

  protected override generateDefaultWorkspaceState(): WorkspaceState {
    throw new Error('Method not implemented.');
  }
  protected override migrateWorkspaceState(state: unknown): WorkspaceState | undefined {
    throw new Error('Method not implemented.');
  }
  protected override isValidWorkspaceState(state: any, repair: boolean): state is WorkspaceState {
    throw new Error('Method not implemented.');
  }
}
