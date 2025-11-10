import { 
  Component, 
  ElementRef, 
  ViewChild, 
  AfterViewInit, 
  HostListener, 
  Output, 
  EventEmitter, 
  Input, 
  OnChanges, 
  SimpleChanges, 
  NgZone,
  inject,
  OnDestroy,
  ChangeDetectionStrategy
} from '@angular/core';
import * as THREE from 'three';
import { ButtonModule } from 'primeng/button';
import { CommonModule, DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { JoystickComponent } from '../joystick/joystick.component';

// Import Services
import { ThreeSceneService } from '../../services/floorplan/three-scene.service';
import { FloorplanBuilderService } from '../../services/floorplan/floorplan-builder.service';
import { PlayerControlsService } from '../../services/floorplan/player-controls.service';
import { FloorplanInteractionService } from '../../services/floorplan/floorplan-interaction.service';
import { Observable, BehaviorSubject, Subscription } from 'rxjs';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [ CommonModule, ButtonModule, DialogModule, JoystickComponent ],
  providers: [DecimalPipe],
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush // 4. เพิ่ม
})
export class FloorPlanComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') private canvasRef!: ElementRef;
  @Input() floorData: any;
  @Input() panToTarget: any;
  @Output() zoneChanged = new EventEmitter<string | null>();

  // 5. Inject Services ทั้งหมด
  private threeScene = inject(ThreeSceneService);
  private floorBuilder = inject(FloorplanBuilderService);
  private playerControls = inject(PlayerControlsService);
  public interaction = inject(FloorplanInteractionService); // Public เพราะ HTML ต้องใช้
  
  private decimalPipe = inject(DecimalPipe);
  private ngZone = inject(NgZone);
  private resizeObserver?: ResizeObserver;

  // 6. Properties ที่เหลือ
  private floorGroup: THREE.Group | null = null;
  public currentView: 'iso' | 'top' = 'iso';
  public isFullscreen = false;
  
  // 7. Properties ที่ย้ายไปเป็น Observable
  public playerPositionDisplay$: Observable<string>;
  public detailDialogVisible = false;

  private cameraLookAtTarget = new THREE.Vector3(); // State ภายใน
  private isInitialized = false;
  private subscriptions = new Subscription();

  constructor() {
    // 8. เชื่อม Output Event เข้ากับ Service State
    this.subscriptions.add(
      this.interaction.currentZoneId$.subscribe(zoneId => {
        this.zoneChanged.emit(zoneId);
      })
    );

    // 9. สร้าง Observable สำหรับแสดงผลตำแหน่ง
    this.playerPositionDisplay$ = new BehaviorSubject<string>('');

    this.subscriptions.add(
      this.interaction.isDetailDialogVisible$.subscribe(visible => {
        this.ngZone.run(() => {
          this.detailDialogVisible = visible;
        });
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isInitialized && changes['floorData'] && this.floorData) {
      this.threeScene.setGroundPlaneColor(this.floorData.color ?? 0xeeeeee);
      this.reloadFloorPlan();
      this.interaction.initialize(this.floorData);
    }
    if (this.isInitialized && changes['panToTarget']) {
      const selection = changes['panToTarget'].currentValue;
      if (selection) {
        this.warpPlayerTo(selection);
        this.panCameraToObject(selection);
        this.ngZone.run(() => this.interaction.closeDetail());
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.isInitialized || !this.floorData) return;
    this.isInitialized = true;
    
    this.threeScene.initialize(this.canvasRef.nativeElement);
    this.playerControls.initialize();
    this.interaction.initialize(this.floorData);

    this.threeScene.setGroundPlaneColor(this.floorData.color ?? 0xeeeeee);
    this.floorGroup = this.floorBuilder.buildFloor(this.floorData);
    this.threeScene.scene.add(this.floorGroup);

    this.cameraLookAtTarget.copy(this.playerControls.player.position);
    this.startRenderingLoop();
    setTimeout(() => {
      this.threeScene.resize();
    }, 0);

    if (typeof window !== 'undefined' && 'ResizeObserver' in window) {
      this.ngZone.runOutsideAngular(() => {
        this.resizeObserver = new ResizeObserver(() => this.threeScene.resize());
        const hostElement = this.canvasRef.nativeElement?.parentElement as Element | null;
        if (hostElement) {
          this.resizeObserver.observe(hostElement);
        }
      });
    }
  }

  ngOnDestroy(): void {
    this.isInitialized = false;
    this.threeScene.destroy();
    this.floorBuilder.clearFloor();
    this.subscriptions.unsubscribe();
    this.resizeObserver?.disconnect();
  }

  private startRenderingLoop(): void {
    this.threeScene.startRenderingLoop(() => {
      // Logic ที่ต้องรันทุก Frame
      this.playerControls.update(this.interaction.currentUserAccessLevel$.value);
      this.interaction.checkPlayerZone();
      this.updateCameraPosition();
      this.updatePlayerPositionDisplay();
    });
  }

  // --- Methods ที่เหลืออยู่ (ส่วนใหญ่เป็นตัวกลาง) ---

  public toggleView(): void {
    this.currentView = this.currentView === 'iso' ? 'top' : 'iso';
  }

  public toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    setTimeout(() => this.threeScene.resize(), 50);
  }

  public getTypeLabel(type: string): string {
    const typeLabelMap: Record<string, string> = {
      zone: 'Zone', area: 'Area', room: 'Room', door: 'Door', object: 'Asset'
    };
    return typeLabelMap[type] ?? type;
  }

  public move(event: Event, key: string, state: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    this.playerControls.setKeyboardInput(key, state);
  }

  public disableOrbitControls(event: Event): void {
    event.stopPropagation();
    if (this.threeScene.controls) this.threeScene.controls.enabled = false;
  }

  public enableOrbitControls(event: Event): void {
    event.stopPropagation();
    if (this.threeScene.controls) this.threeScene.controls.enabled = true;
  }

  private panCameraToObject(targetData: any): void {
    if (!targetData) return;
    if (targetData.center) {
        this.cameraLookAtTarget.x = targetData.center.x;
        this.cameraLookAtTarget.z = targetData.center.y;
      } else if (targetData.boundary) {
        this.cameraLookAtTarget.x = (targetData.boundary.min.x + targetData.boundary.max.x) / 2;
        this.cameraLookAtTarget.z = (targetData.boundary.min.y + targetData.boundary.max.y) / 2;
      }
  }
  
  private warpPlayerTo(targetData: any): void {
    if (!this.playerControls.player || !targetData?.center) return;
    const newPosition = new THREE.Vector3(
      targetData.center.x,
      this.playerControls.playerSize,
      targetData.center.y 
    );
    this.playerControls.player.position.copy(newPosition);
    this.cameraLookAtTarget.copy(this.playerControls.player.position);
  }

  private updateCameraPosition(): void {
    if (!this.playerControls.player) return;
    
    // ถ้า Dialog ไม่ได้เปิด, ให้กล้องตาม Player
    if (!this.interaction.isDetailDialogVisible$.value) {
      this.cameraLookAtTarget.copy(this.playerControls.player.position);
    }

    let targetCameraPos = new THREE.Vector3();
    const cameraLookAt = this.cameraLookAtTarget;
    if (this.currentView === 'iso') {
      const offset = new THREE.Vector3(-8, 7, -8);
      targetCameraPos.copy(cameraLookAt).add(offset);
    } else {
      targetCameraPos.set(cameraLookAt.x, 35, cameraLookAt.z);
    }
    const lerpAlpha = 0.05;
    this.threeScene.camera.position.lerp(targetCameraPos, lerpAlpha);
    this.threeScene.controls.target.lerp(cameraLookAt, lerpAlpha);
  }
  
  private updatePlayerPositionDisplay(): void {
    const pos = this.playerControls.player.position;
    const x = this.decimalPipe.transform(pos.x, '1.1-1');
    const z = this.decimalPipe.transform(pos.z, '1.1-1');
    const newPositionDisplay = `X: ${x}, Z: ${z}`;
    
    const displaySubject = this.playerPositionDisplay$ as BehaviorSubject<string>;
    if (displaySubject.value !== newPositionDisplay) {
        this.ngZone.run(() => {
          displaySubject.next(newPositionDisplay);
        });
    }
  }

  @HostListener('window:click', ['$event'])
  onClick(event: MouseEvent) {
    this.interaction.handleMouseClick(event, this.cameraLookAtTarget);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    this.playerControls.setKeyboardInput(event.code, true);
    event.preventDefault();
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    this.playerControls.setKeyboardInput(event.code, false);
    event.preventDefault();
  }

  @HostListener('window:pointerup')
  onGlobalPointerUp(): void {
    if (!this.threeScene.controls) return;
    if (!this.threeScene.controls.enabled) {
      this.threeScene.controls.enabled = true;
    }
  }

  @HostListener('window:resize')
  onWindowResize(event?: Event) {
    this.threeScene.resize();
  }

  private reloadFloorPlan(): void {
    this.ngZone.run(() => {
        this.interaction.currentZoneId$.next(null);
        this.interaction.closeDetail();
        (this.playerPositionDisplay$ as BehaviorSubject<string>).next('');
    });

    if (this.floorGroup) {
      this.threeScene.scene.remove(this.floorGroup);
      this.floorBuilder.clearFloor();
    }
    this.floorGroup = this.floorBuilder.buildFloor(this.floorData);
    this.threeScene.scene.add(this.floorGroup);

    if (this.playerControls.player) {
      this.playerControls.player.position.set(0, this.playerControls.playerSize, 0);
      this.cameraLookAtTarget.copy(this.playerControls.player.position);
    }
    this.interaction.simulateAuthentication(this.interaction.currentUserAccessLevel$.value);
  }
}