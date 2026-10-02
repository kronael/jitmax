import { Base } from '../shapes.ts';

export class Dummy extends Base { z = 9; kind() { return this.z; } }
