import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloorPlanComponent } from './components/floor-plan/floor-plan.component';
import { BuildingViewComponent } from './components/building-view/building-view.component';
import floorData from './components/floor-plan/e12-floor1.json';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FloorPlanComponent,
    BuildingViewComponent,
    ButtonModule,
    InputTextModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class App {
  buildingData: any = floorData;
  selectedFloorIndex: number | null = null;
  public lastActiveFloor: number | null = null;
  private readonly totalFloors = 12;
  private readonly floorPalette = [
    '#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d',
    '#43aa8b', '#4d908e', '#577590', '#277da1', '#a855f7', '#ef476f'
  ];

  constructor() {
    this.initialiseFloors();
  }

  onFloorSelected(floorNumber: number): void {
    const index = this.buildingData.floors.findIndex((f: any) => f.floor === floorNumber);
    if (index === -1) return;

    this.lastActiveFloor = floorNumber;
    this.selectedFloorIndex = index;
  }

  resetToBuildingOverview(): void {
    this.selectedFloorIndex = null;
  }

  get selectedFloor(): any | null {
    if (this.selectedFloorIndex === null) return null;
    return this.buildingData.floors[this.selectedFloorIndex] ?? null;
  }

  private initialiseFloors(): void {
    if (!this.buildingData?.floors) {
      this.buildingData = { buildingId: 'E12', buildingName: 'E12 Engineering Building', floors: [] };
    }
    const baseWalls = this.buildingData.floors[0]?.walls ? this.cloneWalls(this.buildingData.floors[0].walls) : [];

    this.buildingData.floors = this.buildingData.floors.map((floor: any, index: number) => ({
      ...floor,
      color: floor.color ?? this.floorPalette[index % this.floorPalette.length]
    }));

    const existingCount = this.buildingData.floors.length;
    for (let floorNumber = existingCount + 1; floorNumber <= this.totalFloors; floorNumber++) {
      this.buildingData.floors.push(
        this.createPlaceholderFloor(floorNumber, this.floorPalette[(floorNumber - 1) % this.floorPalette.length], baseWalls)
      );
    }
  }

  private createPlaceholderFloor(floorNumber: number, color: string, baseWalls: any[]): any {
    const hallBoundary = { min: { x: -7, y: -9 }, max: { x: 7, y: 9 } };
    const liftBoundary = { min: { x: -7, y: -18 }, max: { x: 7, y: -9 } };

    return {
      floor: floorNumber,
      floorName: `ชั้น ${floorNumber}`,
      color,
      walls: this.cloneWalls(baseWalls),
      zones: [
        {
          id: `f${floorNumber}_core_zone`,
          name: 'Core Corridor',
          areas: [
            { id: `f${floorNumber}_hall`, name: `Hall ${floorNumber}`, color: '#cfe9ff', boundary: hallBoundary },
            { id: `f${floorNumber}_lift_lobby`, name: 'Lift Lobby', color: '#b1ddff', boundary: liftBoundary }
          ],
          rooms: [
            {
              id: `f${floorNumber}_wing_left`,
              name: `Learning Studio ${floorNumber}A`,
              color: '#d1c4f6',
              boundary: { min: { x: -46, y: -4 }, max: { x: -7, y: 9 } },
              doors: [
                {
                  id: `f${floorNumber}_wing_left_door`,
                  center: { x: -16.75, y: -4 },
                  size: { width: 2, depth: 0.2 },
                  accessLevel: 1
                }
              ]
            },
            {
              id: `f${floorNumber}_wing_right`,
              name: `Innovation Lab ${floorNumber}B`,
              color: '#c3f7d6',
              boundary: { min: { x: 7, y: -4 }, max: { x: 46, y: 9 } },
              doors: [
                {
                  id: `f${floorNumber}_wing_right_door`,
                  center: { x: 16.75, y: -4 },
                  size: { width: 2, depth: 0.2 },
                  accessLevel: 0
                }
              ]
            }
          ],
          objects: [
            { id: `f${floorNumber}_collab_hub`, type: 'Collaboration Hub', boundary: { min: { x: -4, y: -11 }, max: { x: 4, y: -9 } } }
          ]
        }
      ]
    };
  }

  private cloneWalls(walls: any[]): any[] {
    return walls.map(wall => ({
      start: { x: wall.start.x, y: wall.start.y },
      end: { x: wall.end.x, y: wall.end.y }
    }));
  }
}
