/**
 * Created by sam on 04.11.2016.
 */

import Column from './Column';
import StringColumn from './StringColumn';

/**
 * a string column in which the label is a text but the value a link
 */
export default class LinkColumn extends StringColumn {
  /**
   * a pattern used for generating the link, $1 is replaced with the actual value
   * @type {null}
   */
  private link = null;

  constructor(id:string, desc:any) {
    super(id, desc);
    this.link = desc.link;
  }

  get headerCssClass() {
    return this.link == null ? 'link' : 'link link_pattern';
  }

  createEventList() {
    return super.createEventList().concat(['linkChanged']);
  }

  setLink(link: string) {
    /* tslint:disable */
    if (link == this.link) { /*== on purpose*/
      return;
    }
    /* tslint:enable */
    this.fire(['linkChanged', 'dirtyHeader', 'dirtyValues', 'dirty'], this.link, this.link = link);
  }

  getLink() {
    return this.link || '';
  }

  dump(toDescRef:(desc:any) => any):any {
    var r = super.dump(toDescRef);
    /* tslint:disable */
    if (this.link != (<any>this.desc).link) {
      r.link = this.link;
    }
    /* tslint:enable */
    return r;
  }

  restore(dump:any, factory:(dump:any) => Column) {
    super.restore(dump, factory);
    if (dump.link) {
      this.link = dump.link;
    }
  }

  getLabel(row:any) {
    var v:any = super.getRaw(row);
    if (v && v.alt) {
      return v.alt;
    }
    return '' + v;
  }

  isLink(row: any) {
    if (this.link) {
      return true;
    }
    //get original value
    var v:any = super.getRaw(row);
    //convert to link
    return v && v.href != null;
  }

  getValue(row:any) {
    //get original value
    var v:any = super.getRaw(row);
    //convert to link
    if (v && v.href) {
      return v.href;
    } else if (this.link) {
      return this.link.replace(/\$1/g, v || '');
    }
    return v;
  }
}