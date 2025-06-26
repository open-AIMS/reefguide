import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterOutlet } from '@angular/router';
import { defineCustomElements as defineArcgisMapElements } from '@arcgis/map-components/dist/loader';
import { defineCustomElements as defineCalciteElements } from '@esri/calcite-components/dist/loader';
import { environment } from '../environments/environment';
import { AppAccessService } from './auth/app-access.service';
import { SplashScreenComponent } from './auth/splash-screen/splash-screen.component';

/**
 * Root App Component with Integrated Splash Screen
 *
 * This component now manages the application-wide access control by:
 * 1. Checking user authentication and authorization status
 * 2. Showing splash screen when user needs to authenticate or lacks access
 * 3. Blurring background content while splash is active
 * 4. Providing smooth transitions between auth states
 *
 * The component maintains the existing functionality while adding
 * the new access control layer on top.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, MatToolbarModule, MatButtonModule, SplashScreenComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly appAccessService = inject(AppAccessService);

  title = 'adria-app';

  /**
   * Current user access state - drives splash screen visibility
   */
  readonly userAccessState = this.appAccessService.userAccessState;

  /**
   * Complete splash state including interaction blocking
   */
  readonly splashState = this.appAccessService.splashState;

  /**
   * Splash screen configuration from environment
   */
  readonly splashConfig = signal(environment.splashConfig);

  constructor() {
    // Initialize splash screen configuration from environment
    this.appAccessService.updateSplashConfig(environment.splashConfig);

    // Log access state changes for debugging
    this.appAccessService.userAccessState$.subscribe(state => {
      console.log(`[AppComponent] User access state: ${state}`);
    });
  }

  ngOnInit(): void {
    // Initialize third-party components
    this.initializeThirdPartyComponents();
  }

  /**
   * Handle successful login from splash screen
   */
  onLoginSuccess(): void {
    console.log('[AppComponent] Login successful, splash will auto-hide');
    // The splash screen will automatically hide when userAccessState becomes 'authorized'
    // No manual intervention needed due to reactive state management
  }

  /**
   * Handle splash screen dismissal
   * Note: In our implementation, splash only dismisses when user is authorized,
   * so this is mainly for future extensibility
   */
  onSplashDismissed(): void {
    console.log('[AppComponent] Splash screen dismissed');
    // Could add analytics or other side effects here
  }

  /**
   * Initialize ArcGIS and Calcite components
   * Separated into its own method for clarity
   */
  private initializeThirdPartyComponents(): void {
    // Initialize Calcite components
    defineCalciteElements(window, {
      resourcesUrl: 'https://js.arcgis.com/calcite-components/2.11.1/assets'
    });

    // Initialize ArcGIS Map components
    // Should only be called once per application lifecycle
    defineArcgisMapElements(window, {
      resourcesUrl: 'https://js.arcgis.com/map-components/4.30/assets'
    });

    console.log('[AppComponent] Third-party components initialized');
  }

  /**
   * Get CSS classes for the main app container
   * Used to control background blur and interaction blocking
   */
  getAppContainerClasses(): Record<string, boolean> {
    const state = this.splashState();

    return {
      'app-container': true,
      'splash-active': state.isVisible,
      'blur-background': state.shouldBlurBackground,
      'block-interactions': state.shouldBlockInteractions
    };
  }

  /**
   * Check if the main app content should be rendered
   * Optimization: don't render heavy components when splash is showing
   */
  shouldRenderMainContent(): boolean {
    // Always render content so it loads in background while splash shows
    // This provides a smoother user experience
    return true;
  }

  /**
   * Get accessibility attributes for the main container
   */
  getMainContentAriaAttributes(): Record<string, string | boolean> {
    const state = this.splashState();

    return {
      'aria-hidden': state.isVisible,
      inert: state.shouldBlockInteractions // Prevents focus and interaction
    };
  }
}
