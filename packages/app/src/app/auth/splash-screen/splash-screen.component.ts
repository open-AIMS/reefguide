import { Component, input, output } from '@angular/core';
import { SplashOverlayComponent } from './splash-overlay/splash-overlay.component';
import { SplashConfig, UserAccessState } from '../auth.types';

/**
 * Main Splash Screen Component - Entry point that manages the overlay
 */
@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [SplashOverlayComponent],
  templateUrl: './splash-screen.component.html',
  styleUrl: './splash-screen.component.scss'
})
export class SplashScreenComponent {
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
}
