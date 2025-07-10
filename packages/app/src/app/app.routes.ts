// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { JobsTableComponent } from './jobs/jobs-table/jobs-table.component';

export const routes: Routes = [
  //{
  //  path: '',
  //  loadComponent: () =>
  //    import('./projects/projects-list/projects-list.component').then(m => m.ProjectsListComponent),
  //  title: 'My Projects'
  //},
  //{
  //  path: 'projects',
  //  loadComponent: () =>
  //    import('./projects/projects-list/projects-list.component').then(m => m.ProjectsListComponent),
  //  title: 'My Projects'
  //},
  {
    path: 'test',
    loadComponent: () =>
      import('./model-workflow/model-workflow.component').then(m => {
        console.log('Hit');
        return m.ModelWorkflowComponent;
      }),
    title: 'ADRIA Model Run'
  },
  {
    path: 'adria/:projectId',
    loadComponent: () =>
      import('./model-workflow/model-workflow.component').then(m => m.ModelWorkflowComponent),
    title: 'ADRIA Model Run'
  },
  {
    path: 'location-selection',
    loadComponent: () =>
      import('./location-selection/location-selection.component').then(m => {
        console.log('selection');
        return m.LocationSelectionComponent;
      }),
    title: 'Location Selection'
  },
  {
    path: 'test-map',
    loadComponent: () => import('./test/test-map/test-map.component').then(m => m.TestMapComponent),
    title: 'Test Map'
  },
  {
    path: 'jobs',
    component: JobsTableComponent,
    title: 'My Jobs'
  }
];
