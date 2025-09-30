import { Component, Inject, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebApiService } from '../../../api/web-api.service';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import {
  GetProjectsResponse,
  UserReference,
  GroupWithRelations,
  GetProjectResponse
} from '@reefguide/types';

export interface UpdateProjectDialogInput {
  projectId: number;
}

@Component({
  selector: 'app-project-settings-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatAutocompleteModule,
    MatInputModule,
    MatFormFieldModule,
    ReactiveFormsModule
  ],
  templateUrl: './project-settings-dialog.component.html',
  styleUrl: './project-settings-dialog.component.scss'
})
export class ProjectSettingsDialogComponent {
  webApiService = inject(WebApiService);

  projectId: number;
  projectDetails = signal<GetProjectResponse['project'] | null>(null);
  isLoading = signal<boolean>(true);
  loadError = signal<string | null>(null);
  isPublic = signal<boolean>(false);

  // User sharing
  userSearchControl = new FormControl('');
  filteredUsers = signal<UserReference[]>([]);
  isSearchingUsers = signal<boolean>(false);

  // Group sharing
  groupSearchControl = new FormControl('');
  availableGroups = signal<GroupWithRelations[]>([]);
  filteredGroups = signal<GroupWithRelations[]>([]);
  isLoadingGroups = signal<boolean>(false);

  // Computed current shares
  sharedUsers = computed(() => {
    const project = this.projectDetails();
    if (!project) return [];
    return project.userShares?.map(share => share.user) || [];
  });

  sharedGroups = computed(() => {
    const project = this.projectDetails();
    if (!project) return [];
    return project.groupShares?.map(share => share.group) || [];
  });

  constructor(@Inject(MAT_DIALOG_DATA) public input: UpdateProjectDialogInput) {
    this.projectId = input.projectId;
    this.loadProject();
    this.setupUserSearch();
    this.loadGroups();
  }

  loadProject() {
    this.isLoading.set(true);
    this.loadError.set(null);

    this.webApiService.getProject(this.projectId).subscribe({
      next: response => {
        this.projectDetails.set(response.project);
        this.isPublic.set(response.project.is_public);
        this.isLoading.set(false);
      },
      error: error => {
        this.loadError.set('Failed to load project details');
        this.isLoading.set(false);
        console.error('Error loading project:', error);
      }
    });
  }

  setupUserSearch() {
    this.userSearchControl.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(query => {
          if (!query || query.length < 2) {
            this.filteredUsers.set([]);
            return of(null);
          }
          this.isSearchingUsers.set(true);
          return this.webApiService.searchUsers(query, 10);
        })
      )
      .subscribe({
        next: response => {
          if (response) {
            // Filter out users who are already shared with
            const currentUserIds = this.sharedUsers().map(u => u.id);
            const filtered = response.results.filter(u => !currentUserIds.includes(u.id));
            this.filteredUsers.set(filtered);
          }
          this.isSearchingUsers.set(false);
        },
        error: error => {
          console.error('Error searching users:', error);
          this.isSearchingUsers.set(false);
        }
      });
  }

  loadGroups() {
    this.isLoadingGroups.set(true);
    this.webApiService.getGroups().subscribe({
      next: response => {
        this.availableGroups.set(response.groups);
        this.updateFilteredGroups();
        this.isLoadingGroups.set(false);
      },
      error: error => {
        console.error('Error loading groups:', error);
        this.isLoadingGroups.set(false);
      }
    });

    // Setup group search filtering
    this.groupSearchControl.valueChanges.subscribe(() => {
      this.updateFilteredGroups();
    });
  }

  updateFilteredGroups() {
    const query = this.groupSearchControl.value?.toLowerCase() || '';
    const currentGroupIds = this.sharedGroups().map(g => g.id);

    const filtered = this.availableGroups()
      .filter(g => !currentGroupIds.includes(g.id))
      .filter(
        g =>
          !query ||
          g.name.toLowerCase().includes(query) ||
          g.description?.toLowerCase().includes(query)
      );

    this.filteredGroups.set(filtered);
  }

  onPublicToggle(checked: boolean) {
    this.isPublic.set(checked);
    this.webApiService.setProjectPublic(this.projectId, { isPublic: checked }).subscribe({
      error: error => {
        // Rollback on error
        this.isPublic.set(!checked);
        console.error('Error updating project publicity:', error);
      }
    });
  }

  onAddUser(user: UserReference) {
    // Optimistically update UI
    const currentProject = this.projectDetails();
    if (!currentProject) return;

    this.projectDetails.set({
      ...currentProject,
      userShares: [
        ...(currentProject.userShares || []),
        {
          id: -1, // Temporary ID
          project_id: this.projectId,
          user_id: user.id,
          created_at: new Date(),
          updated_at: new Date(),
          user
        }
      ]
    });

    // Clear search
    this.userSearchControl.setValue('');

    // Make API call
    this.webApiService.shareProjectWithUsers(this.projectId, { userIds: [user.id] }).subscribe({
      next: () => {
        // Reload to get accurate data
        this.loadProject();
      },
      error: error => {
        console.error('Error sharing with user:', error);
        // Rollback
        this.loadProject();
      }
    });
  }

  onRemoveUser(user: UserReference) {
    // Optimistically update UI
    const currentProject = this.projectDetails();
    if (!currentProject) return;

    this.projectDetails.set({
      ...currentProject,
      userShares: (currentProject.userShares || []).filter(share => share.user_id !== user.id)
    });

    // Make API call
    this.webApiService.unshareProjectWithUsers(this.projectId, { userIds: [user.id] }).subscribe({
      next: () => {
        // Reload to get accurate data
        this.loadProject();
      },
      error: error => {
        console.error('Error unsharing with user:', error);
        // Rollback
        this.loadProject();
      }
    });
  }

  onAddGroup(group: GroupWithRelations) {
    // Optimistically update UI
    const currentProject = this.projectDetails();
    if (!currentProject) return;

    this.projectDetails.set({
      ...currentProject,
      groupShares: [
        ...(currentProject.groupShares || []),
        {
          id: -1, // Temporary ID
          project_id: this.projectId,
          group_id: group.id,
          created_at: new Date(),
          updated_at: new Date(),
          group: {
            id: group.id,
            name: group.name,
            description: group.description
          }
        }
      ]
    });

    // Clear search
    this.groupSearchControl.setValue('');

    // Make API call
    this.webApiService.shareProjectWithGroups(this.projectId, { groupIds: [group.id] }).subscribe({
      next: () => {
        // Reload to get accurate data
        this.loadProject();
        this.updateFilteredGroups();
      },
      error: error => {
        console.error('Error sharing with group:', error);
        // Rollback
        this.loadProject();
      }
    });
  }

  onRemoveGroup(group: { id: number; name: string; description: string | null }) {
    // Optimistically update UI
    const currentProject = this.projectDetails();
    if (!currentProject) return;

    this.projectDetails.set({
      ...currentProject,
      groupShares: (currentProject.groupShares || []).filter(share => share.group_id !== group.id)
    });

    // Make API call
    this.webApiService
      .unshareProjectWithGroups(this.projectId, { groupIds: [group.id] })
      .subscribe({
        next: () => {
          // Reload to get accurate data
          this.loadProject();
          this.updateFilteredGroups();
        },
        error: error => {
          console.error('Error unsharing with group:', error);
          // Rollback
          this.loadProject();
        }
      });
  }

  displayUserFn(user: UserReference): string {
    return user ? user.email : '';
  }

  displayGroupFn(group: GroupWithRelations): string {
    return group ? group.name : '';
  }
}
