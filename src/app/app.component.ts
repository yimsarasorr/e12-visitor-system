import { Component } from '@angular/core';
import { FloorPlanComponent } from "./components/floor-plan/floor-plan.component";
import { ButtonModule } from 'primeng/button'; // <-- Import

@Component({
  selector: 'app-root',
  standalone: true, // <-- ทำให้เป็น Standalone
  imports: [
    FloorPlanComponent,
    ButtonModule // <-- เพิ่มเข้าไป
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  title = 'e12-visitor-system';
}