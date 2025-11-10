import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
  Input,
  OnChanges,
  SimpleChanges,
  NgZone,
  inject,
  OnDestroy,
  ChangeDetectionStrategy
} from '@angular/core';
import * as THREE from 'three';
import { CommonModule } from '@angular/common';

import { ThreeSceneService } from '../../services/floorplan/three-scene.service';
import { FloorplanBuilderService } from '../../services/floorplan/floorplan-builder.service';
import { PlayerControlsService } from '../../services/floorplan/player-controls.service';
import { FloorplanInteractionService } from '../../services/floorplan/floorplan-interaction.service';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FloorPlanComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') private canvasRef!: ElementRef;
  @Input() floorData: any;

  private threeScene = inject(ThreeSceneService);
  private floorBuilder = inject(FloorplanBuilderService);
  private playerControls = inject(PlayerControlsService);
  public interaction = inject(FloorplanInteractionService);
  private ngZone = inject(NgZone);
  private resizeObserver?: ResizeObserver;

  private floorGroup: THREE.Group | null = null;
  private cameraLookAtTarget = new THREE.Vector3();
  private isInitialized = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isInitialized && changes['floorData'] && this.floorData) {
      this.threeScene.setGroundPlaneColor(this.floorData.color ?? 0xeeeeee);
      this.reloadFloorPlan();
      this.interaction.initialize(this.floorData);
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
    this.resizeObserver?.disconnect();
  }

  private startRenderingLoop(): void {
    this.threeScene.startRenderingLoop(() => {
      this.playerControls.update(this.interaction.currentUserAccessLevel$.value);
      this.interaction.checkPlayerZone();
      this.updateCameraPosition();
    });
  }

  private updateCameraPosition(): void {
    if (!this.playerControls.player) return;

    this.cameraLookAtTarget.copy(this.playerControls.player.position);
    const targetCameraPos = new THREE.Vector3(
      this.cameraLookAtTarget.x - 8,
      this.cameraLookAtTarget.y + 7,
      this.cameraLookAtTarget.z - 8
    );

    const lerpAlpha = 0.05;
    this.threeScene.camera.position.lerp(targetCameraPos, lerpAlpha);
    this.threeScene.controls.target.lerp(this.cameraLookAtTarget, lerpAlpha);
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
