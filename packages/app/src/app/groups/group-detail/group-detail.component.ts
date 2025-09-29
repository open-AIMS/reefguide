// group-detail.component.ts
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Group } from '@reefguide/db';
import { WebApiService } from '../../../api/web-api.service';
import { MatTabsModule } from '@angular/material/tabs';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AddMembersModalComponent } from '../modals/add-members-modal/add-members-modal.component';
import { DeleteGroupModalComponent } from '../modals/delete-group-modal/delete-group-modal.component';
import { TransferOwnershipModalComponent } from '../modals/transfer-ownership-modal/transfer-ownership-modal.component';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-group-detail',
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatListModule,
    MatButtonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule
  ],
  templateUrl: './group-detail.component.html',
  styleUrl: './group-detail.component.scss'
})
export class GroupDetailComponent implements OnInit {
  private webApi = inject(WebApiService);
  private authService = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  group = signal<Group | null>(null);
  loading = signal(false);
  activeTab = 0;
  currentUserRole = signal<'Owner' | 'Manager' | 'Member' | null>(null);
  currentUserId = computed(() => this.authService.currentUserSignal()?.id);

  ngOnInit() {
    const groupId = Number(this.route.snapshot.paramMap.get('id'));
    if (isNaN(groupId)) {
      this.router.navigate(['/groups']);
      return;
    }
    this.loadGroup(groupId);
  }

  loadGroup(groupId: number) {
    this.loading.set(true);
    this.webApi.getGroup(groupId).subscribe({
      next: response => {
        this.group.set(response.group);
        this.determineUserRole();
        this.loading.set(false);
      },
      error: error => {
        console.error('Error loading group:', error);
        this.snackBar.open('Failed to load group', 'Close', { duration: 3000 });
        this.router.navigate(['/groups']);
        this.loading.set(false);
      }
    });
  }

  private determineUserRole() {
    const group = this.group();
    const userId = this.currentUserId();

    if (!group || !userId) {
      this.currentUserRole.set(null);
      return;
    }

    if (group.owner_id === userId) {
      this.currentUserRole.set('Owner');
      return;
    }

    // TODO: Check manager IDs when available from API response
    // if (group.managerIds?.includes(userId)) {
    //   this.currentUserRole.set('Manager');
    //   return;
    // }

    this.currentUserRole.set('Member');
  }

  onAddMembers() {
    const group = this.group();
    if (!group) return;

    const dialogRef = this.dialog.open(AddMembersModalComponent, {
      width: '600px',
      data: {
        groupId: group.id,
        currentUserRole: this.currentUserRole()
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Members added successfully', 'Close', { duration: 3000 });
        this.loadGroup(group.id);
      }
    });
  }

  onRemoveMember(userId: number) {
    const group = this.group();
    if (!group || !confirm('Are you sure you want to remove this member?')) return;

    this.webApi.removeGroupMembers(group.id, { userIds: [userId] }).subscribe({
      next: () => {
        this.snackBar.open('Member removed', 'Close', { duration: 3000 });
        this.loadGroup(group.id);
      },
      error: error => {
        console.error('Error removing member:', error);
        this.snackBar.open('Failed to remove member', 'Close', { duration: 3000 });
      }
    });
  }

  onPromoteToManager(userId: number) {
    const group = this.group();
    if (!group) return;

    this.webApi.addGroupManagers(group.id, { userIds: [userId] }).subscribe({
      next: () => {
        this.snackBar.open('User promoted to manager', 'Close', { duration: 3000 });
        this.loadGroup(group.id);
      },
      error: error => {
        console.error('Error promoting user:', error);
        this.snackBar.open('Failed to promote user', 'Close', { duration: 3000 });
      }
    });
  }

  onDemoteManager(userId: number) {
    const group = this.group();
    if (!group) return;

    this.webApi.removeGroupManagers(group.id, { userIds: [userId] }).subscribe({
      next: () => {
        this.snackBar.open('Manager demoted to member', 'Close', { duration: 3000 });
        this.loadGroup(group.id);
      },
      error: error => {
        console.error('Error demoting manager:', error);
        this.snackBar.open('Failed to demote manager', 'Close', { duration: 3000 });
      }
    });
  }

  onSaveSettings() {
    const group = this.group();
    if (!group) return;

    this.webApi
      .updateGroup(group.id, {
        name: group.name,
        description: group.description ?? undefined
      })
      .subscribe({
        next: () => {
          this.snackBar.open('Settings saved', 'Close', { duration: 3000 });
          this.loadGroup(group.id);
        },
        error: error => {
          console.error('Error saving settings:', error);
          this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
        }
      });
  }

  onTransferOwnership() {
    const group = this.group();
    if (!group) return;

    // TODO: Get members from API response when available
    const allMembers: any[] = [];

    const dialogRef = this.dialog.open(TransferOwnershipModalComponent, {
      width: '500px',
      data: {
        groupId: group.id,
        groupName: group.name,
        members: allMembers
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Ownership transferred', 'Close', { duration: 3000 });
        this.router.navigate(['/groups']);
      }
    });
  }

  onDeleteGroup() {
    const group = this.group();
    if (!group) return;

    const dialogRef = this.dialog.open(DeleteGroupModalComponent, {
      width: '500px',
      data: {
        groupId: group.id,
        groupName: group.name
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.snackBar.open('Group deleted', 'Close', { duration: 3000 });
        this.router.navigate(['/groups']);
      }
    });
  }

  canManage(): boolean {
    const role = this.currentUserRole();
    return role === 'Owner' || role === 'Manager';
  }

  isOwner(): boolean {
    return this.currentUserRole() === 'Owner';
  }

  goBack() {
    this.router.navigate(['/groups']);
  }
}
