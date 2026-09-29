import { SqlVisitStore } from '../sql/visitStore';
import { D1Runner } from './runner';

export class D1VisitStore extends SqlVisitStore {
  constructor(db: D1Database) {
    super(new D1Runner(db));
  }
}
