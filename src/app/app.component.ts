import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FloorPlanComponent } from './components/floor-plan/floor-plan.component';
import { BuildingViewComponent } from './components/building-view/building-view.component';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToolbarModule } from 'primeng/toolbar';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { ChipModule } from 'primeng/chip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { BuildingData, BuildingDataService } from './services/building-data.service';
import { take, Observable } from 'rxjs'; // 1. ต้องมี Observable

// 2. Import Services ที่เราจะใช้
import { AuthService, RolePermission } from './services/auth.service';
import { FloorplanInteractionService } from './services/floorplan/floorplan-interaction.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FloorPlanComponent,
    BuildingViewComponent,
    ButtonModule,
    InputTextModule,
    ToolbarModule,
    CardModule,
    SelectModule,
    InputGroupModule,
    InputGroupAddonModule,
    ChipModule,
    ProgressSpinnerModule
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class App implements OnInit {
  buildingData: BuildingData;
  selectedFloorIndex: number | null = null;
  public lastActiveFloor: number | null = null;
  public selectedFloorValue: number | null = null;
  public isLoading = true;

  // 3. เพิ่ม Properties ที่หายไปกลับมา (สำหรับ prepareBuildingData)
  private readonly totalFloors = 12;
  private readonly floorPalette = [
    '#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d',
    '#43aa8b', '#4d908e', '#577590', '#277da1', '#a855f7', '#ef476f'
  ];

  // 4. (แก้ไข) Properties สำหรับ Dropdown Role (แบบ "ต่อจริง")
  public availableRoles$!: Observable<RolePermission[]>;
  public selectedRole: string = 'GUEST';

  // 5. Inject Services
  private buildingDataService = inject(BuildingDataService);
  private authService = inject(AuthService);
  private interactionService = inject(FloorplanInteractionService);

  constructor() {
    this.buildingData = this.prepareBuildingData(this.buildingDataService.getFallback());
    // 6. (แก้ไข) โหลด Role จาก AuthService
    this.availableRoles$ = this.authService.getRoles();
  }

  ngOnInit(): void {
    this.loadBuilding('E12');
    // 7. (แก้ไข) ตั้งค่าสิทธิ์เริ่มต้นเมื่อแอปโหลด
    this.onRoleChange(this.selectedRole);
  }

  /**
   * 8. (แก้ไข) ฟังก์ชันนี้จะถูกเรียกเมื่อ Dropdown เปลี่ยน (แบบ "ต่อจริง")
   */
  onRoleChange(role: string): void {
    if (!role) return;
    this.selectedRole = role;

    // 9. (แก้ไข) ดึง "Allow List" (string[]) จาก Supabase
    this.authService.getPermissionList(role)
      .pipe(take(1))
      .subscribe(allowList => {
        // 10. (แก้ไข) ส่ง "Allow List" ไปให้ 3D Model
        this.interactionService.setPermissionList(allowList);
      });
  }

  private loadBuilding(buildingId: string): void {
    this.isLoading = true;
    this.buildingDataService
      .getBuilding(buildingId)
      .pipe(take(1))
      .subscribe(data => {
      this.buildingData = this.prepareBuildingData(data);
      this.selectedFloorIndex = null;
      this.selectedFloorValue = null;
      this.lastActiveFloor = null;
      this.isLoading = false;
    });
  }

  onFloorSelected(floorNumber: number): void {
    const index = this.buildingData.floors.findIndex((f: any) => f.floor === floorNumber);
    if (index === -1) return;

    this.lastActiveFloor = floorNumber;
    this.selectedFloorIndex = index;
    this.selectedFloorValue = floorNumber;
  }

  onFloorDropdownChange(floorValue: number | string | null): void {
    if (floorValue === null || floorValue === undefined || floorValue === '') {
      this.resetToBuildingOverview();
      return;
    }

    const parsed = typeof floorValue === 'number' ? floorValue : Number(floorValue);
    if (Number.isNaN(parsed)) {
      return;
    }
    this.onFloorSelected(parsed);
  }

  resetToBuildingOverview(): void {
    this.selectedFloorIndex = null;
    this.selectedFloorValue = null;
  }

  get selectedFloor(): any | null {
    if (this.selectedFloorIndex === null) return null;
    return this.buildingData.floors[this.selectedFloorIndex] ?? null;
  }

  get floorOptions(): { label: string; value: number }[] {
    return (this.buildingData?.floors ?? []).map((floor: any) => ({
      label: floor.floorName ?? `ชั้น ${floor.floor}`,
      value: floor.floor
    }));
  }

  private prepareBuildingData(data: BuildingData): BuildingData {
    const baseData: BuildingData = {
      buildingId: data?.buildingId ?? 'E12',
      buildingName: data?.buildingName ?? 'E12 Engineering Building',
      floors: Array.isArray(data?.floors) ? [...data.floors] : []
    };

    const baseWalls = baseData.floors[0]?.walls ? this.cloneWalls(baseData.floors[0].walls) : [];

    const hydratedFloors = baseData.floors.map((floor: any, index: number) => ({
      ...floor,
      color: floor.color ?? this.floorPalette[index % this.floorPalette.length]
    }));

    const existingCount = hydratedFloors.length;
    for (let floorNumber = existingCount + 1; floorNumber <= this.totalFloors; floorNumber++) {
      hydratedFloors.push(
        this.createPlaceholderFloor(
          floorNumber,
          this.floorPalette[(floorNumber - 1) % this.floorPalette.length],
          baseWalls
        )
      );
    }

    return {
      ...baseData,
      floors: hydratedFloors
    };
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
