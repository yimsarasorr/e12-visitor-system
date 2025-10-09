import { Component, ElementRef, ViewChild, AfterViewInit, HostListener, Output, EventEmitter, Input, OnChanges, SimpleChanges } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ButtonModule } from 'primeng/button';
import { CommonModule, DecimalPipe } from '@angular/common';
import { DialogModule } from 'primeng/dialog';

interface Boundary {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [ CommonModule, ButtonModule, DialogModule ],
  providers: [DecimalPipe],
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css'],
})
export class FloorPlanComponent implements AfterViewInit, OnChanges {
  @ViewChild('canvas') private canvasRef!: ElementRef;
  @Input() floorData: any;
  @Input() panToTarget: any;
  @Output() zoneChanged = new EventEmitter<string | null>();

  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private wallHeight = 3;
  private wallThickness = 0.2;
  private frustumSize = 60;

  private player!: THREE.Mesh;
  private playerSize = 0.5;
  private playerSpeed = 0.1;
  private wallMeshes: THREE.Mesh[] = [];
  private objectMeshes: THREE.Mesh[] = [];
  private floorMeshes: THREE.Mesh[] = [];
  private doorMeshes: THREE.Mesh[] = [];
  private floorGroup: THREE.Group | null = null;

  private lockedDoorMaterial!: THREE.MeshStandardMaterial;
  private unlockedDoorMaterial!: THREE.MeshStandardMaterial;

  public currentUserAccessLevel = 0;

  private readonly typeLabelMap: Record<string, string> = {
    zone: 'Zone',
    area: 'Area',
    room: 'Room',
    door: 'Door',
    object: 'Asset'
  };

  private keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

  public currentView: 'iso' | 'top' = 'iso';
  public isFullscreen = false;
  public currentZoneId: string | null = null;
  public isDetailDialogVisible = false;
  public selectedObject: { type: string, data: any } | null = null;
  public playerPositionDisplay: string = '';

  private cameraLookAtTarget = new THREE.Vector3();
  private isInitialized = false;

  constructor(private decimalPipe: DecimalPipe) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.isInitialized && changes['floorData'] && this.floorData) {
      this.reloadFloorPlan();
    }
    if (this.isInitialized && changes['panToTarget']) {
      const selection = changes['panToTarget'].currentValue;
      if (selection) {
        this.focusOnExternalSelection(selection);
      } else {
        this.closeDetail();
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.isInitialized || !this.floorData) return;
    this.isInitialized = true;
    
    this.createScene();
    this.loadFloorPlan();
    this.createPlayer();
    this.startRenderingLoop();
    this.updateDoorMaterials();
  }

  // --- START: ฟังก์ชันที่ตกหล่นไป (เพิ่มกลับเข้ามาทั้งหมด) ---

  toggleView(): void {
    this.currentView = this.currentView === 'iso' ? 'top' : 'iso';
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    setTimeout(() => this.onWindowResize(), 50);
  }

  getTypeLabel(type: string): string {
    return this.typeLabelMap[type] ?? type;
  }

  public move(event: Event, key: string, state: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    if (key in this.keys) {
      (this.keys as any)[key] = state;
    }
  }

  public disableOrbitControls(event: Event): void {
    event.stopPropagation();
    if (this.controls) this.controls.enabled = false;
  }

  public enableOrbitControls(event: Event): void {
    event.stopPropagation();
    if (this.controls) this.controls.enabled = true;
  }
  
  public onDialogHide(): void {
    this.closeDetail();
  }

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  
  // --- END: ฟังก์ชันที่ตกหล่นไป ---

  private panCameraToObject(targetData: any): void {
    if (!targetData) return;
    let targetPosition = new THREE.Vector3();
    if (targetData.boundary) {
        targetPosition.x = (targetData.boundary.min.x + targetData.boundary.max.x) / 2;
        targetPosition.z = (targetData.boundary.min.y + targetData.boundary.max.y) / 2;
    } else if (targetData.center) {
        targetPosition.x = targetData.center.x;
        targetPosition.z = targetData.center.y;
    }
    this.cameraLookAtTarget.copy(targetPosition);
    this.camera.zoom = 1.5;
    this.camera.updateProjectionMatrix();
  }
  
  public simulateAuthentication(level: number): void {
    this.currentUserAccessLevel = level;
    this.updateDoorMaterials();
  }

  private updateDoorMaterials(): void {
    this.doorMeshes.forEach(door => {
      const requiredLevel = door.userData['data'].accessLevel;
      if (requiredLevel === -1 || this.currentUserAccessLevel < requiredLevel) {
        door.material = this.lockedDoorMaterial;
      } else {
        door.material = this.unlockedDoorMaterial;
      }
    });
  }

  private checkCollision(newPosition: THREE.Vector3): boolean {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      newPosition, new THREE.Vector3(this.playerSize, this.playerSize * 2, this.playerSize)
    );
    for (const wall of this.wallMeshes) {
      if (playerBox.intersectsBox(new THREE.Box3().setFromObject(wall))) return true;
    }
    for (const obj of this.objectMeshes) {
      if (playerBox.intersectsBox(new THREE.Box3().setFromObject(obj))) return true;
    }
    for (const door of this.doorMeshes) {
      const requiredLevel = door.userData['data'].accessLevel;
      if (requiredLevel === -1 || this.currentUserAccessLevel < requiredLevel) {
        if (playerBox.intersectsBox(new THREE.Box3().setFromObject(door))) return true;
      }
    }
    return false;
  }

  private loadFloorPlan(): void {
    if (this.floorGroup) {
      this.disposeFloorGroup();
    }

    this.floorGroup = new THREE.Group();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const objectMaterial = new THREE.MeshStandardMaterial({ color: 0x445566 });

    this.wallMeshes = [];
    this.objectMeshes = [];
    this.floorMeshes = [];
    this.doorMeshes = [];

    if (this.floorData?.walls) {
      this.floorData.walls.forEach((wall: any) => {
        const start = new THREE.Vector3(wall.start.x, 0, wall.start.y);
        const end = new THREE.Vector3(wall.end.x, 0, wall.end.y);
        const wallMesh = this.buildWallMesh(start, end, this.wallHeight, wallMaterial);
        this.wallMeshes.push(wallMesh);
        this.floorGroup!.add(wallMesh);
      });
    }

    this.floorData?.zones?.forEach((zone: any) => {
      const zoneBoundaries: Boundary[] = [];

      zone.areas?.forEach((area: any) => {
        const areaWidth = area.boundary.max.x - area.boundary.min.x;
        const areaDepth = area.boundary.max.y - area.boundary.min.y;
        const areaGeo = new THREE.PlaneGeometry(areaWidth, areaDepth);
        const areaMat = new THREE.MeshStandardMaterial({ color: area.color || 0xffffff, side: THREE.DoubleSide });
        const areaFloor = new THREE.Mesh(areaGeo, areaMat);
        areaFloor.rotation.x = -Math.PI / 2;
        areaFloor.position.set(area.boundary.min.x + areaWidth / 2, 0.01, area.boundary.min.y + areaDepth / 2);
        const areaData = { ...area, floor: this.floorData.floor };
        areaFloor.userData = { type: 'area', data: areaData };
        this.floorMeshes.push(areaFloor);
        this.floorGroup!.add(areaFloor);
        if (area.boundary) {
          zoneBoundaries.push(area.boundary);
        }
      });

      zone.rooms?.forEach((room: any) => {
        const roomWidth = room.boundary.max.x - room.boundary.min.x;
        const roomDepth = room.boundary.max.y - room.boundary.min.y;
        const roomGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
        const roomMat = new THREE.MeshStandardMaterial({ color: room.color || 0xffffff, side: THREE.DoubleSide });
        const roomFloor = new THREE.Mesh(roomGeo, roomMat);
        roomFloor.rotation.x = -Math.PI / 2;
        roomFloor.position.set(room.boundary.min.x + roomWidth / 2, 0.02, room.boundary.min.y + roomDepth / 2);
        const roomData = { ...room, floor: this.floorData.floor };
        roomFloor.userData = { type: 'room', data: roomData };
        this.floorMeshes.push(roomFloor);
        this.floorGroup!.add(roomFloor);
        if (room.boundary) {
          zoneBoundaries.push(room.boundary);
        }

        room.doors?.forEach((door: any) => {
          const geo = new THREE.BoxGeometry(door.size.width, this.wallHeight, door.size.depth);
          const mesh = new THREE.Mesh(geo, this.lockedDoorMaterial);
          mesh.position.set(door.center.x, this.wallHeight / 2, door.center.y);
          const doorData = { ...door, floor: this.floorData.floor };
          mesh.userData = { type: 'door', data: doorData };
          this.doorMeshes.push(mesh);
          this.floorGroup!.add(mesh);
        });
      });

      zone.objects?.forEach((obj: any) => {
        const width = obj.boundary.max.x - obj.boundary.min.x;
        const depth = obj.boundary.max.y - obj.boundary.min.y;
        const geo = new THREE.BoxGeometry(width, this.wallHeight, depth);
        const mesh = new THREE.Mesh(geo, objectMaterial);
        mesh.position.set(obj.boundary.min.x + width / 2, this.wallHeight / 2, obj.boundary.min.y + depth / 2);
        const objectData = { ...obj, floor: this.floorData.floor };
        mesh.userData = { type: 'object', data: objectData };
        this.objectMeshes.push(mesh);
        this.floorGroup!.add(mesh);
        if (obj.boundary) {
          zoneBoundaries.push(obj.boundary);
        }
      });

      const combined = this.combineBoundaries(zoneBoundaries);
      if (combined) {
        zone.boundary = combined;
        zone.center = {
          x: (combined.min.x + combined.max.x) / 2,
          y: (combined.min.y + combined.max.y) / 2
        };
      }
    });

    if (this.floorGroup) {
      this.scene.add(this.floorGroup);
    }

    if (!this.scene.getObjectByName('gridHelper')) {
      const gridHelper = new THREE.GridHelper(150, 150);
      gridHelper.name = 'gridHelper';
      this.scene.add(gridHelper);
    }

    if (!this.scene.getObjectByName('ambientLight')) {
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      ambientLight.name = 'ambientLight';
      this.scene.add(ambientLight);
    }

    if (!this.scene.getObjectByName('directionalLight')) {
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
      directionalLight.position.set(-10, 20, -10);
      directionalLight.castShadow = true;
      directionalLight.name = 'directionalLight';
      this.scene.add(directionalLight);
    }
  }

  private checkPlayerZone(): void {
    if (!this.player || !this.floorData.zones) return;
    const playerPos = this.player.position;
    let newZoneId: string | null = null;
  
    for (const zone of this.floorData.zones) {
      if (zone.rooms) {
        for (const room of zone.rooms) {
          if (room.boundary && this.containsPoint(room.boundary, playerPos)) {
            newZoneId = room.id;
            break;
          }
        }
      }
      if (newZoneId) break;

      if (zone.areas) {
        for (const area of zone.areas) {
          if (area.boundary && this.containsPoint(area.boundary, playerPos)) {
            newZoneId = area.id;
            break;
          }
        }
      }
      if (newZoneId) break;

      if (zone.boundary && this.containsPoint(zone.boundary, playerPos)) {
        newZoneId = zone.id;
        break;
      }
    }

    if (this.currentZoneId !== newZoneId) {
        this.currentZoneId = newZoneId;
        this.zoneChanged.emit(this.currentZoneId);
    }
  }
  
  private createScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xEBF0F5);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    this.camera.position.set(-20, 18, -25);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvasRef.nativeElement, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, -6);
    this.lockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    this.unlockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
  }

  private createPlayer(): void {
    const playerGeometry = new THREE.CylinderGeometry(this.playerSize/2, this.playerSize/2, this.playerSize * 2);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.player = new THREE.Mesh(playerGeometry, playerMaterial);
    this.player.position.set(0, this.playerSize, 0);
    this.player.castShadow = true;
    this.scene.add(this.player);
    this.cameraLookAtTarget.copy(this.player.position);
  }

  private updatePlayer(): void {
    if (!this.player) return;
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    const rightDirection = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), cameraDirection).normalize();
    const moveVector = new THREE.Vector3(0, 0, 0);
    if (this.keys.ArrowUp) moveVector.add(cameraDirection);
    if (this.keys.ArrowDown) moveVector.sub(cameraDirection);
    if (this.keys.ArrowLeft) moveVector.add(rightDirection);
    if (this.keys.ArrowRight) moveVector.sub(rightDirection);
    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(this.playerSpeed);
      const newPosition = this.player.position.clone().add(moveVector);
      if (!this.checkCollision(newPosition)) {
        this.player.position.copy(newPosition);
      }
    }
  }

  private updateCameraPosition(): void {
    if (!this.player) return;
    if (!this.isDetailDialogVisible) {
      this.cameraLookAtTarget.copy(this.player.position);
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
    this.camera.position.lerp(targetCameraPos, lerpAlpha);
    this.controls.target.lerp(cameraLookAt, lerpAlpha);
  }
  
  @HostListener('window:click', ['$event'])
  onClick(event: MouseEvent) {
    if (event.target !== this.canvasRef.nativeElement) {
      return;
    }
    if (this.isDetailDialogVisible || !this.controls.enabled) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, this.camera);
    const clickableObjects = [...this.floorMeshes, ...this.doorMeshes, ...this.objectMeshes];
    const intersects = raycaster.intersectObjects(clickableObjects);
    if (intersects.length > 0) {
      const clickedObj = intersects[0].object;
      const payload = clickedObj.userData as { type: string, data: any };
      if (payload?.type && payload.data) {
        this.openDetail(payload.type, payload.data);
      }
    }
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (event.code in this.keys) {
      (this.keys as any)[event.code] = true;
      event.preventDefault();
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    if (event.code in this.keys) {
      (this.keys as any)[event.code] = false;
      event.preventDefault();
    }
  }

  private buildWallMesh(start: THREE.Vector3, end: THREE.Vector3, height: number, material: THREE.Material): THREE.Mesh {
    const distance = start.distanceTo(end);
    if (distance < 0.1) return new THREE.Mesh();
    const geometry = new THREE.BoxGeometry(distance, height, this.wallThickness);
    const mesh = new THREE.Mesh(geometry, material);
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mesh.position.set(midPoint.x, height / 2, midPoint.z);
    const direction = new THREE.Vector3().subVectors(end, start);
    mesh.rotation.y = Math.atan2(direction.z, direction.x);
    return mesh;
  }
  
  private startRenderingLoop(): void {
    const render = () => {
      requestAnimationFrame(render);
      
      this.onWindowResize(); // Call resize logic every frame

      this.updatePlayer();
      this.checkPlayerZone();
      this.updateCameraPosition();
      
      const pos = this.player.position;
      const x = this.decimalPipe.transform(pos.x, '1.1-1');
      const z = this.decimalPipe.transform(pos.z, '1.1-1');
      this.playerPositionDisplay = `X: ${x}, Z: ${z}`;
      
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  @HostListener('window:pointerup')
  onGlobalPointerUp(): void {
    if (!this.controls) return;
    if (!this.controls.enabled) {
      this.controls.enabled = true;
    }
  }

  @HostListener('window:resize')
  onWindowResize(event?: Event) {
    if (!this.renderer || !this.camera) return; // Guard clause

    const canvas = this.renderer.domElement;
    if (canvas.clientHeight > 0) {
      const needResize = canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight;
      if (needResize) {
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      }
      const aspect = canvas.clientWidth / canvas.clientHeight;
      this.camera.left = this.frustumSize * aspect / -2;
      this.camera.right = this.frustumSize * aspect / 2;
      this.camera.top = this.frustumSize / 2;
      this.camera.bottom = this.frustumSize / -2;
      this.camera.updateProjectionMatrix();
    }
  }

  private reloadFloorPlan(): void {
    this.currentZoneId = null;
    this.zoneChanged.emit(null);
    this.closeDetail();
    this.playerPositionDisplay = '';
    this.loadFloorPlan();
    if (this.player) {
      this.player.position.set(0, this.playerSize, 0);
      this.cameraLookAtTarget.copy(this.player.position);
    }
    this.updateDoorMaterials();
  }

  private disposeFloorGroup(): void {
    if (!this.floorGroup) return;
    this.floorGroup.children.forEach(child => {
      if (child instanceof THREE.Mesh) {
        this.disposeMesh(child);
      }
    });
    this.scene.remove(this.floorGroup);
    this.floorGroup = null;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
  }

  private focusOnExternalSelection(selection: any): void {
    if (!selection) {
      return;
    }
    const type = selection.type ?? 'zone';
    const data = selection.data ?? selection;
    this.openDetail(type, data);
  }

  private openDetail(type: string, data: any): void {
    this.panCameraToObject(data);
    this.selectedObject = { type, data };
    this.isDetailDialogVisible = true;
  }

  private closeDetail(): void {
    this.isDetailDialogVisible = false;
    this.selectedObject = null;
    this.resetCameraAfterDetail();
  }

  private resetCameraAfterDetail(): void {
    if (!this.camera) {
      return;
    }
    this.camera.zoom = 1.0;
    this.camera.updateProjectionMatrix();
    if (this.player) {
      this.cameraLookAtTarget.copy(this.player.position);
    }
  }

  private containsPoint(boundary: Boundary, position: THREE.Vector3): boolean {
    return (
      position.x >= boundary.min.x &&
      position.x <= boundary.max.x &&
      position.z >= boundary.min.y &&
      position.z <= boundary.max.y
    );
  }

  private combineBoundaries(boundaries: Boundary[]): Boundary | null {
    if (!boundaries.length) {
      return null;
    }
    return boundaries.reduce((acc, boundary) => ({
      min: {
        x: Math.min(acc.min.x, boundary.min.x),
        y: Math.min(acc.min.y, boundary.min.y)
      },
      max: {
        x: Math.max(acc.max.x, boundary.max.x),
        y: Math.max(acc.max.y, boundary.max.y)
      }
    }));
  }
}
