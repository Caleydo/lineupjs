/**
 * Created by Samuel Gratzl on 05.09.2017.
 */
import {default as Column, IColumnDesc} from '../../model/Column';
import {IRankingHeaderContext} from '../engine/RenderColumn';
import SidePanelEntryVis from './SidePanelEntryVis';


export default class SidePanelEntry {
  used = 0;
  private vis: SidePanelEntryVis|null = null;

  constructor(public readonly desc: IColumnDesc) {

  }

  get name() {
    return this.desc.label;
  }

  get id() {
    return `${this.desc.type}@${this.desc.label}`;
  }

  destroyVis() {
    if (this.vis) {
      this.vis.destroy();
    }
  }

  get visColumn() {
    return this.vis ? this.vis.column: null;
  }

  updateVis(ctx: IRankingHeaderContext) {
    if (this.vis) {
      this.vis.update(ctx);
      return this.vis.node;
    }
    return null;
  }

  createVis(column: Column, ctx: IRankingHeaderContext, document: Document) {
    this.vis = new SidePanelEntryVis(column, ctx, document);
    return this.vis.node;
  }
}