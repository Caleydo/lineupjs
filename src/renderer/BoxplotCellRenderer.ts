import {default as BoxPlotColumn, isBoxPlotColumn} from '../model/BoxPlotColumn';
import Column from '../model/Column';
import {
  IBoxPlotColumn, IBoxPlotData, INumberColumn, INumbersColumn, isNumbersColumn,
  LazyBoxPlotData
} from '../model/INumberColumn';
import {renderMissingCanvas, renderMissingDOM} from './missing';
import {IDataRow, IGroup, isNumberColumn} from '../model';
import NumberColumn from '../model/NumberColumn';
import {colorOf, IImposer} from './impose';
import {default as IRenderContext, ICellRendererFactory} from './interfaces';
import {CANVAS_HEIGHT} from '../styles';
import {ICategoricalStatistics, IStatistics} from '../internal/math';

export function computeLabel(v: IBoxPlotData) {
  if (v === null) {
    return '';
  }
  const f = BoxPlotColumn.DEFAULT_FORMATTER;
  return `min = ${f(v.min)}\nq1 = ${f(v.q1)}\nmedian = ${f(v.median)}\nq3 = ${f(v.q3)}\nmax = ${f(v.max)}`;
}

export default class BoxplotCellRenderer implements ICellRendererFactory {
  readonly title = 'Box Plot';

  canRender(col: Column, isGroup: boolean) {
    return (isBoxPlotColumn(col) && !isGroup || (isNumberColumn(col) && isGroup));
  }

  create(col: IBoxPlotColumn & Column, context: IRenderContext, _hist: IStatistics | ICategoricalStatistics | null, imposer?: IImposer) {
    const sortMethod = <keyof IBoxPlotData>col.getSortMethod();
    const sortedByMe = col.isSortedByMe().asc !== undefined;
    const width = context.colWidth(col);
    return {
      template: `<div title="">
                    <div><div></div><div></div></div>
                 </div>`,
      update: (n: HTMLElement, d: IDataRow) => {
        const data = col.getBoxPlotData(d);
        const missing = !data || renderMissingDOM(n, col, d);
        if (missing) {
          return;
        }
        const label = col.getRawBoxPlotData(d)!;
        renderDOMBoxPlot(n, data!, label, sortedByMe ? sortMethod : '', colorOf(col, d, imposer));
      },
      render: (ctx: CanvasRenderingContext2D, d: IDataRow, i: number) => {
        if (renderMissingCanvas(ctx, col, d, width)) {
          return;
        }

        // Rectangle
        const data = col.getBoxPlotData(d);
        if (!data) {
          return;
        }

        const scaled = {
          min: data.min * width,
          median: data.median * width,
          q1: data.q1 * width,
          q3: data.q3 * width,
          max: data.max * width,
          outlier: data.outlier ? data.outlier.map((d) => d * width) : undefined
        };
        renderBoxPlot(ctx, scaled, sortedByMe ? sortMethod : '', colorOf(col, d, imposer), CANVAS_HEIGHT, 0, context);
      }
    };
  }

  private static createAggregatedBoxPlot(col: INumbersColumn & Column, rows: IDataRow[], raw = false): IBoxPlotData {
    // concat all values
    const vs = (<number[]>[]).concat(...rows.map((r) => (raw ? col.getRawNumbers(r) : col.getNumber(r))));
    return new LazyBoxPlotData(vs);
  }

  createGroup(col: INumberColumn & Column, _context: IRenderContext, _hist: IStatistics | ICategoricalStatistics | null, imposer?: IImposer) {
    const sort = (col instanceof NumberColumn && col.isGroupSortedByMe().asc !== undefined) ? col.getSortMethod() : '';
    return {
      template: `<div title="">
                    <div><div></div><div></div></div>
                 </div>`,
      update: (n: HTMLElement, _group: IGroup, rows: IDataRow[]) => {
        if (rows.every((row) => col.isMissing(row))) {
          renderMissingDOM(n, col, rows[0]); // doesn't matter since all
          return;
        }
        let box: IBoxPlotData, label: IBoxPlotData;

        if (isNumbersColumn(col)) {
          box = BoxplotCellRenderer.createAggregatedBoxPlot(col, rows);
          label = BoxplotCellRenderer.createAggregatedBoxPlot(col, rows, true);
        } else {
          box = new LazyBoxPlotData(rows.map((row) => col.getNumber(row)));
          label = new LazyBoxPlotData(rows.map((row) => col.getRawNumber(row)));
        }
        renderDOMBoxPlot(n, box, label, sort, colorOf(col, null, imposer));
      }
    };
  }
}

function renderDOMBoxPlot(n: HTMLElement, data: IBoxPlotData, label: IBoxPlotData, sort: string, color: string | null) {
  n.title = computeLabel(label);

  const whiskers = <HTMLElement>n.firstElementChild;
  const box = <HTMLElement>whiskers.firstElementChild;
  const median = <HTMLElement>whiskers.lastElementChild;

  const leftWhisker = Math.max(data.q1 - 1.5 * (data.q3 - data.q1), data.min);
  const rightWhisker = Math.min(data.q3 + 1.5 * (data.q3 - data.q1), data.max);
  whiskers.style.left = `${Math.round(leftWhisker * 100)}%`;
  const range = rightWhisker - leftWhisker;
  whiskers.style.width = `${Math.round(range * 100)}%`;

  //relative within the whiskers
  box.style.left = `${Math.round((data.q1 - leftWhisker) / range * 100)}%`;
  box.style.width = `${Math.round((data.q3 - data.q1) / range * 100)}%`;
  box.style.backgroundColor = color;

  //relative within the whiskers
  median.style.left = `${Math.round((data.median - leftWhisker) / range * 100)}%`;

  if (!data.outlier || data.outlier.length === 0) {
    whiskers.dataset.sort = sort;
    if (n.children.length > 1) {
      n.innerHTML = '';
      n.appendChild(whiskers);
    }
    return;
  }

  // match lengths
  const outliers = <HTMLElement[]>Array.from(n.children).slice(1);
  outliers.slice(data.outlier.length).forEach((v) => v.remove());
  for (let i = outliers.length; i < data.outlier.length; ++i) {
    const p = n.ownerDocument.createElement('div');
    outliers.push(p);
    n.appendChild(p);
  }

  data.outlier.forEach((v, i) => {
    delete outliers[i].dataset.sort;
    outliers[i].style.left = `${Math.round(v * 100)}%`;
  });

  if (sort === 'min') {
    whiskers.dataset.sort = '';
    outliers[0].dataset.sort = 'min';
  } else if (sort === 'max') {
    whiskers.dataset.sort = '';
    outliers[outliers.length - 1].dataset.sort = 'max';
  }
}

function renderBoxPlot(ctx: CanvasRenderingContext2D, box: IBoxPlotData, sort: string, color: string | null, height: number, topPadding: number, context: ICanvasRenderContext) {
  // TODO padding
  const boxColor = color || context.option('style.boxplot.box', '#e0e0e0');
  const boxStroke = context.option('style.boxplot.stroke', 'black');
  const boxSortIndicator = context.option('style.boxplot.sortIndicator', '#ffa500');

  const boxTopPadding = topPadding + ((height - topPadding * 2) * 0.1);

  const left = Math.max((box.q1 - 1.5 * (box.q3 - box.q1)), box.min);
  const right = Math.min((box.q3 + 1.5 * (box.q3 - box.q1)), box.max);

  ctx.fillStyle = boxColor;
  ctx.strokeStyle = boxStroke;
  ctx.beginPath();
  ctx.rect(box.q1, boxTopPadding, box.q3 - box.q1, height - (boxTopPadding * 2));
  ctx.fill();
  ctx.stroke();

  //Line
  const bottomPos = height - topPadding;
  const middlePos = height / 2;

  ctx.beginPath();
  ctx.moveTo(left, middlePos);
  ctx.lineTo(box.q1, middlePos);
  ctx.moveTo(left, topPadding);
  ctx.lineTo(left, bottomPos);
  ctx.moveTo(box.median, boxTopPadding);
  ctx.lineTo(box.median, height - boxTopPadding);
  ctx.moveTo(box.q3, middlePos);
  ctx.lineTo(right, middlePos);
  ctx.moveTo(right, topPadding);
  ctx.lineTo(right, bottomPos);
  ctx.stroke();
  ctx.fill();

  if (sort !== '') {
    ctx.strokeStyle = boxSortIndicator;
    ctx.beginPath();
    ctx.moveTo(<number>box[<keyof IBoxPlotData>sort], topPadding);
    ctx.lineTo(<number>box[<keyof IBoxPlotData>sort], height - topPadding);
    ctx.stroke();
    ctx.fill();
  }

  if (!box.outlier) {
    return;
  }
  box.outlier.forEach((v) => {
    // currently dots with 3px
    ctx.fillRect(v - 1, middlePos - 1, 3, 3);
  });
}
