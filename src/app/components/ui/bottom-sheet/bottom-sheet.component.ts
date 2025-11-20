import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BottomSheetService, SheetData } from '../../../../services/bottom-sheet.service';
import { AccessListComponent } from '../../../access-list/access-list.component'; 
// (Import Component อื่นๆ ที่จะใช้ใน Sheet เช่น BuildingList ของเพื่อน ถ้ามี)

@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  imports: [CommonModule, AccessListComponent], // ใส่ Component ลูกที่จะมา render
  templateUrl: './bottom-sheet.component.html',
  styleUrls: ['./bottom-sheet.component.css']
})
export class BottomSheetComponent implements OnInit {
  public service = inject(BottomSheetService);
  
  currentData: SheetData = { mode: 'hidden' };
  currentState: 'peek' | 'default' | 'expanded' = 'default';

  // Logic การลาก (Physics) จากโค้ดเดิมของคุณ
  private startY = 0;
  private startHeight = 0;
  private isDragging = false;

  ngOnInit() {
    // ฟังข้อมูล: ว่าต้องโชว์อะไร
    this.service.sheetState$.subscribe(data => {
      this.currentData = data;
    });

    // ฟังสถานะ: ว่าต้องสูงแค่ไหน
    this.service.expansionState$.subscribe(state => {
      this.currentState = state;
    });
  }

  // --- Gesture Logic (Reuse ของเดิมที่คุณทำไว้) ---

  onTouchStart(event: TouchEvent) {
    this.isDragging = true;
    this.startY = event.touches[0].clientY;
    const el = document.querySelector('.global-bottom-sheet') as HTMLElement;
    if (el) {
       this.startHeight = el.offsetHeight;
       el.style.transition = 'none'; // ปิด Animation ชั่วคราวตอนลาก
    }
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isDragging) return;
    const deltaY = this.startY - event.touches[0].clientY;
    const newHeight = this.startHeight + deltaY;
    
    // Update ความสูงแบบ Real-time
    const el = document.querySelector('.global-bottom-sheet') as HTMLElement;
    if (el) el.style.height = `${newHeight}px`;
  }

  onTouchEnd(event: TouchEvent) {
    this.isDragging = false;
    const el = document.querySelector('.global-bottom-sheet') as HTMLElement;
    if (!el) return;

    // คืนค่า Transition
    el.style.transition = 'height 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)';
    
    // Snap Logic (ดีดเข้าล็อค)
    const screenH = window.innerHeight;
    const currentH = el.offsetHeight;
    const ratio = currentH / screenH;

    if (ratio > 0.6) {
      this.service.setExpansionState('expanded');
    } else if (ratio < 0.25) {
      this.service.setExpansionState('peek');
    } else {
      this.service.setExpansionState('default');
    }
    
    // ล้าง inline style เพื่อให้ class ทำงานต่อ
    el.style.height = ''; 
  }

  toggleState() {
    if (this.currentState === 'expanded') {
      this.service.setExpansionState('default');
    } else {
      this.service.setExpansionState('expanded');
    }
  }
}