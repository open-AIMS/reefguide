import { Component, inject, output } from '@angular/core';
import { ReefSearchService } from '../reef-search.service';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-reef-search',
  imports: [MatAutocompleteModule, MatFormFieldModule, MatInputModule, MatIconModule],
  templateUrl: './reef-search.component.html',
  styleUrl: './reef-search.component.scss'
})
export class ReefSearchComponent {
  public reefSearchService = inject(ReefSearchService);

  // Output event for when a reef is selected
  reefSelected = output<{ id: string; name: string }>();

  search(query: string) {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length > 0) {
      this.reefSearchService.search({ query: trimmedQuery });
    } else {
      // Clear results when input is empty
      this.reefSearchService.results.set(undefined);
    }
  }

  onReefSelected(event: any) {
    const selectedReef = event.option.value;
    this.reefSelected.emit(selectedReef);
  }

  // Display function for autocomplete - shows reef name instead of [Object object]
  displayReef(reef: { id: string; name: string } | null): string {
    return reef ? reef.name : '';
  }
}
