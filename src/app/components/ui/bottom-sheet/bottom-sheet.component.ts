import { Component, inject, OnInit, ElementRef, ViewChild, Renderer2 } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BottomSheetService, SheetData } from '../../../services/bottom-sheet.service';
import { AccessListComponent } from '../../access-list/access-list.component';
import { ButtonModule } from 'primeng/button'; // เพิ่ม ButtonModule สำหรับ List

@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  imports: [CommonModule, AccessListComponent, ButtonModule],
  templateUrl: './bottom-sheet.component.html',
  styleUrls: ['./bottom-sheet.component.css']
})
export class BottomSheetComponent implements OnInit {
  // ✅ เปลี่ยนเป็น public เพื่อให้ HTML เข้าถึงได้
  public bottomSheetService = inject(BottomSheetService);
  private renderer = inject(Renderer2);

  @ViewChild('sheet') sheetRef!: ElementRef;

  currentData: SheetData = { mode: 'hidden' };
  currentState: 'hidden' | 'peek' | 'default' | 'expanded' = 'hidden';

  private startY = 0;
  private startHeight = 0;
  private isDragging = false;

  ngOnInit() {
    // 1. Subscribe Content
    this.bottomSheetService.sheetState$.subscribe(data => {
      this.currentData = data;
      if (data.mode === 'hidden') {
        this.updateState('hidden');
      }
    });

    // 2. Subscribe Height State
    this.bottomSheetService.expansionState$.subscribe(state => {
      this.updateState(state);
    });
  }

  // --- Drag Logic ---
  onTouchStart(event: TouchEvent | MouseEvent) {
    this.isDragging = true;
    const clientY = this.getClientY(event);
    this.startY = clientY;
    const el = this.sheetRef.nativeElement;
    this.startHeight = el.offsetHeight;
    this.renderer.setStyle(el, 'transition', 'none');
  }

  onTouchMove(event: TouchEvent | MouseEvent) {
    if (!this.isDragging) return;
    if (event instanceof TouchEvent) event.preventDefault();

    const clientY = this.getClientY(event);
    const deltaY = this.startY - clientY; // Drag up = positive
    const newHeight = this.startHeight + deltaY;

    // Max height = window height - footer - top margin
    const footerHeight = 80; // ประมาณการ หรือใช้ logic ดึงค่าจริง
    const maxHeight = window.innerHeight - footerHeight - 40; 

    if (newHeight > 0 && newHeight <= maxHeight) {
      this.renderer.setStyle(this.sheetRef.nativeElement, 'height', `${newHeight}px`);
    }
  }

  onTouchEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;

    const el = this.sheetRef.nativeElement;
    const currentHeight = el.offsetHeight;
    const screenHeight = window.innerHeight;

    this.renderer.setStyle(el, 'transition', 'height 0.4s cubic-bezier(0.25, 1, 0.5, 1)');
    this.renderer.removeStyle(el, 'height');

    const ratio = currentHeight / screenHeight;

    if (ratio > 0.6) {
      this.updateState('expanded');
    } else if (ratio > 0.25) {
      this.updateState('default');
    } else {
      this.updateState('peek');
    }
  }

  private getClientY(event: TouchEvent | MouseEvent): number {
    return event instanceof TouchEvent ? event.touches[0].clientY : event.clientY;
  }

  // ✅ เปลี่ยนเป็น public และแก้ Logic Type Mismatch
  public updateState(state: 'hidden' | 'peek' | 'default' | 'expanded') {
    if (this.currentState === state) return;
    this.currentState = state;

    // ✅ เช็คก่อนส่งค่ากลับ Service เพื่อไม่ให้ Type Error
    if (state !== 'hidden') {
       // เรียกชื่อฟังก์ชันให้ถูก (setExpansionState ไม่ใช่ notifyStateChange)
       this.bottomSheetService.setExpansionState(state);
    }
  }
  
  // Helper: เมื่อ User เลือกตึก ส่ง Action กลับไปบอก App/Map
  selectBuilding(item: any) {
    this.bottomSheetService.triggerAction('enter-building', item.id);
  }

  // Helper: กดปุ่มปิดในหน้า Detail ให้กลับไปหน้า List (ถ้ามีข้อมูล List ค้างอยู่)
  backToList() {
    this.bottomSheetService.close();
  }
}