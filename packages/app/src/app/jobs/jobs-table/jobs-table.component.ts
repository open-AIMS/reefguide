import { CommonModule } from '@angular/common';
import { Component, inject, ViewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { ListJobsResponse } from '@reefguide/types';
import { Observable } from 'rxjs';
import { WebApiService } from '../../../api/web-api.service';

@Component({
  selector: 'app-jobs',
  imports: [
    CommonModule,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatToolbarModule
  ],
  templateUrl: './jobs-table.component.html',
  styleUrl: './jobs-table.component.scss'
})
export class JobsTableComponent {
  api = inject(WebApiService);
  jobs$: Observable<ListJobsResponse>;

  dataSource = new MatTableDataSource();
  displayedColumns: string[] = [
    'actions',
    'id',
    'type',
    'status',
    'created_at',
    'updated_at',
    'input_payload'
  ];

  @ViewChild(MatSort) sort!: MatSort;

  constructor() {
    this.jobs$ = this.api.listAllJobs();

    this.jobs$.subscribe(resp => {
      this.dataSource.data = resp.jobs;
    });
  }

  ngAfterViewInit() {
    this.dataSource.sort = this.sort;
  }

  downloadResults(jobId: number) {
    this.api.downloadJobResults(jobId).subscribe(x => {
      console.info(`Job ${jobId} download results`, x);
    });
  }

  viewDetails(jobId: number) {
    this.api.getJob(jobId).subscribe(x => {
      console.info(`Job id=${jobId} details`, x);
    });
  }
}
