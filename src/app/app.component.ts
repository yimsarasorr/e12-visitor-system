import { Component } from '@angular/core';
import { FloorPlanComponent } from "./components/floor-plan/floor-plan.component";
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    FloorPlanComponent,
    ButtonModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  title = 'e12-visitor-system';
}