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
import { BehaviorSubject, Subscription } from 'rxjs';

import { ThreeSceneService } from '../../services/floorplan/three-scene.service';
import { FloorplanBuilderService } from '../../services/floorplan/floorplan-builder.service';
import { PlayerControlsService } from '../../services/floorplan/player-controls.service';
import { FloorplanInteractionService } from '../../services/floorplan/floorplan-interaction.service';
import { JoystickComponent } from '../joystick/joystick.component';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [CommonModule, ButtonModule, DialogModule, JoystickComponent],
  providers: [DecimalPipe],
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FloorPlanComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;
  @Input() floorData: any;
  @Input() panToTarget: any;
  @Output() zoneChanged = new EventEmitter<string | null>();

  private threeScene = inject(ThreeSceneService);
  private floorBuilder = inject(FloorplanBuilderService);
  private playerControls = inject(PlayerControlsService);
  public interaction = inject(FloorplanInteractionService);

  private decimalPipe = inject(DecimalPipe);
  private ngZone = inject(NgZone);
  private resizeObserver?: ResizeObserver;

  private floorGroup: THREE.Group | null = null;
  public currentView: 'iso' | 'top' = 'iso';
  public isFullscreen = false;

  private readonly playerPositionDisplaySubject = new BehaviorSubject<string>('');
  public readonly playerPositionDisplay$ = this.playerPositionDisplaySubject.asObservable();
  public detailDialogVisible = false;

  private cameraLookAtTarget = new THREE.Vector3();
  private isInitialized = false;
  private subscriptions = new Subscription();

  constructor() {
    this.subscriptions.add(
      this.interaction.currentZoneId$.subscribe(zoneId => {
        this.zoneChanged.emit(zoneId);
      })
    );

    this.subscriptions.add(
      this.interaction.isDetailDialogVisible$.subscribe(visible => {
        this.ngZone.run(() => {
          this.detailDialogVisible = visible;
        });
      })
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.isInitialized) return;

    if (changes['floorData'] && this.floorData) {
      this.threeScene.setGroundPlaneColor(this.floorData.color ?? 0xeeeeee);
      this.reloadFloorPlan();
      this.interaction.initialize(this.floorData);
    }

    if (changes['panToTarget']) {
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

    this.snapCameraToTarget();
    this.startRenderingLoop();

    this.ngZone.runOutsideAngular(() => setTimeout(() => this.threeScene.resize(), 0));

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

  toggleView(): void {
    this.currentView = this.currentView === 'iso' ? 'top' : 'iso';
    this.snapCameraToTarget();
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    this.ngZone.runOutsideAngular(() => setTimeout(() => this.threeScene.resize(), 50));
  }

  private startRenderingLoop(): void {
    this.threeScene.startRenderingLoop(() => {
      this.playerControls.update(this.interaction.currentUserAccessLevel$.value);
      this.interaction.checkPlayerZone();
      this.updateCameraPosition();
      this.updatePlayerPositionDisplay();
    });
  }

  private updateCameraPosition(): void {
    if (!this.playerControls.player) return;

    if (!this.interaction.isDetailDialogVisible$.value) {
      this.cameraLookAtTarget.copy(this.playerControls.player.position);
    }

    const cameraLookAt = this.cameraLookAtTarget;
    let targetCameraPos = new THREE.Vector3();

    if (this.currentView === 'iso') {
      const offset = new THREE.Vector3(-6.5, 6.25, -6.5);
      targetCameraPos.copy(cameraLookAt).add(offset);
    } else {
      targetCameraPos.set(cameraLookAt.x, 32, cameraLookAt.z);
    }

    const lerpAlpha = 0.08;
    this.threeScene.camera.position.lerp(targetCameraPos, lerpAlpha);
    this.threeScene.controls.target.lerp(cameraLookAt, lerpAlpha);
  }

  private snapCameraToTarget(): void {
    if (!this.playerControls.player) return;

    const baseTarget = this.playerControls.player.position.clone();
    this.cameraLookAtTarget.copy(baseTarget);

    const cameraPosition = this.currentView === 'iso'
      ? baseTarget.clone().add(new THREE.Vector3(-6.5, 6.25, -6.5))
      : new THREE.Vector3(baseTarget.x, 32, baseTarget.z);

    this.threeScene.camera.position.copy(cameraPosition);
    this.threeScene.controls.target.copy(baseTarget);
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
    this.snapCameraToTarget();
  }

  private updatePlayerPositionDisplay(): void {
    const player = this.playerControls.player;
    if (!player) return;

    const x = this.decimalPipe.transform(player.position.x, '1.1-1');
    const z = this.decimalPipe.transform(player.position.z, '1.1-1');
    const newDisplay = `X: ${x}, Z: ${z}`;

    if (this.playerPositionDisplaySubject.value !== newDisplay) {
      this.ngZone.run(() => this.playerPositionDisplaySubject.next(newDisplay));
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
  onWindowResize(): void {
    this.threeScene.resize();
  }

  private reloadFloorPlan(): void {
    this.ngZone.run(() => {
      this.interaction.currentZoneId$.next(null);
      this.interaction.closeDetail();
      this.playerPositionDisplaySubject.next('');
    });

    if (this.floorGroup) {
      this.threeScene.scene.remove(this.floorGroup);
      this.floorBuilder.clearFloor();
    }
    this.floorGroup = this.floorBuilder.buildFloor(this.floorData);
    this.threeScene.scene.add(this.floorGroup);

    if (this.playerControls.player) {
      this.playerControls.player.position.set(0, this.playerControls.playerSize, 0);
      this.snapCameraToTarget();
    }
    this.interaction.simulateAuthentication(this.interaction.currentUserAccessLevel$.value);
  }
}
