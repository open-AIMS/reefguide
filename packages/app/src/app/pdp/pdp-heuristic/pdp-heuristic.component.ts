import { Component } from '@angular/core';
import { DatePipe } from '@angular/common';

@Component({
  selector: 'app-pdp-heuristic',
  imports: [DatePipe],
  templateUrl: './pdp-heuristic.component.html',
  styleUrl: './pdp-heuristic.component.scss'
})
export class PdpHeuristicComponent {
  data = {};
}
