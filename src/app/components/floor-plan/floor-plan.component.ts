import { Component, ElementRef, ViewChild, AfterViewInit, HostListener } from '@angular/core';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import floorData from './e12-floor1.json';

@Component({
  selector: 'app-floor-plan',
  templateUrl: './floor-plan.component.html',
  styleUrls: ['./floor-plan.component.css']
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

  private readonly WING_LENGTH = 39;
  private readonly BUILDING_WIDTH = 18;
  private readonly LOBBY_LENGTH = 14;

  private keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
  };

  public currentView: 'game' | 'top' = 'game';

  ngAfterViewInit(): void {
    this.createScene();
    this.loadFloorPlan();
    this.createPlayer();
    this.startRenderingLoop();
  }

  toggleView(): void {
    this.currentView = this.currentView === 'game' ? 'top' : 'game';
    this.updateCameraPosition();
  }

  public move(key: string, state: boolean): void {
  if (key in this.keys) {
    (this.keys as any)[key] = state;
    }
  }

  private get canvas(): HTMLCanvasElement {
    return this.canvasRef.nativeElement;
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
  this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  this.renderer.setPixelRatio(window.devicePixelRatio);
  this.renderer.shadowMap.enabled = true;

  this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  this.controls.enableDamping = true;
  this.controls.target.set(0, 0, -6);
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
      floorGroup.add(floor);
    });

    if ((floorData as any).walls) {
      (floorData as any).walls.forEach((wall: any) => {
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
      mesh.position.set(obj.boundary.min.x + width/2, this.wallHeight/2, obj.boundary.min.y + depth/2);
      this.objectMeshes.push(mesh);
      floorGroup.add(mesh);
    });

    const gridHelper = new THREE.GridHelper(100, 100);
    this.scene.add(gridHelper);

    // ป้ายบอกสเกล (แก้ตำแหน่งและข้อความ)
    this.addScaleLabel(50, 50, "1 ช่อง = 1 เมตร");
    this.addScaleLabel(-30, -10, `ปีกซ้าย: ${this.WING_LENGTH}x${this.BUILDING_WIDTH} m`);
    this.addScaleLabel(30, -10, `ปีกขวา: ${this.WING_LENGTH}x${this.BUILDING_WIDTH} m`);
    this.addScaleLabel(0, -12, `โถงกลาง: ${this.LOBBY_LENGTH}x${this.BUILDING_WIDTH} m`);

    this.scene.add(floorGroup);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(-10, 20, -10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  private addScaleLabel(x: number, z: number, text: string): void {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000000';
      context.font = '24px Arial';
      context.fillText(text, 10, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });

      const geometry = new THREE.PlaneGeometry(8, 2);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, 0.5, z);
      mesh.rotation.x = -Math.PI / 2;
      this.scene.add(mesh);
    }
  }

  private createPlayer(): void {
    const playerGeometry = new THREE.CylinderGeometry(this.playerSize/2, this.playerSize/2, this.playerSize * 2);
    const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.player = new THREE.Mesh(playerGeometry, playerMaterial);
    this.player.position.set(0, this.playerSize, 0);
    this.player.castShadow = true;
    this.scene.add(this.player);
  }

  private updatePlayer(): void {
    if (!this.player) return;

    // Camera-relative movement
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
    return false;
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
    if (distance < 0.1) {
      console.warn('Wall distance too small, skipping');
      return new THREE.Mesh();
    }
    const geometry = new THREE.BoxGeometry(distance, height, this.wallThickness);
    const mesh = new THREE.Mesh(geometry, material);
    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mesh.position.set(midPoint.x, height / 2, midPoint.z);
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const angle = Math.atan2(direction.z, direction.x);
    mesh.rotation.y = angle;
    return mesh;
  }

  private updateCameraPosition(): void {
    if (this.currentView === 'game') {
      // ปรับค่า offset เพื่อให้มุมกล้องใกล้และต่ำลงเล็กน้อย
      const offset = new THREE.Vector3(-8, 7, -8); 
      const cameraTargetPosition = this.player.position.clone().add(offset);
      this.camera.position.copy(cameraTargetPosition);
      this.controls.target.set(this.player.position.x, 0, this.player.position.z);
    } else { // Top View
      // ลดความสูงของกล้องลงเพื่อให้เห็นรายละเอียดใกล้ขึ้น
      this.camera.position.set(this.player.position.x, 35, this.player.position.z); 
      this.camera.rotation.set(-Math.PI / 2, 0, Math.PI);
      this.controls.target.set(this.player.position.x, 0, this.player.position.z);
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  private startRenderingLoop(): void {
  const render = () => {
    requestAnimationFrame(render);

    const canvas = this.renderer.domElement;
    const aspect = canvas.clientWidth / canvas.clientHeight;

    this.camera.left = this.frustumSize * aspect / -2;
    this.camera.right = this.frustumSize * aspect / 2;
    this.camera.top = this.frustumSize / 2;
    this.camera.bottom = this.frustumSize / -2;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

    this.updatePlayer();
    this.updateCameraPosition();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
  render();
}

  @HostListener('window:resize', ['$event'])
  onWindowResize(event: Event) {
    // const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    // this.camera.left = this.frustumSize * aspect / -2;
    // this.camera.right = this.frustumSize * aspect / 2;
    // this.camera.top = this.frustumSize / 2;
    // this.camera.bottom = this.frustumSize / -2;
    // this.camera.updateProjectionMatrix();
    // this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
  }
}