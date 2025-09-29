import { Component } from '@angular/core';
import { CommonModule } from '@angular/common'; // Import CommonModule
import { FloorPlanComponent } from "./components/floor-plan/floor-plan.component";
import { BuildingViewComponent } from './components/building-view/building-view.component'; // Import ใหม่
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule, // เพิ่ม CommonModule
    FloorPlanComponent,
    BuildingViewComponent, // เพิ่ม Component ใหม่
    ButtonModule
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  title = 'e12-visitor-system';
  selectedFloor: number | null = null; // ตัวแปรสำหรับเก็บชั้นที่เลือก

  onFloorSelected(floor: number): void {
    console.log(`Floor ${floor} selected, showing floor plan.`);
    this.selectedFloor = floor;
  }

  goBackToBuildingView(): void {
    this.selectedFloor = null;
  }
}