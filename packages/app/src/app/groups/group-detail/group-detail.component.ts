import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Group } from '@reefguide/db';
import { WebApiService } from '../../../api/web-api.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';

@Component({
  selector: 'app-group-detail',
  imports: [MatTabsModule, MatListModule, FormsModule, MatFormFieldModule],
  templateUrl: './group-detail.component.html',
  styleUrl: './group-detail.component.scss'
})
export class GroupDetailComponent implements OnInit {
  private webApi = inject(WebApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  group: Group | null = null;
  loading = false;
  activeTab: 'members' | 'settings' = 'members';
  currentUserRole: 'Owner' | 'Manager' | 'Member' | null = null;

  ngOnInit() {
    const groupId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadGroup(groupId);
  }

  loadGroup(groupId: number) {
    this.loading = true;
    // TODO: Implement
    this.loading = false;
  }

  onAddMembers() {
    // TODO: Open add members modal
  }

  onRemoveMember(userId: number) {
    // TODO: Confirm and remove
  }

  onPromoteToManager(userId: number) {
    // TODO: Promote to manager
  }

  onDemoteManager(userId: number) {
    // TODO: Demote manager
  }

  onSaveSettings() {
    // TODO: Save name/description
  }

  onTransferOwnership() {
    // TODO: Open transfer modal
  }

  onDeleteGroup() {
    // TODO: Open delete modal
  }

  canManage(): boolean {
    return this.currentUserRole === 'Owner' || this.currentUserRole === 'Manager';
  }

  isOwner(): boolean {
    return this.currentUserRole === 'Owner';
  }

  goBack() {
    this.router.navigate(['/groups']);
  }
}
