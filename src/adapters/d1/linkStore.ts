import { SqlLinkStore } from '../sql/linkStore';
import { D1Runner } from './runner';

export class D1LinkStore extends SqlLinkStore {
  constructor(db: D1Database) {
    super(new D1Runner(db));
  }
}
