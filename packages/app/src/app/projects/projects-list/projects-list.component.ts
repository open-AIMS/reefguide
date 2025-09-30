import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule, MatIconButton } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Project } from '@reefguide/db';
import { GetProjectsResponse } from '@reefguide/types';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  map,
  Observable
} from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';
import { CreateProjectDialogComponent } from '../create-project-dialog/create-project-dialog.component';
import {
  ProjectSettingsDialogComponent,
  UpdateProjectDialogInput
} from '../project-settings-dialog/project-settings-dialog.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSnackBarModule,
    MatTooltipModule,
    MatButtonModule,
    MatIconButton
  ],
  templateUrl: './projects-list.component.html',
  styleUrls: ['./projects-list.component.scss']
})
export class ProjectsListComponent implements OnInit {
  private readonly webApi = inject(WebApiService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  @ViewChild(MatPaginator) paginator!: MatPaginator;

  // Expose Math to template
  Math = Math;

  // Search and pagination state
  searchQuery$ = new BehaviorSubject<string>('');
  pageSize = 10;
  currentPage = 0;
  totalProjects = 0;

  // Manual pagination control
  private pageEvent$ = new BehaviorSubject<PageEvent>({ pageIndex: 0, pageSize: 10, length: 0 });

  // All projects from the server
  allProjects$ = this.webApi.getProjects().pipe(map(response => response.projects));

  // Filtered projects based on search
  filteredProjects$: Observable<Project[]> = combineLatest([
    this.allProjects$,
    this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged())
  ]).pipe(
    map(([projects, searchQuery]) => {
      if (!searchQuery.trim()) {
        return projects;
      }

      const query = searchQuery.toLowerCase().trim();
      return projects.filter(
        project =>
          project.name.toLowerCase().includes(query) ||
          (project.description && project.description.toLowerCase().includes(query)) ||
          project.type.toLowerCase().includes(query)
      );
    })
  );
  // Show settings if current user is the project owner
  public canManageProjectSettings = (project: Project) => {
    console.log('Checking ownership of ', project);
    if (this.authService.getCurrentUser()?.roles.includes('ADMIN')) {
      return true;
    } else {
      console.log(project.user_id === this.authService.getCurrentUser()?.id);
      return project.user_id === this.authService.getCurrentUser()?.id;
    }
  };

  // Paginated projects
  paginatedProjects$: Observable<Project[]> = combineLatest([
    this.filteredProjects$,
    this.pageEvent$
  ]).pipe(
    map(([projects, pageEvent]) => {
      this.totalProjects = projects.length;
      const startIndex = pageEvent.pageIndex * pageEvent.pageSize;
      const endIndex = startIndex + pageEvent.pageSize;
      return projects.slice(startIndex, endIndex);
    })
  );

  isLoading$ = new BehaviorSubject<boolean>(true);

  ngOnInit() {
    // Set loading to false when projects are loaded
    this.allProjects$.subscribe(() => {
      this.isLoading$.next(false);
    });

    // Reset to first page when search changes
    this.searchQuery$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(() => {
      this.pageEvent$.next({ pageIndex: 0, pageSize: this.pageSize, length: 0 });
      this.currentPage = 0;
    });
  }

  onSearchChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchQuery$.next(target.value);
    // Reset to first page when searching happens automatically via ngOnInit subscription
  }

  onPageChange(event: PageEvent) {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.pageEvent$.next(event);
  }

  openCreateDialog() {
    const dialogRef = this.dialog.open(CreateProjectDialogComponent, {
      width: '600px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.onProjectCreated(result);
      }
    });
  }

  onProjectCreated(project: Project) {
    // Event hook for when a project is created
    // For now, just refresh the list
    this.refreshProjects();

    // Navigate to the appropriate workflow based on project type
    this.navigateToProject(project);
  }

  onProjectClick(project: Project) {
    // Navigate to the appropriate workflow based on project type
    this.navigateToProject(project);
  }

  private navigateToProject(project: Project) {
    switch (project.type) {
      case 'ADRIA_ANALYSIS':
        this.router.navigate(['/adria', project.id]);
        console.log('Ran nav function');
        break;
      case 'SITE_SELECTION':
        // Navigate to site selection workflow when available
        this.router.navigate(['/location-selection', project.id]);
        console.log('Ran nav function');
        break;
      default:
        console.warn('Unknown project type:', project.type);
        // Fallback to a generic project view
        this.router.navigate(['/projects', project.id]);
        break;
    }
  }

  refreshProjects() {
    this.isLoading$.next(true);
    this.allProjects$ = this.webApi.getUserProjects().pipe(map(response => response.projects));

    this.allProjects$.subscribe(() => {
      this.isLoading$.next(false);
    });
  }

  getProjectTypeDisplay(type: string): string {
    switch (type) {
      case 'SITE_SELECTION':
        return 'Site Assessment';
      case 'ADRIA_ANALYSIS':
        return 'ADRIA Analysis';
      default:
        return type;
    }
  }

  getProjectTypeColor(type: string): string {
    switch (type) {
      case 'SITE_SELECTION':
        return 'primary';
      case 'ADRIA_ANALYSIS':
        return 'accent';
      default:
        return 'basic';
    }
  }

  trackByProjectId(index: number, project: Project): number {
    return project.id;
  }

  // Helper methods for text truncation
  truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength).trim() + '...';
  }

  isTextTruncated(text: string, maxLength: number): boolean {
    return text ? text.length > maxLength : false;
  }

  /**
   * Activates the project settings modal
   * @param project The project we are configuring
   */
  openProjectSettings(project: GetProjectsResponse['projects'][number]) {
    const dialogRef = this.dialog.open(ProjectSettingsDialogComponent, {
      disableClose: false,
      width: '30vw',
      maxWidth: '30vw',
      height: '60vh',
      data: {
        projectId: project.id
      } satisfies UpdateProjectDialogInput
    });

    dialogRef.afterClosed().subscribe(() => {
      // Refresh in case of modifications
      this.refreshProjects();
    });
  }
}
