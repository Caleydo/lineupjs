/**
 * Created by Samuel Gratzl on 14.08.2015.
 */

import {Selection} from 'd3-selection';
import DataProvider from '../provider/ADataProvider';
import Column from '../model/Column';
import {createSVG} from '../renderer/index';
import {ISlicer, IBodyRenderContext, IRankingData} from './ABodyRenderer';
import ADOMBodyRenderer, {DOMElement} from './ADOMBodyRenderer';
import {IDOMRenderContext} from '../renderer/RendererContexts';

const domMappings = {
  svg: {
    root: 'svg',
    g: 'g',

    setSize: (n: DOMElement, width: number, height: number) => {
      n.setAttribute('width', String(width));
      n.setAttribute('height', String(height));
    },

    bg: 'rect',
    updateBG: (sel: Selection<DOMElement, any, any, any>, callback: (d: any, i: number) => [number, number]) => {
      sel.attr('height', (d, i) => callback(d, i)[1])
        .attr('width', (d, i) => callback(d, i)[0]);
    },
    meanLine: 'line',
    updateMeanLine: ($mean: Selection<DOMElement, any, any, any>, x: number, height: number) => {
      $mean.attr('x1', 1 + x) //TODO don't know why +1 such that header and body lines are aligned
        .attr('x2', 1 + x)
        .attr('y2', height);
    },
    slopes: 'g',
    updateSlopes: ($slopes: Selection<DOMElement, any, any, any>, width: number, height: number, callback: (d, i) => number) => {
      $slopes.attr('transform', (d, i) => `translate(${callback(d, i)},0)`);
    },
    creator: createSVG,
    translate: (n: DOMElement, x: number, y: number) => n.setAttribute('transform', `translate(${x},${y})`),
    transform: (sel: Selection<DOMElement, any, any, any>, callback: (d: any, i: number)=> [number,number]) => {
      sel.attr('transform', (d, i) => {
        const r = callback(d, i);
        return `translate(${r[0]},${r[1]})`;
      });
    }
  }
};

export default class SVGBodyRenderer extends ADOMBodyRenderer {
  constructor(data: DataProvider, parent: Element, slicer: ISlicer, options = {}) {
    super(data, parent, slicer, domMappings.svg, options);
  }

  updateClipPathsImpl(r: Column[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    let $base = this.$node.select<SVGDefsElement>('defs.body');
    if ($base.empty()) {
      $base = this.$node.append<SVGDefsElement>('defs').classed('body', true);
    }

    //generate clip paths for the text columns to avoid text overflow
    //see http://stackoverflow.com/questions/L742812/cannot-select-svg-foreignobject-element-in-d3
    //there is a bug in webkit which present camelCase selectors
    const textClipPath = $base.selectAll<SVGClipPathElement, Column>(function () {
      return <any>this.getElementsByTagName('clipPath');
    }).data(r, (d) => d.id);
    const textClipPath_enter = textClipPath.enter().append<SVGClipPathElement>('clipPath');
    textClipPath_enter
      .attr('id', (d) => `cp${context.idPrefix}clipCol${d.id}`)
      .append('rect').attr('y', 0);
    textClipPath.exit().remove();
    textClipPath.merge(textClipPath_enter).select('rect')
      .attr('x', 0) //(d,i) => offsets[i],
      .attr('width', (d) => Math.max(d.getWidth() - 5, 0))
      .attr('height', height);
  }

  updateClipPaths(data: IRankingData[], context: IBodyRenderContext&IDOMRenderContext, height: number) {
    const shifts = [];
    let offset = 0;
    data.forEach((r) => {
      const w = r.ranking.flatten(shifts, offset, 2, this.options.columnPadding);
      offset += w + this.options.slopeWidth;
    });
    this.updateClipPathsImpl(shifts.map((s) => s.col), context, height);

    { //update frozen clip-path
      let $elem = this.$node.select(`clipPath#c${context.idPrefix}Freeze`);
      if ($elem.empty()) {
        $elem = this.$node.append('clipPath').attr('id', `c${context.idPrefix}Freeze`).append('rect')
          .attr('y', 0)
          .attr('width', 20000)
          .attr('height', height);
      }

      const maxFrozen = data.length === 0 || data[0].frozen.length === 0 ? 0 : Math.max(...data[0].frozen.map((f) => f.shift + f.column.getWidth()));
      $elem.select('rect')
        .attr('x', maxFrozen)
        .attr('height', height)
        .attr('transform', `translate(${this.currentFreezeLeft},0)`);
    }
  }
}
