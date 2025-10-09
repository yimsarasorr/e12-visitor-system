import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Tree, TreeModule } from 'primeng/tree';
import { TreeNode } from 'primeng/api';

@Component({
  selector: 'app-tree-view',
  standalone: true,
  imports: [CommonModule, FormsModule, TreeModule],
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
  searchTerm = '';
  notFound = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data) {
      this.treeData = this.transformDataToTreeNodes(this.data);
    }
    if (changes['highlightedId'] && this.treeData.length > 0) {
      this.notFound = false;
      const found = this.expandAndSelectNodeByKey(this.treeData, this.highlightedId);
      if (!found) {
        this.selectNode(null);
      }
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
          data: { type: 'floor', floor: floor.floor },
          expanded: true,
          children: floor.zones.map((zone: any) => ({
            key: zone.id,
            label: zone.name,
            data: { type: 'zone', floor: floor.floor, ...zone },
            children: [
              ...zone.areas.map((area: any) => ({
                key: area.id,
                label: area.name,
                data: { type: 'area', floor: floor.floor, ...area },
                icon: 'pi pi-map-marker'
              })),
              ...zone.rooms.map((room: any) => ({
                key: room.id,
                label: room.name,
                data: { type: 'room', floor: floor.floor, ...room },
                children: room.doors.map((door: any) => ({
                  key: door.id,
                  label: `Door: ${door.id}`,
                  data: { type: 'door', floor: floor.floor, ...door },
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

  onSearch(): void {
    this.notFound = false;
    const trimmed = this.searchTerm.trim();
    if (!trimmed) {
      return;
    }
    const match = this.findNodeByLabel(this.treeData, trimmed.toLowerCase());
    if (match) {
      this.selectNode(match);
      this.expandParents(this.treeData, match);
      this.nodeSelected.emit(match.data);
    } else {
      this.notFound = true;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.onSearch();
    }
  }

  private expandAndSelectNodeByKey(nodes: TreeNode[], key: string | null): boolean {
    if (!key) {
      this.selectNode(null);
      return false;
    }
    for (const node of nodes) {
      if (node.key === key) {
        this.selectNode(node);
        this.expandParents(this.treeData, node);
        return true;
      }
      if (node.children) {
        const found = this.expandAndSelectNodeByKey(node.children, key);
        if (found) {
          node.expanded = true;
          return true;
        }
      }
    }
    return false;
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

  private selectNode(node: TreeNode | null): void {
    this.selectedNode = node;
    if (this.tree) {
      this.tree.selection = node;
    }
  }

  private findNodeByLabel(nodes: TreeNode[], query: string): TreeNode | null {
    for (const node of nodes) {
      if (node.label?.toLowerCase().includes(query)) {
        return node;
      }
      if (node.children) {
        const childMatch = this.findNodeByLabel(node.children, query);
        if (childMatch) {
          node.expanded = true;
          return childMatch;
        }
      }
    }
    return null;
  }
}
