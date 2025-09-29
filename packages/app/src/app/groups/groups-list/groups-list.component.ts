import { Component, OnInit, inject } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { Group } from '@reefguide/db';
import { WebApiService } from '../../../api/web-api.service';
import {MatListModule} from '@angular/material/list';

@Component({
  selector: 'app-groups-list',
  templateUrl: './groups-list.component.html',
  imports: [MatFormFieldModule, ReactiveFormsModule, MatInputModule, FormsModule, MatListModule]
})
export class GroupsListComponent implements OnInit {
  private webApi = inject(WebApiService);
  private router = inject(Router);

  groups: Group[] = [];
  loading = false;
  searchQuery = '';

  ngOnInit() {
    this.loadGroups();
  }

  loadGroups() {
    this.loading = true;
    // TODO: Implement
    this.loading = false;
  }

  onSearch(query: string) {
    this.searchQuery = query;
    // TODO: Implement search
  }

  onCreateGroup() {
    // TODO: Open create modal
  }

  onGroupClick(groupId: number) {
    this.router.navigate(['/groups', groupId]);
  }

  getUserRole(group: Group): string {
    // TODO: Determine user's role in this group
    return 'Member';
  }

  getMemberCount(group: Group): number {
    // TODO: Calculate member count
    return 0;
  }
}
