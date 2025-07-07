import { Component, inject } from '@angular/core';
import { JobsManagerService, TrackedJob } from '../../jobs/jobs-manager.service';
import { AsyncPipe } from '@angular/common';
import { JobType } from '@reefguide/db';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';

const labels: Record<JobType, string> = {
  REGIONAL_ASSESSMENT: 'criteria assessment',
  SUITABILITY_ASSESSMENT: 'site suitability',
  DATA_SPECIFICATION_UPDATE: 'data specification update',
  ADRIA_MODEL_RUN: 'adria model run',
  TEST: 'test'
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
    let label = labels[trackedJob.jobType];
    // prefix with region if it's found in payload
    const region = trackedJob.payload['region'];
    if (region) {
      label = `${region} ${label}`;
    }
    return label;
  }

  cancel(job: TrackedJob) {
    this.jobsManager.cancel(job);
  }

  dismiss(job: TrackedJob) {
    this.jobsManager.remove(job.id);
  }
}
