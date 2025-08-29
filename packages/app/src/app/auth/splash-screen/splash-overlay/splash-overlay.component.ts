import { Component, input, output } from '@angular/core';
import { SplashDialogComponent } from '../splash-dialog/splash-dialog.component';
import { SplashConfig, UserAccessState } from '../../auth.types';

/**
 * Splash Overlay Component - Manages the overlay backdrop and contains the dialog
 */
@Component({
  selector: 'app-splash-overlay',
  standalone: true,
  imports: [SplashDialogComponent],
  templateUrl: './splash-overlay.component.html',
  styleUrl: './splash-overlay.component.scss'
})
export class SplashOverlayComponent {
  /** Current user access state */
  userState = input.required<UserAccessState>();

  /** Configuration for splash screen */
  config = input.required<SplashConfig>();

  /** Emitted when user successfully logs in */
  loginSuccess = output<void>();

  /** Emitted when splash screen should be dismissed */
  dismissed = output<void>();

  onLoginSuccess(): void {
    this.loginSuccess.emit();
  }

  onDismissed(): void {
    this.dismissed.emit();
  }

  onKeyDown(event: KeyboardEvent): void {
    // Allow dialog to handle key events
    event.stopPropagation();
  }
}
