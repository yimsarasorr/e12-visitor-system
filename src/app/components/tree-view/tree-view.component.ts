import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Tree, TreeModule } from 'primeng/tree';
import { TreeNode } from 'primeng/api';

@Component({
  selector: 'app-tree-view',
  standalone: true,
  imports: [CommonModule, TreeModule],
  templateUrl: './tree-view.component.html',
  styleUrls: ['./tree-view.component.css']
})
export class TreeViewComponent implements OnChanges {
  @ViewChild('tree') tree!: Tree;
  @Input() data: any;
  @Input() highlightedId: string | null = null;
  @Output() nodeSelected = new EventEmitter<any>();

  treeData: TreeNode[] = [];
  selectedNode: TreeNode | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.treeData = this.transformDataToTreeNodes(this.data);
    }
    if (changes['highlightedId'] && this.treeData.length > 0) {
      this.expandAndSelectNodeByKey(this.treeData, this.highlightedId);
    }
  }

  private transformDataToTreeNodes(buildingData: any): TreeNode[] {
    return [
      {
        key: buildingData.buildingId,
        label: buildingData.buildingName,
        expanded: true,
        children: buildingData.floors.map((floor: any) => ({
          key: `floor_${floor.floor}`,
          label: floor.floorName,
          expanded: true,
          children: floor.zones.map((zone: any) => ({
            key: zone.id,
            label: zone.name,
            data: { type: 'zone', ...zone },
            children: [
              ...zone.areas.map((area: any) => ({
                key: area.id,
                label: area.name,
                data: { type: 'area', ...area },
                icon: 'pi pi-map-marker'
              })),
              ...zone.rooms.map((room: any) => ({
                key: room.id,
                label: room.name,
                data: { type: 'room', ...room },
                children: room.doors.map((door: any) => ({
                  key: door.id,
                  label: `Door: ${door.id}`,
                  data: { type: 'door', ...door },
                  icon: 'pi pi-lock'
                }))
              }))
            ]
          }))
        }))
      }
    ];
  }
  
  onNodeSelect(event: {node: TreeNode}) {
    if (event.node && event.node.data) {
      this.nodeSelected.emit(event.node.data);
    }
  }

  private expandAndSelectNodeByKey(nodes: TreeNode[], key: string | null): void {
    if (!key) {
      this.selectedNode = null;
      return;
    }
    for (const node of nodes) {
      if (node.key === key) {
        this.selectedNode = node;
        this.expandParents(this.treeData, node);
        return;
      }
      if (node.children) {
        this.expandAndSelectNodeByKey(node.children, key);
      }
    }
  }

  private expandParents(nodes: TreeNode[], selectedNode: TreeNode): boolean {
    for(let node of nodes) {
        if (node.children?.some((c: TreeNode) => c.key === selectedNode.key)) {
            node.expanded = true;
            this.expandParents(this.treeData, node);
            return true;
        }
        if (node.children && this.expandParents(node.children, selectedNode)) {
            node.expanded = true;
            return true;
        }
    }
    return false;
  }
}