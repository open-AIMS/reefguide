// src/app/app.routes.ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/location-selection',
    pathMatch: 'full'
  },
  {
    path: 'new-run',
    loadComponent: () =>
      import('./model-workflow/model-workflow.component').then(m => m.ModelWorkflowComponent),
    title: 'Model Run Workflow'
  },
  {
    path: 'location-selection',
    loadComponent: () =>
      import('./location-selection/location-selection.component').then(
        m => m.LocationSelectionComponent
      ),
    title: 'Location Selection'
  },
  {
    path: 'jobs',
    loadComponent: () => import('./jobs/jobs.component').then(m => m.JobsComponent),
    title: 'Jobs'
  },
  {
    path: 'test-map',
    loadComponent: () => import('./test/test-map/test-map.component').then(m => m.TestMapComponent),
    title: 'Test Map'
  },
  // Legacy routes - redirect to new workflow
  {
    path: 'invoke-run',
    redirectTo: '/new-run',
    pathMatch: 'full'
  },
  {
    path: 'view-run/:id',
    redirectTo: '/new-run',
    pathMatch: 'full'
  },
  {
    path: 'runs',
    redirectTo: '/new-run',
    pathMatch: 'full'
  },
  // Fallback route
  {
    path: '**',
    redirectTo: '/new-run'
  }
];
