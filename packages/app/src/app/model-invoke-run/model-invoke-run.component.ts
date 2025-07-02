// src/app/model-invoke-run/model-invoke-run.component.ts
import { Component, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatRippleModule } from '@angular/material/core';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, Validators } from '@angular/forms';
import { FormBuilder, FormGroup } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { WebApiService } from '../../api/web-api.service';
import { JobStatusComponent } from '../jobs/job-status/job-status.component';
import { JobStatusConfig, mergeJobConfig } from '../jobs/job-status/job-status.types';
import { JobDetailsResponse, AdriaModelRunInput } from '@reefguide/types';

@Component({
  selector: 'app-model-invoke-run',
  templateUrl: 'model-invoke-run.component.html',
  styleUrl: 'model-invoke-run.component.scss',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatRippleModule,
    MatSliderModule,
    MatSelectModule,
    MatFormFieldModule,
    ReactiveFormsModule,
    JobStatusComponent
  ]
})
export class ModelInvokeRunComponent {
  private readonly api = inject(WebApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  // Job tracking
  currentJob = signal<JobDetailsResponse['job'] | null>(null);

  // Form state
  myForm: FormGroup;
  isSubmitting = signal(false);

  // Available scenario options (powers of 2)
  scenarioOptions = [1, 2, 4, 8, 16, 32, 64, 128, 256];

  // Job configuration
  jobConfig: JobStatusConfig = mergeJobConfig('ADRIA_MODEL_RUN', {
    title: 'Coral Reef Model Execution',
    purpose:
      'Running coral reef simulation with your deployment parameters across multiple scenarios',
    showElapsedTime: true,
    showDetailedProgress: true,
    theme: 'primary',
    successMessage: 'Model simulation completed! Redirecting to results...',
    customStatusMessages: {
      pending: 'Allocating computational resources for model run...',
      inProgress: 'Executing coral reef simulation scenarios... This may take several minutes.',
      succeeded: 'Simulation complete! Processing results and generating figures...'
    }
  });

  constructor() {
    this.myForm = this.fb.group({
      numScenarios: [64, [Validators.required]],

      // Tabular Acropora (TA)
      ta_lower: [0, [Validators.required, Validators.min(0)]],
      ta_upper: [1000000, [Validators.required, Validators.min(0)]],

      // Corymbose Acropora (CA)
      ca_lower: [0, [Validators.required, Validators.min(0)]],
      ca_upper: [1000000, [Validators.required, Validators.min(0)]],

      // Small Massives (SM)
      sm_lower: [0, [Validators.required, Validators.min(0)]],
      sm_upper: [1000000, [Validators.required, Validators.min(0)]]
    });
  }

  millionDeployed(value: number): string {
    return `${value / 1000000}M`;
  }

  onSubmit() {
    if (this.myForm.invalid) {
      console.log('Form is invalid');
      this.myForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return; // Prevent double submission
    }

    this.isSubmitting.set(true);

    // Build the ADRIA_MODEL_RUN payload
    const formValue = this.myForm.value;
    const payload: AdriaModelRunInput = {
      num_scenarios: formValue.numScenarios,
      rcp_scenario: '45', // Hardcoded for now
      model_params: [
        {
          param_name: 'N_seed_TA',
          third_param_flag: true,
          lower: formValue.ta_lower,
          upper: formValue.ta_upper,
          optional_third: 100000 // Step size
        },
        {
          param_name: 'N_seed_CA',
          third_param_flag: true,
          lower: formValue.ca_lower,
          upper: formValue.ca_upper,
          optional_third: 100000 // Step size
        },
        {
          param_name: 'N_seed_SM',
          third_param_flag: true,
          lower: formValue.sm_lower,
          upper: formValue.sm_upper,
          optional_third: 100000 // Step size
        }
      ]
    };

    // Update job config with scenario count
    this.jobConfig = mergeJobConfig('ADRIA_MODEL_RUN', {
      ...this.jobConfig,
      subtitle: `${formValue.numScenarios} scenarios`,
      purpose: `Running coral reef simulation with ${formValue.numScenarios} scenarios to model restoration outcomes`
    });

    console.log('Starting ADRIA model run job with payload:', payload);

    // Start the job using the job system
    this.api.startJob('ADRIA_MODEL_RUN', payload).subscribe({
      next: job => {
        console.log('Job started:', job);
        this.currentJob.set(job);
      },
      error: error => {
        console.error('Failed to start job:', error);
        this.isSubmitting.set(false);
        // TODO: Show error message to user
      }
    });
  }

  onJobCompleted(job: JobDetailsResponse['job']) {
    console.log('Job completed:', job);
    this.isSubmitting.set(false);

    if (job.status === 'SUCCEEDED') {
      // Redirect to results page with job ID
      console.log('Redirecting to results page for job:', job.id);
      this.router.navigate([`/view-run/${job.id}`]);
    } else if (job.status === 'FAILED') {
      console.error('Job failed:');
      // Keep the job status visible to show error
    }
  }

  onRetryRequested() {
    console.log('Retry requested');
    // Reset job state and resubmit
    this.currentJob.set(null);
    this.isSubmitting.set(false);
    this.onSubmit();
  }

  onCancelRequested() {
    console.log('Cancel requested');
    // Reset to initial state
    this.currentJob.set(null);
    this.isSubmitting.set(false);
  }
}
