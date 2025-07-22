import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ProjectsListComponent } from '../projects/projects-list/projects-list.component';
import { ProfileButtonComponent } from '../user/profile-button/profile-button.component';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    ProjectsListComponent,
    ProfileButtonComponent
  ],
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.scss']
})
export class LandingPageComponent {

}
