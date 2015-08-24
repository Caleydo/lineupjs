/**
 * Created by Samuel Gratzl on 14.08.2015.
 */

import model = require('./model');
import utils = require('./utils');

export class IColumnDesc {
  label:string;
  type:string;
}

/**
 * a basic data provider holding the data and rankings
 */
export class DataProvider extends utils.AEventDispatcher {
  /**
   * all rankings
   * @type {Array}
   * @private
   */
  private rankings_:model.RankColumn[] = [];
  private selection = d3.set();

  private uid = 0;

  /**
   * lookup map of a column type to its column implementation
   */
  columnTypes:any = model.models();

  private forwards ={
    addColumn : utils.forwardEvent(this, 'addColumn'),
    removeColumn : utils.forwardEvent(this, 'removeColumn'),
    dirty: utils.forwardEvent(this, 'dirty')
  };

  createEventList() {
    return super.createEventList().concat(['addColumn', 'removeColumn', 'addRanking', 'removeRanking', 'dirty']);
  }

  /**
   * adds a new ranking
   * @param existing an optional existing ranking to clone
   * @return the new ranking
   */
  pushRanking(existing?:model.RankColumn) {
    var r = this.cloneRanking(existing);
    this.rankings_.push(r);
    r.on('addColumn.provider', this.forwards.addColumn);
    r.on('removeColumn.provider', this.forwards.removeColumn);
    r.on('dirty.provider', this.forwards.dirty);
    this.fire('addRanking', r);
    this.fire('dirty', this);
    return r;
  }

  removeRanking(ranking:model.RankColumn) {
    var i = this.rankings_.indexOf(ranking);
    if (i < 0) {
      return false;
    }
    ranking.on('addColumn.provider', null);
    ranking.on('removeColumn.provider', null);
    ranking.on('dirty.provider', null);
    this.rankings_.splice(i, 1);
    this.fire('removeRanking', ranking);
    this.cleanUpRanking(ranking);
    this.fire('dirty', this);
    return true;
  }

  getRankings() {
    return this.rankings_.slice();
  }

  cleanUpRanking(ranking:model.RankColumn) {

  }

  cloneRanking(existing?:model.RankColumn) {
    return null; //implement me
  }

  /**
   * adds a column to a ranking described by its column description
   * @param ranking
   * @param desc
   * @return {boolean}
   */
  push(ranking:model.RankColumn, desc:IColumnDesc) {
    var r = this.create(desc);
    if (r) {
      ranking.push(r);
      return r;
    }
    return null;
  }

  create(desc: IColumnDesc) {
    var type = this.columnTypes[desc.type];
    if (type) {
      return new type(this.nextId(), desc);
    }
    return null;
  }

  clone(col: model.Column) {
    var dump = col.dump((d) => d);
    var create = (d: any) => {
      var type = this.columnTypes[d.desc.type];
      var c  = new type(this.nextId(), d.desc);
      c.restore(d, create);
      return c;
    };
    return create(dump);
  }

  find(id_or_filter: (col: model.Column) => boolean | string) {
    var filter = typeof(id_or_filter) === 'string' ? (col) => col.id === id_or_filter : id_or_filter;
    for(var i = 0; i < this.rankings_.length; ++i) {
      var r = this.rankings_[i].find(filter);
      if (r) {
        return r;
      }
    }
    return null;
  }

  insert(ranking: model.RankColumn, index: number, desc: IColumnDesc) {
    var r = this.create(desc);
    if (r) {
      ranking.insert(r, index);
      return r;
    }
    return null;
  }

  private nextId() {
    return 'col' + (this.uid++);
  }

  dump() : any {
    return {
      uid: this.uid,
      rankings: this.rankings_.map((r) => r.dump(this.toDescRef))
    };
  }

  toDescRef(desc: any) : any {
    return desc;
  }

  fromDescRef(descRef: any) : any {
    return descRef;
  }

  restore(dump: any) {
    var create = (d: any) => {
      var desc = this.fromDescRef(d.desc);
      var type = this.columnTypes[desc.type];
      var c  = new type(d.id, desc);
      c.restore(d, create);
      return c;
    };
    this.uid = dump.uid;
    this.rankings_ = dump.rankings.map(create);
  }

  /**
   * sorts the given ranking and eventually return a ordering of the data items
   * @param ranking
   * @return {Promise<any>}
   */
  sort(ranking:model.RankColumn):Promise<number[]> {
    return Promise.reject('not implemented');
  }

  /**
   * returns a view in the order of the given indices
   * @param indices
   * @return {Promise<any>}
   */
  view(indices:number[]):Promise<any[]> {
    return Promise.reject('not implemented');
  }

  /**
   * method for computing the unique key of a row
   * @param row
   * @param i
   * @return {string}
   */
  rowKey(row:any, i:number) {
    return typeof(row) === 'number' ? String(row) : String(row._index);
  }


  /**
   * is the given row selected
   * @param row
   * @return {boolean}
   */
  isSelected(row: any) {
    return this.selection.has(this.rowKey(row, -1));
  }

  /**
   * also select the given row
   * @param row
   */
  select(row) {
    this.selection.add(this.rowKey(row, -1));
  }

  /**
   * also select all the given rows
   * @param rows
   */
  selectAll(rows: any[]) {
    rows.forEach((row) => {
      this.selection.add(this.rowKey(row, -1));
    });
  }

  /**
   * set the selection to the given rows
   * @param rows
   */
  setSelection(rows: any[]) {
    this.clearSelection();
    this.selectAll(rows);
  }

  /**
   * delelect the given row
   * @param row
   */
  deselect(row: any) {
    this.selection.remove(this.rowKey(row, -1));
  }

  /**
   * returns a promise containing the selected rows
   * @return {Promise<any[]>}
   */
  selectedRows() {
    if (this.selection.empty()) {
      return Promise.resolve([]);
    }
    var indices = [];
    this.selection.forEach((s) => indices.push(+s));
    indices.sort();
    return this.view(indices);
  }

  /**
   * clears the selection
   */
  clearSelection() {
    this.selection = d3.set();
  }
}

export class CommonDataProvider extends DataProvider {
  private rankingIndex = 0;
  //generic accessor of the data item
  private rowGetter = (row:any, id:string, desc:any) => row[desc.column];

  constructor(public columns:IColumnDesc[] = []) {
    super();

    //generate the accessor
    columns.forEach((d:any) => d.accessor = this.rowGetter);
  }




  toDescRef(desc: any) : any {
    return desc.column ? desc.column : desc;
  }

  fromDescRef(descRef: any) : any {
    if (typeof(descRef) === 'string') {
      return this.columns.filter((d: any) => d.column === descRef) [0];
    }
    return descRef;
  }

  restore(dump: any) {
    super.restore(dump);
    this.rankingIndex = 1 + d3.max(this.getRankings(), (r) => + r.id.substring(4));
  }

  nextRankingId() {
    return 'rank' + (this.rankingIndex++);
  }
}
/**
 * a data provider based on an local array
 */
export class LocalDataProvider extends CommonDataProvider {

  constructor(private data:any[], columns:IColumnDesc[] = []) {
    super(columns);
    //enhance with a magic attribute storing ranking information
    data.forEach((d, i) => {
      d._rankings = {};
      d._index = i
    });
  }

  cloneRanking(existing?:model.RankColumn) {
    var id = this.nextRankingId();
    var rankDesc = {
      label: 'Rank',
      type: 'rank',
      accessor: (row, id) => row._rankings[id] || 0
    };

    var new_ = new model.RankColumn(id, rankDesc);

    if (existing) { //copy the ranking of the other one
      this.data.forEach((row) => {
        var r = row._rankings;
        r[id] = r[existing.id];
      });
      //TODO better cloning
      existing.children.forEach((child) => {
        this.push(new_, child.desc);
      })
    }
    return new_
  }

  cleanUpRanking(ranking:model.RankColumn) {
    //delete all stored information
    this.data.forEach((d) => delete d._rankings[ranking.id]);
  }

  sort(ranking:model.RankColumn):Promise<number[]> {
    //wrap in a helper and store the initial index
    var helper = this.data.map((r, i) => ({row: r, i: i, prev: r._rankings[ranking.id] || 0}));

    //do the optional filtering step
    if (ranking.isFiltered()) {
      helper = helper.filter((d) => ranking.filter(d.row));
    }

    //sort by the ranking column
    helper.sort((a, b) => ranking.comparator(a.row, b.row));

    //store the ranking index and create an argsort version, i.e. rank 0 -> index i
    var argsort = helper.map((r, i) => {
      r.row._rankings[ranking.id] = i;
      return r.i;
    });

    return Promise.resolve(argsort);
  }

  view(indices:number[]) {
    var slice = indices.map((index) => this.data[index]);

    return Promise.resolve(slice);
  }
}

export interface IServerData {
  sort(desc:any) : Promise<number[]>;
  view(indices:number[]): Promise<any[]>;
}

/**
 * a remote implementation of the data provider
 */
export class RemoteDataProvider extends CommonDataProvider {

  private ranks:any = {};

  constructor(private server:IServerData, columns:IColumnDesc[] = []) {
    super(columns);
  }

  cloneRanking(existing?:model.RankColumn) {
    var id = this.nextRankingId();
    var rankDesc = {
      label: 'Rank',
      type: 'rank',
      accessor: (row, id) => this.ranks[id][row._index] || 0
    };
    if (existing) { //copy the ranking of the other one
      //copy the ranking
      this.ranks[id] = this.ranks[existing.id];
    }
    return new model.RankColumn(id, rankDesc);
  }

  cleanUpRanking(ranking:model.RankColumn) {
    //delete all stored information
    delete this.ranks[ranking.id];
  }

  sort(ranking:model.RankColumn):Promise<number[]> {
    //generate a description of what to sort
    var desc = ranking.toSortingDesc((desc) => desc.column);
    //use the server side to sort
    return this.server.sort(desc).then((argsort) => {
      //store the result
      this.ranks[ranking.id] = argsort;
      return argsort;
    });
  }

  view(argsort:number[]) {
    return this.server.view(argsort).then((view) => {
      //enhance with the data index
      view.forEach((d, i) => d._index = argsort[i]);
      return view;
    });
  }
}