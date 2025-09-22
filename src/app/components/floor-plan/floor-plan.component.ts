import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import floorData from './e12-floor1.json';
import { ButtonModule } from 'primeng/button';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-floor-plan',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    DialogModule
  ],
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css'],
})
export class FloorPlanComponent implements AfterViewInit {
  @ViewChild('canvas') private canvasRef!: ElementRef;

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

  private lockedDoorMaterial!: THREE.MeshStandardMaterial;
  private unlockedDoorMaterial!: THREE.MeshStandardMaterial;

  private currentUserAccessLevel = 0;

  private keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
  };

  public currentView: 'game' | 'top' = 'game';
  public isFullscreen = false;
  public currentZoneId: string | null = null;
  public isDetailDialogVisible = false;
  public selectedArea: any = null;
  
  private cameraTargetPosition = new THREE.Vector3();
  private cameraLookAtTarget = new THREE.Vector3();

  ngAfterViewInit(): void {
    this.createScene();
    this.loadFloorPlan();
    this.createPlayer();
    this.startRenderingLoop();
    this.updateDoorMaterials();
  }

  public simulateAuthentication(level: number): void {
    this.currentUserAccessLevel = level;
    this.updateDoorMaterials();
  }

  private updateDoorMaterials(): void {
    this.doorMeshes.forEach(door => {
      const requiredLevel = door.userData['accessLevel'];
      if (this.currentUserAccessLevel >= requiredLevel) {
        door.material = this.unlockedDoorMaterial;
      } else {
        door.material = this.lockedDoorMaterial;
      }
    });
  }

  toggleView(): void {
    this.currentView = this.currentView === 'game' ? 'top' : 'game';
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    setTimeout(() => this.onWindowResize(), 50);
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
    this.controls.enabled = false;
  }

  public enableOrbitControls(event: Event): void {
    event.stopPropagation();
    this.controls.enabled = true;
  }

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
  }
  
  public onDialogHide(): void {
    // เมื่อปิด Dialog ให้รีเซ็ตการซูม
    this.camera.zoom = 1.0;
    this.camera.updateProjectionMatrix();
  }

  private createScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xEBF0F5);
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    this.camera = new THREE.OrthographicCamera(
      this.frustumSize * aspect / -2, this.frustumSize * aspect / 2, this.frustumSize / 2, this.frustumSize / -2, 0.1, 1000
    );
    this.camera.position.set(-20, 18, -25);

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0, -6);

    this.lockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000, transparent: true, opacity: 0.3 });
    this.unlockedDoorMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.3 });
  }

  private loadFloorPlan(): void {
    const floorGroup = new THREE.Group();
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const objectMaterial = new THREE.MeshStandardMaterial({ color: 0x445566 });

    floorData.areas.forEach(area => {
      const width = area.boundary.max.x - area.boundary.min.x;
      const depth = area.boundary.max.y - area.boundary.min.y;
      const floorGeo = new THREE.PlaneGeometry(width, depth);
      const floorMat = new THREE.MeshStandardMaterial({ color: area.color || 0xffffff });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(area.boundary.min.x + width / 2, 0.01, area.boundary.min.y + depth / 2);
      floor.userData = { type: 'floor', areaData: area };
      this.floorMeshes.push(floor);
      floorGroup.add(floor);
    });

    if (floorData.walls) {
      floorData.walls.forEach(wall => {
        const start = new THREE.Vector3(wall.start.x, 0, wall.start.y);
        const end = new THREE.Vector3(wall.end.x, 0, wall.end.y);
        const wallMesh = this.buildWallMesh(start, end, this.wallHeight, wallMaterial);
        this.wallMeshes.push(wallMesh);
        floorGroup.add(wallMesh);
      });
    }

    floorData.objects.forEach(obj => {
      const width = obj.boundary.max.x - obj.boundary.min.x;
      const depth = obj.boundary.max.y - obj.boundary.min.y;
      const geo = new THREE.BoxGeometry(width, this.wallHeight, depth);
      const mesh = new THREE.Mesh(geo, objectMaterial);
      mesh.position.set(obj.boundary.min.x + width / 2, this.wallHeight / 2, obj.boundary.min.y + depth / 2);
      this.objectMeshes.push(mesh);
      floorGroup.add(mesh);
    });
    
    if ((floorData as any).doors) {
      (floorData as any).doors.forEach((door: any) => {
        const geo = new THREE.BoxGeometry(door.size.width, this.wallHeight, door.size.depth);
        const mesh = new THREE.Mesh(geo, this.lockedDoorMaterial);
        mesh.position.set(door.center.x, this.wallHeight / 2, door.center.y);
        mesh.userData = { id: door.id, accessLevel: door.accessLevel };
        this.doorMeshes.push(mesh);
        floorGroup.add(mesh);
      });
    }

    const gridHelper = new THREE.GridHelper(150, 150);
    this.scene.add(gridHelper);
    this.scene.add(floorGroup);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(-10, 20, -10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  private createPlayer(): void {
    const playerGeometry = new THREE.CylinderGeometry(this.playerSize/2, this.playerSize/2, this.playerSize * 2);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.player = new THREE.Mesh(playerGeometry, playerMaterial);
    this.player.position.set(0, this.playerSize, 0);
    this.player.castShadow = true;
    this.scene.add(this.player);
    // กำหนดเป้าหมายเริ่มต้นของกล้องให้เป็นผู้เล่น
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
      if (this.currentUserAccessLevel < door.userData['accessLevel']) {
        if (playerBox.intersectsBox(new THREE.Box3().setFromObject(door))) return true;
      }
    }
    return false;
  }

  private checkPlayerZone(): void {
    if (!this.player) return;
    const playerPos = this.player.position;
    let inAnyZone = false;
    for (const area of floorData.areas) {
      const bounds = area.boundary;
      if (playerPos.x >= bounds.min.x && playerPos.x <= bounds.max.x &&
          playerPos.z >= bounds.min.y && playerPos.z <= bounds.max.y) {
        if (this.currentZoneId !== area.id) {
          this.currentZoneId = area.id;
        }
        inAnyZone = true;
        break;
      }
    }
    if (!inAnyZone && this.currentZoneId !== null) {
      this.currentZoneId = null;
    }
  }
  
  @HostListener('window:click', ['$event'])
  onClick(event: MouseEvent) {
    if (event.target !== this.canvasRef.nativeElement) {
      return; // ถ้าสิ่งที่คลิกไม่ใช่ Canvas ของเรา ให้ออกจากฟังก์ชันทันที
    }

    if (this.isDetailDialogVisible || this.controls.enabled === false) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const rect = this.renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObjects(this.floorMeshes);
    if (intersects.length > 0) {
      const clickedFloor = intersects[0].object;
      if (clickedFloor.userData['type'] === 'floor') {
        this.selectedArea = clickedFloor.userData['areaData'];
        this.isDetailDialogVisible = true;
        
        // กำหนดเป้าหมายใหม่เป็นจุดกึ่งกลางของโซน
        const area = this.selectedArea;
        this.cameraLookAtTarget.x = (area.boundary.min.x + area.boundary.max.x) / 2;
        this.cameraLookAtTarget.y = 0;
        this.cameraLookAtTarget.z = (area.boundary.min.y + area.boundary.max.y) / 2;

        // ซูมเข้า
        this.camera.zoom = 1.5;
        this.camera.updateProjectionMatrix();
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
  
  private updateCameraPosition(): void {
    if (this.isDetailDialogVisible) {
      // ถ้า Dialog เปิดอยู่ ให้มองไปที่โซนที่เลือก
      // this.cameraLookAtTarget ถูกตั้งค่าไว้แล้วใน onClick
    } else {
      // ถ้า Dialog ปิดอยู่ ให้มองไปที่ผู้เล่น
      this.cameraLookAtTarget.copy(this.player.position);
    }
    
    // กำหนดเป้าหมาย "ตำแหน่ง" ของกล้อง
    if (this.currentView === 'game') {
      const offset = new THREE.Vector3(-8, 7, -8);
      this.cameraTargetPosition.copy(this.cameraLookAtTarget).add(offset);
    } else { // Top View
      this.cameraTargetPosition.set(this.cameraLookAtTarget.x, 35, this.cameraLookAtTarget.z);
    }

    // ค่อยๆ เคลื่อนกล้องและจุดที่มองไปยังเป้าหมาย
    const lerpAlpha = 0.05; // ค่าความเร็ว
    this.camera.position.lerp(this.cameraTargetPosition, lerpAlpha);
    this.controls.target.lerp(this.cameraLookAtTarget, lerpAlpha);
  }

  private startRenderingLoop(): void {
    const render = () => {
      requestAnimationFrame(render);
      
      const canvas = this.renderer.domElement;
      if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
        this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
        const aspect = canvas.clientWidth / canvas.clientHeight;
        this.camera.left = this.frustumSize * aspect / -2;
        this.camera.right = this.frustumSize * aspect / 2;
        this.camera.top = this.frustumSize / 2;
        this.camera.bottom = this.frustumSize / -2;
        this.camera.updateProjectionMatrix();
      }
      
      this.updatePlayer();
      this.checkPlayerZone();
      this.updateCameraPosition();
      
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    render();
  }

  @HostListener('window:pointerup')
  onGlobalPointerUp(): void {
    if (!this.controls.enabled) {
      this.controls.enabled = true;
    }
  }

  @HostListener('window:resize')
  onWindowResize() {
    // Left empty because the render loop handles resizing
  }
}