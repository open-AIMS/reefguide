import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ClusterAdminDialogComponent } from '../../admin/cluster/ClusterAdminDialog.component';
import { AdminPanelComponent } from '../../admin/user-panel/user-panel.component';
import { AuthService } from '../../auth/auth.service';
import { ConfigDialogComponent } from '../../location-selection/config-dialog/config-dialog.component';

@Component({
  selector: 'app-profile-button',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatDialogModule
  ],
  templateUrl: './profile-button.component.html',
  styleUrl: './profile-button.component.scss'
})
export class ProfileButtonComponent {
  private authService = inject(AuthService);
  private dialog = inject(MatDialog);
  public isAdmin$ = this.authService.isAdmin();
  public user$ = this.authService.user$;

  onConfigClick(): void {
    this.dialog.open(ConfigDialogComponent);
  }

  onLogoutClick(): void {
    if (this.authService) {
      this.authService.logout();
    }
  }

  onAdminPanelClick(): void {
    this.dialog.open(AdminPanelComponent, {
      width: '800px'
    });
  }

  onClusterAdminClick(): void {
    this.dialog.open(ClusterAdminDialogComponent, {
      width: '800px'
    });
  }
}
