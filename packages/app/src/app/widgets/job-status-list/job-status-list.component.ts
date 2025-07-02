import { Component, inject } from '@angular/core';
import { JobsManagerService, TrackedJob } from '../../jobs/jobs-manager.service';
import { AsyncPipe } from '@angular/common';
import { JobType } from '@reefguide/db';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';

const labels: Record<JobType, string> = {
  REGIONAL_ASSESSMENT: 'Criteria assessment',
  SUITABILITY_ASSESSMENT: 'Site suitability',
  DATA_SPECIFICATION_UPDATE: 'Data specification update',
  TEST: 'Test'
};

@Component({
  selector: 'app-job-status-list',
  imports: [AsyncPipe, MatIconModule, MatProgressSpinnerModule, MatTooltipModule, MatButtonModule],
  templateUrl: './job-status-list.component.html',
  styleUrl: './job-status-list.component.scss'
})
export class JobStatusListComponent {
  readonly jobsManager = inject(JobsManagerService);

  constructor() {}

  getLabel(trackedJob: TrackedJob) {
    return labels[trackedJob.jobType];
  }

  dismiss(job: TrackedJob) {
    this.jobsManager.remove(job.id);
  }
}
