// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { JobsTableComponent } from './jobs/jobs-table/jobs-table.component';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./landing-page/landing-page.component').then(m => m.LandingPageComponent),
    title: 'ReefGuide'
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
