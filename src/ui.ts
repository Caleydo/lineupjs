/**
 * Created by Samuel Gratzl on 14.08.2015.
 */


///<reference path='../typings/tsd.d.ts' />
import d3 = require('d3');
import utils = require('./utils');
import model = require('./model');
import renderer = require('./renderer');
import provider = require('./provider');
import dialogs = require('./ui_dialogs');

class PoolEntry {
  used : number = 0;

  constructor(public desc : provider.IColumnDesc) {

  }
}

export class PoolRenderer {
  private options = {
    layout: 'vertical',
    elemWidth: 100,
    elemHeight: 40,
    width: 100,
    height: 500,
    additionalDesc : [],
    hideUsed: true

  };

  private $node:d3.Selection<any>;
  private entries : PoolEntry[];

  constructor(private data: provider.DataProvider, parent:Element, options:any = {}) {
    utils.merge(this.options, options);
    this.entries = data.getColumns().concat(this.options.additionalDesc).map((d) => new PoolEntry(d));

    this.$node = d3.select(parent).append('div').classed('lu-pool',true);

    this.changeDataStorage(data);
  }

  changeDataStorage(data: provider.DataProvider) {
    if (this.data) {
      this.data.on(['addColumn.pool','removeColumn.pool','addRanking.pool','removeRanking.pool'], null);
    }
    this.data = data;
    if (this.options.hideUsed) {
      var that = this;
      data.on(['addColumn.pool','removeColumn.pool'], function(col) {
        var desc = col.desc, change = this.type === 'addColumn' ? 1 : -1;
        that.entries.some((entry) => {
          if (entry.desc !== desc) {
            return false;
          }
          entry.used += change;
          return true;
        });
        that.update();
      });
      data.on(['addRanking.pool','removeRanking.pool'], function(ranking) {
        var descs = ranking.flatColumns.map((d) => d.desc), change = this.type === 'addRanking' ? 1 : -1;
        that.entries.some((entry) => {
          if (descs.indexOf(entry.desc) < 0) {
            return false;
          }
          entry.used += change;
          return true;
        });
        that.update();
      });
      data.getRankings().forEach((ranking) => {
        var descs = ranking.flatColumns.map((d) => d.desc), change = +1;
        that.entries.some((entry) => {
          if (descs.indexOf(entry.desc) < 0) {
            return false;
          }
          entry.used += change;
        });
      });
    }
  }

  update() {
    var data = this.data;
    var descToShow = this.entries.filter((e) => e.used === 0).map((d) => d.desc);
    var $headers = this.$node.selectAll('div.header').data(descToShow);
    var $headers_enter = $headers.enter().append('div').attr({
      'class': 'header',
      'draggable': true
    }).on('dragstart', (d) => {
      var e = <DragEvent>(<any>d3.event);
      e.dataTransfer.effectAllowed = 'copyMove'; //none, copy, copyLink, copyMove, link, linkMove, move, all
      e.dataTransfer.setData('text/plain', d.label);
      e.dataTransfer.setData('application/caleydo-lineup-column', JSON.stringify(data.toDescRef(d)));
    }).style({
      'background-color': (d) => (<any>d).color || model.Column.DEFAULT_COLOR,
      width: this.options.elemWidth+'px',
      height: this.options.elemHeight+'px'
    });
    $headers_enter.append('span').classed('label',true).text((d) => d.label);
    $headers.style('transform', (d, i) => {
      var pos = this.layout(i);
      return 'translate(' + pos.x + 'px,' + pos.y + 'px)';
    });
    $headers.select('span');
    $headers.exit().remove();
  }

  private layout(i:number) {
    switch (this.options.layout) {
      case 'horizontal':
        return {x: i * this.options.elemWidth, y: 0};
      case 'grid':
        var perRow = d3.round(this.options.width / this.options.elemWidth, 0);
        return {x: (i % perRow) * this.options.elemWidth, y: d3.round(i / perRow, 0) * this.options.elemHeight};
      //case 'vertical':
      default:
        return {x: 0, y: i * this.options.elemHeight};
    }
  }
}


export class HeaderRenderer {
  private options = {
    slopeWidth: 150,
    columnPadding : 5,
    headerHeight: 20,
    manipulative: true,

    filterDialogs : dialogs.filterDialogs(),
    searchAble: (col: model.Column) => col instanceof model.StringColumn
  };

  private $node:d3.Selection<any>;

  private dragHandler = d3.behavior.drag<model.Column>()
    //.origin((d) => d)
    .on('dragstart', function () {
      (<any>d3.event).sourceEvent.stopPropagation();
      d3.select(this).classed('dragging', true);
    })
    .on('drag', function (d) {
      //the new width
      var newValue = Math.max(d3.mouse(this.parentNode)[0], 2);
      d.setWidth(newValue);
      (<any>d3.event).sourceEvent.stopPropagation();
    })
    .on('dragend', function () {
      d3.select(this).classed('dragging', false);
      (<any>d3.event).sourceEvent.stopPropagation();
    });


  constructor(private data:provider.DataProvider,parent:Element, options:any = {}) {
    utils.merge(this.options, options);

    this.$node = d3.select(parent).append('div').classed('lu-header',true);

    this.changeDataStorage(data);
  }

  changeDataStorage(data: provider.DataProvider) {
    if (this.data) {
      this.data.on('dirtyHeader.headerRenderer', null);
    }
    this.data = data;
    data.on('dirtyHeader.headerRenderer', utils.delayedCall(this.update.bind(this),1));
  }

  update() {

    var rankings = this.data.getRankings();
    var shifts =[], offset = 0;
    rankings.forEach((ranking) => {
      offset += ranking.flatten(shifts, offset, 1, this.options.columnPadding) + this.options.slopeWidth;
    });
    //real width
    offset -= this.options.slopeWidth;

    var columns = shifts.map((d) => d.col);
    if (columns.some((c) => c instanceof model.StackColumn && !c.collapsed)) {
      //we have a second level
      this.$node.style('height', this.options.headerHeight*2 + 'px');
    } else {
      this.$node.style('height', this.options.headerHeight + 'px');
    }
    this.renderColumns(columns, shifts);
  }

  private createToolbar($node: d3.Selection<model.Column>) {
    var filterDialogs = this.options.filterDialogs,
      provider = this.data;
    var $regular = $node.filter(d=> !(d instanceof model.RankColumn)),
      $stacked = $node.filter(d=> d instanceof model.StackColumn);

    //edit weights
    $stacked.append('i').attr('class', 'fa fa-tasks').on('click', function(d) {
      dialogs.openEditWeightsDialog(<model.StackColumn>d, d3.select(this.parentNode.parentNode));
      d3.event.stopPropagation();
    });
    //rename
    $regular.append('i').attr('class', 'fa fa-pencil-square-o').on('click', function(d) {
      dialogs.openRenameDialog(d, d3.select(this.parentNode.parentNode));
      d3.event.stopPropagation();
    });
    //clone
    $regular.append('i').attr('class', 'fa fa-code-fork').on('click', function(d) {
      var r = provider.pushRanking();
      r.push(provider.clone(d));
      d3.event.stopPropagation();
    });
    //filter
    $node.filter((d) => filterDialogs.hasOwnProperty(d.desc.type)).append('i').attr('class', 'fa fa-filter').on('click', function(d) {
      filterDialogs[d.desc.type](d, d3.select(this.parentNode.parentNode), provider);
      d3.event.stopPropagation();
    });
    //search
    $node.filter((d) => this.options.searchAble(d)).append('i').attr('class', 'fa fa-search').on('click', function(d) {
      dialogs.openSearchDialog(d, d3.select(this.parentNode.parentNode), provider);
      d3.event.stopPropagation();
    });
    //remove
    $node.append('i').attr('class', 'fa fa-times').on('click', (d) => {
      if (d instanceof model.RankColumn) {
        provider.removeRanking(<model.RankColumn>d);
        if (provider.getRankings().length === 0) { //create at least one
          provider.pushRanking();
        }
      } else {
        d.removeMe();
      }
      d3.event.stopPropagation();
    });
  }

  private renderColumns(columns: model.Column[], shifts, $base: d3.Selection<any> = this.$node, clazz: string = 'header') {

    var provider = this.data;
    var $headers = $base.selectAll('div.'+clazz).data(columns, (d) => d.id);
    var $headers_enter = $headers.enter().append('div').attr({
      'class': clazz,
      'draggable': this.options.manipulative
    }).on('dragstart', (d) => {
      var e = <DragEvent>(<any>d3.event);
      e.dataTransfer.effectAllowed = 'copyMove'; //none, copy, copyLink, copyMove, link, linkMove, move, all
      e.dataTransfer.setData('text/plain', d.label);
      e.dataTransfer.setData('application/caleydo-lineup-column-ref', d.id);
      e.dataTransfer.setData('application/caleydo-lineup-column', JSON.stringify(provider.toDescRef(d.desc)));
    }).on('click', (d) => {
      if (this.options.manipulative) {
        d.toggleMySorting();
      }
    }).style({
      'background-color': (d) => d.color
    });
    $headers_enter.append('i').attr('class', 'fa fa sort_indicator');
    $headers_enter.append('span').classed('label',true);

    if (this.options.manipulative) {
      $headers_enter.append('div').classed('handle', true)
        .call(this.dragHandler)
        .style('width', this.options.columnPadding + 'px')
        .call(utils.dropAble(['application/caleydo-lineup-column-ref', 'application/caleydo-lineup-column'], (data, d:model.Column, copy) => {
          var col:model.Column = null;
          if ('application/caleydo-lineup-column-ref' in data) {
            var id = data['application/caleydo-lineup-column-ref'];
            col = provider.find(id);
            if (copy) {
              col = provider.clone(col);
            } else {
              col.removeMe();
            }
          } else {
            var desc = JSON.parse(data['application/caleydo-lineup-column']);
            col = provider.create(provider.fromDescRef(desc));
          }
          return d.insertAfterMe(col);
        }));
      $headers_enter.append('div').classed('toolbar', true).call(this.createToolbar.bind(this));
    }
    $headers.style({
      width: (d, i) => (shifts[i].width+this.options.columnPadding)+'px',
      left: (d, i) => shifts[i].offset+'px'
    });
    $headers.select('i.sort_indicator').attr('class', (d) => {
      var r = d.findMyRanker();
      if (r && r.sortCriteria().col === d) {
        return 'sort_indicator fa fa-sort-'+(r.sortCriteria().asc ? 'asc' : 'desc');
      }
      return 'sort_indicator fa';
    });
    $headers.select('span.label').text((d) => d.label);

    var that = this;
    $headers.filter((d) => d instanceof model.StackColumn && !d.collapsed).each(function (col : model.StackColumn) {
      var s_shifts = [];
      col.flatten(s_shifts, 0, 1, that.options.columnPadding);

      var s_columns = s_shifts.map((d) => d.col);
      that.renderColumns(s_columns, s_shifts, d3.select(this), clazz+'_i');
    }).select('span.label').call(utils.dropAble(['application/caleydo-lineup-column-ref','application/caleydo-lineup-column'], (data, d: model.StackColumn, copy) => {
      var col: model.Column = null;
      if ('application/caleydo-lineup-column-ref' in data) {
        var id = data['application/caleydo-lineup-column-ref'];
        col = provider.find(id);
        if (copy) {
          col = provider.clone(col);
        } else {
          col.removeMe();
        }
      } else {
        var desc = JSON.parse(data['application/caleydo-lineup-column']);
        col = provider.create(provider.fromDescRef(desc));
      }
      return d.push(col);
    }));

    $headers.exit().remove();
  }
}


export class BodyRenderer {
  private mouseOverItem:(dataIndex:number, hover:boolean) => void;
  private options = {
    rowHeight: 20,
    rowPadding: 1,
    rowBarPadding : 1,
    idPrefix: '',
    slopeWidth: 150,
    columnPadding : 5,
    stacked: true,
    animation: false, //200
    animationDuration: 1000,

    renderers: renderer.renderers()

  };

  private $node: d3.Selection<any>;

  constructor(private data:provider.DataProvider, parent: Element, options = {}) {
    //merge options
    utils.merge(this.options, options);

    this.$node = d3.select(parent).append('svg').classed('lu-body',true);

    this.changeDataStorage(data);
  }

  setOption(key: string, value: any) {
    this.options[key] = value;
  }

  changeDataStorage(data: provider.DataProvider) {
    if (this.data) {
      this.data.on('dirtyValues.bodyRenderer', null);
    }
    this.data = data;
    data.on('dirtyValues.bodyRenderer', utils.delayedCall(this.update.bind(this),1));
  }

  createContext(rankings:model.RankColumn[]):renderer.IRenderContext {
    var options = this.options;
    return {
      rowKey: this.data.rowKey,
      cellY(index:number) {
        return index * (options.rowHeight);
      },
      cellX(index:number) {
        return 0;
      },
      rowHeight(index:number) {
        return options.rowHeight* (1-options.rowPadding);
      },
      renderer(col:model.Column) {
        if (col instanceof model.StackColumn && col.collapsed) {
          return options.renderers.number;
        }
        var l = options.renderers[col.desc.type];
        return l || renderer.defaultRenderer();
      },
      showStacked(col:model.StackColumn) {
        return options.stacked;
      },
      idPrefix: options.idPrefix,

      animated: ($sel: d3.Selection<any>) => options.animation ? $sel.transition().duration(options.animationDuration) : $sel,

      option : (key:string, default_: any) => (key in options) ? options[key] : default_
    };
  }

  updateClipPathsImpl(r:model.Column[],context:renderer.IRenderContext, height: number) {
    var $base = this.$node.select('defs.body');
    if ($base.empty()) {
      $base = this.$node.append('defs').classed('body',true);
    }

    //generate clip paths for the text columns to avoid text overflow
    //see http://stackoverflow.com/questions/11742812/cannot-select-svg-foreignobject-element-in-d3
    //there is a bug in webkit which present camelCase selectors
    var textClipPath = $base.selectAll(function () {
      return this.getElementsByTagName('clipPath');
    }).data(r, (d) => d.id);
    textClipPath.enter().append('clipPath')
      .attr('id', (d) => context.idPrefix+'clipCol'+d.id)
      .append('rect').attr({
        y: 0
      });
    textClipPath.exit().remove();
    textClipPath.select('rect')
      .attr({
        x: 0, //(d,i) => offsets[i],
        width: (d) => Math.max(d.getWidth() - 5, 0),
        height: height
      });
  }

  updateClipPaths(rankings:model.RankColumn[], context:renderer.IRenderContext, height: number) {
    var shifts = [], offset = 0;
    rankings.forEach((r) => {
      var w = r.flatten(shifts, offset, 2, this.options.columnPadding);
      offset += w + this.options.slopeWidth;
    });
    this.updateClipPathsImpl(shifts.map(s => s.col), context, height);
  }

  renderRankings($body: d3.Selection<any>, rankings:model.RankColumn[], shifts:any[], context:renderer.IRenderContext) {
    var dataPromises = rankings.map((r) => this.data.view(r.getOrder()));

    var $rankings = $body.selectAll('g.ranking').data(rankings, (d) => d.id);
    var $rankings_enter = $rankings.enter().append('g').attr({
      'class': 'ranking'
    });
    $rankings_enter.append('g').attr('class', 'rows');
    $rankings_enter.append('g').attr('class', 'cols');

    context.animated($rankings).attr({
      transform: (d, i) => 'translate(' + shifts[i].shift + ',0)'
    });

    var $cols = $rankings.select('g.cols').selectAll('g.child').data((d) => [<model.Column>d].concat(d.children), (d) => d.id);
    $cols.enter().append('g').attr({
      'class': 'child'
    });
    context.animated($cols).attr({
      'data-index': (d, i) => i
    });
    context.animated($cols).attr({
      transform: (d, i, j?) => {
        return 'translate(' + shifts[j].shifts[i] + ',0)';
      }
    }).each(function (d, i, j?) {
      dataPromises[j].then((data) => {
        context.renderer(d).render(d3.select(this), d, data, context);
      });
    });
    $cols.exit().remove();

    function mouseOverRow($row:d3.Selection<number>, $cols:d3.Selection<model.RankColumn>, index:number, ranking:model.RankColumn, rankingIndex:number) {
      $row.classed('hover', true);
      var children = $cols.selectAll('g.child').data();
      var $value_cols = $row.select('g.values').selectAll('g.child').data(children);
      $value_cols.enter().append('g').attr({
        'class': 'child'
      });
      $value_cols.attr({
        transform: (d, i) => {
          return 'translate(' + shifts[rankingIndex].shifts[i] + ',0)';
        }
      }).each(function (d:model.Column, i) {
        dataPromises[rankingIndex].then((data) => {
          context.renderer(d).mouseEnter($cols.selectAll('g.child[data-index="' + i + '"]'), d3.select(this), d, data[index], index, context);
        });
      });
      $value_cols.exit().remove();
      //data.mouseOver(d, i);
    }

    function mouseLeaveRow($row:d3.Selection<number>, $cols:d3.Selection<model.RankColumn>, index:number, ranking:model.RankColumn, rankingIndex:number) {
      $row.classed('hover', false);
      $row.select('g.values').selectAll('g.child').each(function (d:model.Column, i) {
        dataPromises[rankingIndex].then((data) => {
          context.renderer(d).mouseLeave($cols.selectAll('g.child[data-index="' + i + '"]'), d3.select(this), d, data[index], index, context);
        });
      }).remove();
      //data.mouseLeave(d, i);
    }

    this.mouseOverItem = function (data_index:number, hover = true) {
      $rankings.each(function (ranking, rankingIndex) {
        var $ranking = d3.select(this);
        var $row = $ranking.selectAll('g.row[data-index="' + data_index + '"]');
        var $cols = $ranking.select('g.cols');
        if (!$row.empty()) {
          var index = $row.datum().i;
          if (hover) {
            mouseOverRow($row, $cols, index, ranking, rankingIndex);
          } else {
            mouseLeaveRow($row, $cols, index, ranking, rankingIndex);
          }
        }
      });
    };
    var $rows = $rankings.select('g.rows').selectAll('g.row').data((d, i) => d.getOrder().map((d, i) => ({ d: d, i: i })));
    var $rows_enter = $rows.enter().append('g').attr({
      'class': 'row'
    });
    $rows_enter.append('rect').attr({
      'class': 'bg'
    });
    $rows_enter.append('g').attr({'class': 'values'});
    $rows_enter.on('mouseenter', (data_index) => {
      this.mouseOver(data_index.d, true);
    }).on('mouseleave', (data_index) => {
      this.mouseOver(data_index.d, false);
    }).on('click', (data_index) => {
      this.select(data_index.d, d3.event.ctrlKey);
    });
    $rows.attr({
      'data-index': (d) => d.d
    });
    context.animated($rows).select('rect').attr({
      y: (data_index) => context.cellY(data_index.i),
      height: (data_index) => context.rowHeight(data_index.i),
      width: (d, i, j?) => shifts[j].width
    });
    $rows.exit().remove();

    $rankings.exit().remove();
  }

  select(data_index: number, additional = false) {
    //TODO
  }

  mouseOver(dataIndex:number, hover = true) {
    this.mouseOverItem(dataIndex, hover);
    //update the slope graph
    this.$node.selectAll('line.slope[data-index="' + dataIndex + '"').classed('hover', hover);
  }

  renderSlopeGraphs($body: d3.Selection<any>, rankings:model.RankColumn[], shifts:any[], context:renderer.IRenderContext) {

    var slopes = rankings.slice(1).map((d, i) => ({left: rankings[i], left_i : i, right: d, right_i : i+1}));
    var $slopes = $body.selectAll('g.slopegraph').data(slopes);
    $slopes.enter().append('g').attr({
      'class': 'slopegraph'
    });
    context.animated($slopes).attr({
      transform: (d, i) => 'translate(' + (shifts[i + 1].shift - this.options.slopeWidth) + ',0)'
    });
    var $lines = $slopes.selectAll('line.slope').data((d, i) => {
      var cache = {};
      d.right.getOrder().forEach((data_index, pos) => {
        cache[data_index] = pos;
      });
      return d.left.getOrder().map((data_index, pos) => ({
        data_index: data_index,
        lpos: pos,
        rpos: cache[data_index]
      })).filter((d) => d.rpos != null);
    });
    $lines.enter().append('line').attr({
      'class': 'slope',
      x2: this.options.slopeWidth
    }).on('mouseenter', (d) => {
      this.mouseOver(d.data_index, true);
    }).on('mouseleave', (d) => {
      this.mouseOver(d.data_index, false);
    });
    $lines.attr({
      'data-index': (d) => d.data_index
    });
    context.animated($lines).attr({
      y1: (d:any) => {
        return context.rowHeight(d.lpos) * 0.5 + context.cellY(d.lpos);
      },
      y2: (d:any) => {
        return context.rowHeight(d.rpos) * 0.5 + context.cellY(d.rpos);
      }
    });
    $lines.exit().remove();

    $slopes.exit().remove();
  }

  /**
   * render the body
   */
  update() {
    var r = this.data.getRankings();
    var context = this.createContext(r);


    //compute offsets and shifts for individual rankings and columns inside the rankings
    var offset = 0,
      shifts = r.map((d, i) => {
        var r = offset;
        offset += this.options.slopeWidth;
        var o2 = 0,
          shift2 = [<model.Column>d].concat(d.children).map((o) => {
            var r = o2;
            o2 += o.getWidth() + this.options.columnPadding;
            if (o instanceof model.StackColumn && !o.collapsed) {
              o2 += this.options.columnPadding * (o.length -1);
            }
            return r;
          });
        offset += o2;
        return {
          shift: r,
          shifts: shift2,
          width: o2
        };
      });

    var height = this.options.rowHeight * d3.max(r, (d) => d.getOrder().length);
    this.$node.attr({
      width: offset,
      height : height
    });
    this.updateClipPaths(r, context, height);


    var $body = this.$node.select('g.body');
    if ($body.empty()) {
      $body = this.$node.append('g').classed('body',true);
    }

    this.renderRankings($body, r, shifts, context);
    this.renderSlopeGraphs($body, r, shifts, context);
  }
}
