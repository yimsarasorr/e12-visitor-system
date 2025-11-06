// src/app/components/joystick/joystick.component.ts
import { Component, ElementRef, HostListener, ViewChild, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerControlsService } from '../../services/floorplan/player-controls.service';

@Component({
  selector: 'app-joystick',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './joystick.component.html',
  styleUrls: ['./joystick.component.css']
})
export class JoystickComponent {
  @ViewChild('stick') private stickRef!: ElementRef<HTMLDivElement>;
  
  private playerControls = inject(PlayerControlsService);
  private ngZone = inject(NgZone);

  private baseRadius: number = 75; // 150 / 2
  private stickRadius: number = 35; // 70 / 2
  private maxMove: number = this.baseRadius - this.stickRadius - 5; // 5 คือ padding
  private isDragging = false;

  private get stickEl(): HTMLDivElement {
    return this.stickRef.nativeElement;
  }

  // --- 1. เมื่อเริ่มกด (เมาส์ หรือ สัมผัส) ---
  onPointerDown(event: PointerEvent): void {
    // ป้องกันพฤติกรรมเริ่มต้น (เช่น การลากรูป)
    event.preventDefault();
    this.stickEl.setPointerCapture(event.pointerId); // ล็อค pointer
    this.isDragging = true;

    // รันนอก Angular Zone เพื่อ performance ที่ดีขึ้น
    this.ngZone.runOutsideAngular(() => {
      this.updateStickPosition(event.clientX, event.clientY);
    });
  }

  // --- 2. เมื่อลาก (จะถูกจับโดย HostListener) ---
  @HostListener('window:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.isDragging) return;

    this.ngZone.runOutsideAngular(() => {
      this.updateStickPosition(event.clientX, event.clientY);
    });
  }

  // --- 3. เมื่อปล่อย (จะถูกจับโดย HostListener) ---
  @HostListener('window:pointerup', ['$event'])
  onPointerUp(event: PointerEvent): void {
    if (!this.isDragging) return;

    this.isDragging = false;
    this.stickEl.releasePointerCapture(event.pointerId); // ปล่อย pointer

    // รีเซ็ตตำแหน่ง
    this.stickEl.style.transform = `translate(0px, 0px)`;
    
    // บอก Service ให้หยุดเดิน
    this.playerControls.setJoystickInput(0, 0);
  }

  private updateStickPosition(clientX: number, clientY: number): void {
    const baseRect = this.stickEl.parentElement!.getBoundingClientRect();
    const baseCenterX = baseRect.left + this.baseRadius;
    const baseCenterY = baseRect.top + this.baseRadius;

    let deltaX = clientX - baseCenterX;
    let deltaY = clientY - baseCenterY;

    // จำกัดระยะการลากให้อยู่ในวงกลม
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (distance > this.maxMove) {
      deltaX = (deltaX / distance) * this.maxMove;
      deltaY = (deltaY / distance) * this.maxMove;
    }

    // ขยับตัว Stick (UI)
    this.stickEl.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

    // คำนวณ Vector (-1 ถึง 1) แล้วส่งไปให้ Player
    // เรากลับแกน Y เพราะใน 3D (Z) แกนบวกคือ "เดินหน้า" แต่ใน CSS/DOM แกน Y บวกคือ "ลงล่าง"
    const vectorX = deltaX / this.maxMove;
    const vectorY = -deltaY / this.maxMove;
    
    // ส่งค่าไปให้ Service ที่เรา Refactor ไว้
    this.playerControls.setJoystickInput(vectorX, vectorY);
  }
}