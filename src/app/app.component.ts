import { Component, HostListener, OnInit, inject, ChangeDetectorRef, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FloorPlanComponent } from './components/floor-plan/floor-plan.component';
import { BuildingViewComponent } from './components/building-view/building-view.component';
import { MapViewComponent } from './components/map-view/map-view.component'; // 1. Import Map
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToolbarModule } from 'primeng/toolbar';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { ChipModule } from 'primeng/chip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { BottomSheetComponent } from './components/ui/bottom-sheet/bottom-sheet.component'; // Import ตัวใหม่

import { BuildingData, BuildingDataService } from './services/building-data.service';
import { take, Observable } from 'rxjs'; // 1. ต้องมี Observable

// 2. Import Services ที่เราจะใช้
import { AuthService, UserProfile } from './services/auth.service';
import { FloorplanInteractionService } from './services/floorplan/floorplan-interaction.service';
import { BottomSheetService } from './services/bottom-sheet.service';

type SheetState = 'peek' | 'default' | 'expanded';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    FloorPlanComponent,
    BuildingViewComponent,
    MapViewComponent, // เพิ่ม MapViewComponent เข้ามา
    ButtonModule,
    InputTextModule,
    ToolbarModule,
    CardModule,
    SelectModule,
    InputGroupModule,
    InputGroupAddonModule,
    ChipModule,
    ProgressSpinnerModule,
    BottomSheetComponent // แทนที่ AccessListComponent ด้วย BottomSheetComponent
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
  public isSheetVisible = true;

  private readonly sheetStates: SheetState[] = ['peek', 'default', 'expanded'];
  private sheetStateIndex = 0;
  private readonly dragThreshold = 60;
  private isDraggingSheet = false;
  private dragMoved = false;
  private suppressNextTap = false;

  get sheetState(): SheetState {
    return this.sheetStates[this.sheetStateIndex];
  }

  // 2. เพิ่ม State ควบคุมมุมมอง
  // เริ่มต้นที่หน้า Map
  public viewMode: 'map' | 'building' | 'floor' = 'map'; 

  // 3. เพิ่ม Properties ที่หายไปกลับมา (สำหรับ prepareBuildingData)
  private readonly totalFloors = 12;
  private readonly floorPalette = [
    '#f94144', '#f3722c', '#f8961e', '#f9844a', '#f9c74f', '#90be6d',
    '#43aa8b', '#4d908e', '#577590', '#277da1', '#a855f7', '#ef476f'
  ];

  // เปลี่ยนตัวแปรสำหรับ Dropdown จาก Role -> Users
  // public availableRoles$!: Observable<RolePermission[]>;
  // public selectedRole: string = 'GUEST';
  public availableUsers$!: Observable<UserProfile[]>;
  public selectedUserId: string | null = null;
  public currentUser: UserProfile | null = null;

  // 5. Inject Services
  private buildingDataService = inject(BuildingDataService);
  private authService = inject(AuthService);
  private interactionService = inject(FloorplanInteractionService);
  private bottomSheetService = inject(BottomSheetService); // Inject BottomSheetService
  // สำหรับตรวจจับการเปลี่ยนแปลงเมื่อสลับ view
  private cdr = inject(ChangeDetectorRef);
  // ถ้าต้องการ DOM manipulation ในอนาคต
  private renderer = inject(Renderer2);

  constructor() {
    this.buildingData = this.prepareBuildingData(this.buildingDataService.getFallback());
    // เปลี่ยนให้ดึงรายชื่อ Users แทน Roles
    this.availableUsers$ = this.authService.getUsers();
  }

  ngOnInit(): void {
    this.loadBuilding('E12');
    // 1. เริ่มต้นแค่ set viewMode เป็น map
    this.viewMode = 'map';

    // 2. รอฟังคำสั่งว่า User เลือกตึกไหน (จาก Bottom Sheet หรือ Map)
    this.bottomSheetService.action$.subscribe(event => {
      if (event.action === 'enter-building') {
        // ได้ ID ตึกมา -> เปลี่ยนหน้า
        this.onBuildingSelected(event.payload);
      }
    });

    // Optional: เลือก user ตัวอย่างตอนเริ่ม (ถ้ามี)
    this.availableUsers$.pipe(take(1)).subscribe(users => {
      if (users.length > 0) {
        // เลือกผู้ใช้ตัวอย่าง (index 1 ตามตัวอย่าง) — ปรับตามข้อมูลจริงได้
        const idx = Math.min(1, users.length - 1);
        this.onUserChange(users[idx]);
      }
    });
  }

  /**
   * เรียกเมื่อเลือกผู้ใช้งาน (จาก dropdown)
   * ดึง permission ของ user นี้ แล้วส่ง allow list ให้ interaction service
   */
  onUserChange(user: UserProfile | null): void {
    if (!user) return;
    this.selectedUserId = user.id;
    this.currentUser = user;

    this.authService.getUserPermissions(user.id, user.is_staff)
      .pipe(take(1))
      .subscribe(allowList => {
        console.log(`User: ${user.full_name}, Allowed Doors:`, allowList);
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

  // 3. ฟังก์ชันเมื่อเลือกตึกจาก Map
  onBuildingSelected(buildingId: string): void {
    console.log('Entering building:', buildingId);
    this.loadBuilding(buildingId);
    this.viewMode = 'building';
    // เมื่อเข้าหน้าตึก สั่งปิด Sheet รายชื่อตึกไปก่อน
    this.bottomSheetService.close();
  }

  // ถ้าเรียกมาจาก dropdown (หรือจาก component อื่น) ให้ normalize แล้วใช้ selectFloor
  onFloorDropdownChange(value: any): void {
    const floorNumber =
      typeof value === 'number'
        ? value
        : value && (value.floor ?? value.floor_number ?? value.value);

    if (typeof floorNumber === 'number' && !Number.isNaN(floorNumber)) {
      this.selectFloor(floorNumber);
    }

    this.viewMode = 'floor';

    // หน้า Floor Plan: ให้โชว์ Access List และ Default เป็น Half Screen
    setTimeout(() => {
      this.bottomSheetService.showAccessList([]);
      this.bottomSheetService.setExpansionState('default');
    }, 100);
  }

  // ถูกเรียกจาก building-view
  onFloorSelected(floorNumber: number): void {
    this.selectFloor(floorNumber);
  }

  // ถูกเรียกจาก floor-plan (event name อาจต่างกัน) — ให้รองรับด้วย
  onFloorPlanFloorChange(floorNumber: number): void {
    this.selectFloor(floorNumber);
  }

  // กลางเดียวสำหรับการเลือกชั้น
  private selectFloor(floorNumber: number): void {
    const index = this.buildingData.floors.findIndex((f: any) => f.floor === floorNumber);
    if (index === -1) return;

    this.lastActiveFloor = floorNumber;
    this.selectedFloorIndex = index;
    this.selectedFloorValue = floorNumber;

    // ไปยังหน้า Floor
    this.viewMode = 'floor';
    this.cdr.detectChanges();
  }

  // 5. ฟังก์ชันกลับ (Back Button) - ปรับให้รองรับการนำทางระหว่างมุมมอง
  resetToBuildingOverview(): void {
    if (this.viewMode === 'floor') {
      this.viewMode = 'building';
      this.bottomSheetService.close();
    } else {
      // กลับไปหน้า Map
      this.viewMode = 'map';
      // ไม่ต้องสั่งเปิด Sheet ที่นี่ ให้ MapComponent จัดการเอง
    }
  }

  get selectedFloor(): any | null {
    if (this.selectedFloorIndex === null) return null;
    return this.buildingData.floors[this.selectedFloorIndex] ?? null;
  }

  cycleSheetState(): void {
    this.sheetStateIndex = (this.sheetStateIndex + 1) % this.sheetStates.length;
  }

  private gestureStartY: number | null = null;

  onGestureStart(event: TouchEvent | MouseEvent): void {
    const point = this.extractClientY(event);
    if (point === null) return;
    this.gestureStartY = point;
    this.isDraggingSheet = true;
    this.dragMoved = false;
  }

  @HostListener('document:touchmove', ['$event'])
  @HostListener('document:mousemove', ['$event'])
  onGestureMove(event: TouchEvent | MouseEvent): void {
    if (!this.isDraggingSheet || this.gestureStartY === null) return;
    const point = this.extractClientY(event);
    if (point === null) return;

    if (event instanceof TouchEvent) {
      event.preventDefault();
    }

    const distance = this.gestureStartY - point;

    if (distance > this.dragThreshold) {
      this.moveSheetState('up');
      this.dragMoved = true;
      this.gestureStartY = point;
    } else if (distance < -this.dragThreshold) {
      this.moveSheetState('down');
      this.dragMoved = true;
      this.gestureStartY = point;
    }
  }

  @HostListener('document:touchend', ['$event'])
  @HostListener('document:touchcancel', ['$event'])
  @HostListener('document:mouseup', ['$event'])
  onGlobalGestureEnd(event: TouchEvent | MouseEvent): void {
    if (!this.isDraggingSheet) return;
    this.onGestureEnd(event);
  }

  onGestureEnd(event: TouchEvent | MouseEvent): void {
    if (!this.isDraggingSheet) return;

    const startY = this.gestureStartY;
    this.isDraggingSheet = false;
    this.gestureStartY = null;

    const point = this.extractClientY(event);
    if (point === null || startY === null) {
      this.finalizeGesture();
      return;
    }

    const distance = startY - point;

    if (!this.dragMoved && Math.abs(distance) > this.dragThreshold / 2) {
      this.moveSheetState(distance > 0 ? 'up' : 'down');
      this.dragMoved = true;
    }

    this.finalizeGesture();
  }

  onSheetHeaderTap(): void {
    if (this.suppressNextTap) {
      this.suppressNextTap = false;
      return;
    }
    this.cycleSheetState();
  }

  private moveSheetState(direction: 'up' | 'down'): void {
    if (direction === 'up' && this.sheetStateIndex < this.sheetStates.length - 1) {
      this.sheetStateIndex += 1;
    } else if (direction === 'down' && this.sheetStateIndex > 0) {
      this.sheetStateIndex -= 1;
    }
    this.suppressNextTap = false;
  }

  private finalizeGesture(): void {
    this.suppressNextTap = this.dragMoved;
    this.dragMoved = false;
  }

  private extractClientY(event: TouchEvent | MouseEvent): number | null {
    if ('touches' in event && event.touches.length) {
      return event.touches[0]?.clientY ?? null;
    }
    if ('changedTouches' in event && event.changedTouches.length) {
      return event.changedTouches[0]?.clientY ?? null;
    }
    if (event instanceof MouseEvent) {
      return event.clientY;
    }
    return null;
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
