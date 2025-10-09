import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FloorPlanComponent } from "./components/floor-plan/floor-plan.component";
import { TreeViewComponent } from './components/tree-view/tree-view.component';
import { ButtonModule } from 'primeng/button';
import { SplitterModule } from 'primeng/splitter';
import floorData from './components/floor-plan/e12-floor1.json';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ CommonModule, FloorPlanComponent, TreeViewComponent, ButtonModule, SplitterModule ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class App {
  buildingData: any = floorData;
  highlightedId: string | null = null;
  selectedNodeData: any = null;

  onZoneChanged(id: string | null): void {
    this.highlightedId = id;
  }

  onTreeNodeSelected(data: any): void {
    this.selectedNodeData = data;
  }
}