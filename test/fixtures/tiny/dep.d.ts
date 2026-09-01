// The smallest callee there is. A declaration file carries the signature and
// nothing that says how large the JavaScript behind it is, which is the whole
// of TC-33 in one line: V8 would inline this without hesitating, and no reader
// of this file — the checker included — can know that.
export declare function inc(n: number): number;
