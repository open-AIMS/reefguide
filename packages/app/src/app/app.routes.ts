// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { JobsTableComponent } from './jobs/jobs-table/jobs-table.component';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'projects'
  },
  {
    path: 'projects',
    loadComponent: () =>
      import('./projects/projects-list/projects-list.component').then(m => m.ProjectsListComponent),
    title: 'My Projects'
  },
  {
    path: 'adria/:projectId',
    loadComponent: () =>
      import('./model-workflow/model-workflow.component').then(m => m.ModelWorkflowComponent),
    title: 'ADRIA Model Run'
  },
  {
    path: 'location-selection/:projectId',
    loadComponent: () =>
      import('./location-selection/location-selection.component').then(m => {
        console.log('selection');
        return m.LocationSelectionComponent;
      }),
    title: 'Location Selection'
  },
  {
    path: 'jobs',
    component: JobsTableComponent,
    title: 'My Jobs'
  }
];
