import { Component } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'app-loading-overlay',
  imports: [MatProgressSpinnerModule],
  templateUrl: './loading-overlay.component.html',
  styleUrl: './loading-overlay.component.scss',
  host: {
    '(click)': 'onOverlayClick($event)'
  }
})
export class LoadingOverlayComponent {
  onOverlayClick(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }
}
