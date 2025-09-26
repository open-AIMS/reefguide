import { Component, inject, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { debounceTime, distinctUntilChanged, Subject, takeUntil } from 'rxjs';
import { ReefSearchService } from '../reef-search.service';

@Component({
  selector: 'app-reef-search',
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  templateUrl: './reef-search.component.html',
  styleUrl: './reef-search.component.scss'
})
export class ReefSearchComponent {
  public reefSearchService = inject(ReefSearchService);
  searchControl = new FormControl<string>('');
  private destroy$ = new Subject<void>();
  private isSelecting = false; // Add this flag

  // Output event for when a reef is selected
  reefSelected = output<{ id: string; name: string }>();

  ngOnInit() {
    this.searchControl.valueChanges
      .pipe(debounceTime(100), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(searchTerm => {
        // Skip search if user is selecting from autocomplete
        if (this.isSelecting) {
          this.isSelecting = false;
          return;
        }

        this.search(searchTerm || undefined);
      });
  }

  search(query: string | undefined) {
    const trimmedQuery = (query ?? '').trim();
    if (trimmedQuery.length > 0) {
      this.reefSearchService.search({ query: trimmedQuery });
    } else {
      // Clear results when input is empty
      this.reefSearchService.results.set(undefined);
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onReefSelected(event: any) {
    this.isSelecting = true; // Set flag before selection
    const selectedReef = event.option.value;
    this.reefSelected.emit(selectedReef);
  }

  // Display function for autocomplete - shows reef name instead of [Object object]
  displayReef(reef: { id: string; name: string } | null): string {
    return reef ? reef.name : '';
  }
}
