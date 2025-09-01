import { Component, signal } from '@angular/core';
import { FloorPlanComponent } from "./components/floor-plan/floor-plan.component";

@Component({
  selector: 'app-root',
  imports: [FloorPlanComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  protected readonly title = signal('e12-visitor-system');
}
