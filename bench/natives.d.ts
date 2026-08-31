// The types for bench/natives.js, which tsc cannot parse: it is V8 natives
// syntax by necessity (see the comment there). Resolution finds this file
// first, so the .js is never handed to the compiler.
export declare const optimizationStatus: (fn: Function) => number;
export declare const haveSameMap: (a: object, b: object) => boolean;
export declare const hasFastProperties: (o: object) => boolean;
