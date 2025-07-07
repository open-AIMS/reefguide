import { CommonModule } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { JobDetailsResponse } from '@reefguide/types';
import { interval, takeWhile } from 'rxjs';
import { JobStatusConfig } from './job-status.types';

type JobStatus = JobDetailsResponse['job']['status'];

/**
 * Reusable component for displaying job status across different workflows.
 * Supports customization of title, purpose, messages, and styling.
 */
@Component({
  selector: 'app-job-status',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule
  ],
  templateUrl: './job-status.component.html',
  styleUrl: './job-status.component.scss'
})
export class JobStatusComponent {
  /** Job details from the API */
  job = input.required<JobDetailsResponse['job'] | null>();

  /** Configuration for customizing the component */
  config = input.required<JobStatusConfig>();

  /** Whether to show the component (useful for conditional display) */
  visible = input<boolean>(true);

  /** Emitted when job reaches a terminal state (success, failed, etc.) */
  jobCompleted = output<JobDetailsResponse['job']>();

  /** Emitted when user clicks retry button */
  retryRequested = output<void>();

  /** Emitted when user clicks cancel button */
  cancelRequested = output<void>();

  /** Emitted when component auto-hides */
  autoHidden = output<void>();

  // Internal state
  private startTime = signal<Date | null>(null);
  public elapsedTime = signal<string>('');
  private autoHideTimeout?: number;

  /** Computed job status */
  readonly jobStatus = computed(() => this.job()?.status || 'PENDING');

  /** Whether job is in a loading state */
  readonly isLoading = computed(() => {
    const status = this.jobStatus();
    return status === 'PENDING' || status === 'IN_PROGRESS';
  });

  /** Whether job completed successfully */
  readonly isSuccess = computed(() => this.jobStatus() === 'SUCCEEDED');

  /** Whether job failed */
  readonly isError = computed(() => {
    const status = this.jobStatus();
    return status === 'FAILED' || status === 'CANCELLED' || status === 'TIMED_OUT';
  });

  /** Current status message based on job state and config */
  readonly statusMessage = computed(() => {
    const status = this.jobStatus();
    const config = this.config();
    const customMessages = config.customStatusMessages;

    if (customMessages) {
      switch (status) {
        case 'PENDING':
          return customMessages.pending || this.getDefaultMessage(status);
        case 'IN_PROGRESS':
          return customMessages.inProgress || this.getDefaultMessage(status);
        case 'SUCCEEDED':
          return (
            customMessages.succeeded || config.successMessage || this.getDefaultMessage(status)
          );
        case 'FAILED':
          return customMessages.failed || this.getDefaultMessage(status);
        case 'CANCELLED':
          return customMessages.cancelled || this.getDefaultMessage(status);
        case 'TIMED_OUT':
          return customMessages.timedOut || this.getDefaultMessage(status);
        default:
          return this.getDefaultMessage(status);
      }
    }

    return this.getDefaultMessage(status);
  });

  /** Icon to display based on job state */
  readonly statusIcon = computed(() => {
    const config = this.config();

    if (this.isLoading()) {
      return config.icon || 'hourglass_empty';
    } else if (this.isSuccess()) {
      return 'check_circle';
    } else if (this.isError()) {
      return 'error';
    }

    return config.icon || 'info';
  });

  /** CSS classes for styling based on theme and state */
  readonly containerClasses = computed(() => {
    const config = this.config();
    const classes = ['job-status-container'];

    if (config.theme) {
      classes.push(`theme-${config.theme}`);
    }

    if (this.isLoading()) {
      classes.push('status-loading');
    } else if (this.isSuccess()) {
      classes.push('status-success');
    } else if (this.isError()) {
      classes.push('status-error');
    }

    return classes;
  });

  constructor() {
    // Track elapsed time when job is running
    effect(() => {
      const job = this.job();
      const config = this.config();

      if (!job || !config.showElapsedTime) return;

      if (job.status === 'IN_PROGRESS' && !this.startTime()) {
        this.startTime.set(new Date(job.created_at));
        this.startElapsedTimeTracking();
      } else if (job.status !== 'IN_PROGRESS' && job.status !== 'PENDING') {
        this.stopElapsedTimeTracking();
      }
    });

    // Handle job completion
    effect(() => {
      const job = this.job();
      if (!job) return;

      const isTerminal =
        job.status === 'SUCCEEDED' ||
        job.status === 'FAILED' ||
        job.status === 'CANCELLED' ||
        job.status === 'TIMED_OUT';

      if (isTerminal) {
        this.jobCompleted.emit(job);
        this.handleAutoHide();
      }
    });
  }

  ngOnDestroy() {
    this.stopElapsedTimeTracking();
    if (this.autoHideTimeout) {
      clearTimeout(this.autoHideTimeout);
    }
  }

  private getDefaultMessage(status: JobStatus): string {
    switch (status) {
      case 'PENDING':
        return 'Job queued and waiting to start...';
      case 'IN_PROGRESS':
        return 'Job is currently running...';
      case 'SUCCEEDED':
        return 'Job completed successfully!';
      case 'FAILED':
        return 'Job failed to complete.';
      case 'CANCELLED':
        return 'Job was cancelled.';
      case 'TIMED_OUT':
        return 'Job timed out.';
      default:
        return 'Unknown status';
    }
  }

  private startElapsedTimeTracking() {
    const startTime = this.startTime();
    if (!startTime) return;

    const timer$ = interval(1000).pipe(takeWhile(() => this.isLoading()));

    timer$.subscribe(() => {
      const elapsed = Date.now() - startTime.getTime();
      this.elapsedTime.set(this.formatElapsedTime(elapsed));
    });
  }

  private stopElapsedTimeTracking() {
    // Timer automatically stops due to takeWhile condition
  }

  private formatElapsedTime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  private handleAutoHide() {
    const config = this.config();

    if (config.autoHideOnSuccess && this.isSuccess()) {
      const delay = config.autoHideDelay || 3000;
      this.autoHideTimeout = window.setTimeout(() => {
        this.autoHidden.emit();
      }, delay);
    }
  }

  onRetry() {
    this.retryRequested.emit();
  }

  onCancel() {
    this.cancelRequested.emit();
  }
}
